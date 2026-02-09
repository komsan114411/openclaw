import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { SystemSettings, SystemSettingsDocument } from '../../database/schemas/system-settings.schema';
import { EnhancedAutomationService, KeysStatus, isCredentialError } from './enhanced-automation.service';
import { WorkerPoolService } from './worker-pool.service';
import { KeyStorageService } from './key-storage.service';
import { EventBusService } from '../../core/events';

/**
 * Session Status for Real-time Broadcasting
 */
export interface SessionStatus {
  lineAccountId: string;
  sessionId: string;
  name: string;
  lineEmail?: string;
  bankName?: string;
  // Keys Status
  hasKeys: boolean;
  keysStatus: KeysStatus;
  keysAgeMinutes: number;
  keysExpiresIn: number; // seconds
  isExpiringSoon: boolean;
  // Login Status
  loginStatus: 'idle' | 'logging_in' | 'waiting_pin' | 'success' | 'failed' | 'cooldown';
  pinCode?: string;
  pinStatus?: string;
  // Flags
  needsRelogin: boolean;
  reloginReason?: string;
  isAutoReloginEnabled: boolean;
  lastCheckedAt: Date;
  lastError?: string;
}

/**
 * Orchestrator Statistics
 */
export interface OrchestratorStats {
  isRunning: boolean;
  totalSessions: number;
  activeSessions: number;
  expiringSoonSessions: number;
  expiredSessions: number;
  loggingInSessions: number;
  lastHealthCheck: Date | null;
  lastReloginCheck: Date | null;
  autoReloginEnabled: boolean;
  healthCheckIntervalMinutes: number;
  reloginCheckIntervalMinutes: number;
  reloginAttempts: number;
  reloginSuccesses: number;
  reloginFailures: number;
}

/**
 * Orchestrator Service
 *
 * Central control hub for Auto-Relogin Loop (ported from GSB)
 *
 * Features:
 * - Health check loop (configurable interval)
 * - Keys expiry detection and auto-relogin
 * - Real-time status broadcasting via WebSocket
 * - Admin configurable settings
 */
