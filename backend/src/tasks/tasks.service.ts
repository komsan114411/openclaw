import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentsService } from '../payments/payments.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { Session, SessionDocument } from '../database/schemas/session.schema';
import { QuotaReservation, QuotaReservationDocument, QuotaReservationStatus } from '../database/schemas/quota-reservation.schema';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private isRunning: Map<string, boolean> = new Map();

  constructor(
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(QuotaReservation.name) private quotaReservationModel: Model<QuotaReservationDocument>,
    @Inject(forwardRef(() => SubscriptionsService))
    private subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
    @Inject(forwardRef(() => SystemSettingsService))
    private systemSettingsService: SystemSettingsService,
    private redisService: RedisService,
  ) {}

  /**
   * Prevent concurrent execution of the same task
   */
  private async withTaskLock<T>(
    taskName: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    // Check in-memory lock first
    if (this.isRunning.get(taskName)) {
      this.logger.debug(`Task ${taskName} already running (local)`);
      return null;
    }

    // Acquire distributed lock
    const lockToken = await this.redisService.acquireLock(`task:${taskName}`, 300);
    if (!lockToken) {
      this.logger.debug(`Task ${taskName} already running (distributed)`);
      return null;
    }

    this.isRunning.set(taskName, true);
    try {
      return await fn();
    } finally {
      this.isRunning.set(taskName, false);
      await this.redisService.releaseLock(`task:${taskName}`, lockToken);
    }
  }

  /**
   * Expire subscriptions and cleanup reservations every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpireSubscriptions() {
    await this.withTaskLock('expire_subscriptions', async () => {
      this.logger.log('Running subscription expiration task...');
      try {
        const expiredCount = await this.subscriptionsService.expireSubscriptions();
        if (expiredCount > 0) {
          this.logger.log(`Expired ${expiredCount} subscriptions`);
        }
        return expiredCount;
      } catch (error) {
        this.logger.error('Failed to expire subscriptions:', error);
        throw error;
      }
    });
  }

  /**
   * Cleanup stale quota reservations every minute
   * Uses configurable timeout from system settings (default: 3 minutes)
   * This handles cases where slip verification process crashed or timed out
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCleanupStaleReservations() {
    await this.withTaskLock('cleanup_stale_reservations', async () => {
      try {
        // Get settings from database (with caching)
        const settings = await this.systemSettingsService.getSettings();
        
        // Check if cleanup is enabled (default: enabled if settings not found)
        if (settings && settings.quotaReservationCleanupEnabled === false) {
          this.logger.debug('Stale reservation cleanup is disabled');
          return 0;
        }

        // Get timeout from settings (default: 3 minutes)
        const timeoutMinutes = settings?.quotaReservationTimeoutMinutes || 3;
        
        // Cleanup stale reservations
        const cleanedCount = await this.subscriptionsService.cleanupStaleReservations(timeoutMinutes);
        
        if (cleanedCount > 0) {
          this.logger.log(`Cleaned up ${cleanedCount} stale reservations (timeout: ${timeoutMinutes} minutes)`);
        }
        
        return cleanedCount;
      } catch (error) {
        this.logger.error('Failed to cleanup stale reservations:', error);
        throw error;
      }
    });
  }

  /**
   * Cleanup expired quota reservations every 5 minutes
   * This handles cases where reservations were made but never confirmed/rolled back
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCleanupReservations() {
    await this.withTaskLock('cleanup_reservations', async () => {
      this.logger.debug('Running reservation cleanup task...');
      try {
        // Cleanup subscription reservations
        const cleanedSubs = await this.subscriptionsService.cleanupExpiredReservations();
        
        // Cleanup quota reservations (orphaned)
        const cleanedQuotas = await this.cleanupOrphanedQuotaReservations();
        
        const total = cleanedSubs + cleanedQuotas;
        if (total > 0) {
          this.logger.log(`Cleaned up ${cleanedSubs} subscription reservations, ${cleanedQuotas} quota reservations`);
        }
        return total;
      } catch (error) {
        this.logger.error('Failed to cleanup reservations:', error);
        throw error;
      }
    });
  }

  /**
   * Cancel expired pending payments every 6 hours
   * Payments older than 24 hours that haven't been completed
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleCancelExpiredPayments() {
    await this.withTaskLock('cancel_expired_payments', async () => {
      this.logger.log('Running expired payments cancellation task...');
      try {
        const cancelledCount = await this.paymentsService.cancelExpiredPayments();
        if (cancelledCount > 0) {
          this.logger.log(`Cancelled ${cancelledCount} expired payments`);
        }
        return cancelledCount;
      } catch (error) {
        this.logger.error('Failed to cancel expired payments:', error);
        throw error;
      }
    });
  }

  /**
   * Cleanup expired sessions every 2 hours
   */
  @Cron(CronExpression.EVERY_2_HOURS)
  async handleCleanupExpiredSessions() {
    await this.withTaskLock('cleanup_sessions', async () => {
      this.logger.log('Running session cleanup task...');
      try {
        const result = await this.sessionModel.deleteMany({
          expiresAt: { $lt: new Date() },
        });
        
        if (result.deletedCount > 0) {
          this.logger.log(`Cleaned up ${result.deletedCount} expired sessions`);
        }
        return result.deletedCount;
      } catch (error) {
        this.logger.error('Failed to cleanup sessions:', error);
        throw error;
      }
    });
  }

  /**
   * Cleanup orphaned quota reservations (expired but not rolled back)
   */
  private async cleanupOrphanedQuotaReservations(): Promise<number> {
    // Use expiresAt directly; the record already stores the real expiry timestamp.
    // The previous logic subtracted an extra 10 minutes which could delay cleanup unnecessarily.
    const now = new Date();

    const result = await this.quotaReservationModel.updateMany(
      {
        status: QuotaReservationStatus.RESERVED,
        expiresAt: { $lt: now },
      },
      {
        $set: {
          status: QuotaReservationStatus.ROLLED_BACK,
          rolledBackAt: new Date(),
          reason: 'auto_cleanup_expired',
        },
      },
    );

    return result.modifiedCount;
  }

  /**
   * Log system health status every 30 minutes
   */
  /**
   * Health check every 5 minutes (more frequent for better monitoring)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleHealthCheck() {
    const memoryUsage = process.memoryUsage();
    const heapUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const rss = Math.round(memoryUsage.rss / 1024 / 1024);
    const uptime = Math.floor(process.uptime());

    // Get Redis status and cache stats
    const redisStatus = this.redisService.getStatus();
    const cacheStats = this.redisService.getCacheStats();

    // Check for warning conditions
    const warnings: string[] = [];
    const heapUsagePercent = (heapUsed / heapTotal) * 100;

    if (heapUsagePercent > 85) {
      warnings.push(`HIGH_MEMORY: ${heapUsagePercent.toFixed(1)}%`);
    }
    if (!redisStatus.connected) {
      warnings.push(`REDIS_DOWN: ${redisStatus.downSince ? Math.round((Date.now() - redisStatus.downSince) / 1000) + 's' : 'unknown'}`);
    }
    if (cacheStats.utilizationPercent > 80) {
      warnings.push(`CACHE_HIGH: ${cacheStats.utilizationPercent}%`);
    }

    const status = warnings.length > 0 ? 'WARNING' : 'OK';
    const warningStr = warnings.length > 0 ? ` | Warnings: ${warnings.join(', ')}` : '';

    this.logger.log(
      `[HEALTH] ${status} | Memory: ${heapUsed}/${heapTotal}MB (${heapUsagePercent.toFixed(1)}%) | ` +
      `RSS: ${rss}MB | Redis: ${redisStatus.connected ? 'OK' : 'DOWN'} | ` +
      `Cache: ${cacheStats.cacheSize}/${cacheStats.maxCacheSize} | ` +
      `Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m${warningStr}`,
    );

    // Log warning separately for alerting systems
    if (warnings.length > 0) {
      this.logger.warn(`[HEALTH WARNING] ${warnings.join(' | ')}`);
    }
  }

  /**
   * Daily maintenance task at 3 AM
   */
  @Cron('0 3 * * *')
  async handleDailyMaintenance() {
    await this.withTaskLock('daily_maintenance', async () => {
      this.logger.log('Running daily maintenance task...');
      
      try {
        // Cleanup old quota reservations (older than 7 days)
        const oldReservations = await this.quotaReservationModel.deleteMany({
          createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          status: { $in: [QuotaReservationStatus.CONFIRMED, QuotaReservationStatus.ROLLED_BACK] },
        });

        // Cleanup old sessions (older than 30 days, already expired)
        const oldSessions = await this.sessionModel.deleteMany({
          expiresAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        });

        this.logger.log(
          `Daily maintenance complete: ${oldReservations.deletedCount} old reservations, ${oldSessions.deletedCount} old sessions cleaned`,
        );
      } catch (error) {
        this.logger.error('Daily maintenance failed:', error);
        throw error;
      }
    });
  }

  /**
   * Manual trigger for cleanup tasks (for admin use)
   */
  async runCleanupNow(): Promise<{
    expiredSubscriptions: number;
    cleanedReservations: number;
    staleReservations: number;
    expiredSessions: number;
    cancelledPayments: number;
  }> {
    this.logger.log('Running manual cleanup...');

    const results = {
      expiredSubscriptions: 0,
      cleanedReservations: 0,
      staleReservations: 0,
      expiredSessions: 0,
      cancelledPayments: 0,
    };

    try {
      results.expiredSubscriptions = await this.subscriptionsService.expireSubscriptions();
    } catch (error) {
      this.logger.error('Failed to expire subscriptions:', error);
    }

    try {
      results.cleanedReservations = await this.subscriptionsService.cleanupExpiredReservations();
      results.cleanedReservations += await this.cleanupOrphanedQuotaReservations();
    } catch (error) {
      this.logger.error('Failed to cleanup reservations:', error);
    }

    try {
      // Get timeout from settings
      const settings = await this.systemSettingsService.getSettings();
      const timeoutMinutes = settings?.quotaReservationTimeoutMinutes || 3;
      results.staleReservations = await this.subscriptionsService.cleanupStaleReservations(timeoutMinutes);
    } catch (error) {
      this.logger.error('Failed to cleanup stale reservations:', error);
    }

    try {
      const sessionResult = await this.sessionModel.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      results.expiredSessions = sessionResult.deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup sessions:', error);
    }

    try {
      results.cancelledPayments = await this.paymentsService.cancelExpiredPayments();
    } catch (error) {
      this.logger.error('Failed to cancel payments:', error);
    }

    this.logger.log('Manual cleanup complete:', results);
    return results;
  }

  /**
   * Force cleanup all stale reservations (emergency use only)
   * Use with caution - this will release ALL pending reservations
   */
  async forceCleanupAllReservations(): Promise<number> {
    this.logger.warn('Force cleanup all reservations triggered');
    return this.subscriptionsService.forceCleanupAllReservations();
  }
}
