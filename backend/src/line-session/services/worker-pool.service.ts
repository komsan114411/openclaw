import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as path from 'path';
import * as fs from 'fs';

// Types
type Browser = any;
type Page = any;
type CDPSession = any;

export enum WorkerState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  WAITING_PIN = 'waiting_pin',
  RECOVERING = 'recovering',
  ERROR = 'error',
  CLOSED = 'closed',
}

export interface Worker {
  id: string;
  lineAccountId: string;
  email: string;
  browser: Browser | null;
  page: Page | null;
  cdpClient: CDPSession | null;
  state: WorkerState;
  profileDir: string;
  createdAt: Date;
  lastActivityAt: Date;
  recoveryAttempts: number;
  error?: string;
  pinCode?: string;
  capturedKeys?: {
    xLineAccess: string;
    xHmac: string;
  };
  capturedChatMid?: string;
  capturedCurl?: string; // cURL command captured from intercepted request
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  maxRecoveryAttempts: number;
  recoveryDelayMs: number;
  idleTimeoutMs: number;
  userDataDir: string;
  staleWorkerTimeoutMs: number; // [FIX Issue #5] TTL for workers
  cleanupIntervalMs: number; // [FIX Issue #5] How often to run cleanup
}

/**
 * WorkerPool Service
 *
 * Manages multiple browser instances with:
 * - Profile isolation per email
 * - Automatic recovery on crash
 * - Resource cleanup
 * - CDP session management
 *
 * This is a NEW service that works alongside existing LineAutomationService
 */
