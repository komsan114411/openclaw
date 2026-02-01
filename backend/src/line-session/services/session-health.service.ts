import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LineSession, LineSessionDocument } from '../schemas/line-session.schema';
import { KeyStorageService } from './key-storage.service';
import { EventBusService } from '../../core/events';

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

@Injectable()
export class SessionHealthService {
  private readonly logger = new Logger(SessionHealthService.name);
  private isChecking = false;

  // Configuration
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly EXPIRY_WARNING_MINUTES = 5;

  constructor(
    @InjectModel(LineSession.name)
    private lineSessionModel: Model<LineSessionDocument>,
    private keyStorageService: KeyStorageService,
    private eventBusService: EventBusService,
  ) {}

  // Flag to enable/disable automatic health check
  private autoHealthCheckEnabled = false; // Disabled by default

  /**
   * Enable/Disable automatic health check
   */
  setAutoHealthCheckEnabled(enabled: boolean): void {
    this.autoHealthCheckEnabled = enabled;
    this.logger.log(`Auto health check ${enabled ? 'enabled' : 'disabled'}`);
  }

  isAutoHealthCheckEnabled(): boolean {
    return this.autoHealthCheckEnabled;
  }

  /**
   * Cron Job: ตรวจสอบ health ทุก 1 นาที
   * ปิดโดย default - ต้องเปิดผ่าน API
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledHealthCheck(): Promise<void> {
    // Skip if auto health check is disabled
    if (!this.autoHealthCheckEnabled) {
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
        if (result.status === HealthStatus.EXPIRED) {
          this.eventBusService.publish({
            eventName: 'line-session.expired' as any,
            occurredAt: new Date(),
            lineAccountId: session.lineAccountId,
            sessionId: session._id,
          });
        } else if (result.status === HealthStatus.UNHEALTHY) {
          this.eventBusService.publish({
            eventName: 'line-session.unhealthy' as any,
            occurredAt: new Date(),
            lineAccountId: session.lineAccountId,
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

    // 3. Check expiry warning
    if (session.expiresAt) {
      const minutesUntilExpiry =
        (session.expiresAt.getTime() - Date.now()) / 1000 / 60;

      if (minutesUntilExpiry <= this.EXPIRY_WARNING_MINUTES) {
        this.eventBusService.publish({
          eventName: 'line-session.expiring-soon' as any,
          occurredAt: new Date(),
          lineAccountId,
          minutesRemaining: Math.floor(minutesUntilExpiry),
        });
      }
    }

    // 4. Validate keys by making a test request (optional - implement if needed)
    // For now, we assume keys are valid if they exist and not expired
    const isValid = await this.validateKeysWithApi(session);

    if (isValid) {
      await this.keyStorageService.updateSessionStatus(
        lineAccountId,
        'active',
        'valid',
        false,
      );

      return {
        lineAccountId,
        status: HealthStatus.HEALTHY,
        message: 'Session is healthy',
        checkedAt: new Date(),
        consecutiveFailures: 0,
      };
    } else {
      const newFailureCount = session.consecutiveFailures + 1;

      if (newFailureCount >= this.MAX_CONSECUTIVE_FAILURES) {
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
        message: `Validation failed (${newFailureCount}/${this.MAX_CONSECUTIVE_FAILURES})`,
        checkedAt: new Date(),
        consecutiveFailures: newFailureCount,
      };
    }
  }

  /**
   * Validate keys โดยเรียก LINE API
   * ถ้ายังไม่ต้องการ validate จริง สามารถ return true ได้
   */
  private async validateKeysWithApi(session: LineSessionDocument): Promise<boolean> {
    // TODO: Implement actual LINE API validation
    // For now, assume keys are valid if they exist
    // Can be implemented later with actual API call

    // Example implementation:
    // try {
    //   const response = await axios.get('https://api.line.me/v2/profile', {
    //     headers: {
    //       'Authorization': `Bearer ${session.xLineAccess}`,
    //     },
    //   });
    //   return response.status === 200;
    // } catch {
    //   return false;
    // }

    return true;
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
    if (failures >= this.MAX_CONSECUTIVE_FAILURES) return HealthStatus.UNHEALTHY;
    if (status === 'active') return HealthStatus.HEALTHY;
    return HealthStatus.UNKNOWN;
  }
}
