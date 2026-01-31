import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../../core/events';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { KeyStorageService } from './key-storage.service';
import { LoginLockService } from './login-lock.service';
import { encryptPassword, decryptPassword } from '../utils/credential.util';
import * as path from 'path';
import * as fs from 'fs';

// Puppeteer types (loaded dynamically)
type Browser = any;
type Page = any;

export enum LoginStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  LAUNCHING_BROWSER = 'launching_browser',
  LOADING_EXTENSION = 'loading_extension',
  ENTERING_CREDENTIALS = 'entering_credentials',
  WAITING_PIN = 'waiting_pin',
  PIN_DISPLAYED = 'pin_displayed',
  VERIFYING = 'verifying',
  EXTRACTING_KEYS = 'extracting_keys',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export interface LoginResult {
  success: boolean;
  status: LoginStatus;
  pinCode?: string;
  error?: string;
  keys?: {
    xLineAccess: string;
    xHmac: string;
  };
}

interface WorkerState {
  browser: Browser | null;
  page: Page | null;
  status: LoginStatus;
  lineAccountId: string;
  pinCode?: string;
  error?: string;
}

@Injectable()
export class LineAutomationService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(LineAutomationService.name);
  private workers: Map<string, WorkerState> = new Map();
  private puppeteer: any = null;
  private isAvailable = false;

  // Configuration
  private readonly LINE_EXTENSION_ID = 'ophjlpahpchlmihnnnihgmmeilfjmjjc';
  private readonly LOGIN_TIMEOUT = 120000; // 2 minutes
  private readonly PIN_TIMEOUT = 90000; // 90 seconds

  // Encryption key for passwords
  private readonly ENCRYPTION_KEY: string;
  private readonly ENCRYPTION_IV_LENGTH = 16;

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    private configService: ConfigService,
    private eventBusService: EventBusService,
    private keyStorageService: KeyStorageService,
    private loginLockService: LoginLockService,
  ) {
    this.ENCRYPTION_KEY = this.configService.get('LINE_PASSWORD_ENCRYPTION_KEY') ||
      'default-key-change-in-production-32';
  }

  async onModuleInit() {
    await this.initializePuppeteer();
  }

  /**
   * Initialize Puppeteer (dynamic import)
   */
  private async initializePuppeteer() {
    try {
      // Try to load puppeteer-extra with stealth plugin
      // Using require for dynamic loading to avoid TypeScript import errors
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
        this.logger.log('Puppeteer loaded with stealth plugin');
      } else {
        // Fallback to regular puppeteer
        let puppeteer: any = null;
        try {
          puppeteer = require('puppeteer');
        } catch {
          // Not installed
        }

        if (puppeteer) {
          this.puppeteer = puppeteer;
          this.isAvailable = true;
          this.logger.log('Puppeteer loaded (without stealth)');
        } else {
          this.logger.warn('Puppeteer not available - auto login disabled');
        }
      }
    } catch (error: any) {
      this.logger.warn(`Puppeteer initialization failed: ${error.message}`);
      this.isAvailable = false;
    }
  }

  /**
   * Check if automation is available
   */
  isAutomationAvailable(): boolean {
    return this.isAvailable && this.puppeteer !== null;
  }

  /**
   * Get automation status
   */
  getStatus() {
    return {
      available: this.isAvailable,
      activeWorkers: this.workers.size,
      workers: Array.from(this.workers.entries()).map(([id, state]) => ({
        lineAccountId: id,
        status: state.status,
        hasPinCode: !!state.pinCode,
      })),
    };
  }

  /**
   * Encrypt password for storage (using shared utility)
   */
  encryptPasswordValue(password: string): string {
    return encryptPassword(password, this.ENCRYPTION_KEY);
  }

  /**
   * Decrypt password (using shared utility)
   */
  decryptPasswordValue(encryptedPassword: string): string {
    return decryptPassword(encryptedPassword, this.ENCRYPTION_KEY);
  }

  /**
   * Save LINE credentials
   */
  async saveCredentials(
    lineAccountId: string,
    email: string,
    password: string,
  ): Promise<void> {
    const encryptedPassword = this.encryptPasswordValue(password);

    await this.lineSessionModel.updateOne(
      { lineAccountId, isActive: true },
      {
        $set: {
          lineEmail: email,
          linePassword: encryptedPassword,
        },
      },
      { upsert: true },
    );

    this.logger.log(`Credentials saved for ${lineAccountId}`);
  }

  /**
   * Get credentials
   */
  async getCredentials(lineAccountId: string): Promise<{ email: string; password: string } | null> {
    const session = await this.lineSessionModel.findOne({
      lineAccountId,
      isActive: true,
      lineEmail: { $exists: true, $ne: null },
    });

    if (!session?.lineEmail || !session?.linePassword) {
      return null;
    }

    try {
      const password = this.decryptPasswordValue(session.linePassword);
      return { email: session.lineEmail, password };
    } catch (error) {
      this.logger.error(`Failed to decrypt password for ${lineAccountId}`);
      return null;
    }
  }

  /**
   * Start auto login process
   */
  async startLogin(lineAccountId: string, email?: string, password?: string): Promise<LoginResult> {
    if (!this.isAvailable) {
      return {
        success: false,
        status: LoginStatus.FAILED,
        error: 'Puppeteer not available',
      };
    }

    // Acquire global lock (prevent concurrent login from different services)
    const lockAcquired = this.loginLockService.acquireLock(lineAccountId, 'original');
    if (!lockAcquired) {
      const lockInfo = this.loginLockService.getLockInfo(lineAccountId);
      return {
        success: false,
        status: LoginStatus.FAILED,
        error: `Login already in progress (locked by: ${lockInfo?.source || 'unknown'})`,
      };
    }

    // Check if already running
    const existingWorker = this.workers.get(lineAccountId);
    if (existingWorker && existingWorker.status !== LoginStatus.IDLE &&
        existingWorker.status !== LoginStatus.FAILED) {
      this.loginLockService.releaseLock(lineAccountId, 'original');
      return {
        success: false,
        status: existingWorker.status,
        pinCode: existingWorker.pinCode,
        error: 'Login already in progress',
      };
    }

    // Get credentials if not provided
    let credentials: { email: string; password: string };
    if (!email || !password) {
      const saved = await this.getCredentials(lineAccountId);
      if (!saved) {
        return {
          success: false,
          status: LoginStatus.FAILED,
          error: 'No credentials found. Please provide email and password.',
        };
      }
      credentials = saved;
    } else {
      credentials = { email, password };
    }

    // Initialize worker state
    const workerState: WorkerState = {
      browser: null,
      page: null,
      status: LoginStatus.INITIALIZING,
      lineAccountId,
    };
    this.workers.set(lineAccountId, workerState);

    // Emit status update
    this.emitStatusUpdate(lineAccountId, LoginStatus.INITIALIZING);

    try {
      // Launch browser
      this.updateWorkerStatus(lineAccountId, LoginStatus.LAUNCHING_BROWSER);
      const browser = await this.launchBrowser();
      workerState.browser = browser;

      // Get page and navigate to LINE extension
      const page = await browser.newPage();
      workerState.page = page;

      // Setup request interception for capturing keys
      await this.setupRequestInterception(page, lineAccountId);

      // Navigate to LINE extension
      this.updateWorkerStatus(lineAccountId, LoginStatus.LOADING_EXTENSION);
      const extensionUrl = `chrome-extension://${this.LINE_EXTENSION_ID}/index.html`;
      await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(3000);

      // Check if already logged in
      const isLoggedIn = await this.checkLoggedIn(page);
      if (isLoggedIn) {
        this.logger.log(`Already logged in for ${lineAccountId}`);
        // Try to capture keys
        const keys = await this.captureKeys(page, lineAccountId);
        if (keys) {
          this.updateWorkerStatus(lineAccountId, LoginStatus.SUCCESS);
          return { success: true, status: LoginStatus.SUCCESS, keys };
        }
      }

      // Perform login
      this.updateWorkerStatus(lineAccountId, LoginStatus.ENTERING_CREDENTIALS);
      await this.performLogin(page, credentials.email, credentials.password);

      // Wait for PIN
      this.updateWorkerStatus(lineAccountId, LoginStatus.WAITING_PIN);
      const pinCode = await this.waitForPin(page, lineAccountId);

      if (pinCode) {
        workerState.pinCode = pinCode;
        this.updateWorkerStatus(lineAccountId, LoginStatus.PIN_DISPLAYED, { pinCode });

        // Emit PIN event via WebSocket
        this.eventBusService.publish({
          eventName: 'line-session.pin-required' as any,
          occurredAt: new Date(),
          lineAccountId,
          pinCode,
        });

        // Wait for login completion
        this.updateWorkerStatus(lineAccountId, LoginStatus.VERIFYING);
        const loginSuccess = await this.waitForLoginComplete(page);

        if (loginSuccess) {
          // Extract keys
          this.updateWorkerStatus(lineAccountId, LoginStatus.EXTRACTING_KEYS);
          const keys = await this.captureKeys(page, lineAccountId);

          if (keys) {
            this.updateWorkerStatus(lineAccountId, LoginStatus.SUCCESS);
            return { success: true, status: LoginStatus.SUCCESS, keys, pinCode };
          }
        }
      }

      throw new Error('Login failed or timed out');

    } catch (error) {
      this.logger.error(`Login failed for ${lineAccountId}: ${error.message}`);
      this.updateWorkerStatus(lineAccountId, LoginStatus.FAILED, { error: error.message });
      return {
        success: false,
        status: LoginStatus.FAILED,
        error: error.message,
      };
    } finally {
      // Always release the lock
      this.loginLockService.releaseLock(lineAccountId, 'original');
    }
  }

  /**
   * Launch browser with LINE extension
   */
  private async launchBrowser(): Promise<Browser> {
    const extensionPath = path.join(__dirname, '../../extensions/line');

    const options: any = {
      headless: false, // LINE extension requires headed mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
      defaultViewport: { width: 1280, height: 800 },
    };

    // Add LINE extension if exists
    if (fs.existsSync(extensionPath)) {
      options.args.push(`--disable-extensions-except=${extensionPath}`);
      options.args.push(`--load-extension=${extensionPath}`);
    } else {
      this.logger.warn(`LINE extension not found at ${extensionPath} - login may not work correctly`);
    }

    // Check if running in Docker/headless environment
    const isHeadless = this.configService.get('PUPPETEER_HEADLESS') === 'true';
    if (isHeadless) {
      options.headless = 'new';
      options.args.push('--headless=new');
    }

    return this.puppeteer.launch(options);
  }

  /**
   * Setup request interception to capture keys
   */
  private async setupRequestInterception(page: Page, lineAccountId: string) {
    await page.setRequestInterception(true);

    page.on('request', async (request: any) => {
      const url = request.url();
      const headers = request.headers();

      // Capture keys from getRecentMessagesV2 request
      if (url.includes('getRecentMessagesV2') || url.includes('TalkService')) {
        const xLineAccess = headers['x-line-access'];
        const xHmac = headers['x-hmac'];

        if (xLineAccess && xHmac && xLineAccess.length > 50) {
          this.logger.log(`Keys captured from request for ${lineAccountId}`);

          // Save keys
          await this.keyStorageService.saveKeys({
            lineAccountId,
            xLineAccess,
            xHmac,
            userAgent: headers['user-agent'],
            source: 'auto_login',
          });

          // Emit success event
          this.eventBusService.publish({
            eventName: 'line-session.keys-captured' as any,
            occurredAt: new Date(),
            lineAccountId,
          });
        }
      }

      request.continue();
    });
  }

  /**
   * Check if already logged in
   */
  private async checkLoggedIn(page: Page): Promise<boolean> {
    try {
      const loggedInIndicator = await page.$('button[aria-label="Go chatroom"], [data-testid="chat-list"]');
      if (loggedInIndicator) return true;

      const loginForm = await page.$('input[name="email"]');
      if (!loginForm) {
        const url = page.url();
        if (url.includes('#/chats') || url.includes('#/friends')) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Perform login
   */
  private async performLogin(page: Page, email: string, password: string) {
    // Wait for login form
    await page.waitForSelector('input[name="email"]', { timeout: 60000 });

    // Clear and enter email
    await page.click('input[name="email"]', { clickCount: 3 });
    await page.type('input[name="email"]', email, { delay: 50 });

    // Clear and enter password
    await page.click('input[name="password"]', { clickCount: 3 });
    await page.type('input[name="password"]', password, { delay: 50 });

    // Click login button
    const loginButton = await page.$('button[type="submit"]');
    if (loginButton) {
      await loginButton.click();
    }

    await this.delay(2000);
  }

  /**
   * Wait for PIN code to appear
   */
  private async waitForPin(page: Page, lineAccountId: string): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.PIN_TIMEOUT) {
      try {
        const pinCode = await page.evaluate(() => {
          // Try multiple selectors for PIN
          const selectors = [
            '.pinCodeModal-module__pincode__bFKMn',
            '[class*="pincode"]',
            '[class*="pinCode"]',
            '[role="dialog"] span',
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.textContent?.trim();
              if (text && /^\d{6}$/.test(text)) {
                return text;
              }
            }
          }

          // Fallback: scan for 6-digit number
          const bodyText = document.body?.innerText || '';
          const match = bodyText.match(/\b(\d{6})\b/);
          if (match) {
            return match[1];
          }

          return null;
        });

        if (pinCode) {
          this.logger.log(`PIN detected for ${lineAccountId}: ${pinCode}`);
          return pinCode;
        }
      } catch {
        // Continue waiting
      }

      await this.delay(1000);
    }

    return null;
  }

  /**
   * Wait for login to complete
   */
  private async waitForLoginComplete(page: Page): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.LOGIN_TIMEOUT) {
      try {
        const isLoggedIn = await this.checkLoggedIn(page);
        if (isLoggedIn) return true;

        // Check for error
        const errorElement = await page.$('[class*="error"], [class*="alert-danger"]');
        if (errorElement) {
          const errorText = await page.evaluate((el: Element) => el.textContent, errorElement);
          throw new Error(`Login error: ${errorText}`);
        }
      } catch (e) {
        if (e.message.includes('Login error')) throw e;
      }

      await this.delay(2000);
    }

    return false;
  }

  /**
   * Capture keys by triggering requests
   */
  private async captureKeys(page: Page, lineAccountId: string): Promise<{ xLineAccess: string; xHmac: string } | null> {
    try {
      // Navigate to chats to trigger API call
      const currentUrl = page.url();
      if (!currentUrl.includes('#/chats')) {
        await page.goto(currentUrl.split('#')[0] + '#/chats', {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
      }

      // Click on first chat item to trigger messages fetch
      await this.delay(3000);
      await page.evaluate(() => {
        const chatItems = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');
        if (chatItems.length > 0) {
          (chatItems[0] as HTMLElement).click();
        }
      });

      await this.delay(5000);

      // Get captured keys from session
      const session = await this.keyStorageService.getActiveSession(lineAccountId);
      if (session?.xLineAccess && session?.xHmac) {
        return {
          xLineAccess: session.xLineAccess,
          xHmac: session.xHmac,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update worker status
   */
  private updateWorkerStatus(lineAccountId: string, status: LoginStatus, data?: any) {
    const worker = this.workers.get(lineAccountId);
    if (worker) {
      worker.status = status;
      if (data?.pinCode) worker.pinCode = data.pinCode;
      if (data?.error) worker.error = data.error;
    }

    this.emitStatusUpdate(lineAccountId, status, data);
  }

  /**
   * Emit status update via EventBus
   */
  private emitStatusUpdate(lineAccountId: string, status: LoginStatus, data?: any) {
    this.eventBusService.publish({
      eventName: 'line-session.login-status' as any,
      occurredAt: new Date(),
      lineAccountId,
      status,
      ...data,
    });
  }

  /**
   * Get worker status
   */
  getWorkerStatus(lineAccountId: string): WorkerState | null {
    return this.workers.get(lineAccountId) || null;
  }

  /**
   * Cancel login
   */
  async cancelLogin(lineAccountId: string): Promise<void> {
    const worker = this.workers.get(lineAccountId);
    if (worker) {
      if (worker.browser) {
        await worker.browser.close().catch(() => {});
      }
      this.workers.delete(lineAccountId);
      this.logger.log(`Login cancelled for ${lineAccountId}`);
    }
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    for (const [lineAccountId, worker] of this.workers) {
      if (worker.browser) {
        await worker.browser.close().catch(() => {});
      }
    }
    this.workers.clear();
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