@Injectable()
export class WorkerPoolService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(WorkerPoolService.name);
  private workers: Map<string, Worker> = new Map();
  private locks: Map<string, boolean> = new Map();
  private puppeteer: any = null;
  private isAvailable = false;

  private readonly config: WorkerPoolConfig;
  private readonly LINE_EXTENSION_ID = 'ophjlpahpchlmihnnnihgmmeilfjmjjc';

  // [FIX Issue #5] Cleanup interval reference
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.config = {
      maxWorkers: parseInt(this.configService.get('WORKER_POOL_MAX_WORKERS') || '30'), // Increased for 100+ users
      maxRecoveryAttempts: 3,
      recoveryDelayMs: 3000, // Reduced from 5000 for faster recovery
      idleTimeoutMs: 180000, // 3 minutes (reduced from 5) for faster recycling
      userDataDir: this.configService.get('PUPPETEER_USER_DATA_DIR') ||
        path.join(__dirname, '../../extensions/user_data'),
      staleWorkerTimeoutMs: 300000, // 5 minutes (reduced from 10) for faster cleanup
      cleanupIntervalMs: 30000, // 30 seconds (reduced from 1 minute) for more frequent cleanup
    };
  }

  async onModuleInit() {
    await this.initializePuppeteer();

    // [FIX Issue #5] Start periodic cleanup for stale workers
    this.startPeriodicCleanup();
  }

  /**
   * [FIX Issue #5] Start periodic cleanup to prevent memory leaks
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupStaleWorkers();
        await this.cleanupIdleWorkers();
      } catch (error) {
        this.logger.error(`[PeriodicCleanup] Error during cleanup: ${error.message}`);
      }
    }, this.config.cleanupIntervalMs);

    this.logger.log(`[WorkerPool] Started periodic cleanup (every ${this.config.cleanupIntervalMs / 1000}s)`);
  }

  /**
   * [FIX Issue #5] Cleanup stale workers (crashed browsers, unresponsive workers)
   */
  private async cleanupStaleWorkers(): Promise<void> {
    const now = Date.now();
    const staleCandidates: string[] = [];

    for (const [lineAccountId, worker] of this.workers) {
      const timeSinceLastActivity = now - worker.lastActivityAt.getTime();

      // Check if worker is stale (no activity for too long)
      if (timeSinceLastActivity > this.config.staleWorkerTimeoutMs) {
        // Additional check: is the browser still connected?
        const isHealthy = await this.testBrowserHealth(worker);

        if (!isHealthy) {
          staleCandidates.push(lineAccountId);
          this.logger.warn(`[StaleCleanup] Worker ${lineAccountId} is stale (${Math.round(timeSinceLastActivity / 1000)}s since last activity, browser unhealthy)`);
        }
      }

      // Also check for workers in ERROR state that haven't been cleaned up
      if (worker.state === WorkerState.ERROR || worker.state === WorkerState.CLOSED) {
        const timeSinceError = now - worker.lastActivityAt.getTime();
        if (timeSinceError > 60000) { // 1 minute grace period for ERROR state
          staleCandidates.push(lineAccountId);
          this.logger.warn(`[StaleCleanup] Worker ${lineAccountId} in ${worker.state} state for too long`);
        }
      }
    }

    // Clean up stale workers
    for (const lineAccountId of staleCandidates) {
      try {
        await this.forceCloseWorker(lineAccountId);
        this.logger.log(`[StaleCleanup] Cleaned up stale worker: ${lineAccountId}`);
      } catch (error) {
        this.logger.error(`[StaleCleanup] Failed to cleanup worker ${lineAccountId}: ${error.message}`);
        // Force remove from map even if cleanup fails
        this.workers.delete(lineAccountId);
        this.releaseLock(lineAccountId);
      }
    }

    if (staleCandidates.length > 0) {
      this.logger.log(`[StaleCleanup] Cleaned up ${staleCandidates.length} stale workers`);
    }
  }

  /**
   * [FIX Issue #5] Force close worker - removes from map even if browser close fails
   */
  private async forceCloseWorker(lineAccountId: string): Promise<void> {
    const worker = this.workers.get(lineAccountId);
    if (!worker) return;

    // Try to cleanup resources gracefully
    try {
      await this.cleanupWorkerResources(worker);
    } catch (error) {
      this.logger.warn(`[ForceClose] Resource cleanup failed for ${lineAccountId}: ${error.message}`);
    }

    // Always remove from map and release lock
    worker.state = WorkerState.CLOSED;
    this.workers.delete(lineAccountId);
    this.releaseLock(lineAccountId);

    this.logger.log(`[ForceClose] Worker forcefully closed: ${lineAccountId}`);
  }

  /**
   * Initialize Puppeteer
   */
  private async initializePuppeteer() {
    try {
      let puppeteerExtra: any = null;
      let StealthPlugin: any = null;

      try {
        puppeteerExtra = require('puppeteer-extra');
        StealthPlugin = require('puppeteer-extra-plugin-stealth');
      } catch {
        // Not installed
      }

      if (puppeteerExtra && StealthPlugin) {
        this.puppeteer = puppeteerExtra;
        this.puppeteer.use(StealthPlugin());
        this.isAvailable = true;
        this.logger.log('WorkerPool: Puppeteer loaded with stealth plugin');
      } else {
        try {
          this.puppeteer = require('puppeteer');
          this.isAvailable = true;
          this.logger.log('WorkerPool: Puppeteer loaded (without stealth)');
        } catch {
          this.logger.warn('WorkerPool: Puppeteer not available');
        }
      }
    } catch (error: any) {
      this.logger.warn(`WorkerPool initialization failed: ${error.message}`);
    }
  }

  /**
   * Check if pool is available
   */
  isPoolAvailable(): boolean {
    return this.isAvailable && this.puppeteer !== null;
  }

  /**
   * Get pool status
   */
  getPoolStatus() {
    return {
      available: this.isAvailable,
      maxWorkers: this.config.maxWorkers,
      activeWorkers: this.workers.size,
      workers: Array.from(this.workers.values()).map(w => ({
        id: w.id,
        lineAccountId: w.lineAccountId,
        email: w.email,
        state: w.state,
        hasPinCode: !!w.pinCode,
        hasKeys: !!w.capturedKeys,
        hasChatMid: !!w.capturedChatMid,
        createdAt: w.createdAt,
        lastActivityAt: w.lastActivityAt,
      })),
    };
  }

  /**
   * Get profile directory for email
   */
  private getProfileDir(email: string, lineAccountId: string): string {
    // Create safe directory name from email
    const safeEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
    return `${safeEmail}_account_${lineAccountId}`;
  }

  /**
   * Ensure user data directory exists
   */
  private ensureUserDataDir(): void {
    if (!fs.existsSync(this.config.userDataDir)) {
      fs.mkdirSync(this.config.userDataDir, { recursive: true });
    }
  }

  /**
   * Acquire lock for lineAccountId
   */
  acquireLock(lineAccountId: string): boolean {
    if (this.locks.get(lineAccountId)) {
      return false;
    }
    this.locks.set(lineAccountId, true);
    return true;
  }

  /**
   * Release lock for lineAccountId
   */
  releaseLock(lineAccountId: string): void {
    this.locks.delete(lineAccountId);
  }

  /**
   * Check if can start login (with lock)
   */
  canStartLogin(lineAccountId: string): boolean {
    return !this.locks.get(lineAccountId) && this.workers.size < this.config.maxWorkers;
  }

  /**
   * Get worker by lineAccountId
   */
  getWorker(lineAccountId: string): Worker | null {
    return this.workers.get(lineAccountId) || null;
  }

  /**
   * Initialize a new worker
   */
  async initializeWorker(lineAccountId: string, email: string): Promise<Worker> {
    if (!this.isAvailable) {
      throw new Error('WorkerPool not available');
    }

    // Check existing worker
    const existing = this.workers.get(lineAccountId);
    if (existing && existing.state !== WorkerState.ERROR && existing.state !== WorkerState.CLOSED) {
      // Test if browser is still responsive before reusing
      const browserHealthy = await this.testBrowserHealth(existing);

      if (browserHealthy) {
        // CRITICAL: Clear old state to prevent PIN mixing with previous login
        this.logger.log(`Reusing existing worker for ${lineAccountId}, browser is healthy`);
        existing.pinCode = undefined;
        existing.capturedKeys = undefined;
        existing.capturedChatMid = undefined;
        existing.error = undefined;
        existing.lastActivityAt = new Date();
        return existing;
      } else {
        // Browser is stale/crashed - close and create new one
        this.logger.warn(`Worker browser is stale for ${lineAccountId}, creating new worker`);
        await this.closeWorker(lineAccountId);
      }
    }

    // Check max workers
    if (this.workers.size >= this.config.maxWorkers) {
      throw new Error(`Max workers (${this.config.maxWorkers}) reached`);
    }

    this.ensureUserDataDir();

    const profileDir = this.getProfileDir(email, lineAccountId);
    const profilePath = path.join(this.config.userDataDir, profileDir);

    // Ensure profile directory exists
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }

    const worker: Worker = {
      id: `worker_${lineAccountId}_${Date.now()}`,
      lineAccountId,
      email,
      browser: null,
      page: null,
      cdpClient: null,
      state: WorkerState.INITIALIZING,
      profileDir,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      recoveryAttempts: 0,
    };

    this.workers.set(lineAccountId, worker);
    this.emitWorkerStateChanged(worker);

    try {
      // Launch browser with isolated profile
      // Use LINE_EXTENSION_PATH env var (Docker) or default path (local dev)
      const extensionPath = this.configService.get('LINE_EXTENSION_PATH') ||
        path.join(__dirname, '../../extensions/line');

      // Check for custom executable path (for Docker/production)
      const executablePath = this.configService.get('PUPPETEER_EXECUTABLE_PATH');
      const headlessEnv = this.configService.get('PUPPETEER_HEADLESS');
      const displayEnv = process.env.DISPLAY;

      // Headless = false if:
      // 1. PUPPETEER_HEADLESS is explicitly 'false'
      // 2. DISPLAY is set (Xvfb or real display)
      const isHeadless = headlessEnv !== 'false' && !displayEnv;

      // Debug logging
      this.logger.log(`[WorkerPool] ========== BROWSER LAUNCH DEBUG ==========`);
      this.logger.log(`[WorkerPool] lineAccountId: ${lineAccountId}`);
      this.logger.log(`[WorkerPool] extensionPath: ${extensionPath}`);
      this.logger.log(`[WorkerPool] extensionExists: ${fs.existsSync(extensionPath)}`);
      this.logger.log(`[WorkerPool] executablePath: ${executablePath || 'default'}`);
      this.logger.log(`[WorkerPool] headless: ${isHeadless}`);
      this.logger.log(`[WorkerPool] DISPLAY: ${displayEnv || 'not set'}`);
      this.logger.log(`[WorkerPool] PUPPETEER_HEADLESS: ${headlessEnv || 'not set'}`);
      this.logger.log(`[WorkerPool] profileDir: ${profileDir}`);
      this.logger.log(`[WorkerPool] ===========================================`);

      const launchOptions: any = {
        headless: isHeadless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1280,800',
          '--disable-blink-features=AutomationControlled',
          `--user-data-dir=${this.config.userDataDir}`,
          `--profile-directory=${profileDir}`,
          // GSB-style: Allow insecure content and disable web security for extension access
          '--allow-running-insecure-content',
          '--disable-web-security',
        ],
        defaultViewport: { width: 1280, height: 800 },
        // GSB-style: Allow extensions to load by ignoring default args that disable them
        ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
      };

      // Add executable path if specified (for Docker with system Chromium)
      if (executablePath) {
        launchOptions.executablePath = executablePath;
        this.logger.log(`Using custom Chromium path: ${executablePath}`);
      }

      // Add extension if exists (only works in non-headless mode)
      // GSB-style: Just use --load-extension (ignoreDefaultArgs already removes --disable-extensions)
      if (!isHeadless && fs.existsSync(extensionPath)) {
        launchOptions.args.push(`--load-extension=${extensionPath}`);
        this.logger.log(`[WorkerPool] Loading extension from: ${extensionPath}`);
      } else if (!isHeadless) {
        this.logger.warn(`LINE extension not found at ${extensionPath} - login may not work correctly`);
      } else {
        this.logger.warn(`[WorkerPool] Running in headless mode - extension will NOT load (LINE login requires non-headless)`);
      }

      worker.browser = await this.puppeteer.launch(launchOptions);

      // Setup disconnect handler for recovery
      worker.browser.on('disconnected', () => {
        this.handleBrowserDisconnect(lineAccountId);
      });

      // Create page
      worker.page = await worker.browser.newPage();

      // Setup CDP session for enhanced interception
      worker.cdpClient = await worker.page.target().createCDPSession();
      await worker.cdpClient.send('Network.enable');

      worker.state = WorkerState.READY;
      worker.lastActivityAt = new Date();
      this.emitWorkerStateChanged(worker);

      this.logger.log(`Worker initialized for ${lineAccountId} with profile: ${profileDir}`);

      return worker;

    } catch (error: any) {
      worker.state = WorkerState.ERROR;
      worker.error = error.message;
      this.emitWorkerStateChanged(worker);
      throw error;
    }
  }

  /**
   * Test if browser is still healthy/responsive
   */
  private async testBrowserHealth(worker: Worker): Promise<boolean> {
    try {
      if (!worker.browser || !worker.page) {
        this.logger.warn(`[BrowserHealth] No browser or page for ${worker.lineAccountId}`);
        return false;
      }

      // Check if browser is connected
      if (!worker.browser.isConnected()) {
        this.logger.warn(`[BrowserHealth] Browser disconnected for ${worker.lineAccountId}`);
        return false;
      }

      // Try a simple operation with short timeout
      const testPromise = worker.page.evaluate(() => {
        return 'health-check';
      });

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 5000),
      );

      const result = await Promise.race([testPromise, timeoutPromise]);

      if (result === 'health-check') {
        this.logger.log(`[BrowserHealth] Browser healthy for ${worker.lineAccountId}`);
        return true;
      }

      this.logger.warn(`[BrowserHealth] Browser health check timed out for ${worker.lineAccountId}`);
      return false;
    } catch (error: any) {
      this.logger.warn(`[BrowserHealth] Browser health check failed for ${worker.lineAccountId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle browser disconnect (crash recovery)
   * [FIX Issue #5] Improved to properly clean up worker entry on max retries
   */
  private async handleBrowserDisconnect(lineAccountId: string) {
    const worker = this.workers.get(lineAccountId);
    if (!worker) return;

    this.logger.warn(`[BrowserDisconnect] Browser disconnected for ${lineAccountId}`);

    // [FIX Issue #5] If max recovery attempts reached, fully clean up the worker
    if (worker.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      this.logger.error(`[BrowserDisconnect] Max recovery attempts (${this.config.maxRecoveryAttempts}) reached for ${lineAccountId}, removing worker`);
      worker.state = WorkerState.ERROR;
      worker.error = 'Max recovery attempts reached - browser crashed';
      worker.lastActivityAt = new Date(); // Update for cleanup tracking
      this.emitWorkerStateChanged(worker);

      // [FIX Issue #5] Schedule delayed cleanup to allow error event to propagate
      setTimeout(async () => {
        try {
          await this.forceCloseWorker(lineAccountId);
          this.logger.log(`[BrowserDisconnect] Worker ${lineAccountId} cleaned up after max recovery attempts`);
        } catch (error) {
          this.logger.error(`[BrowserDisconnect] Failed to cleanup worker ${lineAccountId}: ${error.message}`);
          // Force remove anyway
          this.workers.delete(lineAccountId);
          this.releaseLock(lineAccountId);
        }
      }, 5000); // 5 second delay to allow error handling

      return;
    }

    worker.state = WorkerState.RECOVERING;
    worker.recoveryAttempts++;
    worker.lastActivityAt = new Date();
    this.emitWorkerStateChanged(worker);

    this.logger.log(`[BrowserDisconnect] Attempting recovery ${worker.recoveryAttempts}/${this.config.maxRecoveryAttempts} for ${lineAccountId}`);

    await this.delay(this.config.recoveryDelayMs);

    try {
      // Cleanup old resources
      await this.cleanupWorkerResources(worker);

      // Re-initialize
      await this.initializeWorker(lineAccountId, worker.email);
      this.logger.log(`[BrowserDisconnect] Worker recovered for ${lineAccountId} (attempt ${worker.recoveryAttempts})`);

    } catch (error: any) {
      this.logger.error(`[BrowserDisconnect] Recovery failed for ${lineAccountId}: ${error.message}`);
      worker.state = WorkerState.ERROR;
      worker.error = error.message;
      worker.lastActivityAt = new Date();
      this.emitWorkerStateChanged(worker);

      // [FIX Issue #5] If recovery fails, schedule cleanup
      setTimeout(async () => {
        await this.forceCloseWorker(lineAccountId);
      }, 10000); // 10 second delay before force cleanup
    }
  }

  /**
   * Setup CDP network interception
   */
  async setupCDPInterception(
    worker: Worker,
    onKeyCaptured: (keys: { xLineAccess: string; xHmac: string }, chatMid?: string) => void,
  ): Promise<void> {
    if (!worker.cdpClient) {
      throw new Error('CDP client not initialized');
    }

    // Listen for requests via CDP
    worker.cdpClient.on('Network.requestWillBeSent', (params: any) => {
      const { request } = params;
      const url = request.url;
      const headers = request.headers;

      // Log all LINE API calls for debugging
      if (url.includes('line-chrome-gw.line-apps.com')) {
        this.logger.debug(`[CDP] LINE API call detected: ${url.split('?')[0]}`);
      }

      // Phase 88: ONLY capture from getRecentMessagesV2 endpoint (like GSB)
      // Don't capture from getChats - keys must match the HMAC for getRecentMessagesV2
      if (url.includes('getRecentMessagesV2') && !worker.capturedKeys) {
        const xLineAccess = headers['x-line-access'] || headers['X-Line-Access'];
        const xHmac = headers['x-hmac'] || headers['X-Hmac'];

        this.logger.log(`[CDP KeyCapture] Request to ${url.includes('getRecentMessagesV2') ? 'getRecentMessagesV2' : 'getChats'}`);
        this.logger.log(`[CDP KeyCapture] Has x-line-access: ${!!xLineAccess}, length: ${xLineAccess?.length || 0}`);
        this.logger.log(`[CDP KeyCapture] Has x-hmac: ${!!xHmac}, length: ${xHmac?.length || 0}`);

        if (xLineAccess && xHmac && xLineAccess.length > 50 && xLineAccess.includes('.')) {
          // Extract chatMid from POST data
          let chatMid: string | undefined;
          if (request.postData) {
            try {
              const bodyData = JSON.parse(request.postData);
              this.logger.debug(`[CDP KeyCapture] POST data: ${JSON.stringify(bodyData).substring(0, 200)}`);

              // Handle different LINE API formats
              if (Array.isArray(bodyData) && bodyData[0]) {
                const firstElement = bodyData[0];
                if (typeof firstElement === 'string') {
                  // Simple format: ["mid123"]
                  chatMid = firstElement;
                } else if (typeof firstElement === 'object' && firstElement !== null) {
                  // Object format: [{ targetUserMids: ["mid123"], ... }]
                  if (Array.isArray(firstElement.targetUserMids) && firstElement.targetUserMids[0]) {
                    chatMid = firstElement.targetUserMids[0];
                  } else if (firstElement.chatMid) {
                    chatMid = firstElement.chatMid;
                  } else if (firstElement.mid) {
                    chatMid = firstElement.mid;
                  }
                }
              } else if (typeof bodyData === 'object' && bodyData !== null) {
                // Direct object format: { targetUserMids: ["mid123"], ... }
                if (Array.isArray(bodyData.targetUserMids) && bodyData.targetUserMids[0]) {
                  chatMid = bodyData.targetUserMids[0];
                } else if (bodyData.chatMid) {
                  chatMid = bodyData.chatMid;
                } else if (bodyData.mid) {
                  chatMid = bodyData.mid;
                }
              }

              this.logger.debug(`[CDP KeyCapture] Extracted chatMid: ${chatMid || 'none'}`);
            } catch (parseError) {
              this.logger.warn(`[CDP KeyCapture] Failed to parse POST data: ${parseError}`);
            }
          }

          // CRITICAL: Final validation - chatMid MUST be a string
          if (chatMid && typeof chatMid !== 'string') {
            this.logger.warn(`[CDP KeyCapture] chatMid is not a string (${typeof chatMid}), setting to undefined`);
            chatMid = undefined;
          }

          worker.capturedKeys = { xLineAccess, xHmac };
          worker.capturedChatMid = chatMid;
          worker.lastActivityAt = new Date();

          // Generate cURL command from intercepted request (GSB-style)
          try {
            const method = request.method || 'POST';
            let curlCmd = `curl '${url}' \\\n  -X ${method}`;

            // Add important headers
            const importantHeaders = ['x-line-access', 'x-hmac', 'content-type', 'x-line-chrome-version', 'x-lal'];
            for (const [key, value] of Object.entries(headers)) {
              if (importantHeaders.includes(key.toLowerCase()) || key.toLowerCase().startsWith('x-')) {
                curlCmd += ` \\\n  -H '${key}: ${value}'`;
              }
            }

            // Add data if POST request
            if (method === 'POST' && request.postData) {
              const escapedData = request.postData.replace(/'/g, "'\\''");
              curlCmd += ` \\\n  --data-raw '${escapedData}'`;
            }

            worker.capturedCurl = curlCmd;
            this.logger.log(`[CDP KeyCapture SUCCESS] cURL command captured`);
          } catch (curlError) {
            this.logger.warn(`[CDP KeyCapture] Failed to generate cURL: ${curlError}`);
          }

          this.logger.log(`[CDP KeyCapture SUCCESS] Keys captured for ${worker.lineAccountId}!`);
          this.logger.log(`[CDP KeyCapture SUCCESS] x-line-access: ${xLineAccess.substring(0, 30)}...`);
          this.logger.log(`[CDP KeyCapture SUCCESS] x-hmac: ${xHmac.substring(0, 30)}...`);
          this.logger.log(`[CDP KeyCapture SUCCESS] chatMid: ${chatMid || 'N/A'}`);
          onKeyCaptured({ xLineAccess, xHmac }, chatMid);
        } else {
          this.logger.warn(`[CDP KeyCapture] Invalid keys format - skipping capture`);
        }
      }
    });

    this.logger.log(`CDP interception setup for ${worker.lineAccountId}`);
  }

  /**
   * Also setup Puppeteer request interception (dual-layer)
   */
  async setupPuppeteerInterception(
    worker: Worker,
    onKeyCaptured: (keys: { xLineAccess: string; xHmac: string }, chatMid?: string) => void,
  ): Promise<void> {
    if (!worker.page) {
      throw new Error('Page not initialized');
    }

    await worker.page.setRequestInterception(true);

    worker.page.on('request', async (request: any) => {
      const url = request.url();
      const headers = request.headers();

      // Phase 88: ONLY capture from getRecentMessagesV2 endpoint (like GSB)
      if (url.includes('getRecentMessagesV2') && !worker.capturedKeys) {
        const xLineAccess = headers['x-line-access'];
        const xHmac = headers['x-hmac'];

        if (xLineAccess && xHmac && xLineAccess.length > 50 && xLineAccess.includes('.')) {
          // Extract chatMid from POST data
          let chatMid: string | undefined;
          const postData = request.postData();
          if (postData) {
            try {
              const bodyData = JSON.parse(postData);
              this.logger.debug(`[Puppeteer KeyCapture] POST data: ${JSON.stringify(bodyData).substring(0, 200)}`);

              // Handle different LINE API formats
              if (Array.isArray(bodyData) && bodyData[0]) {
                const firstElement = bodyData[0];
                if (typeof firstElement === 'string') {
                  // Simple format: ["mid123"]
                  chatMid = firstElement;
                } else if (typeof firstElement === 'object' && firstElement !== null) {
                  // Object format: [{ targetUserMids: ["mid123"], ... }]
                  if (Array.isArray(firstElement.targetUserMids) && firstElement.targetUserMids[0]) {
                    chatMid = firstElement.targetUserMids[0];
                  } else if (firstElement.chatMid) {
                    chatMid = firstElement.chatMid;
                  } else if (firstElement.mid) {
                    chatMid = firstElement.mid;
                  }
                }
              } else if (typeof bodyData === 'object' && bodyData !== null) {
                // Direct object format: { targetUserMids: ["mid123"], ... }
                if (Array.isArray(bodyData.targetUserMids) && bodyData.targetUserMids[0]) {
                  chatMid = bodyData.targetUserMids[0];
                } else if (bodyData.chatMid) {
                  chatMid = bodyData.chatMid;
                } else if (bodyData.mid) {
                  chatMid = bodyData.mid;
                }
              }

              this.logger.debug(`[Puppeteer KeyCapture] Extracted chatMid: ${chatMid || 'none'}`);
            } catch (parseError) {
              this.logger.warn(`[Puppeteer KeyCapture] Failed to parse POST data: ${parseError}`);
            }
          }

          // CRITICAL: Final validation - chatMid MUST be a string
          if (chatMid && typeof chatMid !== 'string') {
            this.logger.warn(`[Puppeteer KeyCapture] chatMid is not a string (${typeof chatMid}), setting to undefined`);
            chatMid = undefined;
          }

          worker.capturedKeys = { xLineAccess, xHmac };
          worker.capturedChatMid = chatMid;
          worker.lastActivityAt = new Date();

          this.logger.log(`Puppeteer: Keys captured for ${worker.lineAccountId}`);
          onKeyCaptured({ xLineAccess, xHmac }, chatMid);
        }
      }

      request.continue();
    });
  }

  /**
   * Cleanup worker resources
   */
  private async cleanupWorkerResources(worker: Worker): Promise<void> {
    try {
      if (worker.cdpClient) {
        await worker.cdpClient.detach().catch(() => { });
        worker.cdpClient = null;
      }
      if (worker.page) {
        await worker.page.close().catch(() => { });
        worker.page = null;
      }
      if (worker.browser) {
        await worker.browser.close().catch(() => { });
        worker.browser = null;
      }
    } catch (error: any) {
      this.logger.warn(`Cleanup error: ${error.message}`);
    }
  }

  /**
   * Close worker (completely close browser)
   */
  async closeWorker(lineAccountId: string): Promise<void> {
    const worker = this.workers.get(lineAccountId);
    if (!worker) return;

    await this.cleanupWorkerResources(worker);
    worker.state = WorkerState.CLOSED;
    this.workers.delete(lineAccountId);
    this.releaseLock(lineAccountId);

    this.logger.log(`Worker closed for ${lineAccountId}`);
  }

  /**
   * Soft cancel - GSB-style: Keep browser open, just reset state
   * This allows reusing the same browser session for next login
   */
  async softCancelWorker(lineAccountId: string): Promise<void> {
    const worker = this.workers.get(lineAccountId);
    if (!worker) return;

    // Clear login-specific state but keep browser open
    worker.pinCode = undefined;
    worker.capturedKeys = undefined;
    worker.capturedChatMid = undefined;
    worker.capturedCurl = undefined;
    worker.error = undefined;
    worker.state = WorkerState.READY; // Reset to ready for reuse
    worker.lastActivityAt = new Date();

    this.releaseLock(lineAccountId);
    this.emitWorkerStateChanged(worker);

    this.logger.log(`Worker soft-cancelled for ${lineAccountId} (browser kept open for reuse)`);
  }

  /**
   * Check if worker exists and browser is still alive
   */
  hasActiveWorker(lineAccountId: string): boolean {
    const worker = this.workers.get(lineAccountId);
    if (!worker || !worker.browser) return false;

    try {
      // Check if browser is connected
      return worker.browser.isConnected();
    } catch {
      return false;
    }
  }

  /**
   * Update worker state
   */
  updateWorkerState(lineAccountId: string, state: WorkerState, data?: Partial<Worker>): void {
    const worker = this.workers.get(lineAccountId);
    if (!worker) return;

    worker.state = state;
    worker.lastActivityAt = new Date();

    if (data) {
      Object.assign(worker, data);
    }

    this.emitWorkerStateChanged(worker);
  }

  /**
   * Emit worker state changed event
   */
  private emitWorkerStateChanged(worker: Worker): void {
    this.eventEmitter.emit('worker.stateChanged', {
      lineAccountId: worker.lineAccountId,
      state: worker.state,
      pinCode: worker.pinCode,
      hasKeys: !!worker.capturedKeys,
      hasChatMid: !!worker.capturedChatMid,
      error: worker.error,
    });
  }

  /**
   * Cleanup idle workers
   */
  async cleanupIdleWorkers(): Promise<void> {
    const now = Date.now();

    for (const [lineAccountId, worker] of this.workers) {
      const idleTime = now - worker.lastActivityAt.getTime();

      if (idleTime > this.config.idleTimeoutMs &&
        (worker.state === WorkerState.IDLE || worker.state === WorkerState.READY)) {
        this.logger.log(`Closing idle worker: ${lineAccountId}`);
        await this.closeWorker(lineAccountId);
      }
    }
  }

  /**
   * Module destroy cleanup
   * [FIX Issue #5] Also stops the cleanup interval
   */
  async onModuleDestroy(): Promise<void> {
    // Stop periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('[WorkerPool] Stopped periodic cleanup');
    }

    // Close all workers
    for (const [lineAccountId] of this.workers) {
      try {
        await this.closeWorker(lineAccountId);
      } catch (error) {
        this.logger.error(`[ModuleDestroy] Failed to close worker ${lineAccountId}: ${error.message}`);
      }
    }
    this.workers.clear();
    this.locks.clear();
    this.logger.log('[WorkerPool] All workers cleaned up');
  }

  /**
   * Helper delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
