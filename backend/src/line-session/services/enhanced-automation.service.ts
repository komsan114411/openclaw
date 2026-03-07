import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkerPoolService, WorkerState, Worker } from './worker-pool.service';
import { LoginCoordinatorService, RequestStatus } from './login-coordinator.service';
import { KeyStorageService } from './key-storage.service';
import { LoginLockService } from './login-lock.service';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { SystemSettings, SystemSettingsDocument } from '../../database/schemas/system-settings.schema';
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
  CREDENTIAL_ERROR = 'credential_error',
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
  isCredentialError?: boolean;
}

/**
 * Check if an error message indicates invalid credentials (not retryable)
 */
export function isCredentialError(errorMessage: string): boolean {
  const patterns = [
    /email.*password.*incorrect/i,
    /password.*incorrect/i,
    /incorrect.*password/i,
    /not registered with LINE/i,
    /invalid.*credentials/i,
    /รหัสผ่าน.*ไม่ถูกต้อง/i,
    /อีเมล.*ไม่ถูกต้อง/i,
  ];
  return patterns.some(p => p.test(errorMessage));
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
export class EnhancedAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnhancedAutomationService.name);

  private readonly LINE_EXTENSION_ID = 'ophjlpahpchlmihnnnihgmmeilfjmjjc';
  private readonly LOGIN_TIMEOUT = 300000; // 5 minutes — match PIN_EXPIRY_MINUTES
  private readonly PIN_TIMEOUT = 180000; // 3 minutes (GSB-style, was 90 seconds)
  private readonly DIALOG_TIMEOUT = 10000; // 10 seconds to wait for dialog after login
  private readonly MESSAGE_TRIGGER_ATTEMPTS = 10; // [FIX] Increased from 6 to 10 attempts
  private readonly ATTEMPT_DELAY = 3000; // 3 seconds between attempts (reduced from 4)

  // PIN Status Configuration (ported from GSB)
  private readonly PIN_EXPIRY_MINUTES = 5;      // PIN expires after 5 minutes
  private readonly PIN_FRESH_MINUTES = 1;       // PIN is "fresh" for 1 minute
  private readonly KEYS_EXPIRY_MINUTES = 30;    // Keys expire after 30 minutes
  private readonly KEYS_WARNING_MINUTES = 5;    // Warn 5 minutes before expiry

  // PIN cleanup interval (30 seconds)
  private readonly PIN_CLEANUP_INTERVAL_MS = 30000;
  private pinCleanupInterval: NodeJS.Timeout | null = null;

  // In-memory PIN storage (for real-time tracking like GSB)
  private pinStore: Map<string, { pinCode: string; createdAt: Date; updatedAt: Date }> = new Map();

  // Track recent login success (for health check grace period)
  // This helps frontend detect success even after worker is closed
  // Also used to skip health check validation for recently logged in sessions
  private recentLoginSuccess: Map<string, { timestamp: number }> = new Map();

  // Grace period for health check skip after successful login (5 minutes)
  // During this time, health check will trust the keys without LINE API validation
  private readonly HEALTH_CHECK_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

  // Login limits cache (from SystemSettings, TTL 60s)
  private loginLimitsCache: { maxConcurrent: number; maxPerUser: number; cachedAt: number } | null = null;

  // Global circuit breaker: stop all login attempts when the same infrastructure error
  // (e.g., Xvfb crash) hits every account consecutively
  private consecutiveGlobalFailures = 0;
  private lastGlobalError: string | null = null;
  private globalCircuitBreakerTripped = false;
  private globalCircuitBreakerTimer: NodeJS.Timeout | null = null;
  private readonly GLOBAL_CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly GLOBAL_CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  // Queue processing guard (prevent concurrent processNextInQueue calls)
  private processingQueue = false;

  // Track background login promises for sequential relogin (prevent multiple PINs at once)
  private backgroundLoginPromises: Map<string, Promise<void>> = new Map();

  // Abort signals for waitForLoginComplete — prevents detached frame spam after forceCloseBrowser
  private loginAbortSignals: Map<string, boolean> = new Map();

  // Encryption
  private readonly ENCRYPTION_KEY: string;

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
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
   * Initialize module - start PIN cleanup interval
   * This ensures PINs are cleaned up even if orchestrator is not running
   */
  onModuleInit(): void {
    this.logger.log('[PIN Security] Starting internal PIN cleanup interval (every 30 seconds)');

    // Start cleanup interval (PINs + stale queue items)
    this.pinCleanupInterval = setInterval(() => {
      this.cleanupExpiredPinsSecure();
      this.cleanupStaleQueuedItems();
    }, this.PIN_CLEANUP_INTERVAL_MS);
  }

  /**
   * Get login limits from SystemSettings (cached 60s)
   */
  private async getLoginLimits(): Promise<{ maxConcurrent: number; maxPerUser: number }> {
    if (this.loginLimitsCache && Date.now() - this.loginLimitsCache.cachedAt < 60_000) {
      return this.loginLimitsCache;
    }
    const s = await this.systemSettingsModel.findOne({ settingsId: 'main' }).lean();
    const result = { maxConcurrent: s?.maxConcurrentLogins ?? 3, maxPerUser: s?.maxLoginPerUser ?? 2 };
    this.loginLimitsCache = { ...result, cachedAt: Date.now() };
    return result;
  }

  /**
   * Wait for a background login (PIN verification) to complete.
   * Used by orchestrator to ensure sequential relogin — no overlapping PINs.
   */
  async waitForBackgroundLogin(lineAccountId: string, timeoutMs = 480000): Promise<void> {
    const promise = this.backgroundLoginPromises.get(lineAccountId);
    if (!promise) return;
    try {
      await Promise.race([
        promise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
      ]);
    } catch {
      // timeout or error — continue
    } finally {
      this.backgroundLoginPromises.delete(lineAccountId);
    }
  }

  /**
   * Securely clear a PIN by overwriting the value before deletion
   * This prevents PIN from lingering in memory
   */
  private secureClearPin(lineAccountId: string): void {
    const pinData = this.pinStore.get(lineAccountId);
    if (pinData) {
      // Overwrite sensitive data with zeros before deletion
      pinData.pinCode = '000000';
      pinData.createdAt = new Date(0);
      pinData.updatedAt = new Date(0);
      this.pinStore.delete(lineAccountId);
    }
  }

  /**
   * Cleanup expired PINs with secure deletion
   * Called every 30 seconds by internal interval
   */
  private cleanupExpiredPinsSecure(): number {
    let cleaned = 0;
    const now = new Date();
    const expiryMs = this.PIN_EXPIRY_MINUTES * 60 * 1000;
    const expiredAccounts: string[] = [];

    // First pass: identify expired PINs
    for (const [lineAccountId, pinData] of this.pinStore) {
      const pinAge = now.getTime() - new Date(pinData.updatedAt).getTime();
      if (pinAge > expiryMs) {
        expiredAccounts.push(lineAccountId);
      }
    }

    // Second pass: securely delete expired PINs
    for (const lineAccountId of expiredAccounts) {
      this.secureClearPin(lineAccountId);
      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(`[PIN Security] Securely cleaned ${cleaned} expired PIN(s)`);
    }

    return cleaned;
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
    // Also clear credential_error status if previously set
    const updateFields: Record<string, unknown> = {
      lineEmail: email,
      linePassword: encryptedPassword,
    };
    if (existingSession.status === 'credential_error') {
      updateFields.status = 'expired'; // Reset to expired so relogin can be triggered
      updateFields.lastError = null;
      this.logger.log(`[SaveCredentials] Cleared credential_error for ${lineAccountId} — new credentials saved`);
    }

    await this.lineSessionModel.updateOne(
      { _id: existingSession._id },
      { $set: updateFields },
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
    // Global circuit breaker: if infrastructure is broken, fail fast
    if (this.globalCircuitBreakerTripped) {
      this.logger.warn(`[Login] Global circuit breaker active — blocking login for ${lineAccountId}`);
      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: `ระบบล็อกอินหยุดชั่วคราว: ${this.lastGlobalError}. กรุณารอ 5 นาทีแล้วลองใหม่`,
      };
    }

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

    const sessionOwnerId = existingSession.ownerId || 'system';

    // Check if THIS account already has a lock (login in progress)
    // Must come BEFORE concurrent limit check to prevent false queueing
    if (this.loginLockService.isLocked(lineAccountId)) {
      const lockInfo = this.loginLockService.getLockInfo(lineAccountId);

      // Check if there's an active worker with PIN
      const worker = this.workerPoolService.getWorker(lineAccountId);
      if (worker && worker.pinCode) {
        this.logger.log(`[Login] Account ${lineAccountId} already has PIN ${worker.pinCode} — returning existing PIN`);
        return {
          success: false,
          status: EnhancedLoginStatus.PIN_DISPLAYED,
          pinCode: worker.pinCode,
          message: 'กำลังรอยืนยัน PIN อยู่แล้ว กรุณากรอก PIN ที่โทรศัพท์',
        };
      }

      // Check PIN store as fallback
      const pinStatus = this.getPinStatus(lineAccountId);
      if (pinStatus.pinCode && pinStatus.isUsable) {
        this.logger.log(`[Login] Account ${lineAccountId} has stored PIN ${pinStatus.pinCode} — returning`);
        return {
          success: false,
          status: EnhancedLoginStatus.PIN_DISPLAYED,
          pinCode: pinStatus.pinCode,
          message: 'กำลังรอยืนยัน PIN อยู่แล้ว กรุณากรอก PIN ที่โทรศัพท์',
        };
      }

      // Login in progress but no PIN yet — show current stage
      const stage = lockInfo?.stage || 'กำลังดำเนินการ';
      this.logger.log(`[Login] Account ${lineAccountId} already locked by ${lockInfo?.source || 'unknown'} (stage: ${stage}) — returning in-progress`);
      return {
        success: false,
        status: EnhancedLoginStatus.VERIFYING,
        message: `บัญชีนี้กำลังล็อกอินอยู่แล้ว — ${stage}\nกรุณารอสักครู่`,
      };
    }

    // Fetch dynamic login limits from SystemSettings
    const limits = await this.getLoginLimits();

    // Per-user concurrent limit: prevent one user from hogging all login slots
    if (source === 'manual' && this.loginLockService.isUserAtLimit(sessionOwnerId, limits.maxPerUser)) {
      const grouped = this.loginLockService.getLocksGroupedByOwner(sessionOwnerId);
      this.logger.warn(`[Login] Per-user limit reached for owner ${sessionOwnerId} (${grouped.ownLocks.length} active)`);

      const ownDetails = grouped.ownLocks.map(l => {
        const name = l.info.accountName || 'บัญชี';
        const stage = l.info.stage || 'กำลังดำเนินการ';
        return `${name} (${stage})`;
      }).join(', ');

      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: `คุณกำลังล็อกอิน ${grouped.ownLocks.length} บัญชีพร้อมกัน (สูงสุด ${limits.maxPerUser} บัญชีต่อผู้ใช้)\nกำลังทำงาน: ${ownDetails}\nกรุณารอบัญชีก่อนหน้าเสร็จก่อนแล้วลองใหม่`,
      };
    }

    // System-wide concurrent login limit: prevent RAM exhaustion from too many browsers
    // All sources (manual, relogin, auto) enter queue with priority
    const activeLoginCount = this.loginLockService.getAllLocks().length;
    if (activeLoginCount >= limits.maxConcurrent) {
      const queueInfo = this.loginLockService.addToQueue(lineAccountId, sessionOwnerId, source, limits.maxConcurrent);

      // Queue is full
      if (!queueInfo) {
        this.logger.warn(`[Login] Queue full, rejecting ${lineAccountId} (source: ${source})`);
        return {
          success: false,
          status: EnhancedLoginStatus.FAILED,
          error: 'คิวล็อกอินเต็ม กรุณารอสักครู่แล้วลองใหม่',
        };
      }

      this.logger.warn(`[Login] Concurrent limit reached, queued ${lineAccountId} (position: ${queueInfo.position}, source: ${source})`);

      // Emit queue event for WebSocket
      this.eventEmitter.emit('login.queued', {
        lineAccountId,
        ownerId: sessionOwnerId,
        position: queueInfo.position,
        estimatedWaitSeconds: queueInfo.estimatedWaitSeconds,
        source,
        timestamp: new Date(),
      });

      // Build privacy-safe detail: show own accounts with stage, mask others
      const grouped = this.loginLockService.getLocksGroupedByOwner(sessionOwnerId);
      const waitMinutes = Math.ceil(queueInfo.estimatedWaitSeconds / 60);

      // Build status lines
      const lines: string[] = [];
      lines.push(`ระบบกำลังล็อกอิน ${activeLoginCount} บัญชีพร้อมกัน (สูงสุด ${limits.maxConcurrent} บัญชี)`);

      if (grouped.ownLocks.length > 0) {
        const ownDetails = grouped.ownLocks.map(l => {
          const name = l.info.accountName || 'บัญชี';
          const stage = l.info.stage || 'กำลังดำเนินการ';
          return `${name} (${stage})`;
        }).join(', ');
        lines.push(`บัญชีของคุณ: ${ownDetails}`);
      }
      if (grouped.othersCount > 0) {
        lines.push(`บัญชีผู้ใช้อื่น: ${grouped.othersCount} บัญชี`);
      }

      lines.push(`คิวที่ ${queueInfo.position} — รอประมาณ ${waitMinutes} นาที จะเริ่มอัตโนมัติเมื่อถึงคิว`);

      return {
        success: false,
        status: EnhancedLoginStatus.FAILED,
        error: lines.join('\n'),
        message: `queued:${queueInfo.position}:${queueInfo.estimatedWaitSeconds}`,
      };
    }

    // Remove from queue if was queued (slot now available)
    this.loginLockService.removeFromQueue(lineAccountId);

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

    // Acquire global lock (prevent concurrent login from different services)
    const accountName = existingSession.name || existingSession.lineEmail?.split('@')[0] || 'บัญชี';
    const lockAcquired = this.loginLockService.acquireLock(lineAccountId, 'enhanced', sessionOwnerId, accountName);
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
    // Track whether lock responsibility has been transferred to continueLoginInBackground
    let lockTransferred = false;

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

      // Clear any previous abort signal from forceCloseBrowser/cancelLogin
      this.loginAbortSignals.delete(lineAccountId);

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

          // Track recent success for polling fallback and health check grace period
          this.recentLoginSuccess.set(lineAccountId, { timestamp: Date.now() });
          // Auto-clear after health check grace period (5 minutes)
          setTimeout(() => this.recentLoginSuccess.delete(lineAccountId), this.HEALTH_CHECK_GRACE_PERIOD_MS);

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

      // Step 7: Verify page is still valid after browser setup/recovery
      if (!worker.page) {
        this.logger.error(`[Login] Page is null after browser setup — browser recovery may have failed for ${lineAccountId}`);
        this.loginCoordinatorService.markLoginFailed(lineAccountId, 'Browser page lost during setup');
        return {
          success: false,
          status: EnhancedLoginStatus.FAILED,
          requestId,
          error: 'เบราว์เซอร์เกิดปัญหาระหว่างเตรียมตัว กรุณาลองใหม่',
        };
      }

      // Step 8: Check if already logged in
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

          // Track recent success for polling fallback and health check grace period
          this.recentLoginSuccess.set(lineAccountId, { timestamp: Date.now() });
          // Auto-clear after health check grace period (5 minutes)
          setTimeout(() => this.recentLoginSuccess.delete(lineAccountId), this.HEALTH_CHECK_GRACE_PERIOD_MS);

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

        // Mark lock as transferred to background process BEFORE starting it
        lockTransferred = true;

        // Start background process AFTER building result (non-blocking with setImmediate)
        // Wrap in tracked promise so orchestrator can await sequential relogin
        const bgPromise = new Promise<void>((resolve) => {
          setImmediate(async () => {
            try {
              await this.continueLoginInBackground(
                worker,
                keyCapturedPromise,
                requestId!,
                lineAccountId,
                pinCode,
              );
            } finally {
              resolve();
            }
          });
        });
        this.backgroundLoginPromises.set(lineAccountId, bgPromise);
        // Self-cleanup: remove from Map after promise resolves (prevents leak for manual logins)
        bgPromise.then(() => { this.backgroundLoginPromises.delete(lineAccountId); });

        this.logger.log(`[PIN] === RETURNING NOW ===`);
        return result;
      }

      throw new Error('Login failed or timed out - no PIN detected');

    } catch (error: any) {
      this.logger.error(`Login failed for ${lineAccountId}: ${error.message}`);
      this.loginCoordinatorService.markLoginFailed(lineAccountId, error.message);

      // Global circuit breaker: track consecutive identical failures
      if (error.message === this.lastGlobalError) {
        this.consecutiveGlobalFailures++;
      } else {
        this.consecutiveGlobalFailures = 1;
        this.lastGlobalError = error.message;
      }
      if (this.consecutiveGlobalFailures >= this.GLOBAL_CIRCUIT_BREAKER_THRESHOLD) {
        this.globalCircuitBreakerTripped = true;
        this.logger.error(
          `[CircuitBreaker] TRIPPED after ${this.consecutiveGlobalFailures} identical failures: ${this.lastGlobalError}`,
        );
        if (this.globalCircuitBreakerTimer) clearTimeout(this.globalCircuitBreakerTimer);
        this.globalCircuitBreakerTimer = setTimeout(() => {
          this.globalCircuitBreakerTripped = false;
          this.consecutiveGlobalFailures = 0;
          this.logger.log('[CircuitBreaker] Reset — login attempts allowed again');
        }, this.GLOBAL_CIRCUIT_BREAKER_COOLDOWN_MS);
      }

      // Detect credential errors — these should NOT be retried
      const credentialErr = isCredentialError(error.message);
      const status = credentialErr ? EnhancedLoginStatus.CREDENTIAL_ERROR : EnhancedLoginStatus.FAILED;

      if (credentialErr) {
        this.logger.warn(`[Login] CREDENTIAL ERROR for ${lineAccountId} — auto-relogin will be stopped. User must update email/password.`);
      }

      this.emitStatus(lineAccountId, status, {
        requestId,
        error: error.message,
        isCredentialError: credentialErr,
      });

      // Close browser worker to prevent zombie processes (Issue C fix)
      await this.workerPoolService.closeWorker(lineAccountId).catch(() => {});

      // Release lock on error — mark as handled so finally block doesn't double-release
      lockTransferred = true;
      this.loginLockService.releaseLock(lineAccountId, 'enhanced');
      this.processNextInQueue();

      return {
        success: false,
        status,
        requestId,
        error: error.message,
        isCredentialError: credentialErr,
      };
    } finally {
      // Release lock if it wasn't transferred to continueLoginInBackground or already released in catch
      if (!lockTransferred) {
        this.logger.debug(`[Login] Releasing lock in finally block for ${lineAccountId} (early return path)`);
        this.loginLockService.releaseLock(lineAccountId, 'enhanced');
        this.processNextInQueue();
      }
    }
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
      // Refresh lock timestamp — lock was acquired minutes ago during browser setup + PIN wait.
      // Without refresh, LOCK_TIMEOUT (8 min) could expire during waitForLoginComplete (5 min).
      this.loginLockService.refreshLock(lineAccountId, 'enhanced');

      // Wait for login completion (user enters PIN on mobile)
      this.emitStatus(lineAccountId, EnhancedLoginStatus.VERIFYING, { requestId });
      const loginSuccess = await this.waitForLoginComplete(worker.page, lineAccountId);

      if (loginSuccess) {
        // Extract keys with multiple attempts
        this.emitStatus(lineAccountId, EnhancedLoginStatus.EXTRACTING_KEYS, { requestId });
        const capturedData = await this.triggerAndCaptureKeys(worker, keyCapturedPromise, requestId, lineAccountId);

        if (capturedData) {
          await this.saveKeysToDatabase(lineAccountId, capturedData.keys, capturedData.chatMid, capturedData.cUrlBash);
          this.loginCoordinatorService.markLoginCompleted(lineAccountId);

          // Securely clear PIN from store after successful login to stop PIN countdown broadcasts
          this.secureClearPin(lineAccountId);
          this.logger.log(`[PIN Security] Securely cleared PIN for ${lineAccountId} after successful login`);

          // Track recent success for health check grace period (5 minutes)
          // This prevents health check from marking keys as expired immediately after login
          this.recentLoginSuccess.set(lineAccountId, { timestamp: Date.now() });
          this.logger.log(`[RecentSuccess] Marked success for ${lineAccountId} (grace period: ${this.HEALTH_CHECK_GRACE_PERIOD_MS / 60000} minutes)`);
          // Auto-clear after health check grace period
          setTimeout(() => {
            this.recentLoginSuccess.delete(lineAccountId);
            this.logger.log(`[RecentSuccess] Cleared for ${lineAccountId}`);
          }, this.HEALTH_CHECK_GRACE_PERIOD_MS);

          // Reset global circuit breaker on success
          this.consecutiveGlobalFailures = 0;
          this.lastGlobalError = null;
          this.globalCircuitBreakerTripped = false;

          this.emitStatus(lineAccountId, EnhancedLoginStatus.SUCCESS, {
            requestId,
            pinCode,
            chatMid: capturedData.chatMid,
            keys: capturedData.keys, // Include keys for auto-slip module
            cUrlBash: capturedData.cUrlBash, // Include cURL for auto-slip module
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

        // Auto-process next queued login (decoupled to avoid recursion)
        this.processNextInQueue();
      } catch (lockError: any) {
        this.logger.error(`[BackgroundLogin] Failed to release lock for ${lineAccountId}: ${lockError.message}`);
        // Lock will be auto-released by LoginLockService timeout
      }
    }
  }

  /**
   * Auto-process queued items when slots are freed.
   * Dequeues multiple items if multiple slots are available.
   * Uses setImmediate to decouple from the releasing call stack (prevent recursion).
   * Preserves original source for correct priority on re-queue.
   */
  private processNextInQueue(): void {
    if (this.processingQueue) return;
    this.processingQueue = true;

    this.getLoginLimits().then(limits => {
      try {
        const availableSlots = this.loginLockService.getAvailableSlots(limits.maxConcurrent);
        if (availableSlots <= 0) return;

        const itemsToProcess: { lineAccountId: string; ownerId: string; source: 'manual' | 'auto' | 'relogin' }[] = [];

        for (let i = 0; i < availableSlots; i++) {
          const nextInQueue = this.loginLockService.dequeueNext();
          if (!nextInQueue) break;
          const validSource = (['manual', 'auto', 'relogin'] as const).includes(
            nextInQueue.source as 'manual' | 'auto' | 'relogin',
          ) ? nextInQueue.source as 'manual' | 'auto' | 'relogin' : 'manual' as const;
          itemsToProcess.push({
            lineAccountId: nextInQueue.lineAccountId,
            ownerId: nextInQueue.ownerId,
            source: validSource,
          });
        }

        if (itemsToProcess.length === 0) return;

        // Emit queue position updates for remaining items
        this.emitQueueUpdates(limits.maxConcurrent);

        // Start each dequeued item in a decoupled context
        for (const item of itemsToProcess) {
          const { lineAccountId, ownerId, source } = item;

          // Notify user that their queued login is starting automatically
          this.eventEmitter.emit('login.slot_available', {
            lineAccountId,
            ownerId,
            timestamp: new Date(),
          });

          this.logger.log(`[Queue] Auto-starting login for queued ${lineAccountId} (owner: ${ownerId}, source: ${source})`);

          // Decouple: avoid calling startLogin inside the finally of another startLogin
          setImmediate(async () => {
            try {
              // Reset cooldown for dequeued items — they already waited in queue,
              // so the old cooldown should not block them
              this.loginCoordinatorService.resetCooldown(lineAccountId);

              // Validate session still exists before auto-starting
              const sessionExists = await this.lineSessionModel.exists({ lineAccountId });
              if (!sessionExists) {
                this.logger.warn(`[Queue] Session no longer exists for ${lineAccountId}, skipping`);
                return;
              }

              // Emit status so frontend shows "processing" instead of "click again"
              this.emitStatus(lineAccountId, EnhancedLoginStatus.REQUESTING, {
                message: 'ถึงคิวแล้ว กำลังเริ่มล็อกอินอัตโนมัติ...',
              });

              const result = await this.startLogin(lineAccountId, undefined, undefined, source);

              if (!result.success && !result.pinCode) {
                // Login failed — check if it was concurrent limit (re-queue) vs real error
                if (result.error?.includes('สูงสุด') || result.error?.includes('ต่อผู้ใช้') || result.error?.includes('คิวที่')) {
                  // Re-queue with original source (preserves priority)
                  const reQueueInfo = this.loginLockService.addToQueue(lineAccountId, ownerId, source, limits.maxConcurrent);
                  if (reQueueInfo) {
                    this.logger.warn(`[Queue] Auto-login for ${lineAccountId} hit limit, re-queued at position ${reQueueInfo.position}`);

                    this.eventEmitter.emit('login.queued', {
                      lineAccountId,
                      ownerId,
                      position: reQueueInfo.position,
                      estimatedWaitSeconds: reQueueInfo.estimatedWaitSeconds,
                      source,
                      timestamp: new Date(),
                    });

                    this.emitQueueUpdates(limits.maxConcurrent);
                  }
                } else {
                  // Real failure — notify user
                  this.logger.error(`[Queue] Auto-login failed for ${lineAccountId}: ${result.error}`);
                }
              }
            } catch (error: unknown) {
              const errMsg = error instanceof Error ? error.message : String(error);
              this.logger.error(`[Queue] Auto-login error for ${lineAccountId}: ${errMsg}`);
            }
          });
        }
      } finally {
        this.processingQueue = false;
      }
    }).catch(err => {
      this.processingQueue = false;
      this.logger.error(`[Queue] Failed to get login limits: ${err.message}`);
    });
  }

  /**
   * Emit queue position updates to all remaining items in queue via WebSocket
   */
  private emitQueueUpdates(maxConcurrent: number = 3): void {
    const { items } = this.loginLockService.getQueueStatus();
    for (const item of items) {
      this.eventEmitter.emit('login.queue_update', {
        lineAccountId: item.lineAccountId,
        ownerId: item.ownerId,
        position: item.position,
        estimatedWaitSeconds: this.loginLockService.estimateWaitTime(item.position, maxConcurrent),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Cleanup stale queue items and notify frontend of failures
   */
  private cleanupStaleQueuedItems(): void {
    const staleItems = this.loginLockService.cleanupStaleQueueItems();

    for (const item of staleItems) {
      this.emitStatus(item.lineAccountId, EnhancedLoginStatus.FAILED, {
        error: 'คิวหมดเวลา กรุณากดล็อกอินใหม่',
        ownerId: item.ownerId,
      });
    }

    if (staleItems.length > 0) {
      this.getLoginLimits().then(limits => {
        this.emitQueueUpdates(limits.maxConcurrent);
      }).catch(() => {
        this.emitQueueUpdates(); // fallback to default
      });
    }
  }

  /**
   * Validate keys by making a test API call to LINE
   *
   * [FIX] Changed from getChats to getProfile endpoint:
   * - getChats requires xHmac that matches the request body
   * - xHmac is generated per-request, so using stored xHmac with different body fails
   * - getProfile doesn't require xHmac, only xLineAccess token
   * - This makes validation more reliable and accurate
   */
  async validateKeys(xLineAccess: string, xHmac: string): Promise<boolean> {
    try {
      const axios = require('axios');

      // [FIX] Use getProfile endpoint - doesn't require xHmac
      // xHmac is request-specific (generated from body), so it only works with the original request
      // getProfile only needs valid xLineAccess token to work
      const response = await axios.post(
        'https://line-chrome-gw.line-apps.com/api/talk/thrift/Talk/TalkService/getProfile',
        [], // Empty body for getProfile
        {
          headers: {
            'x-line-access': xLineAccess,
            // Note: xHmac not sent - getProfile doesn't require it
            'content-type': 'application/json',
            'x-line-chrome-version': '3.7.1',
          },
          timeout: 10000,
          validateStatus: (status: number) => status < 500,
        },
      );

      // Check if response is successful
      if (response.status === 200 && response.data?.code === 0) {
        const displayName = response.data?.data?.displayName || 'Unknown';
        this.logger.log(`[ValidateKeys] Keys are VALID (profile: ${displayName})`);
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

      // For 200 with non-zero code, keys might still work
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

    // [FIX] First, wait for chat list to fully render
    this.logger.log(`[TriggerKeys] 🔄 Waiting for chat list to render...`);
    await this.waitForChatListToRender(worker.page);

    // [NEW] Step 1: Navigate to chats and find GSB now
    this.logger.log(`[TriggerKeys] 📱 Step 1: Navigate to chats...`);
    await this.navigateToChats(worker.page);
    await this.delay(2000);

    // [NEW] Step 2: Search and click GSB now chat specifically
    this.logger.log(`[TriggerKeys] 🔍 Step 2: Searching for GSB now chat...`);
    const gsbClicked = await this.findAndClickGSBNowChat(worker.page, worker.cdpClient);
    
    if (gsbClicked) {
      this.logger.log(`[TriggerKeys] ✅ GSB now chat clicked, waiting for getRecentMessagesV2...`);
      await this.delay(3000); // Wait for messages to load
    } else {
      this.logger.warn(`[TriggerKeys] ⚠️ GSB now chat not found, trying first chat...`);
      await this.clickFirstChatItem(worker.page, worker.cdpClient);
      await this.delay(2000);
    }

    // [NEW] Step 3: Wait for getRecentMessagesV2 cURL (max 15 seconds)
    this.logger.log(`[TriggerKeys] ⏳ Step 3: Waiting for getRecentMessagesV2 cURL...`);
    let waitCount = 0;
    const maxWait = 30; // 30 * 500ms = 15 seconds
    while (!worker.capturedCurlRecentMessages && waitCount < maxWait) {
      await this.delay(500);
      waitCount++;
      if (waitCount % 6 === 0) {
        this.logger.log(`[TriggerKeys] Still waiting for getRecentMessagesV2 cURL... (${waitCount * 500}ms)`);
        // Try scrolling to trigger more API calls
        await this.scrollToLoadRecentMessages(worker.page);
      }
    }

    // Check if we got the cURL
    if (worker.capturedCurlRecentMessages) {
      this.logger.log(`[TriggerKeys] ✅ getRecentMessagesV2 cURL captured after ${waitCount * 500}ms`);
    } else {
      this.logger.warn(`[TriggerKeys] ⚠️ getRecentMessagesV2 cURL not captured, trying more attempts...`);
    }

    // [FALLBACK] If still no getRecentMessagesV2 cURL, try more aggressive methods
    if (!worker.capturedCurlRecentMessages) {
      for (let attempt = 1; attempt <= 5; attempt++) {
        this.logger.log(`[TriggerKeys] 🎯 Fallback attempt ${attempt}/5`);

        try {
          switch (attempt) {
            case 1:
              // Try clicking bank chat by pattern
              await this.clickBankChat(worker.page, worker.cdpClient);
              break;
            case 2:
              // Try scrolling messages
              await this.scrollToLoadRecentMessages(worker.page);
              break;
            case 3:
              // Try force refresh
              await this.forceRefreshMessages(worker.page, worker.cdpClient);
              break;
            case 4:
              // Try clicking first chat again
              await this.clickFirstChatItem(worker.page, worker.cdpClient);
              break;
            case 5:
              // Reload and try GSB now again
              await worker.page.reload({ waitUntil: 'domcontentloaded' });
              await this.delay(3000);
              await this.findAndClickGSBNowChat(worker.page, worker.cdpClient);
              break;
          }
        } catch (error: any) {
          this.logger.warn(`[TriggerKeys] ⚠️ Fallback attempt ${attempt} failed: ${error.message}`);
        }

        await this.delay(2000);

        // Check if we got it now
        if (worker.capturedCurlRecentMessages) {
          this.logger.log(`[TriggerKeys] ✅ getRecentMessagesV2 cURL captured on fallback attempt ${attempt}`);
          break;
        }
      }
    }

    // Return results
    if (worker.capturedKeys) {
      const preferredCurl = worker.capturedCurlRecentMessages || worker.capturedCurl;
      this.logger.log(`[TriggerKeys] 📋 Final result - Using cURL: ${worker.capturedCurlRecentMessages ? 'getRecentMessagesV2 ✅' : 'general (fallback) ⚠️'}`);

      return {
        keys: worker.capturedKeys,
        chatMid: worker.capturedChatMid,
        cUrlBash: preferredCurl,
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
   * [NEW] Find and click GSB now chat specifically
   * Returns true if GSB now chat was found and clicked
   */
  private async findAndClickGSBNowChat(page: any, cdpClient?: any): Promise<boolean> {
    this.logger.log(`[FindGSB] 🔍 Searching for GSB now chat...`);

    try {
      // GSB now specific patterns (prioritized)
      const gsbPatterns = [
        'GSB now',
        'GSB NOW', 
        'GSBnow',
        'gsb now',
        'ออมสิน',
        'GSB',
        'ธนาคารออมสิน',
      ];

      // Try to find GSB now in chat list
      const elementInfo = await page.evaluate((patterns: string[]) => {
        // Multiple selectors for chat items
        const selectors = [
          '[class*="chatItem"]',
          '[class*="listItem"]',
          '[class*="ChatListItem"]',
          '[data-testid="chat-list-item"]',
          'li[role="listitem"]',
          '[class*="conversation"]',
        ];

        for (const selector of selectors) {
          const chatItems = document.querySelectorAll(selector);
          
          for (const item of chatItems) {
            const text = (item.textContent || '').toLowerCase();
            
            for (const pattern of patterns) {
              if (text.includes(pattern.toLowerCase())) {
                const rect = item.getBoundingClientRect();
                // Make sure element is visible
                if (rect.width > 0 && rect.height > 0) {
                  return {
                    found: true,
                    x: rect.x + rect.width / 2,
                    y: rect.y + rect.height / 2,
                    text: (item.textContent || '').substring(0, 50),
                    pattern: pattern
                  };
                }
              }
            }
          }
        }

        return { found: false, x: 0, y: 0, text: '', pattern: '' };
      }, gsbPatterns);

      if (elementInfo.found) {
        this.logger.log(`[FindGSB] ✅ Found GSB chat: "${elementInfo.text}..." (matched: ${elementInfo.pattern})`);

        // Try CDP click first (more reliable)
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
            this.logger.log(`[FindGSB] 👆 CDP clicked GSB chat at (${elementInfo.x}, ${elementInfo.y})`);
            await this.delay(1500);
            return true;
          } catch (cdpError: any) {
            this.logger.warn(`[FindGSB] CDP click failed: ${cdpError.message}, trying DOM click...`);
          }
        }

        // Fallback: DOM click
        const clicked = await page.evaluate((patterns: string[]) => {
          const selectors = [
            '[class*="chatItem"]',
            '[class*="listItem"]',
            '[class*="ChatListItem"]',
            '[data-testid="chat-list-item"]',
          ];

          for (const selector of selectors) {
            const chatItems = document.querySelectorAll(selector);
            
            for (const item of chatItems) {
              const text = (item.textContent || '').toLowerCase();
              
              for (const pattern of patterns) {
                if (text.includes(pattern.toLowerCase())) {
                  (item as HTMLElement).click();
                  return true;
                }
              }
            }
          }
          return false;
        }, gsbPatterns);

        if (clicked) {
          this.logger.log(`[FindGSB] 👆 DOM clicked GSB chat`);
          await this.delay(1500);
          return true;
        }
      }

      this.logger.warn(`[FindGSB] ⚠️ GSB now chat not found in chat list`);
      return false;

    } catch (error: any) {
      this.logger.warn(`[FindGSB] Error: ${error.message}`);
      return false;
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

  // ============================================
  // [FIX] NEW METHODS FOR FIX_REPORT.md
  // ============================================

  /**
   * [FIX] Wait for chat list to fully render
   * Ensures DOM is ready before attempting to click
   */
  private async waitForChatListToRender(page: any): Promise<boolean> {
    this.logger.log(`[WaitRender] ⏳ Waiting for chat list to render...`);

    const maxWaitTime = 15000; // 15 seconds max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const hasContent = await page.evaluate(() => {
          // Check for chat list container
          const chatListSelectors = [
            '[class*="chatList"]',
            '[class*="ChatList"]',
            '[class*="listContainer"]',
            '[data-testid="chat-list"]',
          ];

          for (const selector of chatListSelectors) {
            const el = document.querySelector(selector);
            if (el && el.children.length > 0) {
              return true;
            }
          }

          // Check for chat items
          const chatItems = document.querySelectorAll('[class*="chatItem"], [class*="listItem"]');
          return chatItems.length > 0;
        });

        if (hasContent) {
          this.logger.log(`[WaitRender] ✅ Chat list rendered (${Date.now() - startTime}ms)`);
          await this.delay(500); // Extra wait for stability
          return true;
        }
      } catch (e) {
        // Continue waiting
      }

      await this.delay(500);
    }

    this.logger.warn(`[WaitRender] ⚠️ Chat list render timeout`);
    return false;
  }

  /**
   * [FIX] Search for bank chat by name using search box
   * Implements: Search for 'GSB NOW' in contact search box using page.type()
   */
  private async searchBankChatByName(page: any, cdpClient?: any): Promise<void> {
    const bankSearchTerms = ['GSB NOW', 'GSB', 'ออมสิน', 'SCB', 'KBANK', 'KBank', 'กสิกร'];

    this.logger.log(`[SearchBank] 🔍 Searching for bank chat...`);

    try {
      // Look for search input
      const searchSelectors = [
        'input[placeholder*="search"]',
        'input[placeholder*="Search"]',
        'input[placeholder*="ค้นหา"]',
        'input[type="search"]',
        '[class*="searchInput"]',
        '[class*="SearchInput"]',
        '[data-testid="search-input"]',
      ];

      let searchFound = false;
      for (const selector of searchSelectors) {
        try {
          const searchInput = await page.$(selector);
          if (searchInput) {
            this.logger.log(`[SearchBank] Found search input: ${selector}`);

            // Click to focus
            await searchInput.click();
            await this.delay(300);

            // Clear existing text
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await this.delay(100);

            // Try each bank search term
            for (const term of bankSearchTerms) {
              this.logger.log(`[SearchBank] Typing: "${term}"`);
              await searchInput.type(term, { delay: 50 });
              await this.delay(1500); // Wait for search results

              // Check if results appeared
              const hasResults = await page.evaluate(() => {
                const items = document.querySelectorAll('[class*="chatItem"], [class*="listItem"], [class*="searchResult"]');
                return items.length > 0;
              });

              if (hasResults) {
                this.logger.log(`[SearchBank] ✅ Found results for "${term}"`);
                // Click first result
                await this.clickFirstChatItem(page, cdpClient);
                searchFound = true;
                break;
              }

              // Clear for next term
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await page.keyboard.press('Backspace');
              await this.delay(300);
            }

            if (searchFound) break;
          }
        } catch (e) {
          // Try next selector
        }
      }

      if (!searchFound) {
        this.logger.warn(`[SearchBank] ⚠️ Search box not found or no results`);
      }
    } catch (error: any) {
      this.logger.warn(`[SearchBank] Error: ${error.message}`);
    }
  }

  /**
   * [FIX] Force refresh messages to trigger getRecentMessagesV2 API call
   */
  private async forceRefreshMessages(page: any, cdpClient?: any): Promise<void> {
    this.logger.log(`[ForceRefresh] 🔄 Forcing message refresh...`);

    try {
      // Method 1: Pull to refresh (scroll up quickly)
      await page.evaluate(() => {
        const messageContainer = document.querySelector('[class*="messageList"], [class*="MessageList"], [class*="chatContent"]');
        if (messageContainer) {
          messageContainer.scrollTop = 0;
        }
      });
      await this.delay(500);

      // Method 2: Click on chat header to refresh
      const headerSelectors = [
        '[class*="chatHeader"]',
        '[class*="ChatHeader"]',
        '[class*="conversationHeader"]',
      ];

      for (const selector of headerSelectors) {
        try {
          const header = await page.$(selector);
          if (header) {
            await header.click();
            this.logger.log(`[ForceRefresh] Clicked header: ${selector}`);
            await this.delay(1000);
            break;
          }
        } catch (e) {
          // Try next
        }
      }

      // Method 3: Press F5 in message area (some apps refresh on this)
      await page.keyboard.press('F5');
      await this.delay(1000);

      // Method 4: Use CDP to reload frame
      if (cdpClient) {
        try {
          await cdpClient.send('Page.reload', { ignoreCache: false });
          this.logger.log(`[ForceRefresh] CDP page reload sent`);
          await this.delay(2000);
        } catch (e) {
          // Ignore
        }
      }
    } catch (error: any) {
      this.logger.warn(`[ForceRefresh] Error: ${error.message}`);
    }
  }

  /**
   * [FIX] Scroll chat to load recent messages
   * This triggers the getRecentMessagesV2 API call
   */
  private async scrollToLoadRecentMessages(page: any): Promise<void> {
    this.logger.log(`[ScrollMessages] 📜 Scrolling to load messages...`);

    try {
      // Find message container
      const scrolled = await page.evaluate(() => {
        const containerSelectors = [
          '[class*="messageList"]',
          '[class*="MessageList"]',
          '[class*="chatContent"]',
          '[class*="ChatContent"]',
          '[class*="conversationContent"]',
          '[data-testid="message-list"]',
        ];

        for (const selector of containerSelectors) {
          const container = document.querySelector(selector);
          if (container) {
            // Scroll to top to trigger loading older messages
            container.scrollTop = 0;

            // Wait and scroll down
            setTimeout(() => {
              container.scrollTop = container.scrollHeight;
            }, 500);

            return true;
          }
        }
        return false;
      });

      if (scrolled) {
        this.logger.log(`[ScrollMessages] ✅ Scrolled message container`);
        await this.delay(2000); // Wait for API call

        // Scroll again to trigger more loads
        await page.evaluate(() => {
          const container = document.querySelector('[class*="messageList"], [class*="MessageList"], [class*="chatContent"]');
          if (container) {
            // Scroll up
            container.scrollTop = 0;
          }
        });
        await this.delay(1000);

        // Scroll down
        await page.evaluate(() => {
          const container = document.querySelector('[class*="messageList"], [class*="MessageList"], [class*="chatContent"]');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        });
        await this.delay(1000);
      } else {
        this.logger.warn(`[ScrollMessages] ⚠️ Message container not found`);
      }
    } catch (error: any) {
      this.logger.warn(`[ScrollMessages] Error: ${error.message}`);
    }
  }

  /**
   * [FIX] Keyboard navigation to find and click bank chat
   * Uses arrow keys and enter to navigate chat list
   */
  private async keyboardNavigateToBankChat(page: any, cdpClient?: any): Promise<void> {
    this.logger.log(`[KeyboardNav] ⌨️ Using keyboard to navigate...`);

    try {
      // First, make sure we're on chat list
      await this.navigateToChats(page);
      await this.delay(1000);

      // Focus on chat list
      await page.keyboard.press('Tab');
      await this.delay(200);

      // Navigate through items with arrow keys
      const bankPatterns = ['GSB', 'SCB', 'KBANK', 'ออมสิน', 'กสิกร', 'ธนาคาร'];

      for (let i = 0; i < 10; i++) {
        // Press Down arrow
        await page.keyboard.press('ArrowDown');
        await this.delay(300);

        // Check if current item is a bank chat
        const isBank = await page.evaluate((patterns: string[]) => {
          const focused = document.activeElement;
          if (focused) {
            const text = focused.textContent || '';
            for (const pattern of patterns) {
              if (text.includes(pattern)) {
                return true;
              }
            }
          }

          // Also check highlighted/selected items
          const selected = document.querySelector('[class*="selected"], [class*="active"], [class*="focused"]');
          if (selected) {
            const text = selected.textContent || '';
            for (const pattern of patterns) {
              if (text.includes(pattern)) {
                return true;
              }
            }
          }

          return false;
        }, bankPatterns);

        if (isBank) {
          this.logger.log(`[KeyboardNav] ✅ Found bank chat at position ${i + 1}`);
          // Press Enter to open
          await page.keyboard.press('Enter');
          await this.delay(1000);
          return;
        }
      }

      // If no bank found, just press Enter on current item
      this.logger.log(`[KeyboardNav] No bank found, selecting current item`);
      await page.keyboard.press('Enter');
      await this.delay(1000);

    } catch (error: any) {
      this.logger.warn(`[KeyboardNav] Error: ${error.message}`);
    }
  }

  /**
   * Check if already logged in (GSB-style with multiple indicators)
   */
  private async checkLoggedIn(page: any): Promise<boolean> {
    try {
      if (!page) {
        this.logger.warn(`[CheckLoggedIn] Page is null — browser may have been closed during recovery`);
        return false;
      }
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
    if (!page) {
      this.logger.error(`[Extension] Page is null — cannot navigate to extension`);
      return false;
    }
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

    // Method 1: Try direct navigation first
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`[Extension] Method 1: Direct navigation (attempt ${attempt}/${maxRetries})...`);

        // Navigate with 30s timeout (server อาจ overloaded)
        await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
          // Delay before retry
          await this.delay(2000);
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
      await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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

      await page.goto('chrome://extensions', { waitUntil: 'load', timeout: 30000 });
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
        await page.goto(extensionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
    if (!page) {
      throw new Error('Browser page is null — cannot perform login');
    }

    this.logger.log(`[Login] ========== STARTING LOGIN PROCESS ==========`);
    this.logger.log(`[Login] Waiting for email input field...`);

    try {
      await page.waitForSelector('input[name="email"]', { timeout: 90000 });
      this.logger.log(`[Login] Found email input, entering credentials`);
    } catch (e: any) {
      this.logger.error(`[Login] Email input not found: ${e.message}`);
      try {
        const currentUrl = page.url?.();
        this.logger.error(`[Login] Current URL: ${currentUrl}`);
        const pageContent = await page.content?.();
        if (pageContent) {
          this.logger.error(`[Login] Page content length: ${pageContent.length}`);
          this.logger.error(`[Login] Page contains 'email': ${pageContent.includes('email')}`);
          this.logger.error(`[Login] Page contains 'login': ${pageContent.includes('login')}`);
        }
      } catch (debugErr) {
        this.logger.error(`[Login] Could not get debug info: page may be destroyed`);
      }
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
  private async waitForLoginComplete(page: any, lineAccountId?: string): Promise<boolean> {
    const startTime = Date.now();
    let checkCount = 0;

    this.logger.log(`[LoginComplete] Waiting for PIN verification (timeout: ${this.LOGIN_TIMEOUT / 60000} minutes)...`);

    // GSB-style: Try to wait for navigation first
    try {
      this.logger.log(`[LoginComplete] Waiting for page navigation after PIN verification...`);

      // Race navigation against abort signal
      const navPromise = page.waitForNavigation({
        waitUntil: 'load',
        timeout: this.LOGIN_TIMEOUT,
      });

      // Check abort every 500ms during navigation wait
      const abortCheckPromise = new Promise<'aborted'>((resolve) => {
        const interval = setInterval(() => {
          if (lineAccountId && this.loginAbortSignals.get(lineAccountId)) {
            clearInterval(interval);
            resolve('aborted');
          }
        }, 500);
        // Clean up on nav completion
        navPromise.then(() => clearInterval(interval)).catch(() => clearInterval(interval));
      });

      const navResult = await Promise.race([navPromise, abortCheckPromise]);
      if (navResult === 'aborted') {
        this.logger.warn(`[LoginComplete] Aborted during navigation wait for ${lineAccountId}`);
        return false;
      }

      this.logger.log(`[LoginComplete] Navigation completed!`);

      // After navigation, check if logged in
      const isLoggedIn = await this.checkLoggedIn(page);
      if (isLoggedIn) {
        this.logger.log(`[LoginComplete] Successfully logged in after navigation`);
        return true;
      }
    } catch (navError: any) {
      // Check abort before falling through to polling
      if (lineAccountId && this.loginAbortSignals.get(lineAccountId)) {
        this.logger.warn(`[LoginComplete] Aborted after navigation error for ${lineAccountId}`);
        return false;
      }
      // Navigation timeout - fall back to polling
      this.logger.log(`[LoginComplete] Navigation wait ended, falling back to polling...`);
    }

    // Fallback: Poll for login completion
    while (Date.now() - startTime < this.LOGIN_TIMEOUT) {
      // Check abort signal BEFORE each poll iteration
      if (lineAccountId && this.loginAbortSignals.get(lineAccountId)) {
        this.logger.warn(`[LoginComplete] Aborted polling for ${lineAccountId} (abort signal received)`);
        return false;
      }

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
          try {
            const currentUrl = page.url();
            this.logger.log(`[LoginComplete] Still waiting... ${elapsed}s elapsed, URL: ${currentUrl}`);
          } catch {
            this.logger.log(`[LoginComplete] Still waiting... ${elapsed}s elapsed (page detached)`);
          }
        }
      } catch (e: any) {
        if (e.message.includes('Login error')) throw e;
        // If page is detached, check abort before continuing
        if (e.message.includes('detached') || e.message.includes('Protocol error')) {
          if (lineAccountId && this.loginAbortSignals.get(lineAccountId)) {
            this.logger.warn(`[LoginComplete] Aborted polling for ${lineAccountId} (page detached + abort signal)`);
            return false;
          }
        }
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
    // Safety check: chatMid must be a string (not an object)
    let validChatMid: string | undefined;
    if (chatMid) {
      if (typeof chatMid === 'string') {
        validChatMid = chatMid;
      } else if (typeof chatMid === 'object') {
        // Handle case where chatMid is an object (e.g., { targetUserMids: [...] })
        this.logger.warn(`[SaveKeys] chatMid is an object, attempting to extract: ${JSON.stringify(chatMid).substring(0, 100)}`);
        const chatMidObj = chatMid as any;
        if (Array.isArray(chatMidObj.targetUserMids) && chatMidObj.targetUserMids[0]) {
          validChatMid = chatMidObj.targetUserMids[0];
          this.logger.log(`[SaveKeys] Extracted chatMid from targetUserMids: ${validChatMid}`);
        } else if (chatMidObj.chatMid) {
          validChatMid = chatMidObj.chatMid;
        } else if (chatMidObj.mid) {
          validChatMid = chatMidObj.mid;
        }
      }
    }

    // Final safety check: ensure chatMid is a string before saving
    if (validChatMid && typeof validChatMid !== 'string') {
      this.logger.error(`[SaveKeys] CRITICAL: chatMid is still not a string after extraction: ${typeof validChatMid} - ${JSON.stringify(validChatMid).substring(0, 100)}`);
      validChatMid = undefined;
    }

    // Save keys with captured chatMid and cUrlBash in one call
    await this.keyStorageService.saveKeys({
      lineAccountId,
      xLineAccess: keys.xLineAccess,
      xHmac: keys.xHmac,
      source: 'enhanced_auto_login',
      chatMid: validChatMid,
      cUrlBash: cUrlBash,
    });

    this.logger.log(`Keys saved for ${lineAccountId}, chatMid: ${validChatMid || 'N/A'}, hasCurl: ${!!cUrlBash}`);
  }

  /**
   * Cancel login - GSB-style: Keep browser open for reuse
   * This allows faster re-login using the same browser session and profile
   */
  async cancelLogin(lineAccountId: string): Promise<void> {
    // Signal waitForLoginComplete to abort immediately
    this.loginAbortSignals.set(lineAccountId, true);
    this.loginCoordinatorService.cancelRequest(lineAccountId);

    // Securely clear active PIN tracking
    this.secureClearPin(lineAccountId);

    // GSB-style: Soft cancel - keep browser open, just reset state
    // This allows reusing the same browser for next login attempt
    await this.workerPoolService.softCancelWorker(lineAccountId);

    // Release the login lock so new login attempts can proceed (Issue B fix)
    this.loginLockService.releaseLock(lineAccountId, 'enhanced');
    this.processNextInQueue();

    // Emit cancelled status
    this.emitStatus(lineAccountId, EnhancedLoginStatus.FAILED, { error: 'Login cancelled by user' });

    this.logger.log(`Login cancelled for ${lineAccountId} (browser kept open for reuse)`);
  }

  /**
   * Force close browser - Use this when you want to completely close the browser
   */
  async forceCloseBrowser(lineAccountId: string): Promise<void> {
    // Signal waitForLoginComplete to abort immediately (prevents detached frame spam)
    this.loginAbortSignals.set(lineAccountId, true);
    this.loginCoordinatorService.cancelRequest(lineAccountId);
    this.secureClearPin(lineAccountId);
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

    // Check if keys were recently captured (within last 30 seconds)
    // This handles the case where worker is already closed but login just succeeded
    const recentSuccess = this.recentLoginSuccess.get(lineAccountId);
    if (recentSuccess && Date.now() - recentSuccess.timestamp < 30000) {
      status = 'success';
      message = 'ดึง Keys สำเร็จ';
      return {
        success: true,
        status,
        pin: undefined,
        message,
        error: undefined,
        stage: status,
        pinStatus: this.getPinStatus(lineAccountId),
        worker: null,
        request,
        cooldown,
        recentSuccess: true,
      };
    }

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

  /**
   * Retry login after wrong PIN
   * Quick retry: force close browser, reset cooldown, start fresh login
   * Must use forceCloseBrowser (not soft cancel) because reused browser
   * gets stuck on extension page causing navigation timeouts
   */
  async retryLoginAfterWrongPin(lineAccountId: string): Promise<EnhancedLoginResult> {
    this.logger.log(`[RetryWrongPin] Starting quick retry for ${lineAccountId}`);

    // Step 1: Force close browser (NOT soft cancel - reused browser gets stuck)
    try {
      await this.forceCloseBrowser(lineAccountId);
      this.logger.log(`[RetryWrongPin] Force closed browser for ${lineAccountId}`);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.warn(`[RetryWrongPin] Force close failed (may already be idle): ${error.message}`);
    }

    // Step 2: Wait 2 seconds for browser process cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Reset cooldown to bypass wait
    this.loginCoordinatorService.resetCooldown(lineAccountId);

    // Step 4: Release login lock so startLogin can acquire it
    this.loginLockService.releaseLock(lineAccountId, 'enhanced');

    this.logger.log(`[RetryWrongPin] Cooldown reset and lock released for ${lineAccountId}`);

    // Step 5: Start fresh login with saved credentials (source = 'manual', forceLogin = true)
    // forceLogin = true → skip key copying from other sessions, always do browser login for new PIN
    const result = await this.startLogin(lineAccountId, undefined, undefined, 'manual', true);

    this.logger.log(`[RetryWrongPin] New login started for ${lineAccountId}: ${result.status}`);
    return result;
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
   * Check if a session has recent login success within grace period
   * Used by Orchestrator to skip health check validation for recently logged in sessions
   *
   * @param lineAccountId - Session ID to check
   * @param gracePeriodMs - Optional custom grace period (default: HEALTH_CHECK_GRACE_PERIOD_MS = 5 minutes)
   * @returns Object with hasRecentSuccess flag and age in seconds
   */
  hasRecentSuccess(lineAccountId: string, gracePeriodMs?: number): {
    hasRecentSuccess: boolean;
    ageSeconds: number;
    gracePeriodSeconds: number;
  } {
    const recentSuccess = this.recentLoginSuccess.get(lineAccountId);
    const gracePeriod = gracePeriodMs || this.HEALTH_CHECK_GRACE_PERIOD_MS;

    if (!recentSuccess) {
      return {
        hasRecentSuccess: false,
        ageSeconds: 0,
        gracePeriodSeconds: gracePeriod / 1000,
      };
    }

    const ageMs = Date.now() - recentSuccess.timestamp;
    const ageSeconds = Math.floor(ageMs / 1000);
    const hasRecentSuccess = ageMs < gracePeriod;

    return {
      hasRecentSuccess,
      ageSeconds,
      gracePeriodSeconds: gracePeriod / 1000,
    };
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
   * Clear PIN for a LINE account (secure deletion)
   */
  clearPin(lineAccountId: string): void {
    this.secureClearPin(lineAccountId);
    this.logger.log(`[PIN Security] Securely cleared PIN for ${lineAccountId}`);
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

        // Securely clear PIN
        this.secureClearPin(lineAccountId);

        // Release lock if held
        this.loginLockService.releaseLock(lineAccountId, 'enhanced');
        this.processNextInQueue();

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
   * Uses secure deletion to prevent PIN from lingering in memory
   */
  cleanupExpiredPins(): number {
    let cleaned = 0;
    const now = new Date();
    const expiryMs = this.PIN_EXPIRY_MINUTES * 60 * 1000;
    const expiredAccounts: string[] = [];

    // First pass: identify expired PINs
    for (const [lineAccountId, pinData] of this.pinStore) {
      const pinAge = now.getTime() - new Date(pinData.updatedAt).getTime();
      if (pinAge > expiryMs) {
        expiredAccounts.push(lineAccountId);
      }
    }

    // Second pass: securely delete expired PINs
    for (const lineAccountId of expiredAccounts) {
      this.secureClearPin(lineAccountId);
      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(`[PIN Security] Securely cleaned up ${cleaned} expired PINs`);
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

    // Sync stage to lock for queue visibility
    const stageLabel = this.getStageLabel(status);
    if (stageLabel) {
      this.loginLockService.updateLockStage(lineAccountId, stageLabel);
    }
  }

  /** Map EnhancedLoginStatus → Thai label for lock stage display */
  private getStageLabel(status: EnhancedLoginStatus): string | null {
    switch (status) {
      case EnhancedLoginStatus.REQUESTING:
      case EnhancedLoginStatus.INITIALIZING:
        return 'กำลังเริ่มต้น';
      case EnhancedLoginStatus.LAUNCHING_BROWSER:
        return 'กำลังเปิดเบราว์เซอร์';
      case EnhancedLoginStatus.LOADING_EXTENSION:
      case EnhancedLoginStatus.CHECKING_SESSION:
        return 'กำลังโหลด LINE';
      case EnhancedLoginStatus.ENTERING_CREDENTIALS:
        return 'กำลังกรอกข้อมูล';
      case EnhancedLoginStatus.WAITING_PIN:
      case EnhancedLoginStatus.PIN_DISPLAYED:
        return 'รอยืนยัน PIN';
      case EnhancedLoginStatus.VERIFYING:
        return 'กำลังตรวจสอบ';
      case EnhancedLoginStatus.EXTRACTING_KEYS:
        return 'กำลังดึง Keys';
      case EnhancedLoginStatus.TRIGGERING_MESSAGES:
        return 'กำลังดึงข้อมูล Chat';
      default:
        return null;
    }
  }

  /**
   * Helper delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on module destroy - securely clear all PINs from memory
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('[PIN Security] Module destroying - securely clearing all PINs from memory');

    // Stop cleanup interval
    if (this.pinCleanupInterval) {
      clearInterval(this.pinCleanupInterval);
      this.pinCleanupInterval = null;
    }

    // Clear circuit breaker timer
    if (this.globalCircuitBreakerTimer) {
      clearTimeout(this.globalCircuitBreakerTimer);
      this.globalCircuitBreakerTimer = null;
    }

    // Securely clear all PINs
    const pinCount = this.pinStore.size;
    for (const lineAccountId of Array.from(this.pinStore.keys())) {
      this.secureClearPin(lineAccountId);
    }

    // Clear the map itself
    this.pinStore.clear();

    // Clear recent login success map
    this.recentLoginSuccess.clear();

    this.logger.log(`[PIN Security] Securely cleared ${pinCount} PIN(s) and cleaned up memory`);

    // WorkerPoolService handles its own cleanup
  }
}
