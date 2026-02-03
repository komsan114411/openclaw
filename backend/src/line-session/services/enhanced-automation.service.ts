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

/**
 * PIN Status Types (ported from GSB)
 * FRESH: < 1 minute - ใหม่มาก
 * NEW: 1-5 minutes - ยังใช้ได้
 * OLD: >= 5 minutes - หมดอายุ
 */
export enum PinStatus {
  FRESH = 'FRESH',     // < 1 minute - ใหม่มาก
  NEW = 'NEW',         // 1-5 minutes - ยังใช้ได้
  OLD = 'OLD',         // >= 5 minutes - หมดอายุ
  NO_PIN = 'NO_PIN',   // ไม่มี PIN
}

/**
 * Keys Status Types (ported from GSB)
 */
export enum KeysStatus {
  UNKNOWN = 'UNKNOWN',
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  EXPIRING_SOON = 'EXPIRING_SOON',
}

/**
 * PIN Status Result Interface (ported from GSB)
 */
export interface PinStatusResult {
  pinCode: string | null;
  status: PinStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
  ageMinutes: number;
  ageSeconds: number;
  expiresIn: number;  // seconds until expiry
  isFresh: boolean;   // < 1 minute
  isNew: boolean;     // 1-5 minutes
  isUsable: boolean;  // < 5 minutes
  recommendation: string;
}

export interface EnhancedLoginResult {
  success: boolean;
  status: EnhancedLoginStatus;
  requestId?: string;
  pinCode?: string;
  error?: string;
  message?: string;
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
  private readonly LOGIN_TIMEOUT = 180000; // 3 minutes (GSB-style)
  private readonly PIN_TIMEOUT = 180000; // 3 minutes (GSB-style, was 90 seconds)
  private readonly DIALOG_TIMEOUT = 10000; // 10 seconds to wait for dialog after login
  private readonly MESSAGE_TRIGGER_ATTEMPTS = 6;
  private readonly ATTEMPT_DELAY = 4000; // 4 seconds between attempts

  // PIN Status Configuration (ported from GSB)
  private readonly PIN_EXPIRY_MINUTES = 5;      // PIN expires after 5 minutes
  private readonly PIN_FRESH_MINUTES = 1;       // PIN is "fresh" for 1 minute
  private readonly KEYS_EXPIRY_MINUTES = 30;    // Keys expire after 30 minutes
  private readonly KEYS_WARNING_MINUTES = 5;    // Warn 5 minutes before expiry

  // In-memory PIN storage (for real-time tracking like GSB)
  private pinStore: Map<string, { pinCode: string; createdAt: Date; updatedAt: Date }> = new Map();

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
   * With Xvfb support: headless=false + DISPLAY set = can run with virtual display
   */
  private isHeadlessMode(): boolean {
    const headlessEnv = process.env.PUPPETEER_HEADLESS;
    const displayEnv = process.env.DISPLAY;

    // If headless is explicitly false, we can run (with real or virtual display)
    if (headlessEnv === 'false') {
      return false;
    }

    // If DISPLAY is set (Xvfb), we can run even if headless not set
    if (displayEnv) {
      return false;
    }

    // Otherwise, check if headless is enabled
    return headlessEnv === 'true' || headlessEnv === '1' || headlessEnv === 'new';
  }

  /**
   * Check if virtual display (Xvfb) is available
   */
  private hasVirtualDisplay(): boolean {
    return !!process.env.DISPLAY;
  }