@Injectable()
export class OrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorService.name);

  // Loop intervals
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reloginCheckInterval: NodeJS.Timeout | null = null;
  private statusBroadcastInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private pinCountdownInterval: NodeJS.Timeout | null = null;

  // State
  private isRunning = false;
  private settings: SystemSettings | null = null;
  private lastHealthCheck: Date | null = null;
  private lastReloginCheck: Date | null = null;

  // Statistics
  private reloginAttempts = 0;
  private reloginSuccesses = 0;
  private reloginFailures = 0;

  // Recovery tracking
  private recoveryAttempts: Map<string, { attempts: number; lastAttempt: Date }> = new Map();

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
    private enhancedAutomationService: EnhancedAutomationService,
    private workerPoolService: WorkerPoolService,
    private keyStorageService: KeyStorageService,
    private eventEmitter: EventEmitter2,
    private eventBusService: EventBusService,
  ) {}

  async onModuleInit() {
    this.logger.log('Orchestrator Service initializing...');

    // Auto-cleanup corrupted sessions on startup
    await this.cleanupCorruptedSessions();

    await this.loadSettings();
    await this.startLoops();
    this.logger.log('Orchestrator Service initialized');
  }

  /**
   * Fix or clean up corrupted sessions (missing name, ownerId, or with invalid data)
   * Try to fix first, only delete if unfixable
   */
  private async cleanupCorruptedSessions(): Promise<void> {
    try {
      // Find corrupted sessions
      const corruptedSessions = await this.lineSessionModel.find({
        $or: [
          { name: { $exists: false } },
          { name: null },
          { name: '' },
          { ownerId: { $exists: false } },
          { ownerId: null },
          { ownerId: '' },
        ],
      });

      this.logger.log(`[Cleanup] Found ${corruptedSessions.length} corrupted sessions`);

      let fixedCount = 0;
      let deletedCount = 0;

      for (const session of corruptedSessions) {
        const sessionId = session._id.toString();

        // Try to fix: sessions with email/credentials are fixable
        if (session.lineEmail || session.lineAccountId) {
          const fixedName = session.lineEmail?.split('@')[0] || session.lineAccountId || `Session-${sessionId.slice(-6)}`;
          const fixedOwnerId = session.ownerId || 'system';

          await this.lineSessionModel.updateOne(
            { _id: session._id },
            {
              $set: {
                name: fixedName,
                ownerId: fixedOwnerId,
              },
            },
          );
          fixedCount++;
          this.logger.log(`[Cleanup] Fixed session ${sessionId}: name=${fixedName}`);
        } else {
          // No email or lineAccountId - delete
          await this.lineSessionModel.deleteOne({ _id: session._id });
          deletedCount++;
          this.logger.log(`[Cleanup] Deleted unfixable session ${sessionId}`);
        }
      }

      if (fixedCount > 0 || deletedCount > 0) {
        this.logger.log(`[Cleanup] Completed: fixed=${fixedCount}, deleted=${deletedCount}`);
      }
    } catch (error: any) {
      this.logger.error(`[Cleanup] Error: ${error.message}`);
    }
  }

  onModuleDestroy() {
    this.stopLoops();
  }

  /**
   * Load settings from database
   */
  async loadSettings(): Promise<void> {
    this.settings = await this.systemSettingsModel.findOne({ settingsId: 'main' });
    if (!this.settings) {
      this.logger.warn('No system settings found, using defaults');
    }
  }

  /**
   * Start all loops
   */
  async startLoops(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Loops already running');
      return;
    }

    await this.loadSettings();

    const healthCheckMs = (this.settings?.lineSessionHealthCheckIntervalMinutes || 5) * 60 * 1000;
    const reloginCheckMs = (this.settings?.lineSessionReloginCheckIntervalMinutes || 10) * 60 * 1000;
    const statusBroadcastMs = 5000; // 5 seconds

    // Health Check Loop
    if (this.settings?.lineSessionHealthCheckEnabled !== false) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, healthCheckMs);
      this.logger.log(`Health check loop started (every ${healthCheckMs / 60000} minutes)`);
    }

    // Relogin Check Loop
    if (this.settings?.lineSessionAutoReloginEnabled !== false) {
      this.reloginCheckInterval = setInterval(() => {
        this.performReloginCheck();
      }, reloginCheckMs);
      this.logger.log(`Relogin check loop started (every ${reloginCheckMs / 60000} minutes)`);
    }

    // Status Broadcast Loop (always on for real-time updates)
    this.statusBroadcastInterval = setInterval(() => {
      this.broadcastAllStatuses();
    }, statusBroadcastMs);
    this.logger.log('Status broadcast loop started (every 5 seconds)');

    // Cleanup Loop - Auto-cleanup expired PINs every 1 minute
    const cleanupMs = 60000; // 1 minute
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, cleanupMs);
    this.logger.log('Cleanup loop started (every 1 minute)');

    // PIN Countdown Broadcast Loop - Every 10 seconds for real-time PIN countdown sync
    const pinCountdownMs = 10000; // 10 seconds
    this.pinCountdownInterval = setInterval(() => {
      this.broadcastPinCountdowns();
    }, pinCountdownMs);
    this.logger.log('PIN countdown broadcast loop started (every 10 seconds)');

    this.isRunning = true;

    // Perform initial checks
    this.logger.log('[Orchestrator] Running initial checks...');
    await this.performHealthCheck();

    // Run initial relogin check after a short delay
    setTimeout(async () => {
      this.logger.log('[Orchestrator] Running initial relogin check...');
      await this.performReloginCheck();
    }, 10000); // 10 seconds after startup
  }

  /**
   * Stop all loops
   */
  stopLoops(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.reloginCheckInterval) {
      clearInterval(this.reloginCheckInterval);
      this.reloginCheckInterval = null;
    }
    if (this.statusBroadcastInterval) {
      clearInterval(this.statusBroadcastInterval);
      this.statusBroadcastInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.pinCountdownInterval) {
      clearInterval(this.pinCountdownInterval);
      this.pinCountdownInterval = null;
    }
    this.isRunning = false;
    this.logger.log('All loops stopped');
  }

  /**
   * Perform cleanup of expired PINs and stale logins
   */
  private async performCleanup(): Promise<void> {
    try {
      const result = await this.enhancedAutomationService.autoCleanupExpiredLogins();

      if (result.cleaned > 0) {
        this.logger.log(`[Cleanup] Cleaned up ${result.cleaned} expired login(s)`);

        // Emit PIN expired events for each cleaned up login
        for (const detail of result.details) {
          this.eventEmitter.emit('session.pin_expired', {
            lineAccountId: detail.lineAccountId,
            reason: detail.reason,
            timestamp: new Date(),
          });
        }

        // Broadcast cleanup event
        this.eventEmitter.emit('orchestrator.cleanup', {
          type: 'cleanup',
          cleaned: result.cleaned,
          details: result.details,
          timestamp: new Date(),
        });
      }
    } catch (error: any) {
      this.logger.error(`[Cleanup] Error during cleanup: ${error.message}`);
    }
  }

  /**
   * Broadcast PIN countdown updates for all active PINs
   * This keeps frontend countdown synchronized with server time
   */
  private broadcastPinCountdowns(): void {
    try {
      const activePins = this.enhancedAutomationService.getAllActivePins();

      for (const { lineAccountId, status } of activePins) {
        // Emit PIN countdown event
        this.eventEmitter.emit('session.pin_countdown', {
          lineAccountId,
          pinCode: status.pinCode,
          expiresIn: status.expiresIn,
          status: status.status, // FRESH/NEW/OLD
          ageSeconds: status.ageSeconds,
          isUsable: status.isUsable,
          timestamp: new Date(),
        });
      }
    } catch (error: any) {
      // Silent fail for countdown broadcast
    }
  }

  /**
   * Restart loops (after settings change)
   */
  async restartLoops(): Promise<void> {
    this.stopLoops();
    await this.startLoops();
  }

  /**
   * Perform health check on all sessions
   */
  async performHealthCheck(): Promise<void> {
    this.lastHealthCheck = new Date();
    this.logger.log('[HealthCheck] Starting health check...');

    try {
      const sessions = await this.lineSessionModel.find({ isActive: true });
      this.logger.log(`[HealthCheck] Found ${sessions.length} active sessions`);

      for (const session of sessions) {
        try {
          // Skip sessions with credential_error — user must fix email/password manually
          if (session.status === 'credential_error') {
            continue;
          }

          // Use session._id as the primary identifier (lineAccountId might be empty)
          const sessionId = session._id.toString();

          // Try to fix corrupted sessions
          if (!session.name || !session.ownerId) {
            const fixedName = session.lineEmail?.split('@')[0] || session.lineAccountId || `Session-${sessionId.slice(-6)}`;
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              { $set: { name: fixedName, ownerId: session.ownerId || 'system' } },
            );
            session.name = fixedName;
            this.logger.log(`[HealthCheck] Auto-fixed session ${sessionId}: name=${fixedName}`);
          }

          // Check keys status (time-based)
          const keysStatus = await this.enhancedAutomationService.getKeysStatus(sessionId);

          // If session has no keys at all
          if (!session.xLineAccess || !session.xHmac) {
            this.logger.warn(`[HealthCheck] Session ${session.name}: no keys found`);
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              {
                $set: {
                  lastCheckedAt: new Date(),
                  lastCheckResult: 'no_keys',
                  status: 'expired',
                  lastError: 'ไม่มี keys - ต้องเข้าสู่ระบบใหม่',
                },
              },
            );
            continue;
          }

          // [FIX] Check if session has recent login success (grace period protection)
          const recentSuccessInfo = this.enhancedAutomationService.hasRecentSuccess(sessionId);

          // Validate keys with actual LINE API call (always validate to get real status)
          this.logger.log(`[HealthCheck] Validating keys for ${session.name}...`);
          const keysValid = await this.enhancedAutomationService.validateKeys(session.xLineAccess, session.xHmac);

          // Update session with check result
          try {
            if (keysValid) {
              this.logger.log(`[HealthCheck] Session ${session.name}: keys VALID ✓`);
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                {
                  $set: {
                    lastCheckedAt: new Date(),
                    lastCheckResult: 'valid',
                    status: 'active',
                    lastError: null,
                    consecutiveFailures: 0,
                  },
                },
              );
            } else if (recentSuccessInfo.hasRecentSuccess) {
              // [FIX] Keys validation failed BUT session has recent login success
              // Don't mark as expired - trust the recent login (LINE API may have delay)
              this.logger.warn(
                `[HealthCheck] Session ${session.name}: LINE API returned expired, but TRUSTING recent login success (${recentSuccessInfo.ageSeconds}s ago, grace period: ${recentSuccessInfo.gracePeriodSeconds}s)`,
              );
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                {
                  $set: {
                    lastCheckedAt: new Date(),
                    lastCheckResult: 'valid_grace_period',
                    status: 'active',
                    lastError: null,
                    consecutiveFailures: 0,
                  },
                },
              );
            } else {
              // Keys validation failed AND no recent success - truly expired
              this.logger.warn(`[HealthCheck] Session ${session.name}: keys EXPIRED ✗`);
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                {
                  $set: {
                    lastCheckedAt: new Date(),
                    lastCheckResult: 'expired',
                    status: 'expired',
                    lastError: 'Keys หมดอายุ - รอ auto-relogin',
                  },
                },
              );

              // Emit expired event for real-time notification and relogin scheduling
              // Use session._id.toString() as the identifier for relogin
              const sessionIdStr = session._id.toString();
              this.eventEmitter.emit('session.expired', {
                lineAccountId: sessionIdStr,
                sessionId: session._id,
                name: session.name,
              });
              // Also publish to EventBusService for ReloginScheduler
              this.eventBusService.publish({
                eventName: 'line-session.expired' as any,
                occurredAt: new Date(),
                lineAccountId: sessionIdStr,
                sessionId: sessionIdStr,
                name: session.name,
              });
            }
          } catch (updateError: any) {
            this.logger.warn(`[HealthCheck] Failed to update session ${session.name}: ${updateError.message}`);
          }

          // Check if needs warning (expiring soon based on time)
          if (keysStatus.isExpiringSoon && keysValid) {
            const minutesLeft = Math.floor(keysStatus.expiresIn / 60);
            this.logger.warn(`[HealthCheck] Session ${session.name} keys expiring soon (${minutesLeft} min left)`);
            this.eventEmitter.emit('session.expiring_soon', {
              lineAccountId: sessionId,
              sessionId: session._id,
              name: session.name,
              expiresIn: keysStatus.expiresIn,
            });
          }
        } catch (error: any) {
          this.logger.error(`[HealthCheck] Error checking session ${session.name}: ${error.message}`);
        }
      }

      this.logger.log('[HealthCheck] Health check completed');
    } catch (error: any) {
      this.logger.error(`[HealthCheck] Error: ${error.message}`);
    }
  }

  /**
   * Perform relogin check and auto-relogin expired sessions
   */
  async performReloginCheck(): Promise<void> {
    this.logger.log(`[ReloginCheck] Auto-relogin enabled: ${this.settings?.lineSessionAutoReloginEnabled !== false}`);

    if (this.settings?.lineSessionAutoReloginEnabled === false) {
      this.logger.log('[ReloginCheck] Auto-relogin is disabled in settings, skipping');
      return;
    }

    this.lastReloginCheck = new Date();
    this.logger.log('[ReloginCheck] Starting relogin check...');

    try {
      // Find sessions that need relogin:
      // 1. Status is expired or pending_relogin
      // 2. Last check result is expired
      // 3. Too many consecutive failures
      // 4. No keys at all (xLineAccess is empty)
      // EXCLUDE: credential_error (user must fix email/password manually)
      const sessions = await this.lineSessionModel.find({
        isActive: true,
        status: { $ne: 'credential_error' },
        $or: [
          { status: 'expired' },
          { status: 'pending_relogin' },
          { lastCheckResult: 'expired' },
          { consecutiveFailures: { $gte: this.settings?.lineSessionMaxConsecutiveFailures || 3 } },
          { xLineAccess: { $exists: false } },
          { xLineAccess: null },
          { xLineAccess: '' },
        ],
      });

      this.logger.log(`[ReloginCheck] Found ${sessions.length} sessions needing relogin`);

      // Log each session's details
      for (const s of sessions) {
        this.logger.log(`[ReloginCheck] Session: ${s.name}, status=${s.status}, hasKeys=${!!s.xLineAccess}, hasEmail=${!!s.lineEmail}, hasPassword=${!!s.linePassword}`);
      }

      for (const session of sessions) {
        try {
          // Use session._id as the primary identifier
          const sessionId = session._id.toString();

          // Try to fix corrupted sessions instead of just skipping
          if (!session.name || !session.ownerId) {
            this.logger.warn(`[ReloginCheck] Session ${sessionId} is corrupted (missing name or ownerId)`);

            // Try to auto-fix: set name from email or lineAccountId
            const fixedName = session.lineEmail?.split('@')[0] || session.lineAccountId || `Session-${sessionId.slice(-6)}`;
            const fixedOwnerId = session.ownerId || 'system';

            try {
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                {
                  $set: {
                    name: fixedName,
                    ownerId: fixedOwnerId,
                  },
                },
              );
              this.logger.log(`[ReloginCheck] Auto-fixed session ${sessionId}: name=${fixedName}`);

              // Update local session object for this iteration
              session.name = fixedName;
              session.ownerId = fixedOwnerId;
            } catch (fixError: any) {
              this.logger.error(`[ReloginCheck] Failed to fix session ${sessionId}: ${fixError.message}`);
              continue;
            }
          }

          // Check recovery attempts (cooldown) - Optimized for 100+ users
          const recovery = this.recoveryAttempts.get(sessionId);
          if (recovery && recovery.attempts >= 5) { // Increased from 3 to 5
            const cooldownMs = 10 * 60 * 1000; // 10 minutes (reduced from 30)
            if (Date.now() - recovery.lastAttempt.getTime() < cooldownMs) {
              const remainingMs = cooldownMs - (Date.now() - recovery.lastAttempt.getTime());
              const remainingMin = Math.ceil(remainingMs / 60000);
              this.logger.log(`[ReloginCheck] Session ${session.name} in cooldown (${remainingMin} min left), skipping`);

              // Update session status to show cooldown
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                { $set: { status: 'cooldown', lastError: `ถูกระงับชั่วคราว เหลืออีก ${remainingMin} นาที` } },
              );
              continue;
            }
            // Reset after cooldown
            this.recoveryAttempts.delete(sessionId);
            this.logger.log(`[ReloginCheck] Cooldown expired for ${session.name}, resetting attempts`);
          }

          // Check if has credentials
          if (!session.lineEmail || !session.linePassword) {
            this.logger.warn(`[ReloginCheck] Session ${session.name} has no credentials, skipping`);
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              { $set: { status: 'no_credentials', lastError: 'ไม่มีข้อมูลเข้าสู่ระบบ (email/password)' } },
            );
            continue;
          }

          // [FIX] Skip relogin for sessions with recent login success
          // This prevents triggering relogin immediately after successful login
          const recentSuccessInfo = this.enhancedAutomationService.hasRecentSuccess(sessionId);
          if (recentSuccessInfo.hasRecentSuccess) {
            this.logger.log(
              `[ReloginCheck] Session ${session.name}: SKIPPING relogin (recent login success ${recentSuccessInfo.ageSeconds}s ago, grace period: ${recentSuccessInfo.gracePeriodSeconds}s)`,
            );
            // Update status back to active since login was recently successful
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              {
                $set: {
                  status: 'active',
                  lastCheckResult: 'valid',
                  lastCheckedAt: new Date(),
                  lastError: null,
                },
              },
            );
            continue;
          }

          // Double-check: Validate keys with LINE API before triggering relogin
          // This prevents unnecessary relogin attempts
          if (session.xLineAccess && session.xHmac) {
            this.logger.log(`[ReloginCheck] Validating keys for ${session.name} before relogin...`);
            const keysValid = await this.enhancedAutomationService.validateKeys(
              session.xLineAccess,
              session.xHmac,
            );

            if (keysValid) {
              this.logger.log(`[ReloginCheck] Keys are still valid for ${session.name}, skipping relogin`);
              // Update status back to active
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                { $set: { status: 'active', lastCheckResult: 'valid', lastCheckedAt: new Date() } },
              );
              continue;
            }

            // [FIX] Keys validation failed - but check grace period again before relogin
            // (in case login just completed during validation)
            const recentSuccessRecheck = this.enhancedAutomationService.hasRecentSuccess(sessionId);
            if (recentSuccessRecheck.hasRecentSuccess) {
              this.logger.warn(
                `[ReloginCheck] Session ${session.name}: LINE API returned expired, but TRUSTING recent login (${recentSuccessRecheck.ageSeconds}s ago), skipping relogin`,
              );
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                {
                  $set: {
                    status: 'active',
                    lastCheckResult: 'valid_grace_period',
                    lastCheckedAt: new Date(),
                    lastError: null,
                  },
                },
              );
              continue;
            }

            this.logger.log(`[ReloginCheck] Keys confirmed expired for ${session.name}, proceeding with relogin`);
          }

          // Update status to show relogin in progress
          await this.lineSessionModel.updateOne(
            { _id: session._id },
            { $set: { status: 'logging_in', lastError: null } },
          );

          this.logger.log(`[ReloginCheck] Auto-relogin for session ${session.name} (ID: ${sessionId})`);
          this.reloginAttempts++;

          // Trigger relogin using session._id
          const result = await this.enhancedAutomationService.startLogin(
            sessionId,
            undefined, // Use stored credentials
            undefined,
            'auto',
          );

          if (result.success || result.pinCode) {
            this.reloginSuccesses++;
            this.recoveryAttempts.delete(sessionId);
            this.logger.log(`[ReloginCheck] Relogin initiated for ${session.name}, PIN: ${result.pinCode || 'N/A'}`);

            // Update status with PIN
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              { $set: { status: 'waiting_pin', lastError: null } },
            );

            // Emit event for real-time update
            this.eventEmitter.emit('session.relogin_started', {
              lineAccountId: sessionId,
              sessionId: session._id,
              name: session.name,
              pinCode: result.pinCode,
            });
          } else {
            this.reloginFailures++;
            const errorMsg = result.error || 'เข้าสู่ระบบไม่สำเร็จ';

            // Check if this is a credential error (wrong email/password)
            // Credential errors should NOT be retried — user must fix credentials manually
            if (result.isCredentialError || isCredentialError(errorMsg)) {
              this.logger.error(
                `[ReloginCheck] CREDENTIAL ERROR for ${session.name}: ${errorMsg} — stopping auto-relogin permanently`,
              );
              await this.lineSessionModel.updateOne(
                { _id: session._id },
                {
                  $set: {
                    status: 'credential_error',
                    lastError: 'อีเมลหรือรหัสผ่าน LINE ไม่ถูกต้อง กรุณาแก้ไขข้อมูลเข้าสู่ระบบ',
                    lastCheckedAt: new Date(),
                  },
                },
              );
              // Remove from recovery tracking — no point retrying
              this.recoveryAttempts.delete(sessionId);

              // Emit event for frontend notification
              this.eventEmitter.emit('session.credential_error', {
                lineAccountId: sessionId,
                sessionId: session._id,
                name: session.name,
                error: errorMsg,
              });
            } else {
              // Normal failure — track attempts and retry later
              const recoveryData = this.recoveryAttempts.get(sessionId) || { attempts: 0, lastAttempt: new Date() };
              recoveryData.attempts++;
              recoveryData.lastAttempt = new Date();
              this.recoveryAttempts.set(sessionId, recoveryData);

              await this.lineSessionModel.updateOne(
                { _id: session._id },
                { $set: { status: 'failed', lastError: errorMsg } },
              );

              this.logger.error(`[ReloginCheck] Relogin failed for ${session.name}: ${errorMsg} (attempt ${recoveryData.attempts}/5)`);
            }
          }
        } catch (error: any) {
          this.reloginFailures++;
          this.logger.error(`[ReloginCheck] Error relogging session ${session.name}: ${error.message}`);

          // Update status with error
          try {
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              { $set: { status: 'error', lastError: error.message } },
            );
          } catch (updateErr) {
            // Ignore update errors
          }
        }
      }

      this.logger.log('[ReloginCheck] Relogin check completed');
    } catch (error: any) {
      this.logger.error(`[ReloginCheck] Error: ${error.message}`);
    }
  }

  /**
   * Broadcast all session statuses via WebSocket
   */
  async broadcastAllStatuses(): Promise<void> {
    try {
      const sessions = await this.lineSessionModel.find({ isActive: true });
      const statuses: SessionStatus[] = [];

      for (const session of sessions) {
        try {
          // Use session._id as the primary identifier
          const sessionId = session._id.toString();
          const keysStatus = await this.enhancedAutomationService.getKeysStatus(sessionId);
          const workerStatus = this.enhancedAutomationService.getWorkerStatus(sessionId);
          const pinStatus = this.enhancedAutomationService.getPinStatus(sessionId);

          statuses.push({
            lineAccountId: sessionId,
            sessionId: sessionId,
            name: session.name,
            lineEmail: session.lineEmail,
            bankName: session.bankName,
            hasKeys: keysStatus.hasKeys,
            keysStatus: keysStatus.keysStatus,
            keysAgeMinutes: keysStatus.keysAgeMinutes,
            keysExpiresIn: keysStatus.expiresIn,
            isExpiringSoon: keysStatus.isExpiringSoon,
            loginStatus: this.mapWorkerStateToLoginStatus(workerStatus?.worker?.state),
            pinCode: pinStatus.pinCode || undefined,
            pinStatus: pinStatus.status,
            needsRelogin: session.status !== 'credential_error' &&
              (!keysStatus.isValid || keysStatus.keysStatus === KeysStatus.EXPIRED),
            reloginReason: session.status === 'credential_error' ? 'Credential error' :
                          !keysStatus.hasKeys ? 'No keys' :
                          keysStatus.keysStatus === KeysStatus.EXPIRED ? 'Keys expired' : undefined,
            isAutoReloginEnabled: this.settings?.lineSessionAutoReloginEnabled !== false,
            lastCheckedAt: session.lastCheckedAt || new Date(),
            lastError: workerStatus?.error || (session as any).lastError || undefined,
          });
        } catch (error: any) {
          // Skip this session
        }
      }

      // Emit to WebSocket
      this.eventEmitter.emit('orchestrator.status_broadcast', {
        timestamp: new Date(),
        sessions: statuses,
        stats: this.getStatistics(),
      });
    } catch (error: any) {
      // Silent fail for broadcast
    }
  }

  /**
   * Map worker state to login status
   */
  private mapWorkerStateToLoginStatus(state?: string): SessionStatus['loginStatus'] {
    switch (state) {
      case 'logging_in':
      case 'initializing':
        return 'logging_in';
      case 'waiting_pin':
        return 'waiting_pin';
      case 'ready':
        return 'success';
      case 'error':
      case 'closed':
        return 'failed';
      case 'cooldown':
        return 'cooldown';
      default:
        return 'idle';
    }
  }

  /**
   * Get orchestrator statistics
   */
  getStatistics(): OrchestratorStats {
    return {
      isRunning: this.isRunning,
      totalSessions: 0, // Will be filled by caller
      activeSessions: 0,
      expiringSoonSessions: 0,
      expiredSessions: 0,
      loggingInSessions: 0,
      lastHealthCheck: this.lastHealthCheck,
      lastReloginCheck: this.lastReloginCheck,
      autoReloginEnabled: this.settings?.lineSessionAutoReloginEnabled !== false,
      healthCheckIntervalMinutes: this.settings?.lineSessionHealthCheckIntervalMinutes || 5,
      reloginCheckIntervalMinutes: this.settings?.lineSessionReloginCheckIntervalMinutes || 10,
      reloginAttempts: this.reloginAttempts,
      reloginSuccesses: this.reloginSuccesses,
      reloginFailures: this.reloginFailures,
    };
  }

  /**
   * Get all session statuses
   */
  async getAllSessionStatuses(): Promise<SessionStatus[]> {
    const sessions = await this.lineSessionModel.find({ isActive: true });
    const statuses: SessionStatus[] = [];

    for (const session of sessions) {
      try {
        // Use session._id as the primary identifier
        const sessionId = session._id.toString();
        const keysStatus = await this.enhancedAutomationService.getKeysStatus(sessionId);
        const workerStatus = this.enhancedAutomationService.getWorkerStatus(sessionId);
        const pinStatus = this.enhancedAutomationService.getPinStatus(sessionId);

        statuses.push({
          lineAccountId: sessionId,
          sessionId: sessionId,
          name: session.name,
          lineEmail: session.lineEmail,
          bankName: session.bankName,
          hasKeys: keysStatus.hasKeys,
          keysStatus: keysStatus.keysStatus,
          keysAgeMinutes: keysStatus.keysAgeMinutes,
          keysExpiresIn: keysStatus.expiresIn,
          isExpiringSoon: keysStatus.isExpiringSoon,
          loginStatus: this.mapWorkerStateToLoginStatus(workerStatus?.worker?.state),
          pinCode: pinStatus.pinCode || undefined,
          pinStatus: pinStatus.status,
          needsRelogin: session.status !== 'credential_error' &&
            (!keysStatus.isValid || keysStatus.keysStatus === KeysStatus.EXPIRED),
          reloginReason: session.status === 'credential_error' ? 'Credential error' :
                        !keysStatus.hasKeys ? 'No keys' :
                        keysStatus.keysStatus === KeysStatus.EXPIRED ? 'Keys expired' : undefined,
          isAutoReloginEnabled: this.settings?.lineSessionAutoReloginEnabled !== false,
          lastCheckedAt: session.lastCheckedAt || new Date(),
          lastError: workerStatus?.error || (session as any).lastError || undefined,
        });
      } catch (error: any) {
        // Skip this session
      }
    }

    return statuses;
  }

  /**
   * Manually trigger relogin for a session
   */
  async triggerManualRelogin(lineAccountId: string): Promise<{ success: boolean; message: string; pinCode?: string }> {
    this.logger.log(`[ManualRelogin] Triggering relogin for ${lineAccountId}`);

    try {
      const result = await this.enhancedAutomationService.startLogin(
        lineAccountId,
        undefined,
        undefined,
        'manual',
      );

      if (result.success || result.pinCode) {
        return {
          success: true,
          message: result.pinCode ? `PIN: ${result.pinCode}` : 'Relogin successful',
          pinCode: result.pinCode,
        };
      } else {
        return {
          success: false,
          message: result.error || 'Relogin failed',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Force health check now
   */
  async forceHealthCheck(): Promise<void> {
    await this.performHealthCheck();
  }

  /**
   * Force relogin check now
   */
  async forceReloginCheck(): Promise<void> {
    await this.performReloginCheck();
  }

  /**
   * Update settings and restart loops
   */
  async updateSettings(): Promise<void> {
    await this.loadSettings();
    await this.restartLoops();
  }

  /**
   * Get current settings
   */
  getCurrentSettings(): {
    healthCheckEnabled: boolean;
    healthCheckIntervalMinutes: number;
    autoReloginEnabled: boolean;
    reloginCheckIntervalMinutes: number;
    maxConsecutiveFailures: number;
    expiryWarningMinutes: number;
  } {
    return {
      healthCheckEnabled: this.settings?.lineSessionHealthCheckEnabled !== false,
      healthCheckIntervalMinutes: this.settings?.lineSessionHealthCheckIntervalMinutes || 5,
      autoReloginEnabled: this.settings?.lineSessionAutoReloginEnabled !== false,
      reloginCheckIntervalMinutes: this.settings?.lineSessionReloginCheckIntervalMinutes || 10,
      maxConsecutiveFailures: this.settings?.lineSessionMaxConsecutiveFailures || 3,
      expiryWarningMinutes: this.settings?.lineSessionExpiryWarningMinutes || 5,
    };
  }
}
