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

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.config = {
      maxWorkers: parseInt(this.configService.get('WORKER_POOL_MAX_WORKERS') || '5'),
      maxRecoveryAttempts: 3,
      recoveryDelayMs: 5000,
      idleTimeoutMs: 300000, // 5 minutes
      userDataDir: this.configService.get('PUPPETEER_USER_DATA_DIR') ||
        path.join(__dirname, '../../extensions/user_data'),
    };
  }

  async onModuleInit() {
    await this.initializePuppeteer();
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
   */
  private async handleBrowserDisconnect(lineAccountId: string) {
    const worker = this.workers.get(lineAccountId);
    if (!worker) return;

    this.logger.warn(`Browser disconnected for ${lineAccountId}`);

    if (worker.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      worker.state = WorkerState.ERROR;
      worker.error = 'Max recovery attempts reached';
      this.emitWorkerStateChanged(worker);
      return;
    }

    worker.state = WorkerState.RECOVERING;
    worker.recoveryAttempts++;
    this.emitWorkerStateChanged(worker);

    await this.delay(this.config.recoveryDelayMs);

    try {
      // Cleanup old resources
      await this.cleanupWorkerResources(worker);

      // Re-initialize
      await this.initializeWorker(lineAccountId, worker.email);
      this.logger.log(`Worker recovered for ${lineAccountId} (attempt ${worker.recoveryAttempts})`);

    } catch (error: any) {
      this.logger.error(`Recovery failed for ${lineAccountId}: ${error.message}`);
      worker.state = WorkerState.ERROR;
      worker.error = error.message;
      this.emitWorkerStateChanged(worker);
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

      // Capture keys from getRecentMessagesV2 (primary) or getChats (fallback)
      if (url.includes('getRecentMessagesV2') || url.includes('getChats')) {
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
              if (Array.isArray(bodyData) && bodyData[0]) {
                chatMid = bodyData[0];
              }
            } catch {
              // Ignore parse errors
            }
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

      if (url.includes('getRecentMessagesV2') || url.includes('TalkService')) {
        const xLineAccess = headers['x-line-access'];
        const xHmac = headers['x-hmac'];

        if (xLineAccess && xHmac && xLineAccess.length > 50 && xLineAccess.includes('.')) {
          // Extract chatMid from POST data
          let chatMid: string | undefined;
          const postData = request.postData();
          if (postData) {
            try {
              const bodyData = JSON.parse(postData);
              if (Array.isArray(bodyData) && bodyData[0]) {
                chatMid = bodyData[0];
              }
            } catch {
              // Ignore
            }
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
        await worker.cdpClient.detach().catch(() => {});
        worker.cdpClient = null;
      }
      if (worker.page) {
        await worker.page.close().catch(() => {});
        worker.page = null;
      }
      if (worker.browser) {
        await worker.browser.close().catch(() => {});
        worker.browser = null;
      }
    } catch (error: any) {
      this.logger.warn(`Cleanup error: ${error.message}`);
    }
  }

  /**
   * Close worker
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
   */
  async onModuleDestroy(): Promise<void> {
    for (const [lineAccountId] of this.workers) {
      await this.closeWorker(lineAccountId);
    }
    this.workers.clear();
    this.locks.clear();
  }

  /**
   * Helper delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
