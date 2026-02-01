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
      // CRITICAL: Clear old state to prevent PIN mixing with previous login
      this.logger.log(`Reusing existing worker for ${lineAccountId}, clearing old state`);
      existing.pinCode = undefined;
      existing.capturedKeys = undefined;
      existing.capturedChatMid = undefined;
      existing.error = undefined;
      existing.lastActivityAt = new Date();
      return existing;
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

      this.logger.log(`Browser config: headless=${isHeadless}, DISPLAY=${displayEnv || 'not set'}, PUPPETEER_HEADLESS=${headlessEnv || 'not set'}`);

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
        ],
        defaultViewport: { width: 1280, height: 800 },
      };

      // Add executable path if specified (for Docker with system Chromium)
      if (executablePath) {
        launchOptions.executablePath = executablePath;
        this.logger.log(`Using custom Chromium path: ${executablePath}`);
      }

      // Add extension if exists (only works in non-headless mode)
      if (!isHeadless && fs.existsSync(extensionPath)) {
        launchOptions.args.push(`--disable-extensions-except=${extensionPath}`);
        launchOptions.args.push(`--load-extension=${extensionPath}`);
      } else if (!isHeadless) {
        this.logger.warn(`LINE extension not found at ${extensionPath} - login may not work correctly`);
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

      // Capture keys from getRecentMessagesV2
      if (url.includes('getRecentMessagesV2')) {
        const xLineAccess = headers['x-line-access'] || headers['X-Line-Access'];
        const xHmac = headers['x-hmac'] || headers['X-Hmac'];

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

          this.logger.log(`CDP: Keys captured for ${worker.lineAccountId}, chatMid: ${chatMid || 'N/A'}`);
          onKeyCaptured({ xLineAccess, xHmac }, chatMid);
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
