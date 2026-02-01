import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkerPoolService, WorkerState, Worker } from './worker-pool.service';
import { LoginCoordinatorService, RequestStatus } from './login-coordinator.service';
import { KeyStorageService } from './key-storage.service';
import { LoginLockService } from './login-lock.service';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { encryptPassword, decryptPassword } from '../utils/credential.util';

export enum EnhancedLoginStatus {
  IDLE = 'idle',
  REQUESTING = 'requesting',
  INITIALIZING = 'initializing',
  LAUNCHING_BROWSER = 'launching_browser',
  LOADING_EXTENSION = 'loading_extension',
  CHECKING_SESSION = 'checking_session',
  ENTERING_CREDENTIALS = 'entering_credentials',
  WAITING_PIN = 'waiting_pin',
  PIN_DISPLAYED = 'pin_displayed',
  VERIFYING = 'verifying',
  EXTRACTING_KEYS = 'extracting_keys',
  TRIGGERING_MESSAGES = 'triggering_messages',
  SUCCESS = 'success',
  FAILED = 'failed',
  COOLDOWN = 'cooldown',
}

export interface EnhancedLoginResult {
  success: boolean;
  status: EnhancedLoginStatus;
  requestId?: string;
  pinCode?: string;
  error?: string;
  keys?: {
    xLineAccess: string;
    xHmac: string;
  };
  chatMid?: string;
  sessionReused?: boolean;
  cooldownRemainingMs?: number;
}

/**
 * Enhanced LINE Automation Service
 *
 * Full GSB-like implementation with:
 * - WorkerPool for profile isolation
 * - LoginCoordinator for request management
 * - CDP + Puppeteer dual-layer interception
 * - Auto chatMid extraction
 * - Error recovery and retry
 * - Multi-attempt message trigger
 *
 * This service works ALONGSIDE the original LineAutomationService
 * Use this for production, use original for simple/testing
 */
