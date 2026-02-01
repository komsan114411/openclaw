import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { SystemSettings, SystemSettingsDocument } from '../../database/schemas/system-settings.schema';
import { EnhancedAutomationService, KeysStatus } from './enhanced-automation.service';
import { WorkerPoolService } from './worker-pool.service';
import { KeyStorageService } from './key-storage.service';

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
    this.isRunning = false;
    this.logger.log('All loops stopped');
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

          // Check keys status
          const keysStatus = await this.enhancedAutomationService.getKeysStatus(sessionId);

          // If session has keys, validate them with actual API call
          let keysValid = keysStatus.isValid;
          if (session.xLineAccess && session.xHmac && keysStatus.isValid) {
            // Validate keys with LINE API
            keysValid = await this.enhancedAutomationService.validateKeys(session.xLineAccess, session.xHmac);
            if (!keysValid) {
              this.logger.warn(`[HealthCheck] Session ${session.name}: keys failed API validation - marking as expired`);
            }
          }

          // Update session with check result
          try {
            await this.lineSessionModel.updateOne(
              { _id: session._id },
              {
                lastCheckedAt: new Date(),
                lastCheckResult: keysValid ? 'valid' : 'expired',
                status: keysValid ? 'active' : 'expired',
              }
            );
          } catch (updateError: any) {
            this.logger.warn(`[HealthCheck] Failed to update session ${session.name}: ${updateError.message}`);
          }

          // Check if needs warning
          if (keysStatus.isExpiringSoon) {
            this.logger.warn(`[HealthCheck] Session ${session.name} keys expiring soon (${keysStatus.expiresIn}s left)`);
            this.eventEmitter.emit('session.expiring_soon', {
              lineAccountId: sessionId,
              sessionId: session._id,
              name: session.name,
              expiresIn: keysStatus.expiresIn,
            });
          }

          // Check if expired
          if (keysStatus.keysStatus === KeysStatus.EXPIRED) {
            this.logger.warn(`[HealthCheck] Session ${session.name} keys expired`);
            this.eventEmitter.emit('session.expired', {
              lineAccountId: sessionId,
              sessionId: session._id,
              name: session.name,
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
      const sessions = await this.lineSessionModel.find({
        isActive: true,
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

          // Check recovery attempts (cooldown)
          const recovery = this.recoveryAttempts.get(sessionId);
          if (recovery && recovery.attempts >= 3) {
            const cooldownMs = 30 * 60 * 1000; // 30 minutes
            if (Date.now() - recovery.lastAttempt.getTime() < cooldownMs) {
              this.logger.log(`[ReloginCheck] Session ${session.name} in cooldown, skipping`);
              continue;
            }
            // Reset after cooldown
            this.recoveryAttempts.delete(sessionId);
          }

          // Check if has credentials
          if (!session.lineEmail || !session.linePassword) {
            this.logger.warn(`[ReloginCheck] Session ${session.name} has no credentials, skipping`);
            continue;
          }

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

            // Emit event for real-time update
            this.eventEmitter.emit('session.relogin_started', {
              lineAccountId: sessionId,
              sessionId: session._id,
              name: session.name,
              pinCode: result.pinCode,
            });
          } else {
            this.reloginFailures++;
            const recoveryData = this.recoveryAttempts.get(sessionId) || { attempts: 0, lastAttempt: new Date() };
            recoveryData.attempts++;
            recoveryData.lastAttempt = new Date();
            this.recoveryAttempts.set(sessionId, recoveryData);
            this.logger.error(`[ReloginCheck] Relogin failed for ${session.name}: ${result.error}`);
          }
        } catch (error: any) {
          this.reloginFailures++;
          this.logger.error(`[ReloginCheck] Error relogging session ${session.name}: ${error.message}`);
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
            needsRelogin: !keysStatus.isValid || keysStatus.keysStatus === KeysStatus.EXPIRED,
            reloginReason: !keysStatus.hasKeys ? 'No keys' :
                          keysStatus.keysStatus === KeysStatus.EXPIRED ? 'Keys expired' : undefined,
            isAutoReloginEnabled: this.settings?.lineSessionAutoReloginEnabled !== false,
            lastCheckedAt: session.lastCheckedAt || new Date(),
            lastError: workerStatus?.error,
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
          needsRelogin: !keysStatus.isValid || keysStatus.keysStatus === KeysStatus.EXPIRED,
          reloginReason: !keysStatus.hasKeys ? 'No keys' :
                        keysStatus.keysStatus === KeysStatus.EXPIRED ? 'Keys expired' : undefined,
          isAutoReloginEnabled: this.settings?.lineSessionAutoReloginEnabled !== false,
          lastCheckedAt: session.lastCheckedAt || new Date(),
          lastError: workerStatus?.error,
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
