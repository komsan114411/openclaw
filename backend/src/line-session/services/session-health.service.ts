import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { KeyStorageService } from './key-storage.service';
import { EventBusService } from '../../core/events';
import { SystemSettings, SystemSettingsDocument } from '../../database/schemas/system-settings.schema';

export enum HealthStatus {
  HEALTHY = 'healthy',
  UNHEALTHY = 'unhealthy',
  EXPIRED = 'expired',
  UNKNOWN = 'unknown',
}

export interface HealthCheckResult {
  lineAccountId: string;
  status: HealthStatus;
  message: string;
  checkedAt: Date;
  consecutiveFailures: number;
}

/**
 * ผลลัพธ์การ validate keys แบบละเอียด
 */
export interface KeyValidationResult {
  isValid: boolean;
  validatedAt: Date;
  httpStatus: number | null;
  responseCode: number | null;
  reason: string;
  reasonCode: 'VALID' | 'EXPIRED' | 'INVALID_SESSION' | 'AUTH_REQUIRED' | 'RATE_LIMITED' | 'NO_KEYS' | 'NETWORK_ERROR' | 'UNKNOWN';
  responseTime: number;
}

/**
 * Configuration from system settings
 */
export interface HealthCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxConsecutiveFailures: number;
  expiryWarningMinutes: number;
  autoReloginEnabled: boolean;
  reloginCheckIntervalMinutes: number;
}