@Injectable()
export class EnhancedAutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(EnhancedAutomationService.name);

  private readonly LINE_EXTENSION_ID = 'ophjlpahpchlmihnnnihgmmeilfjmjjc';
  private readonly LOGIN_TIMEOUT = 120000; // 2 minutes
  private readonly PIN_TIMEOUT = 90000; // 90 seconds
  private readonly MESSAGE_TRIGGER_ATTEMPTS = 6;
  private readonly ATTEMPT_DELAY = 4000; // 4 seconds between attempts

  // Encryption
  private readonly ENCRYPTION_KEY: string;

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private workerPoolService: WorkerPoolService,
    private loginCoordinatorService: LoginCoordinatorService,
    private keyStorageService: KeyStorageService,
    private loginLockService: LoginLockService,
  ) {
    this.ENCRYPTION_KEY = this.configService.get('LINE_PASSWORD_ENCRYPTION_KEY') ||
      'default-key-change-in-production-32';
  }

  /**
   * Check if running in headless mode (extension-based login won't work)
   */
  private isHeadlessMode(): boolean {
    const headlessEnv = process.env.PUPPETEER_HEADLESS;
    return headlessEnv === 'true' || headlessEnv === '1' || headlessEnv === 'new';
  }

  /**
   * Check if enhanced automation is available
   */
  isAvailable(): boolean {
    // Extension-based login doesn't work in headless mode
    if (this.isHeadlessMode()) {
      return false;
    }
    return this.workerPoolService.isPoolAvailable();
  }

  /**
   * Get full status
   */
  getStatus() {
    return {
      available: this.isAvailable(),
      pool: this.workerPoolService.getPoolStatus(),
      coordinator: this.loginCoordinatorService.getStatistics(),
    };
  }

  /**
   * Encrypt password (using shared utility)
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
   * Save credentials
   */
  async saveCredentials(lineAccountId: string, email: string, password: string): Promise<void> {
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
    } catch {
      return null;
    }
  }

  /**
   * Start enhanced login process
   */
  async startLogin(
    lineAccountId: string,
    email?: string,
    password?: string,
    source: 'manual' | 'auto' | 'relogin' = 'manual',
  ): Promise<EnhancedLoginResult> {
    // Step 0: Check if headless mode (extension-based login won't work)
    if (this.isHeadlessMode()) {
      this.logger.warn(`Automated login not available in headless mode for ${lineAccountId}`);
      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: 'Automated login is not available in production (headless mode). Please use manual key entry: copy X-Line-Access and X-Hmac headers from browser DevTools.',
      };
    }

    // Step 0b: Acquire global lock (prevent concurrent login from different services)
    const lockAcquired = this.loginLockService.acquireLock(lineAccountId, 'enhanced');
    if (!lockAcquired) {
      const lockInfo = this.loginLockService.getLockInfo(lineAccountId);
      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: `Login already in progress (locked by: ${lockInfo?.source || 'unknown'})`,
      };
    }

    let requestId: string | undefined;

    try {
      // Step 1: Request approval from coordinator
      const requestResult = this.loginCoordinatorService.requestLogin(lineAccountId, source);

      if (!requestResult.approved) {
        return {
          success: false,
          status: EnhancedLoginStatus.COOLDOWN,
          error: requestResult.message,
          cooldownRemainingMs: requestResult.cooldownRemainingMs,
        };
      }

      requestId = requestResult.requestId!;
      this.emitStatus(lineAccountId, EnhancedLoginStatus.REQUESTING, { requestId });

      // Step 2: Get credentials
      let credentials: { email: string; password: string };
      if (!email || !password) {
        const saved = await this.getCredentials(lineAccountId);
        if (!saved) {
          this.loginCoordinatorService.markLoginFailed(lineAccountId, 'No credentials found');
          return {
            success: false,
            status: EnhancedLoginStatus.FAILED,
            requestId,
            error: 'No credentials found. Please provide email and password.',
          };
        }
        credentials = saved;
      } else {
        credentials = { email, password };
        // Save for future use
        await this.saveCredentials(lineAccountId, email, password);
      }

      // Step 3: Check for existing keys from same email (key copying)
      const existingKeys = await this.checkExistingKeys(lineAccountId, credentials.email);
      if (existingKeys) {
        this.loginCoordinatorService.markLoginCompleted(lineAccountId);
        return {
          success: true,
          status: EnhancedLoginStatus.SUCCESS,
          requestId,
          keys: existingKeys.keys,
          chatMid: existingKeys.chatMid,
          sessionReused: true,
        };
      }

      // Step 4: Initialize worker
      this.loginCoordinatorService.markLoginStarted(lineAccountId);
      this.emitStatus(lineAccountId, EnhancedLoginStatus.INITIALIZING, { requestId });

      let worker: Worker;
      try {
        this.emitStatus(lineAccountId, EnhancedLoginStatus.LAUNCHING_BROWSER, { requestId });
        worker = await this.workerPoolService.initializeWorker(lineAccountId, credentials.email);
      } catch (error: any) {
        this.loginCoordinatorService.markLoginFailed(lineAccountId, error.message);
        return {
          success: false,
          status: EnhancedLoginStatus.FAILED,
          requestId,
          error: `Failed to initialize browser: ${error.message}`,
        };
      }

      // Step 5: Setup interception (dual-layer)
      const keyCapturedPromise = new Promise<{ keys: any; chatMid?: string }>((resolve) => {
        const onKeyCaptured = (keys: any, chatMid?: string) => {
          resolve({ keys, chatMid });
        };

        // Setup both CDP and Puppeteer interception
        this.workerPoolService.setupCDPInterception(worker, onKeyCaptured);
        this.workerPoolService.setupPuppeteerInterception(worker, onKeyCaptured);
      });

      // Step 6: Navigate to LINE extension
      this.emitStatus(lineAccountId, EnhancedLoginStatus.LOADING_EXTENSION, { requestId });
      const extensionUrl = `chrome-extension://${this.LINE_EXTENSION_ID}/index.html`;
      await worker.page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(3000);

      // Step 7: Check if already logged in
      this.emitStatus(lineAccountId, EnhancedLoginStatus.CHECKING_SESSION, { requestId });
      const isLoggedIn = await this.checkLoggedIn(worker.page);

      if (isLoggedIn) {
        this.logger.log(`Already logged in for ${lineAccountId}`);
        // Trigger keys capture
        const capturedData = await this.triggerAndCaptureKeys(worker, keyCapturedPromise, requestId, lineAccountId);
        if (capturedData) {
          await this.saveKeysToDatabase(lineAccountId, capturedData.keys, capturedData.chatMid);
          this.loginCoordinatorService.markLoginCompleted(lineAccountId);
          return {
            success: true,
            status: EnhancedLoginStatus.SUCCESS,
            requestId,
            keys: capturedData.keys,
            chatMid: capturedData.chatMid,
            sessionReused: true,
          };
        }
      }

      // Step 8: Perform login
      this.emitStatus(lineAccountId, EnhancedLoginStatus.ENTERING_CREDENTIALS, { requestId });
      await this.performLogin(worker.page, credentials.email, credentials.password);

      // Step 9: Wait for PIN
      this.emitStatus(lineAccountId, EnhancedLoginStatus.WAITING_PIN, { requestId });
      const pinCode = await this.waitForPin(worker.page, lineAccountId);

      if (pinCode) {
        this.workerPoolService.updateWorkerState(lineAccountId, WorkerState.WAITING_PIN, { pinCode });
        this.emitStatus(lineAccountId, EnhancedLoginStatus.PIN_DISPLAYED, { requestId, pinCode });

        // Step 10: Wait for login completion
        this.emitStatus(lineAccountId, EnhancedLoginStatus.VERIFYING, { requestId });
        const loginSuccess = await this.waitForLoginComplete(worker.page);

        if (loginSuccess) {
          // Step 11: Extract keys with multiple attempts
          this.emitStatus(lineAccountId, EnhancedLoginStatus.EXTRACTING_KEYS, { requestId });
          const capturedData = await this.triggerAndCaptureKeys(worker, keyCapturedPromise, requestId, lineAccountId);

          if (capturedData) {
            await this.saveKeysToDatabase(lineAccountId, capturedData.keys, capturedData.chatMid);
            this.loginCoordinatorService.markLoginCompleted(lineAccountId);

            return {
              success: true,
              status: EnhancedLoginStatus.SUCCESS,
              requestId,
              keys: capturedData.keys,
              chatMid: capturedData.chatMid,
              pinCode,
            };
          }
        }
      }

      throw new Error('Login failed or timed out');

    } catch (error: any) {
      this.logger.error(`Login failed for ${lineAccountId}: ${error.message}`);
      this.loginCoordinatorService.markLoginFailed(lineAccountId, error.message);
      this.emitStatus(lineAccountId, EnhancedLoginStatus.FAILED, { requestId, error: error.message });

      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        requestId,
        error: error.message,
      };
    } finally {
      // Always release the lock
      this.loginLockService.releaseLock(lineAccountId, 'enhanced');
    }
  }

  /**
   * Check for existing keys from same email (key copying)
   */
  private async checkExistingKeys(
    lineAccountId: string,
    email: string,
  ): Promise<{ keys: { xLineAccess: string; xHmac: string }; chatMid?: string } | null> {
    // Find another account with same email that has valid keys
    const existingSession = await this.lineSessionModel.findOne({
      lineAccountId: { $ne: lineAccountId },
      lineEmail: email,
      isActive: true,
      xLineAccess: { $exists: true, $ne: null },
      status: 'active',
    });

    if (existingSession?.xLineAccess && existingSession?.xHmac) {
      this.logger.log(`Found existing keys for email ${email}, copying to ${lineAccountId}`);

      // Copy keys to current account
      await this.keyStorageService.saveKeys({
        lineAccountId,
        xLineAccess: existingSession.xLineAccess,
        xHmac: existingSession.xHmac,
        source: 'copied',
        metadata: { copiedFrom: existingSession.lineAccountId },
      });

      return {
        keys: {
          xLineAccess: existingSession.xLineAccess,
          xHmac: existingSession.xHmac,
        },
        chatMid: existingSession.chatMid,
      };
    }

    return null;
  }

  /**
   * Trigger and capture keys with multiple attempts (like GSB)
   */
  private async triggerAndCaptureKeys(
    worker: Worker,
    keyCapturedPromise: Promise<{ keys: any; chatMid?: string }>,
    requestId: string,
    lineAccountId: string,
  ): Promise<{ keys: { xLineAccess: string; xHmac: string }; chatMid?: string } | null> {
    this.emitStatus(lineAccountId, EnhancedLoginStatus.TRIGGERING_MESSAGES, { requestId });

    for (let attempt = 1; attempt <= this.MESSAGE_TRIGGER_ATTEMPTS; attempt++) {
      this.logger.log(`Trigger attempt ${attempt}/${this.MESSAGE_TRIGGER_ATTEMPTS} for ${lineAccountId}`);

      try {
        switch (attempt) {
          case 1:
            // Attempt 1: Click chat button
            await this.clickChatButton(worker.page);
            break;

          case 2:
            // Attempt 2: Navigate to #/chats directly
            await this.navigateToChats(worker.page);
            break;

          case 3:
            // Attempt 3: Click first chat item
            await this.clickFirstChatItem(worker.page);
            break;

          case 4:
            // Attempt 4: Auto-detect and click bank notification chat
            await this.clickBankChat(worker.page);
            break;

          case 5:
            // Attempt 5: Scroll chat list and click second item
            await this.scrollAndClickChat(worker.page);
            break;

          case 6:
            // Attempt 6: Reload and retry
            await worker.page.reload({ waitUntil: 'domcontentloaded' });
            await this.delay(3000);
            await this.clickFirstChatItem(worker.page);
            break;
        }
      } catch (error: any) {
        this.logger.warn(`Trigger attempt ${attempt} failed: ${error.message}`);
      }

      await this.delay(this.ATTEMPT_DELAY);

      // Check if keys were captured
      if (worker.capturedKeys) {
        this.logger.log(`Keys captured on attempt ${attempt}`);

        // Wait a bit more for messages
        await this.delay(5000);

        return {
          keys: worker.capturedKeys,
          chatMid: worker.capturedChatMid,
        };
      }

      // Also check with timeout
      try {
        const result = await Promise.race([
          keyCapturedPromise,
          this.delay(2000).then(() => null),
        ]);

        if (result) {
          return result;
        }
      } catch {
        // Continue to next attempt
      }
    }

    // Final check
    if (worker.capturedKeys) {
      return {
        keys: worker.capturedKeys,
        chatMid: worker.capturedChatMid,
      };
    }

    return null;
  }

  /**
   * Click chat button (multiple selectors)
   */
  private async clickChatButton(page: any): Promise<void> {
    const selectors = [
      'button[aria-label="Go chatroom"]',
      'button[aria-label="チャット"]',
      '[data-testid="chat-tab"]',
      'a[href="#/chats"]',
      '[class*="chatTab"]',
    ];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await this.delay(1000);
          return;
        }
      } catch {
        // Try next selector
      }
    }
  }

  /**
   * Navigate to chats URL
   */
  private async navigateToChats(page: any): Promise<void> {
    try {
      const currentUrl = page.url();
      const baseUrl = currentUrl.split('#')[0];
      await page.goto(baseUrl + '#/chats', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await this.delay(2000);
    } catch (error: any) {
      this.logger.warn(`navigateToChats failed: ${error.message}`);
      // Don't throw - let the next attempt try a different approach
    }
  }

  /**
   * Click first chat item
   */
  private async clickFirstChatItem(page: any): Promise<void> {
    try {
      await page.evaluate(() => {
        const selectors = [
          '[class*="chatItem"]',
          '[class*="listItem"]',
          '[class*="ChatListItem"]',
          '[data-testid="chat-list-item"]',
        ];

        for (const selector of selectors) {
          const items = document.querySelectorAll(selector);
          if (items.length > 0) {
            (items[0] as HTMLElement).click();
            return;
          }
        }
      });
      await this.delay(1000);
    } catch (error: any) {
      this.logger.warn(`clickFirstChatItem failed: ${error.message}`);
    }
  }

  /**
   * Click bank notification chat
   */
  private async clickBankChat(page: any): Promise<void> {
    try {
      const bankPatterns = ['SCB', 'GSB', 'KBANK', 'KBank', 'ธนาคาร', 'ออมสิน', 'กสิกร', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย'];

      await page.evaluate((patterns: string[]) => {
        const chatItems = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');

        for (const item of chatItems) {
          const text = item.textContent || '';
          for (const pattern of patterns) {
            if (text.includes(pattern)) {
              (item as HTMLElement).click();
              return;
            }
          }
        }
      }, bankPatterns);

      await this.delay(1000);
    } catch (error: any) {
      this.logger.warn(`clickBankChat failed: ${error.message}`);
    }
  }

  /**
   * Scroll and click second chat
   */
  private async scrollAndClickChat(page: any): Promise<void> {
    try {
      await page.evaluate(() => {
        const chatList = document.querySelector('[class*="chatList"], [class*="ChatList"]');
        if (chatList) {
          chatList.scrollTop = 100;
        }

        setTimeout(() => {
          const items = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');
          if (items.length > 1) {
            (items[1] as HTMLElement).click();
          }
        }, 500);
      });

      await this.delay(1500);
    } catch (error: any) {
      this.logger.warn(`scrollAndClickChat failed: ${error.message}`);
    }
  }

  /**
   * Check if already logged in
   */
  private async checkLoggedIn(page: any): Promise<boolean> {
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
  private async performLogin(page: any, email: string, password: string): Promise<void> {
    await page.waitForSelector('input[name="email"]', { timeout: 90000 });

    await page.click('input[name="email"]', { clickCount: 3 });
    await page.type('input[name="email"]', email, { delay: 50 });

    await page.click('input[name="password"]', { clickCount: 3 });
    await page.type('input[name="password"]', password, { delay: 50 });

    const loginButton = await page.$('button[type="submit"]');
    if (loginButton) {
      await loginButton.click();
    }

    await this.delay(2000);
  }

  /**
   * Wait for PIN code
   */
  private async waitForPin(page: any, lineAccountId: string): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.PIN_TIMEOUT) {
      try {
        const pinCode = await page.evaluate(() => {
          const selectors = [
            '.pinCodeModal-module__pincode__bFKMn',
            '[class*="pincode"]',
            '[class*="pinCode"]',
            '[class*="pin-code"]',
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

          // Regex patterns
          const bodyText = document.body?.innerText || '';
          const patterns = [
            /PIN\s*[:：]?\s*(\d{6})/i,
            /รหัส\s*[:：]?\s*(\d{6})/i,
            /code\s*[:：]?\s*(\d{6})/i,
            /\b(\d{6})\b/,
          ];

          for (const pattern of patterns) {
            const match = bodyText.match(pattern);
            if (match && match[1]) {
              return match[1];
            }
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
  private async waitForLoginComplete(page: any): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < this.LOGIN_TIMEOUT) {
      try {
        const isLoggedIn = await this.checkLoggedIn(page);
        if (isLoggedIn) return true;

        const errorElement = await page.$('[class*="error"], [class*="alert-danger"]');
        if (errorElement) {
          const errorText = await page.evaluate((el: Element) => el.textContent, errorElement);
          throw new Error(`Login error: ${errorText}`);
        }
      } catch (e: any) {
        if (e.message.includes('Login error')) throw e;
      }

      await this.delay(2000);
    }

    return false;
  }

  /**
   * Save keys to database
   */
  private async saveKeysToDatabase(
    lineAccountId: string,
    keys: { xLineAccess: string; xHmac: string },
    chatMid?: string,
  ): Promise<void> {
    await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: keys.xLineAccess,
      xHmac: keys.xHmac,
      source: 'enhanced_auto_login',
    });

    // Update chatMid if captured
    if (chatMid) {
      await this.lineSessionModel.updateOne(
        { lineAccountId, isActive: true },
        { $set: { chatMid } },
      );
    }

    this.logger.log(`Keys saved for ${lineAccountId}, chatMid: ${chatMid || 'N/A'}`);
  }

  /**
   * Cancel login
   */
  async cancelLogin(lineAccountId: string): Promise<void> {
    this.loginCoordinatorService.cancelRequest(lineAccountId);
    await this.workerPoolService.closeWorker(lineAccountId);
    this.logger.log(`Login cancelled for ${lineAccountId}`);
  }

  /**
   * Get worker status
   */
  getWorkerStatus(lineAccountId: string) {
    const worker = this.workerPoolService.getWorker(lineAccountId);
    const request = this.loginCoordinatorService.getRequestStatus(lineAccountId);
    const cooldown = this.loginCoordinatorService.getCooldownInfo(lineAccountId);

    return {
      worker: worker ? {
        state: worker.state,
        pinCode: worker.pinCode,
        hasKeys: !!worker.capturedKeys,
        hasChatMid: !!worker.capturedChatMid,
      } : null,
      request,
      cooldown,
    };
  }

  /**
   * Reset cooldown
   */
  resetCooldown(lineAccountId: string): void {
    this.loginCoordinatorService.resetCooldown(lineAccountId);
  }

  /**
   * Emit status update
   */
  private emitStatus(lineAccountId: string, status: EnhancedLoginStatus, data?: any): void {
    this.eventEmitter.emit('enhanced-login.status', {
      lineAccountId,
      status,
      timestamp: new Date(),
      ...data,
    });
  }

  /**
   * Helper delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    // WorkerPoolService handles its own cleanup
  }
}