  /**
   * Check if enhanced automation is available
   */
  isAvailable(): boolean {
    // Extension-based login works with real display or Xvfb
    if (this.isHeadlessMode() && !this.hasVirtualDisplay()) {
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
   * Note: lineAccountId can be either:
   * - The session _id (for user flow)
   * - The actual LINE Account ID (for admin flow)
   */
  async saveCredentials(lineAccountId: string, email: string, password: string): Promise<boolean> {
    // Check if session exists first - try by _id first, then by lineAccountId field
    let existingSession = await this.lineSessionModel.findById(lineAccountId);

    if (!existingSession) {
      existingSession = await this.lineSessionModel.findOne({
        lineAccountId,
        isActive: true,
      });
    }

    if (!existingSession) {
      this.logger.warn(`Cannot save credentials: session not found for ${lineAccountId}`);
      return false;
    }

    const encryptedPassword = this.encryptPasswordValue(password);

    // Update using the found session's _id to ensure correct document is updated
    await this.lineSessionModel.updateOne(
      { _id: existingSession._id },
      {
        $set: {
          lineEmail: email,
          linePassword: encryptedPassword,
        },
      },
    );

    this.logger.log(`Credentials saved for ${lineAccountId}`);
    return true;
  }

  /**
   * Get credentials
   * Note: lineAccountId can be either session _id or actual LINE Account ID
   */
  async getCredentials(lineAccountId: string): Promise<{ email: string; password: string } | null> {
    // Try by _id first, then by lineAccountId field
    let session = await this.lineSessionModel.findById(lineAccountId);

    if (!session) {
      session = await this.lineSessionModel.findOne({
        lineAccountId,
        isActive: true,
        lineEmail: { $exists: true, $ne: null },
      });
    }

    if (!session?.lineEmail || !session?.linePassword) {
      this.logger.warn(`[GetCredentials] No credentials found for ${lineAccountId}`);
      return null;
    }

    try {
      const password = this.decryptPasswordValue(session.linePassword);
      return { email: session.lineEmail, password };
    } catch (error: any) {
      // [FIX Issue #3] Better error handling - log detailed error and emit event
      this.logger.error(`[GetCredentials] Failed to decrypt password for ${lineAccountId}: ${error.message}`);
      this.logger.error(`[GetCredentials] This may indicate corrupted credentials. User should re-enter password.`);

      // Emit event so frontend can notify user
      this.eventEmitter.emit('line-session.credential-error', {
        lineAccountId,
        error: 'Password decryption failed. Please re-enter your LINE credentials.',
        timestamp: new Date(),
      });

      return null;
    }
  }

  /**
   * Start enhanced login process
   * Note: lineAccountId can be either session _id or actual LINE Account ID
   * @param forceLogin - Skip key copying and force browser login (for testing)
   */
  async startLogin(
    lineAccountId: string,
    email?: string,
    password?: string,
    source: 'manual' | 'auto' | 'relogin' = 'manual',
    forceLogin = false,
  ): Promise<EnhancedLoginResult> {
    // Step 0: Check if session exists in database - try by _id first, then by lineAccountId
    let existingSession = await this.lineSessionModel.findById(lineAccountId);

    if (!existingSession) {
      existingSession = await this.lineSessionModel.findOne({
        lineAccountId,
        isActive: true,
      });
    }

    if (!existingSession) {
      this.logger.warn(`Cannot start login: session not found for ${lineAccountId}`);
      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: 'Session not found. Please create a LINE session first before attempting login.',
      };
    }

    // Step 0b: Check if headless mode without virtual display (extension-based login won't work)
    if (this.isHeadlessMode() && !this.hasVirtualDisplay()) {
      this.logger.warn(`Automated login not available: no display for ${lineAccountId}`);
      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: 'Automated login requires a display (Xvfb or real). Please configure DISPLAY environment or use manual key entry.',
      };
    }

    // Log display status
    this.logger.log(`Display check: DISPLAY=${process.env.DISPLAY || 'not set'}, HEADLESS=${process.env.PUPPETEER_HEADLESS || 'not set'}`);

    // Step 0b: Acquire global lock (prevent concurrent login from different services)
    const lockAcquired = this.loginLockService.acquireLock(lineAccountId, 'enhanced');
    if (!lockAcquired) {
      const lockInfo = this.loginLockService.getLockInfo(lineAccountId);

      // Check if there's an active worker with PIN - return PIN status instead of error
      const worker = this.workerPoolService.getWorker(lineAccountId);
      if (worker && worker.pinCode) {
        this.logger.log(`[Login] Returning existing PIN ${worker.pinCode} for ${lineAccountId} (login in progress)`);
        return {
          success: false,
          status: EnhancedLoginStatus.PIN_DISPLAYED,
          pinCode: worker.pinCode,
          message: 'PIN displayed. Please verify on your LINE mobile app.',
        };
      }

      // Check PIN store as fallback
      const pinStatus = this.getPinStatus(lineAccountId);
      if (pinStatus.pinCode && pinStatus.isUsable) {
        this.logger.log(`[Login] Returning stored PIN ${pinStatus.pinCode} for ${lineAccountId} (login in progress)`);
        return {
          success: false,
          status: EnhancedLoginStatus.PIN_DISPLAYED,
          pinCode: pinStatus.pinCode,
          message: 'PIN displayed. Please verify on your LINE mobile app.',
        };
      }

      // Return in-progress status instead of error
      return {
        success: false,
        status: EnhancedLoginStatus.VERIFYING,
        message: `Login in progress (${lockInfo?.source || 'unknown'}). Please wait...`,
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
      // Skip if forceLogin is true (for testing browser login)
      if (!forceLogin) {
        const existingKeys = await this.checkExistingKeys(lineAccountId, credentials.email);
        if (existingKeys) {
          this.loginCoordinatorService.markLoginCompleted(lineAccountId);
          this.logger.log(`[Login] Using existing keys for ${lineAccountId} (key copying)`);
          return {
            success: true,
            status: EnhancedLoginStatus.SUCCESS,
            requestId,
            keys: existingKeys.keys,
            chatMid: existingKeys.chatMid,
            sessionReused: true,
          };
        }
      } else {
        this.logger.log(`[Login] Force login enabled - skipping key copying for ${lineAccountId}`);
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

      // Step 6: Navigate to LINE extension (GSB-style with multiple fallback methods)
      this.emitStatus(lineAccountId, EnhancedLoginStatus.LOADING_EXTENSION, { requestId });
      let extensionLoaded = await this.navigateToExtension(worker);

      // If extension loading failed, try recreating browser
      if (!extensionLoaded) {
        this.logger.warn(`[Login] Extension loading failed, recreating browser for ${lineAccountId}`);

        // Close current worker and create new one
        await this.workerPoolService.closeWorker(lineAccountId);

        // Small delay before recreating
        await this.delay(2000);

        // Recreate worker with fresh browser
        this.emitStatus(lineAccountId, EnhancedLoginStatus.LAUNCHING_BROWSER, { requestId });
        worker = await this.workerPoolService.initializeWorker(lineAccountId, credentials.email);

        // Setup interception again for new browser
        const newKeyCapturedPromise = new Promise<{ keys: any; chatMid?: string }>((resolve) => {
          const onKeyCaptured = (keys: any, chatMid?: string) => {
            resolve({ keys, chatMid });
          };
          this.workerPoolService.setupCDPInterception(worker, onKeyCaptured);
          this.workerPoolService.setupPuppeteerInterception(worker, onKeyCaptured);
        });

        // Wait for browser to stabilize
        await this.delay(3000);

        // Try extension loading again
        this.emitStatus(lineAccountId, EnhancedLoginStatus.LOADING_EXTENSION, { requestId });
        extensionLoaded = await this.navigateToExtension(worker);

        if (!extensionLoaded) {
          throw new Error('Failed to load LINE extension after browser recreation');
        }
      }

      await this.delay(3000);

      // Take screenshot for debugging (only in development)
      try {
        const pageContent = await worker.page.content();
        this.logger.log(`[Login] Page content length: ${pageContent.length} chars`);
        if (pageContent.length < 500) {
          this.logger.warn(`[Login] Page content seems too short, might not have loaded properly`);
        }
      } catch (e) {
        // Ignore screenshot errors
      }

      // Step 7: Check if already logged in
      this.emitStatus(lineAccountId, EnhancedLoginStatus.CHECKING_SESSION, { requestId });
      const isLoggedIn = await this.checkLoggedIn(worker.page);
      this.logger.log(`[Login] Already logged in: ${isLoggedIn}`);

      if (isLoggedIn) {
        this.logger.log(`Already logged in for ${lineAccountId}`);
        // Trigger keys capture
        const capturedData = await this.triggerAndCaptureKeys(worker, keyCapturedPromise, requestId, lineAccountId);
        if (capturedData) {
          await this.saveKeysToDatabase(lineAccountId, capturedData.keys, capturedData.chatMid, capturedData.cUrlBash);
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
        this.logger.log(`PIN ${pinCode} detected, returning to frontend immediately for ${lineAccountId}`);

        // Store PIN with timestamp for status tracking (GSB-style)
        this.storePin(lineAccountId, pinCode);

        // Update worker state with PIN
        this.workerPoolService.updateWorkerState(lineAccountId, WorkerState.WAITING_PIN, { pinCode });

        // Emit PIN_DISPLAYED status event for WebSocket clients
        this.emitStatus(lineAccountId, EnhancedLoginStatus.PIN_DISPLAYED, { requestId, pinCode });

        // Build result BEFORE starting background process
        const result: EnhancedLoginResult = {
          success: false, // Not complete yet, but PIN is available
          status: EnhancedLoginStatus.PIN_DISPLAYED,
          requestId,
          pinCode,
          message: 'PIN displayed. Please verify on your LINE mobile app.',
        };

        this.logger.log(`[PIN] === ABOUT TO RETURN PIN RESULT ===`);
        this.logger.log(`[PIN] pinCode: ${pinCode}`);
        this.logger.log(`[PIN] result: ${JSON.stringify(result)}`);

        // Start background process AFTER building result (non-blocking with setImmediate)
        setImmediate(() => {
          this.continueLoginInBackground(
            worker,
            keyCapturedPromise,
            requestId!,
            lineAccountId,
            pinCode,
          );
        });

        this.logger.log(`[PIN] === RETURNING NOW ===`);
        return result;
      }

      throw new Error('Login failed or timed out - no PIN detected');

    } catch (error: any) {
      this.logger.error(`Login failed for ${lineAccountId}: ${error.message}`);
      this.loginCoordinatorService.markLoginFailed(lineAccountId, error.message);
      this.emitStatus(lineAccountId, EnhancedLoginStatus.FAILED, { requestId, error: error.message });

      // Release lock on error (background process releases its own lock)
      this.loginLockService.releaseLock(lineAccountId, 'enhanced');

      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        requestId,
        error: error.message,
      };
    }
    // Note: Don't release lock here - if PIN returned, background process handles it
  }

  /**
   * Continue login process in background after PIN is displayed
   * This allows the API to return immediately with the PIN
   */
  private async continueLoginInBackground(
    worker: Worker,
    keyCapturedPromise: Promise<{ keys: any; chatMid?: string }>,
    requestId: string,
    lineAccountId: string,
    pinCode: string,
  ): Promise<void> {
    try {
      // Wait for login completion (user enters PIN on mobile)
      this.emitStatus(lineAccountId, EnhancedLoginStatus.VERIFYING, { requestId });
      const loginSuccess = await this.waitForLoginComplete(worker.page);

      if (loginSuccess) {
        // Extract keys with multiple attempts
        this.emitStatus(lineAccountId, EnhancedLoginStatus.EXTRACTING_KEYS, { requestId });
        const capturedData = await this.triggerAndCaptureKeys(worker, keyCapturedPromise, requestId, lineAccountId);

        if (capturedData) {
          await this.saveKeysToDatabase(lineAccountId, capturedData.keys, capturedData.chatMid, capturedData.cUrlBash);
          this.loginCoordinatorService.markLoginCompleted(lineAccountId);

          // Clear PIN from store after successful login to stop PIN countdown broadcasts
          this.pinStore.delete(lineAccountId);
          this.logger.log(`[PIN] Cleared PIN for ${lineAccountId} after successful login`);

          this.emitStatus(lineAccountId, EnhancedLoginStatus.SUCCESS, {
            requestId,
            pinCode,
            chatMid: capturedData.chatMid,
            keys: capturedData.keys, // Include keys for auto-slip module
          });
          this.logger.log(`Background login completed for ${lineAccountId}`);
          return;
        }
      }

      // Login failed
      throw new Error('Login verification failed or timed out');

    } catch (error: any) {
      this.logger.error(`[BackgroundLogin] Failed for ${lineAccountId}: ${error.message}`);
      this.loginCoordinatorService.markLoginFailed(lineAccountId, error.message);
      this.emitStatus(lineAccountId, EnhancedLoginStatus.FAILED, { requestId, error: error.message });
    } finally {
      // [FIX Issue #5] Release lock safely with try-catch
      try {
        this.loginLockService.releaseLock(lineAccountId, 'enhanced');
        this.logger.debug(`[BackgroundLogin] Lock released for ${lineAccountId}`);
      } catch (lockError: any) {
        this.logger.error(`[BackgroundLogin] Failed to release lock for ${lineAccountId}: ${lockError.message}`);
        // Lock will be auto-released by LoginLockService timeout
      }
    }
  }

  /**
   * Validate keys by making a test API call to LINE
   */
  async validateKeys(xLineAccess: string, xHmac: string): Promise<boolean> {
    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://line-chrome-gw.line-apps.com/api/talk/thrift/Talk/TalkService/getChats',
        ['', 50, ''],
        {
          headers: {
            'x-line-access': xLineAccess,
            'x-hmac': xHmac,
            'content-type': 'application/json',
            'x-line-chrome-version': '3.4.0',
          },
          timeout: 10000,
          validateStatus: (status: number) => status < 500,
        },
      );

      // Check if response is successful
      if (response.status === 200 && response.data?.code === 0) {
        this.logger.log(`[ValidateKeys] Keys are VALID`);
        return true;
      }

      // 401/403 means keys are expired
      if (response.status === 401 || response.status === 403) {
        this.logger.warn(`[ValidateKeys] Keys are EXPIRED (${response.status})`);
        return false;
      }

      // Handle specific LINE API error codes for status 400
      const errorCode = response.data?.code;
      if (response.status === 400) {
        // Error code 10005: Session expired/invalid token
        // Error code 20: Invalid session
        // Error code 35: Authentication required
        if (errorCode === 10005 || errorCode === 20 || errorCode === 35) {
          this.logger.warn(`[ValidateKeys] Keys are EXPIRED (status=400, code=${errorCode})`);
          return false;
        }
        // Error code 10008: Rate limited - assume keys are still valid
        if (errorCode === 10008) {
          this.logger.log(`[ValidateKeys] Rate limited (code=10008) - assuming keys are VALID`);
          return true;
        }
      }

      // For 200 with non-zero code, keys might still work for messages
      if (response.status === 200) {
        this.logger.log(`[ValidateKeys] Status 200 with code=${errorCode} - assuming keys are VALID`);
        return true;
      }

      this.logger.warn(`[ValidateKeys] Keys validation unclear: status=${response.status}, code=${errorCode}`);
      return false;
    } catch (error: any) {
      this.logger.error(`[ValidateKeys] Error validating keys: ${error.message}`);
      return false;
    }
  }