@Injectable()
export class SessionHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionHealthService.name);
  private isChecking = false;

  // Dynamic configuration from system settings
  private config: HealthCheckConfig = {
    enabled: false,
    intervalMinutes: 5,
    maxConsecutiveFailures: 3,
    expiryWarningMinutes: 5,
    autoReloginEnabled: false,
    reloginCheckIntervalMinutes: 10,
  };

  // Interval timer for dynamic scheduling
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheckTime: Date | null = null;

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    @InjectModel(SystemSettings.name)
    private systemSettingsModel: Model<SystemSettingsDocument>,
    private keyStorageService: KeyStorageService,
    private eventBusService: EventBusService,
  ) {}

  /**
   * Initialize on module start - load settings and start scheduler
   */
  async onModuleInit(): Promise<void> {
    await this.loadSettingsFromDatabase();
    this.startHealthCheckScheduler();
    this.logger.log('SessionHealthService initialized with settings from database');
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    this.stopHealthCheckScheduler();
  }

  /**
   * Load settings from database
   */
  async loadSettingsFromDatabase(): Promise<HealthCheckConfig> {
    try {
      const settings = await this.systemSettingsModel.findOne({ settingsId: 'main' });
      if (settings) {
        this.config = {
          enabled: settings.lineSessionHealthCheckEnabled ?? false,
          intervalMinutes: settings.lineSessionHealthCheckIntervalMinutes ?? 5,
          maxConsecutiveFailures: settings.lineSessionMaxConsecutiveFailures ?? 3,
          expiryWarningMinutes: settings.lineSessionExpiryWarningMinutes ?? 5,
          autoReloginEnabled: settings.lineSessionAutoReloginEnabled ?? false,
          reloginCheckIntervalMinutes: settings.lineSessionReloginCheckIntervalMinutes ?? 10,
        };
        this.logger.log(`Loaded health check settings: enabled=${this.config.enabled}, interval=${this.config.intervalMinutes}min`);
      }
    } catch (error) {
      this.logger.error(`Failed to load settings: ${error.message}`);
    }
    return this.config;
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Update configuration and restart scheduler
   */
  async updateConfig(newConfig: Partial<HealthCheckConfig>): Promise<HealthCheckConfig> {
    // Update local config
    this.config = { ...this.config, ...newConfig };

    // Save to database
    try {
      await this.systemSettingsModel.updateOne(
        { settingsId: 'main' },
        {
          $set: {
            lineSessionHealthCheckEnabled: this.config.enabled,
            lineSessionHealthCheckIntervalMinutes: this.config.intervalMinutes,
            lineSessionMaxConsecutiveFailures: this.config.maxConsecutiveFailures,
            lineSessionExpiryWarningMinutes: this.config.expiryWarningMinutes,
            lineSessionAutoReloginEnabled: this.config.autoReloginEnabled,
            lineSessionReloginCheckIntervalMinutes: this.config.reloginCheckIntervalMinutes,
          },
        },
        { upsert: true },
      );
      this.logger.log(`Saved health check settings to database`);
    } catch (error) {
      this.logger.error(`Failed to save settings: ${error.message}`);
    }

    // Restart scheduler with new interval
    this.restartHealthCheckScheduler();

    return this.config;
  }

  /**
   * Start the health check scheduler with dynamic interval
   */
  private startHealthCheckScheduler(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Run health check based on configured interval
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.healthCheckInterval = setInterval(async () => {
      await this.runScheduledHealthCheck();
    }, intervalMs);

    this.logger.log(`Health check scheduler started: interval=${this.config.intervalMinutes} minutes`);
  }

  /**
   * Stop the health check scheduler
   */
  private stopHealthCheckScheduler(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.log('Health check scheduler stopped');
    }
  }

  /**
   * Restart scheduler (when settings change)
   */
  private restartHealthCheckScheduler(): void {
    this.stopHealthCheckScheduler();
    if (this.config.enabled) {
      this.startHealthCheckScheduler();
    }
  }

  /**
   * Enable/Disable automatic health check
   */
  async setAutoHealthCheckEnabled(enabled: boolean): Promise<void> {
    await this.updateConfig({ enabled });
    this.logger.log(`Auto health check ${enabled ? 'enabled' : 'disabled'}`);
  }

  isAutoHealthCheckEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Scheduled health check runner
   */
  private async runScheduledHealthCheck(): Promise<void> {
    // Skip if auto health check is disabled
    if (!this.config.enabled) {
      return;
    }

    if (this.isChecking) {
      this.logger.debug('Health check already in progress, skipping...');
      return;
    }

    this.isChecking = true;
    try {
      await this.checkAllSessionsHealth();
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * ตรวจสอบ health ของทุก sessions
   */
  async checkAllSessionsHealth(): Promise<HealthCheckResult[]> {
    const sessions = await this.keyStorageService.getAllActiveSessions();
    this.logger.log(`Checking health for ${sessions.length} active sessions`);

    const results: HealthCheckResult[] = [];

    for (const session of sessions) {
      try {
        const result = await this.checkSessionHealth(session);
        results.push(result);

        // Emit events based on status
        // Use session._id if lineAccountId is not set (for Auto-Slip sessions)
        const sessionIdentifier = session.lineAccountId || session._id.toString();
        if (result.status === HealthStatus.EXPIRED) {
          this.eventBusService.publish({
            eventName: 'line-session.expired' as any,
            occurredAt: new Date(),
            lineAccountId: sessionIdentifier,
            sessionId: session._id.toString(),
          });
        } else if (result.status === HealthStatus.UNHEALTHY) {
          this.eventBusService.publish({
            eventName: 'line-session.unhealthy' as any,
            occurredAt: new Date(),
            lineAccountId: sessionIdentifier,
            consecutiveFailures: result.consecutiveFailures,
          });
        }
      } catch (error) {
        this.logger.error(
          `Error checking session ${session.lineAccountId}: ${error.message}`,
        );
      }
    }

    return results;
  }

  /**
   * ตรวจสอบ health ของ session เดียว
   */
  async checkSessionHealth(session: LineSessionDocument): Promise<HealthCheckResult> {
    const lineAccountId = session.lineAccountId;

    // 1. Check if keys exist
    if (!session.xLineAccess || !session.xHmac) {
      await this.keyStorageService.updateSessionStatus(
        lineAccountId,
        'invalid',
        'no_keys',
        true,
      );

      return {
        lineAccountId,
        status: HealthStatus.UNHEALTHY,
        message: 'No keys found',
        checkedAt: new Date(),
        consecutiveFailures: session.consecutiveFailures + 1,
      };
    }

    // 2. Check expiry (if expiresAt is set)
    if (session.expiresAt && new Date() > session.expiresAt) {
      await this.keyStorageService.markAsExpired(lineAccountId);

      return {
        lineAccountId,
        status: HealthStatus.EXPIRED,
        message: 'Session expired',
        checkedAt: new Date(),
        consecutiveFailures: session.consecutiveFailures,
      };
    }

    // 3. Check expiry warning (use config from settings)
    if (session.expiresAt) {
      const minutesUntilExpiry =
        (session.expiresAt.getTime() - Date.now()) / 1000 / 60;

      if (minutesUntilExpiry <= this.config.expiryWarningMinutes) {
        this.eventBusService.publish({
          eventName: 'line-session.expiring-soon' as any,
          occurredAt: new Date(),
          lineAccountId,
          minutesRemaining: Math.floor(minutesUntilExpiry),
        });
      }
    }

    // 4. Validate keys by making a test request to LINE API
    const isValid = await this.validateKeysWithApi(session);

    if (isValid) {
      await this.keyStorageService.updateSessionStatus(
        lineAccountId,
        'active',
        'valid',
        false,
      );

      this.lastHealthCheckTime = new Date();
      return {
        lineAccountId,
        status: HealthStatus.HEALTHY,
        message: 'Session is healthy',
        checkedAt: new Date(),
        consecutiveFailures: 0,
      };
    } else {
      const newFailureCount = session.consecutiveFailures + 1;

      // Use config from settings
      if (newFailureCount >= this.config.maxConsecutiveFailures) {
        await this.keyStorageService.updateSessionStatus(
          lineAccountId,
          'pending_relogin',
          'validation_failed',
          true,
        );

        return {
          lineAccountId,
          status: HealthStatus.EXPIRED,
          message: `Validation failed ${newFailureCount} times, needs relogin`,
          checkedAt: new Date(),
          consecutiveFailures: newFailureCount,
        };
      }

      await this.keyStorageService.updateSessionStatus(
        lineAccountId,
        'active',
        'validation_failed',
        true,
      );

      return {
        lineAccountId,
        status: HealthStatus.UNHEALTHY,
        message: `Validation failed (${newFailureCount}/${this.config.maxConsecutiveFailures})`,
        checkedAt: new Date(),
        consecutiveFailures: newFailureCount,
      };
    }
  }

  /**
   * Validate keys โดยเรียก LINE API - Public method สำหรับทดสอบ keys โดยตรง
   */
  async validateKeysDirectly(lineAccountId: string): Promise<KeyValidationResult> {
    const startTime = Date.now();
    const session = await this.keyStorageService.getActiveSession(lineAccountId);

    if (!session || !session.xLineAccess || !session.xHmac) {
      return {
        isValid: false,
        validatedAt: new Date(),
        httpStatus: null,
        responseCode: null,
        reason: 'ไม่พบ keys หรือ session',
        reasonCode: 'NO_KEYS',
        responseTime: Date.now() - startTime,
      };
    }

    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://line-chrome-gw.line-apps.com/api/talk/thrift/Talk/TalkService/getChats',
        ['', 50, ''],
        {
          headers: {
            'x-line-access': session.xLineAccess,
            'x-hmac': session.xHmac,
            'content-type': 'application/json',
            'x-line-chrome-version': '3.4.0',
          },
          timeout: 15000,
          validateStatus: (status: number) => status < 500,
        },
      );

      const responseTime = Date.now() - startTime;
      const errorCode = response.data?.code;

      // Success - Keys are valid
      if (response.status === 200 && errorCode === 0) {
        // Update session status
        await this.keyStorageService.updateSessionStatus(lineAccountId, 'active', 'valid', false);
        return {
          isValid: true,
          validatedAt: new Date(),
          httpStatus: response.status,
          responseCode: errorCode,
          reason: 'Keys ใช้งานได้ปกติ',
          reasonCode: 'VALID',
          responseTime,
        };
      }

      // 401/403 - Expired or unauthorized
      if (response.status === 401 || response.status === 403) {
        await this.keyStorageService.markAsExpired(lineAccountId);
        return {
          isValid: false,
          validatedAt: new Date(),
          httpStatus: response.status,
          responseCode: errorCode,
          reason: 'Keys หมดอายุแล้ว (Unauthorized)',
          reasonCode: 'EXPIRED',
          responseTime,
        };
      }

      // Handle specific error codes
      if (response.status === 400) {
        // 10005: Session expired
        if (errorCode === 10005) {
          await this.keyStorageService.markAsExpired(lineAccountId);
          return {
            isValid: false,
            validatedAt: new Date(),
            httpStatus: response.status,
            responseCode: errorCode,
            reason: 'Session หมดอายุ (Code: 10005)',
            reasonCode: 'EXPIRED',
            responseTime,
          };
        }
        // 20: Invalid session
        if (errorCode === 20) {
          await this.keyStorageService.markAsExpired(lineAccountId);
          return {
            isValid: false,
            validatedAt: new Date(),
            httpStatus: response.status,
            responseCode: errorCode,
            reason: 'Session ไม่ถูกต้อง (Code: 20)',
            reasonCode: 'INVALID_SESSION',
            responseTime,
          };
        }
        // 35: Auth required
        if (errorCode === 35) {
          await this.keyStorageService.markAsExpired(lineAccountId);
          return {
            isValid: false,
            validatedAt: new Date(),
            httpStatus: response.status,
            responseCode: errorCode,
            reason: 'ต้องล็อกอินใหม่ (Code: 35)',
            reasonCode: 'AUTH_REQUIRED',
            responseTime,
          };
        }
        // 10008: Rate limited - keys might still be valid
        if (errorCode === 10008) {
          return {
            isValid: true,
            validatedAt: new Date(),
            httpStatus: response.status,
            responseCode: errorCode,
            reason: 'ถูก rate limit แต่ keys น่าจะยังใช้ได้',
            reasonCode: 'RATE_LIMITED',
            responseTime,
          };
        }
      }

      // Status 200 with non-zero code - might still work
      if (response.status === 200) {
        await this.keyStorageService.updateSessionStatus(lineAccountId, 'active', 'valid', false);
        return {
          isValid: true,
          validatedAt: new Date(),
          httpStatus: response.status,
          responseCode: errorCode,
          reason: `Keys ใช้งานได้ (Code: ${errorCode || 'N/A'})`,
          reasonCode: 'VALID',
          responseTime,
        };
      }

      // Unknown status
      this.logger.warn(`Keys validation unclear for ${lineAccountId}: status=${response.status}, code=${errorCode}`);
      return {
        isValid: false,
        validatedAt: new Date(),
        httpStatus: response.status,
        responseCode: errorCode,
        reason: `ไม่สามารถระบุได้ (HTTP: ${response.status}, Code: ${errorCode})`,
        reasonCode: 'UNKNOWN',
        responseTime,
      };
    } catch (error: any) {
      this.logger.error(`Error validating keys for ${lineAccountId}: ${error.message}`);
      return {
        isValid: false,
        validatedAt: new Date(),
        httpStatus: null,
        responseCode: null,
        reason: `Network error: ${error.message}`,
        reasonCode: 'NETWORK_ERROR',
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate keys โดยเรียก LINE API - Internal method
   */
  private async validateKeysWithApi(session: LineSessionDocument): Promise<boolean> {
    if (!session.xLineAccess || !session.xHmac) {
      return false;
    }

    try {
      const axios = require('axios');
      const response = await axios.post(
        'https://line-chrome-gw.line-apps.com/api/talk/thrift/Talk/TalkService/getChats',
        ['', 50, ''],
        {
          headers: {
            'x-line-access': session.xLineAccess,
            'x-hmac': session.xHmac,
            'content-type': 'application/json',
            'x-line-chrome-version': '3.4.0',
          },
          timeout: 10000,
          validateStatus: (status: number) => status < 500,
        },
      );

      // Success
      if (response.status === 200 && response.data?.code === 0) {
        return true;
      }

      // Expired
      if (response.status === 401 || response.status === 403) {
        return false;
      }

      // Handle specific error codes
      const errorCode = response.data?.code;
      if (response.status === 400) {
        // 10005: Session expired, 20: Invalid session, 35: Auth required
        if (errorCode === 10005 || errorCode === 20 || errorCode === 35) {
          return false;
        }
        // 10008: Rate limited - assume valid
        if (errorCode === 10008) {
          return true;
        }
      }

      // Status 200 with non-zero code might still work
      if (response.status === 200) {
        return true;
      }

      this.logger.warn(`Keys validation unclear for ${session.lineAccountId}: status=${response.status}, code=${errorCode}`);
      return false;
    } catch (error: any) {
      this.logger.error(`Error validating keys for ${session.lineAccountId}: ${error.message}`);
      return false;
    }
  }

  /**
   * ดึงสถานะ health ของ LINE Account
   */
  async getHealthStatus(lineAccountId: string): Promise<HealthCheckResult | null> {
    const session = await this.keyStorageService.getActiveSession(lineAccountId);
    if (!session) return null;

    return this.checkSessionHealth(session);
  }

  /**
   * ดึงสถานะ health ของทุก sessions
   */
  async getAllHealthStatuses(): Promise<HealthCheckResult[]> {
    const sessions = await this.keyStorageService.getAllActiveSessions();
    const results: HealthCheckResult[] = [];

    for (const session of sessions) {
      results.push({
        lineAccountId: session.lineAccountId,
        status: this.mapStatusToHealth(session.status, session.consecutiveFailures),
        message: session.lastCheckResult || 'No check performed',
        checkedAt: session.lastCheckedAt || (session as any).updatedAt || new Date(),
        consecutiveFailures: session.consecutiveFailures,
      });
    }

    return results;
  }

  private mapStatusToHealth(status: string, failures: number): HealthStatus {
    if (status === 'expired') return HealthStatus.EXPIRED;
    if (status === 'invalid') return HealthStatus.UNHEALTHY;
    if (status === 'pending_relogin') return HealthStatus.EXPIRED;
    if (failures >= this.config.maxConsecutiveFailures) return HealthStatus.UNHEALTHY;
    if (status === 'active') return HealthStatus.HEALTHY;
    return HealthStatus.UNKNOWN;
  }
}