  /**
   * Check for existing keys from same email (key copying)
   * Now validates keys before copying
   */
  private async checkExistingKeys(
    lineAccountId: string,
    email: string,
  ): Promise<{ keys: { xLineAccess: string; xHmac: string }; chatMid?: string } | null> {
    // Find another account with same email that has keys
    const existingSession = await this.lineSessionModel.findOne({
      _id: { $ne: lineAccountId },
      lineEmail: email,
      isActive: true,
      xLineAccess: { $exists: true, $ne: null },
      $expr: { $gt: [{ $strLenCP: '$xLineAccess' }, 0] },
    });

    if (existingSession?.xLineAccess && existingSession?.xHmac) {
      this.logger.log(`[KeyCopy] Found keys for email ${email}, validating before copy...`);

      // VALIDATE keys before copying
      const isValid = await this.validateKeys(existingSession.xLineAccess, existingSession.xHmac);

      if (!isValid) {
        this.logger.warn(`[KeyCopy] Keys are INVALID/EXPIRED - will proceed with browser login`);

        // Mark the source session as needing relogin too
        await this.lineSessionModel.updateOne(
          { _id: existingSession._id },
          {
            $set: {
              status: 'expired',
              lastCheckResult: 'expired',
            },
          },
        );

        return null; // Don't copy invalid keys
      }

      this.logger.log(`[KeyCopy] Keys are VALID - copying to ${lineAccountId}`);

      // Copy keys to current account
      await this.keyStorageService.saveKeys({
        lineAccountId,
        xLineAccess: existingSession.xLineAccess,
        xHmac: existingSession.xHmac,
        source: 'copied',
        metadata: { copiedFrom: existingSession._id.toString() },
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
  ): Promise<{ keys: { xLineAccess: string; xHmac: string }; chatMid?: string; cUrlBash?: string } | null> {
    this.emitStatus(lineAccountId, EnhancedLoginStatus.TRIGGERING_MESSAGES, { requestId });

    for (let attempt = 1; attempt <= this.MESSAGE_TRIGGER_ATTEMPTS; attempt++) {
      this.logger.log(`Trigger attempt ${attempt}/${this.MESSAGE_TRIGGER_ATTEMPTS} for ${lineAccountId}`);

      try {
        switch (attempt) {
          case 1:
            // Attempt 1: Click chat button (with CDP support)
            await this.clickChatButton(worker.page, worker.cdpClient);
            break;

          case 2:
            // Attempt 2: Navigate to #/chats directly
            await this.navigateToChats(worker.page);
            break;

          case 3:
            // Attempt 3: Click first chat item
            await this.clickFirstChatItem(worker.page, worker.cdpClient);
            break;

          case 4:
            // Attempt 4: Auto-detect and click bank notification chat
            await this.clickBankChat(worker.page, worker.cdpClient);
            break;

          case 5:
            // Attempt 5: Scroll chat list and click second item
            await this.scrollAndClickChat(worker.page, worker.cdpClient);
            break;

          case 6:
            // Attempt 6: Reload and retry
            await worker.page.reload({ waitUntil: 'domcontentloaded' });
            await this.delay(3000);
            await this.clickFirstChatItem(worker.page, worker.cdpClient);
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
          cUrlBash: worker.capturedCurl,
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
        cUrlBash: worker.capturedCurl,
      };
    }

    return null;
  }

  /**
   * Click chat button with CDP fallback (GSB-style)
   */
  private async clickChatButton(page: any, cdpClient?: any): Promise<void> {
    const selectors = [
      'button[aria-label="Go chatroom"]',
      'button[aria-label="チャット"]',
      '[data-testid="chat-tab"]',
      'a[href="#/chats"]',
      '[class*="chatTab"]',
      'nav button:first-child',
      '[class*="navItem"]:first-child',
    ];

    for (const selector of selectors) {
      try {
        // First try: Get element position for CDP click
        const elementInfo = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          if (el) {
            const rect = el.getBoundingClientRect();
            return {
              found: true,
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
            };
          }
          return { found: false, x: 0, y: 0 };
        }, selector);

        if (elementInfo.found) {
          // Try CDP click first (more reliable like GSB)
          if (cdpClient) {
            try {
              await cdpClient.send('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: elementInfo.x,
                y: elementInfo.y,
                button: 'left',
                clickCount: 1,
              });
              await cdpClient.send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: elementInfo.x,
                y: elementInfo.y,
                button: 'left',
                clickCount: 1,
              });
              this.logger.log(`[CDP Click] Clicked ${selector} at (${elementInfo.x}, ${elementInfo.y})`);
              await this.delay(1000);
              return;
            } catch (cdpError) {
              // Fall back to normal click
            }
          }

          // Fallback: Normal element click
          const element = await page.$(selector);
          if (element) {
            await element.click();
            this.logger.log(`[Click] Clicked ${selector}`);
            await this.delay(1000);
            return;
          }
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
   * Click first chat item (Enhanced with CDP)
   */
  private async clickFirstChatItem(page: any, cdpClient?: any): Promise<void> {
    try {
      const elementInfo = await page.evaluate(() => {
        const selectors = [
          '[class*="chatItem"]',
          '[class*="listItem"]',
          '[class*="ChatListItem"]',
          '[data-testid="chat-list-item"]',
        ];

        for (const selector of selectors) {
          const items = document.querySelectorAll(selector);
          if (items.length > 0) {
            const el = items[0] as HTMLElement;
            const rect = el.getBoundingClientRect();
            return {
              found: true,
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              selector
            };
          }
        }
        return { found: false, x: 0, y: 0 };
      });

      if (elementInfo.found) {
        if (cdpClient) {
          try {
            await cdpClient.send('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x: elementInfo.x,
              y: elementInfo.y,
              button: 'left',
              clickCount: 1,
            });
            await cdpClient.send('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: elementInfo.x,
              y: elementInfo.y,
              button: 'left',
              clickCount: 1,
            });
            this.logger.log(`[CDP Click] Clicked first chat item (${elementInfo.selector})`);
            await this.delay(1000);
            return;
          } catch (e) {
            // Fallback
          }
        }

        // Fallback or if CDP fails
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel) as HTMLElement;
          if (el) el.click();
        }, elementInfo.selector);
        this.logger.log(`[Click] Clicked first chat item (${elementInfo.selector})`);
        await this.delay(1000);
      }
    } catch (error: any) {
      this.logger.warn(`clickFirstChatItem failed: ${error.message}`);
    }
  }

  /**
   * Click bank notification chat (Enhanced with CDP)
   */
  private async clickBankChat(page: any, cdpClient?: any): Promise<void> {
    try {
      const bankPatterns = ['SCB', 'GSB', 'KBANK', 'KBank', 'ธนาคาร', 'ออมสิน', 'กสิกร', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย'];

      const elementInfo = await page.evaluate((patterns: string[]) => {
        const chatItems = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');

        for (const item of chatItems) {
          const text = item.textContent || '';
          for (const pattern of patterns) {
            if (text.includes(pattern)) {
              const rect = item.getBoundingClientRect();
              return {
                found: true,
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                text: text.substring(0, 30)
              };
            }
          }
        }
        return { found: false, x: 0, y: 0 };
      }, bankPatterns);

      if (elementInfo.found) {
        if (cdpClient) {
          try {
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: elementInfo.x, y: elementInfo.y, button: 'left', clickCount: 1 });
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: elementInfo.x, y: elementInfo.y, button: 'left', clickCount: 1 });
            this.logger.log(`[CDP Click] Clicked bank chat "${elementInfo.text}..."`);
            await this.delay(1000);
            return;
          } catch (e) { /* Fallback */ }
        }

        // Fallback: DOM click
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
        this.logger.log(`[Click] Clicked bank chat (fallback)`);
        await this.delay(1000);
      }
    } catch (error: any) {
      this.logger.warn(`clickBankChat failed: ${error.message}`);
    }
  }

  /**
   * Scroll and click second chat (Enhanced with CDP)
   */
  private async scrollAndClickChat(page: any, cdpClient?: any): Promise<void> {
    try {
      const elementInfo = await page.evaluate(async () => {
        const chatList = document.querySelector('[class*="chatList"], [class*="ChatList"]');
        if (chatList) {
          chatList.scrollTop = 100;
        }

        // Wait a bit for scroll - logic inside evaluate is sync, so we can't wait well.
        // We'll return finding info and click from outside
        const items = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');
        if (items.length > 1) {
          const el = items[1] as HTMLElement;
          const rect = el.getBoundingClientRect();
          return {
            found: true,
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
          };
        }
        return { found: false, x: 0, y: 0 };
      });

      await this.delay(500); // Wait for scroll effect

      if (elementInfo.found) {
        if (cdpClient) {
          try {
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: elementInfo.x, y: elementInfo.y, button: 'left', clickCount: 1 });
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: elementInfo.x, y: elementInfo.y, button: 'left', clickCount: 1 });
            this.logger.log(`[CDP Click] Clicked second chat item`);
            await this.delay(1000);
            return;
          } catch (e) { }
        }

        // Fallback: DOM click
        await page.evaluate(() => {
          const items = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');
          if (items.length > 1) {
            (items[1] as HTMLElement).click();
          }
        });
        this.logger.log(`[Click] Clicked second chat item (fallback)`);
        await this.delay(1000);
      }
    } catch (error: any) {
      this.logger.warn(`scrollAndClickChat failed: ${error.message}`);
    }
  }

  /**
   * Check if already logged in (GSB-style with multiple indicators)
   */
  private async checkLoggedIn(page: any): Promise<boolean> {
    try {
      const url = page.url();

      // Check URL patterns that indicate logged in
      if (url.includes('#/chats') || url.includes('#/friends') || url.includes('#/settings')) {
        this.logger.log(`[CheckLoggedIn] URL indicates logged in: ${url}`);
        return true;
      }

      // Check for chat-related elements (indicates logged in)
      const loggedInSelectors = [
        'button[aria-label="Go chatroom"]',
        'button[aria-label="チャット"]',
        '[data-testid="chat-list"]',
        '[data-testid="chat-tab"]',
        '[class*="chatList"]',
        '[class*="ChatList"]',
        '[class*="friendList"]',
        '[class*="FriendList"]',
        'a[href="#/chats"]',
        'a[href="#/friends"]',
      ];

      for (const selector of loggedInSelectors) {
        const element = await page.$(selector);
        if (element) {
          this.logger.log(`[CheckLoggedIn] Found logged-in indicator: ${selector}`);
          return true;
        }
      }

      // Check if login form is NOT present (might indicate logged in)
      const loginForm = await page.$('input[name="email"]');
      if (!loginForm) {
        // No login form and no PIN dialog = might be logged in
        const pinDialog = await page.$('[role="dialog"], [class*="pinCode"]');
        if (!pinDialog) {
          // Check if we're on a page that requires login
          const pageContent = await page.content();
          if (pageContent.includes('chats') || pageContent.includes('friends') || pageContent.includes('messages')) {
            this.logger.log(`[CheckLoggedIn] No login form, page content suggests logged in`);
            return true;
          }
        }
      }

      return false;
    } catch (e) {
      this.logger.warn(`[CheckLoggedIn] Error checking login status: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * Navigate to LINE extension with multiple fallback methods (GSB-style)
   * Method 1: Direct navigation to chrome-extension:// URL
   * Method 2: Navigate to chrome://extensions and enable LINE extension
   * Method 3: Use known extension URL as fallback
   */
  private async navigateToExtension(worker: Worker): Promise<boolean> {
    const page = worker.page;
    const extensionUrl = `chrome-extension://${this.LINE_EXTENSION_ID}/index.html`;
    const maxRetries = 5; // Reduced from 15 to fail faster

    this.logger.log(`[Extension] ========== EXTENSION LOADING (GSB-style) ==========`);
    this.logger.log(`[Extension] Target URL: ${extensionUrl}`);

    // First: Test if browser/page is responsive
    try {
      this.logger.log(`[Extension] Testing browser responsiveness...`);
      const testResult = await Promise.race([
        page.evaluate(() => 'responsive'),
        this.delay(5000).then(() => null),
      ]);

      if (!testResult) {
        this.logger.error(`[Extension] Browser not responsive - page.evaluate timed out`);
        return false;
      }
      this.logger.log(`[Extension] Browser is responsive`);
    } catch (testError: any) {
      this.logger.error(`[Extension] Browser test failed: ${testError.message}`);
      return false;
    }

    // Method 1: Try direct navigation first (with shorter timeout)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`[Extension] Method 1: Direct navigation (attempt ${attempt}/${maxRetries})...`);

        // Navigate with shorter timeout
        await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

        const currentUrl = page.url();
        this.logger.log(`[Extension] Current URL: ${currentUrl}`);

        if (!currentUrl.includes('chrome-error') && currentUrl.includes(this.LINE_EXTENSION_ID)) {
          this.logger.log(`[Extension] Method 1 SUCCESS - Extension loaded!`);
          await this.delay(2000);
          return true;
        }

        this.logger.warn(`[Extension] Method 1 failed - URL: ${currentUrl}`);

        // Check if it's a simple about:blank - extension might not be loaded
        if (currentUrl === 'about:blank' || currentUrl.includes('chrome-error')) {
          this.logger.warn(`[Extension] Extension appears not to be loaded in browser`);
          break; // Don't retry, extension is not available
        }
      } catch (navError: any) {
        this.logger.warn(`[Extension] Method 1 error: ${navError.message?.substring(0, 100)}`);

        // If timeout, browser might be overloaded
        if (navError.message?.includes('timeout')) {
          this.logger.warn(`[Extension] Navigation timeout - browser might be overloaded`);
          // Short delay before retry
          await this.delay(1000);
        }
      }

      // Delay between retries
      if (attempt < maxRetries) {
        await this.delay(1500);
      }
    }

    // Method 2: Try to navigate to about:blank first then extension (clean navigation)
    try {
      this.logger.log(`[Extension] Method 2: Clean navigation via about:blank...`);

      // First go to about:blank
      await page.goto('about:blank', { waitUntil: 'load', timeout: 5000 });
      await this.delay(1000);

      // Then navigate to extension
      await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const currentUrl = page.url();
      this.logger.log(`[Extension] Method 2 URL: ${currentUrl}`);

      if (!currentUrl.includes('chrome-error') && currentUrl.includes(this.LINE_EXTENSION_ID)) {
        this.logger.log(`[Extension] Method 2 SUCCESS - Extension loaded!`);
        await this.delay(2000);
        return true;
      }

      // Check page content
      const pageContent = await page.content();
      this.logger.log(`[Extension] Method 2 content length: ${pageContent.length}`);

      if (pageContent.length > 1000 && (pageContent.includes('LINE') || pageContent.includes('email'))) {
        this.logger.log(`[Extension] Method 2 SUCCESS - Extension content detected!`);
        await this.delay(2000);
        return true;
      }

      this.logger.warn(`[Extension] Method 2 failed`);
    } catch (method2Error: any) {
      this.logger.warn(`[Extension] Method 2 error: ${method2Error.message?.substring(0, 100)}`);
    }

    // Method 3: Try CDP navigation (more reliable in some cases)
    try {
      this.logger.log(`[Extension] Method 3: CDP navigation...`);

      if (worker.cdpClient) {
        // Use CDP to navigate
        await worker.cdpClient.send('Page.navigate', { url: extensionUrl });
        await this.delay(3000);

        const currentUrl = page.url();
        this.logger.log(`[Extension] Method 3 URL: ${currentUrl}`);

        if (currentUrl.includes(this.LINE_EXTENSION_ID)) {
          this.logger.log(`[Extension] Method 3 SUCCESS - Extension loaded via CDP!`);
          await this.delay(2000);
          return true;
        }
      }

      this.logger.warn(`[Extension] Method 3 failed`);
    } catch (cdpError: any) {
      this.logger.warn(`[Extension] Method 3 error: ${cdpError.message?.substring(0, 100)}`);
    }

    // Method 4: chrome://extensions to verify extension is loaded
    try {
      this.logger.log(`[Extension] Method 4: Checking chrome://extensions...`);

      await page.goto('chrome://extensions', { waitUntil: 'load', timeout: 10000 });
      await this.delay(2000);

      // Check if LINE extension exists
      const extensionCheck = await page.evaluate(() => {
        const pageText = document.body?.innerText || '';
        return {
          hasLine: pageText.toLowerCase().includes('line'),
          hasExtensions: document.querySelectorAll('extensions-item').length,
        };
      });

      this.logger.log(`[Extension] chrome://extensions check: ${JSON.stringify(extensionCheck)}`);

      if (extensionCheck.hasLine || extensionCheck.hasExtensions > 0) {
        // Extension is present, try navigating one more time
        await this.delay(1000);
        await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const currentUrl = page.url();
        if (currentUrl.includes(this.LINE_EXTENSION_ID)) {
          this.logger.log(`[Extension] Method 4 SUCCESS - Extension loaded after verification!`);
          await this.delay(2000);
          return true;
        }
      } else {
        this.logger.error(`[Extension] Extension NOT found in chrome://extensions - browser might not have loaded it`);
      }
    } catch (extCheckError: any) {
      this.logger.warn(`[Extension] Method 4 error: ${extCheckError.message?.substring(0, 100)}`);
    }

    this.logger.error(`[Extension] ========== ALL METHODS FAILED ==========`);
    return false;
  }

  /**
   * Perform login (GSB-style - simple form submission)
   */
  private async performLogin(page: any, email: string, password: string): Promise<void> {
    this.logger.log(`[Login] ========== STARTING LOGIN PROCESS ==========`);
    this.logger.log(`[Login] Waiting for email input field...`);

    try {
      await page.waitForSelector('input[name="email"]', { timeout: 90000 });
      this.logger.log(`[Login] Found email input, entering credentials`);
    } catch (e: any) {
      this.logger.error(`[Login] Email input not found: ${e.message}`);
      const currentUrl = page.url();
      this.logger.error(`[Login] Current URL: ${currentUrl}`);

      // Take screenshot of current state for debugging
      const pageContent = await page.content();
      this.logger.error(`[Login] Page content length: ${pageContent.length}`);
      this.logger.error(`[Login] Page contains 'email': ${pageContent.includes('email')}`);
      this.logger.error(`[Login] Page contains 'login': ${pageContent.includes('login')}`);
      throw e;
    }

    // Clear and enter email
    this.logger.log(`[Login] Clicking email input...`);
    await page.click('input[name="email"]', { clickCount: 3 });
    this.logger.log(`[Login] Typing email...`);
    await page.type('input[name="email"]', email, { delay: 50 });
    this.logger.log(`[Login] Entered email: ${email.substring(0, 3)}***`);

    // Clear and enter password
    this.logger.log(`[Login] Clicking password input...`);
    await page.click('input[name="password"]', { clickCount: 3 });
    this.logger.log(`[Login] Typing password...`);
    await page.type('input[name="password"]', password, { delay: 50 });
    this.logger.log(`[Login] Entered password: ***${password.length} chars`);

    // Click login button
    this.logger.log(`[Login] Looking for login button...`);
    const loginButton = await page.$('button[type="submit"]');
    if (loginButton) {
      this.logger.log(`[Login] Found login button, clicking...`);
      await loginButton.click();
      this.logger.log(`[Login] Clicked login button`);
    } else {
      // Try alternative selectors
      this.logger.warn(`[Login] button[type="submit"] not found, trying alternatives...`);
      const altSelectors = [
        'button:contains("Log in")',
        'button:contains("ล็อกอิน")',
        'button:contains("Login")',
        'input[type="submit"]',
        'form button',
      ];

      let clicked = false;
      for (const sel of altSelectors) {
        try {
          const altButton = await page.$(sel);
          if (altButton) {
            await altButton.click();
            this.logger.log(`[Login] Clicked alternative button: ${sel}`);
            clicked = true;
            break;
          }
        } catch {
          // Try next
        }
      }

      if (!clicked) {
        // Try form submit
        try {
          await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) form.submit();
          });
          this.logger.log(`[Login] Submitted form directly`);
          clicked = true;
        } catch {
          // Ignore
        }
      }

      if (!clicked) {
        throw new Error('Login button not found');
      }
    }

    // GSB-style: Just wait a short time after clicking (don't wait for dialog)
    this.logger.log(`[Login] Waiting 3 seconds for form submission...`);
    await this.delay(3000);

    // Log current state
    const currentUrl = page.url();
    this.logger.log(`[Login] Current URL after submit: ${currentUrl}`);

    // Check for immediate errors
    const errorDetected = await this.detectLoginError(page);
    if (errorDetected) {
      this.logger.error(`[Login] Error detected: ${errorDetected}`);
      throw new Error(`Login failed: ${errorDetected}`);
    }

    this.logger.log(`[Login] ========== LOGIN FORM SUBMITTED, WAITING FOR PIN ==========`);
  }

  /**
   * Detect login errors on page (GSB-style)
   */
  private async detectLoginError(page: any): Promise<string | null> {
    try {
      const errorMessage = await page.evaluate(() => {
        // Check for error elements
        const errorSelectors = [
          '[class*="error"]',
          '[class*="Error"]',
          '[class*="alert-danger"]',
          '[class*="alert-error"]',
          '.error-message',
          '[data-testid="error"]',
        ];

        for (const selector of errorSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            const text = element.textContent.trim();
            if (text && text.length > 0 && text.length < 200) {
              return text;
            }
          }
        }

        // Check for specific error text in body
        const bodyText = document.body?.innerText || '';
        const errorPatterns = [
          /incorrect.*(password|email)/i,
          /invalid.*(credentials|password|email)/i,
          /login.*(failed|error)/i,
          /รหัสผ่าน.*ไม่ถูกต้อง/i,
          /อีเมล.*ไม่ถูกต้อง/i,
          /เข้าสู่ระบบ.*ไม่สำเร็จ/i,
        ];

        for (const pattern of errorPatterns) {
          const match = bodyText.match(pattern);
          if (match) {
            return match[0];
          }
        }

        return null;
      });

      return errorMessage;
    } catch {
      return null;
    }
  }

  /**
   * Wait for PIN code (GSB-style with extended timeout and better selectors)
   */
  private async waitForPin(page: any, lineAccountId: string): Promise<string | null> {
    const startTime = Date.now();
    let checkCount = 0;
    let lastUrl = '';

    this.logger.log(`[PIN] Starting PIN detection for ${lineAccountId}, timeout: ${this.PIN_TIMEOUT}ms (${this.PIN_TIMEOUT / 60000} minutes)`);

    while (Date.now() - startTime < this.PIN_TIMEOUT) {
      checkCount++;
      try {
        // Log every 10 checks (approximately every 10 seconds)
        if (checkCount % 10 === 1) {
          const currentUrl = page.url();
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          this.logger.log(`[PIN] Check #${checkCount}, elapsed: ${elapsed}s, URL: ${currentUrl}`);

          // If URL changed, log it
          if (currentUrl !== lastUrl) {
            this.logger.log(`[PIN] URL changed: ${lastUrl} -> ${currentUrl}`);
            lastUrl = currentUrl;
          }
        }

        // GSB-style PIN detection with multiple approaches
        const pinCode = await page.evaluate(() => {
          // Priority 1: GSB's specific PIN selector
          const gsbPinElement = document.querySelector('.pinCodeModal-module__pincode__bFKMn');
          if (gsbPinElement) {
            const text = gsbPinElement.textContent?.trim();
            if (text && /^\d{6}$/.test(text)) {
              return text;
            }
          }

          // Priority 2: Dialog with PIN (GSB approach)
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            // Look for 6-digit number in dialog
            const spans = dialog.querySelectorAll('span, div, p');
            for (const span of spans) {
              const text = span.textContent?.trim();
              if (text && /^\d{6}$/.test(text)) {
                return text;
              }
            }
          }

          // Priority 3: Various PIN class selectors
          const selectors = [
            '[class*="pincode"]',
            '[class*="pinCode"]',
            '[class*="pin-code"]',
            '[class*="PinCode"]',
            '[class*="verification-code"]',
            '[class*="verificationCode"]',
            '[data-testid*="pin"]',
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

          // Priority 4: Look for large/styled numbers (PIN usually displayed prominently)
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.children.length === 0) { // Leaf nodes only
              const text = el.textContent?.trim();
              if (text && /^\d{6}$/.test(text)) {
                // Check if it's styled as PIN (larger font, centered, etc.)
                const style = window.getComputedStyle(el);
                const fontSize = parseFloat(style.fontSize);
                if (fontSize >= 18) { // PIN usually displayed in larger font
                  return text;
                }
              }
            }
          }

          // Priority 5: Regex patterns on body text (last resort)
          const bodyText = document.body?.innerText || '';
          const patterns = [
            /PIN\s*[:：]?\s*(\d{6})/i,
            /รหัส(?:ยืนยัน)?\s*[:：]?\s*(\d{6})/i,
            /verification\s*code\s*[:：]?\s*(\d{6})/i,
            /code\s*[:：]?\s*(\d{6})/i,
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
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          this.logger.log(`[PIN] PIN detected for ${lineAccountId}: ${pinCode} (after ${elapsed}s, ${checkCount} checks)`);
          return pinCode;
        }

        // Check for errors that might indicate login failed
        if (checkCount % 30 === 0) { // Check every 30 seconds
          const errorDetected = await this.detectLoginError(page);
          if (errorDetected) {
            this.logger.error(`[PIN] Login error detected: ${errorDetected}`);
            throw new Error(`Login failed during PIN wait: ${errorDetected}`);
          }
        }
      } catch (e: any) {
        if (e.message.includes('Login failed')) {
          throw e;
        }
        // Continue waiting for other errors
      }

      await this.delay(1000);
    }

    // Final check - log page state for debugging
    try {
      const finalUrl = page.url();
      const pageTitle = await page.title();
      this.logger.warn(`[PIN] PIN detection timed out after ${this.PIN_TIMEOUT / 1000}s`);
      this.logger.warn(`[PIN] Final URL: ${finalUrl}`);
      this.logger.warn(`[PIN] Page title: ${pageTitle}`);
    } catch (e) {
      // Ignore
    }

    return null;
  }

  /**
   * Wait for login to complete (GSB-style with navigation wait)
   * This waits for user to verify PIN on mobile app
   */
  private async waitForLoginComplete(page: any): Promise<boolean> {
    const startTime = Date.now();
    let checkCount = 0;

    this.logger.log(`[LoginComplete] Waiting for PIN verification (timeout: ${this.LOGIN_TIMEOUT / 60000} minutes)...`);

    // GSB-style: Try to wait for navigation first
    try {
      this.logger.log(`[LoginComplete] Waiting for page navigation after PIN verification...`);
      await page.waitForNavigation({
        waitUntil: 'load',
        timeout: this.LOGIN_TIMEOUT,
      });
      this.logger.log(`[LoginComplete] Navigation completed!`);

      // After navigation, check if logged in
      const isLoggedIn = await this.checkLoggedIn(page);
      if (isLoggedIn) {
        this.logger.log(`[LoginComplete] Successfully logged in after navigation`);
        return true;
      }
    } catch (navError: any) {
      // Navigation timeout - fall back to polling
      this.logger.log(`[LoginComplete] Navigation wait ended, falling back to polling...`);
    }

    // Fallback: Poll for login completion
    while (Date.now() - startTime < this.LOGIN_TIMEOUT) {
      checkCount++;
      try {
        const isLoggedIn = await this.checkLoggedIn(page);
        if (isLoggedIn) {
          this.logger.log(`[LoginComplete] Login verified on check #${checkCount}`);
          return true;
        }

        // Check for errors
        const errorDetected = await this.detectLoginError(page);
        if (errorDetected) {
          throw new Error(`Login error: ${errorDetected}`);
        }

        // Log progress every 15 seconds
        if (checkCount % 8 === 0) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const currentUrl = page.url();
          this.logger.log(`[LoginComplete] Still waiting... ${elapsed}s elapsed, URL: ${currentUrl}`);
        }
      } catch (e: any) {
        if (e.message.includes('Login error')) throw e;
      }

      await this.delay(2000);
    }

    this.logger.warn(`[LoginComplete] Timed out waiting for login verification`);
    return false;
  }

  /**
   * Save keys to database
   */
  private async saveKeysToDatabase(
    lineAccountId: string,
    keys: { xLineAccess: string; xHmac: string },
    chatMid?: string,
    cUrlBash?: string,
  ): Promise<void> {
    await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: keys.xLineAccess,
      xHmac: keys.xHmac,
      source: 'enhanced_auto_login',
    });

    // Update chatMid and cUrlBash if captured
    const updateData: Record<string, any> = {};

    // Safety check: chatMid must be a string (not an object)
    if (chatMid) {
      if (typeof chatMid === 'string') {
        updateData.chatMid = chatMid;
      } else if (typeof chatMid === 'object') {
        // Handle case where chatMid is an object (e.g., { targetUserMids: [...] })
        this.logger.warn(`[SaveKeys] chatMid is an object, attempting to extract: ${JSON.stringify(chatMid).substring(0, 100)}`);
        const chatMidObj = chatMid as any;
        if (Array.isArray(chatMidObj.targetUserMids) && chatMidObj.targetUserMids[0]) {
          updateData.chatMid = chatMidObj.targetUserMids[0];
          this.logger.log(`[SaveKeys] Extracted chatMid from targetUserMids: ${updateData.chatMid}`);
        } else if (chatMidObj.chatMid) {
          updateData.chatMid = chatMidObj.chatMid;
        } else if (chatMidObj.mid) {
          updateData.chatMid = chatMidObj.mid;
        }
      }
    }

    if (cUrlBash) {
      updateData.cUrlBash = cUrlBash;
    }

    if (Object.keys(updateData).length > 0) {
      // Final safety check: ensure chatMid is a string before saving
      if (updateData.chatMid && typeof updateData.chatMid !== 'string') {
        this.logger.error(`[SaveKeys] CRITICAL: chatMid is still not a string after extraction: ${typeof updateData.chatMid} - ${JSON.stringify(updateData.chatMid).substring(0, 100)}`);
        delete updateData.chatMid; // Remove to prevent Mongoose casting error
      }

      if (Object.keys(updateData).length > 0) {
        await this.lineSessionModel.updateOne(
          { lineAccountId, isActive: true },
          { $set: updateData },
        );
      }
    }

    this.logger.log(`Keys saved for ${lineAccountId}, chatMid: ${chatMid || 'N/A'}, hasCurl: ${!!cUrlBash}`);
  }

  /**
   * Cancel login - GSB-style: Keep browser open for reuse
   * This allows faster re-login using the same browser session and profile
   */
  async cancelLogin(lineAccountId: string): Promise<void> {
    this.loginCoordinatorService.cancelRequest(lineAccountId);

    // Clear active PIN tracking
    this.pinStore.delete(lineAccountId);

    // GSB-style: Soft cancel - keep browser open, just reset state
    // This allows reusing the same browser for next login attempt
    await this.workerPoolService.softCancelWorker(lineAccountId);

    // Emit cancelled status
    this.emitStatus(lineAccountId, EnhancedLoginStatus.FAILED, { error: 'Login cancelled by user' });

    this.logger.log(`Login cancelled for ${lineAccountId} (browser kept open for reuse)`);
  }

  /**
   * Force close browser - Use this when you want to completely close the browser
   */
  async forceCloseBrowser(lineAccountId: string): Promise<void> {
    this.loginCoordinatorService.cancelRequest(lineAccountId);
    this.pinStore.delete(lineAccountId);
    await this.workerPoolService.closeWorker(lineAccountId);
    this.logger.log(`Browser force-closed for ${lineAccountId}`);
  }

  /**
   * Get worker status
   * Returns format compatible with frontend polling:
   * - status: string (waiting_for_pin, extracting_keys, starting, completed, success, failed, error)
   * - pin: string (PIN code if available)
   * - message: string
   * - error: string (if failed)
   */
  getWorkerStatus(lineAccountId: string) {
    const worker = this.workerPoolService.getWorker(lineAccountId);
    const request = this.loginCoordinatorService.getRequestStatus(lineAccountId);
    const cooldown = this.loginCoordinatorService.getCooldownInfo(lineAccountId);

    // Map worker state to frontend-expected status
    let status = 'idle';
    let message = '';
    let pin: string | undefined;
    let error: string | undefined;

    if (worker) {
      pin = worker.pinCode;
      error = worker.error;

      switch (worker.state) {
        case WorkerState.INITIALIZING:
        case WorkerState.READY:
          status = 'starting';
          message = 'กำลังเริ่มต้น...';
          break;
        case WorkerState.BUSY:
          status = 'extracting_keys';
          message = 'กำลังดึง Keys...';
          break;
        case WorkerState.WAITING_PIN:
          status = 'waiting_for_pin';
          message = 'รอยืนยัน PIN บนมือถือ';
          break;
        case WorkerState.ERROR:
          status = 'failed';
          message = worker.error || 'เกิดข้อผิดพลาด';
          break;
        case WorkerState.CLOSED:
          if (worker.capturedKeys) {
            status = 'success';
            message = 'ดึง Keys สำเร็จ';
          } else {
            status = 'idle';
            message = '';
          }
          break;
        default:
          status = 'starting';
          message = 'กำลังดำเนินการ...';
      }
    } else if (request) {
      // Check request status if no worker
      switch (request.status) {
        case 'pending':
        case 'in_progress':
          status = 'starting';
          message = 'กำลังเริ่มต้น...';
          break;
        case 'completed':
          status = 'success';
          message = 'สำเร็จ';
          break;
        case 'failed':
          status = 'failed';
          message = request.error || 'เกิดข้อผิดพลาด';
          error = request.error;
          break;
      }
    }

    // Get PIN status with GSB-style tracking
    const pinStatus = this.getPinStatus(lineAccountId);

    return {
      success: true,
      // Frontend-expected format
      status,
      pin: pin || pinStatus.pinCode,
      message,
      error,
      stage: status,
      // GSB-style PIN status
      pinStatus: {
        status: pinStatus.status,
        ageMinutes: pinStatus.ageMinutes,
        ageSeconds: pinStatus.ageSeconds,
        expiresIn: pinStatus.expiresIn,
        isFresh: pinStatus.isFresh,
        isNew: pinStatus.isNew,
        isUsable: pinStatus.isUsable,
        recommendation: pinStatus.recommendation,
      },
      // Original detailed data
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

  // ============================================
  // PIN Status Tracking Methods (ported from GSB)
  // ============================================

  /**
   * Store PIN for a LINE account (ported from GSB)
   */
  storePin(lineAccountId: string, pinCode: string): void {
    const now = new Date();
    const existing = this.pinStore.get(lineAccountId);

    this.pinStore.set(lineAccountId, {
      pinCode,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });

    this.logger.log(`[PIN] Stored PIN for ${lineAccountId}: ${pinCode}`);
  }

  /**
   * Get PIN with detailed status (ported from GSB getPinByBankId)
   * Returns: { pin, status: FRESH/NEW/OLD/NO_PIN, ageMinutes, expiresIn, recommendation }
   */
  getPinStatus(lineAccountId: string): PinStatusResult {
    const pinData = this.pinStore.get(lineAccountId);

    if (!pinData || !pinData.pinCode) {
      return {
        pinCode: null,
        status: PinStatus.NO_PIN,
        createdAt: null,
        updatedAt: null,
        ageMinutes: 0,
        ageSeconds: 0,
        expiresIn: 0,
        isFresh: false,
        isNew: false,
        isUsable: false,
        recommendation: 'ไม่มี PIN - กรุณาล็อกอินใหม่',
      };
    }

    // Calculate PIN age
    const now = new Date();
    const pinCreatedAt = new Date(pinData.updatedAt || pinData.createdAt);
    const pinAgeMs = now.getTime() - pinCreatedAt.getTime();
    const pinAgeMinutes = Math.floor(pinAgeMs / 1000 / 60);
    const pinAgeSeconds = Math.floor(pinAgeMs / 1000);

    // Determine status
    let status: PinStatus;
    let recommendation: string;

    if (pinAgeMinutes < this.PIN_FRESH_MINUTES) {
      status = PinStatus.FRESH;
      recommendation = 'กรุณากรอก PIN บนมือถือทันที';
    } else if (pinAgeMinutes < this.PIN_EXPIRY_MINUTES) {
      status = PinStatus.NEW;
      recommendation = `PIN ยังใช้ได้ เหลือเวลา ${this.PIN_EXPIRY_MINUTES - pinAgeMinutes} นาที`;
    } else {
      status = PinStatus.OLD;
      recommendation = 'PIN หมดอายุแล้ว กรุณาล็อกอินใหม่';
    }

    // Calculate expiration
    const isUsable = pinAgeMinutes < this.PIN_EXPIRY_MINUTES;
    const expiresIn = isUsable
      ? Math.max(0, this.PIN_EXPIRY_MINUTES * 60 - pinAgeSeconds)
      : 0;

    return {
      pinCode: pinData.pinCode,
      status,
      createdAt: pinData.createdAt,
      updatedAt: pinData.updatedAt,
      ageMinutes: pinAgeMinutes,
      ageSeconds: pinAgeSeconds,
      expiresIn,
      isFresh: status === PinStatus.FRESH,
      isNew: status === PinStatus.NEW,
      isUsable,
      recommendation,
    };
  }

  /**
   * Get Keys status for a LINE account (ported from GSB)
   * Note: lineAccountId can be either session _id or actual lineAccountId field
   */
  async getKeysStatus(lineAccountId: string): Promise<{
    hasKeys: boolean;
    keysStatus: KeysStatus;
    keysAge: number;
    keysAgeMinutes: number;
    keysExpiresAt: Date | null;
    expiresIn: number;
    isValid: boolean;
    isExpiringSoon: boolean;
    recommendation: string;
  }> {
    // Try by _id first, then by lineAccountId field
    let session = await this.lineSessionModel.findById(lineAccountId);

    if (!session) {
      session = await this.lineSessionModel.findOne({
        lineAccountId,
        isActive: true,
      });
    }

    if (!session) {
      return {
        hasKeys: false,
        keysStatus: KeysStatus.UNKNOWN,
        keysAge: 0,
        keysAgeMinutes: 0,
        keysExpiresAt: null,
        expiresIn: 0,
        isValid: false,
        isExpiringSoon: false,
        recommendation: 'ไม่พบ session - กรุณาล็อกอินใหม่',
      };
    }

    const hasKeys = !!(session.xLineAccess && session.xHmac);

    if (!hasKeys) {
      return {
        hasKeys: false,
        keysStatus: KeysStatus.UNKNOWN,
        keysAge: 0,
        keysAgeMinutes: 0,
        keysExpiresAt: null,
        expiresIn: 0,
        isValid: false,
        isExpiringSoon: false,
        recommendation: 'ไม่มี Keys - กรุณาล็อกอินใหม่',
      };
    }

    // Calculate keys age
    const now = new Date();
    const keysUpdatedAt = session.lastCheckedAt || (session as any).updatedAt || now;
    const keysAgeMs = now.getTime() - new Date(keysUpdatedAt).getTime();
    const keysAgeMinutes = Math.floor(keysAgeMs / 1000 / 60);

    // Calculate expiration
    const keysExpiryMs = this.KEYS_EXPIRY_MINUTES * 60 * 1000;
    const timeUntilExpiry = keysExpiryMs - keysAgeMs;
    const expiresIn = Math.max(0, Math.floor(timeUntilExpiry / 1000));
    const keysExpiresAt = new Date(new Date(keysUpdatedAt).getTime() + keysExpiryMs);

    // Determine status
    let keysStatus: KeysStatus;
    let recommendation: string;
    let isValid = false;
    let isExpiringSoon = false;

    if (timeUntilExpiry <= 0) {
      keysStatus = KeysStatus.EXPIRED;
      recommendation = 'Keys หมดอายุแล้ว - ต้อง login ใหม่';
    } else if (timeUntilExpiry <= this.KEYS_WARNING_MINUTES * 60 * 1000) {
      keysStatus = KeysStatus.EXPIRING_SOON;
      isValid = true;
      isExpiringSoon = true;
      const minutesLeft = Math.ceil(timeUntilExpiry / 60000);
      recommendation = `Keys กำลังจะหมดอายุใน ${minutesLeft} นาที`;
    } else {
      keysStatus = KeysStatus.VALID;
      isValid = true;
      recommendation = 'Keys ใช้งานได้ปกติ';
    }

    return {
      hasKeys,
      keysStatus,
      keysAge: keysAgeMs,
      keysAgeMinutes,
      keysExpiresAt,
      expiresIn,
      isValid,
      isExpiringSoon,
      recommendation,
    };
  }

  /**
   * Get full session status (PIN + Keys) - ported from GSB
   */
  async getFullSessionStatus(lineAccountId: string): Promise<{
    lineAccountId: string;
    pin: PinStatusResult;
    keys: Awaited<ReturnType<typeof this.getKeysStatus>>;
    lastCheckedAt: Date;
    needsRelogin: boolean;
    reloginReason: string | null;
  }> {
    const pin = this.getPinStatus(lineAccountId);
    const keys = await this.getKeysStatus(lineAccountId);

    // Determine if relogin is needed
    let needsRelogin = false;
    let reloginReason: string | null = null;

    if (!keys.hasKeys) {
      needsRelogin = true;
      reloginReason = 'No keys found';
    } else if (keys.keysStatus === KeysStatus.EXPIRED) {
      needsRelogin = true;
      reloginReason = 'Keys expired';
    }

    return {
      lineAccountId,
      pin,
      keys,
      lastCheckedAt: new Date(),
      needsRelogin,
      reloginReason,
    };
  }

  /**
   * Clear PIN for a LINE account
   */
  clearPin(lineAccountId: string): void {
    this.pinStore.delete(lineAccountId);
    this.logger.log(`[PIN] Cleared PIN for ${lineAccountId}`);
  }

  /**
   * Get all active PINs (for admin dashboard)
   */
  getAllActivePins(): Array<{ lineAccountId: string; status: PinStatusResult }> {
    const results: Array<{ lineAccountId: string; status: PinStatusResult }> = [];

    for (const [lineAccountId] of this.pinStore) {
      const status = this.getPinStatus(lineAccountId);
      if (status.isUsable) {
        results.push({ lineAccountId, status });
      }
    }

    // Sort by most recent first
    results.sort((a, b) => (b.status.updatedAt?.getTime() || 0) - (a.status.updatedAt?.getTime() || 0));

    return results;
  }

  /**
   * Get all pending logins with full details (for admin dashboard)
   * Shows accounts waiting for PIN verification with session info
   */
  async getPendingLogins(): Promise<Array<{
    lineAccountId: string;
    sessionId: string;
    name: string;
    email: string;
    pinCode: string | null;
    pinStatus: PinStatusResult;
    workerState: string | null;
    timeRemaining: number;
    isExpired: boolean;
  }>> {
    const results: Array<{
      lineAccountId: string;
      sessionId: string;
      name: string;
      email: string;
      pinCode: string | null;
      pinStatus: PinStatusResult;
      workerState: string | null;
      timeRemaining: number;
      isExpired: boolean;
    }> = [];

    // Get all PINs (including expired for cleanup info)
    for (const [lineAccountId, pinData] of this.pinStore) {
      const pinStatus = this.getPinStatus(lineAccountId);
      const worker = this.workerPoolService.getWorker(lineAccountId);

      // Get session info from database
      let session = await this.lineSessionModel.findById(lineAccountId);
      if (!session) {
        session = await this.lineSessionModel.findOne({
          lineAccountId,
          isActive: true,
        });
      }

      results.push({
        lineAccountId,
        sessionId: session?._id?.toString() || lineAccountId,
        name: session?.name || 'Unknown',
        email: session?.lineEmail || 'N/A',
        pinCode: pinData.pinCode,
        pinStatus,
        workerState: worker?.state || null,
        timeRemaining: pinStatus.expiresIn,
        isExpired: !pinStatus.isUsable,
      });
    }

    // Sort: usable PINs first (by freshness), then expired
    results.sort((a, b) => {
      if (a.isExpired !== b.isExpired) {
        return a.isExpired ? 1 : -1; // Non-expired first
      }
      return b.timeRemaining - a.timeRemaining; // More time remaining first
    });

    return results;
  }

  /**
   * Auto-cleanup expired PINs and release locks
   * Called periodically by orchestrator
   */
  async autoCleanupExpiredLogins(): Promise<{
    cleaned: number;
    details: Array<{ lineAccountId: string; reason: string }>;
  }> {
    const details: Array<{ lineAccountId: string; reason: string }> = [];
    let cleaned = 0;
    const now = new Date();
    const expiryMs = this.PIN_EXPIRY_MINUTES * 60 * 1000;

    for (const [lineAccountId, pinData] of this.pinStore) {
      const pinAge = now.getTime() - new Date(pinData.updatedAt).getTime();

      if (pinAge > expiryMs) {
        // PIN expired - cleanup
        this.logger.log(`[AutoCleanup] PIN expired for ${lineAccountId}, cleaning up...`);

        // Clear PIN
        this.pinStore.delete(lineAccountId);

        // Release lock if held
        this.loginLockService.releaseLock(lineAccountId, 'enhanced');

        // Close worker if exists
        await this.workerPoolService.closeWorker(lineAccountId);

        // Mark login as failed in coordinator
        this.loginCoordinatorService.markLoginFailed(lineAccountId, 'PIN expired - user did not verify in time');

        details.push({ lineAccountId, reason: 'PIN expired' });
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`[AutoCleanup] Cleaned up ${cleaned} expired logins`);
    }

    return { cleaned, details };
  }

  /**
   * Check if relogin is needed based on keys status (ported from GSB)
   */
  async needsRelogin(lineAccountId: string): Promise<{ needsRelogin: boolean; reason: string }> {
    const keys = await this.getKeysStatus(lineAccountId);

    if (!keys.hasKeys) {
      return { needsRelogin: true, reason: 'No keys found' };
    }

    if (keys.keysStatus === KeysStatus.EXPIRED) {
      return { needsRelogin: true, reason: 'Keys expired' };
    }

    return { needsRelogin: false, reason: 'Keys valid' };
  }

  /**
   * Auto-cleanup expired PINs (call periodically)
   */
  cleanupExpiredPins(): number {
    let cleaned = 0;
    const now = new Date();
    const expiryMs = this.PIN_EXPIRY_MINUTES * 60 * 1000;

    for (const [lineAccountId, pinData] of this.pinStore) {
      const pinAge = now.getTime() - new Date(pinData.updatedAt).getTime();
      if (pinAge > expiryMs) {
        this.pinStore.delete(lineAccountId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`[PIN] Cleaned up ${cleaned} expired PINs`);
    }

    return cleaned;
  }

  /**
   * Emit status update
   */
  private emitStatus(lineAccountId: string, status: EnhancedLoginStatus, data?: any): void {
    const eventData = {
      lineAccountId,
      status,
      timestamp: new Date(),
      ...data,
    };
    this.logger.log(`[EnhancedAutomation] Emitting status: ${status} for ${lineAccountId}${data?.pinCode ? ` with PIN ${data.pinCode}` : ''}`);
    this.eventEmitter.emit('enhanced-login.status', eventData);
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
