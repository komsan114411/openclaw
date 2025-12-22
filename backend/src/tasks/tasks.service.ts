import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private subscriptionsService: SubscriptionsService,
    private paymentsService: PaymentsService,
  ) {}

  /**
   * Expire subscriptions and cleanup reservations every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpireSubscriptions() {
    this.logger.log('Running subscription expiration task...');
    try {
      const expiredCount = await this.subscriptionsService.expireSubscriptions();
      if (expiredCount > 0) {
        this.logger.log(`Expired ${expiredCount} subscriptions`);
      }
    } catch (error) {
      this.logger.error('Failed to expire subscriptions:', error);
    }
  }

  /**
   * Cleanup expired quota reservations every 5 minutes
   * This handles orphaned reservations from failed transactions
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCleanupReservations() {
    this.logger.debug('Running reservation cleanup task...');
    try {
      const cleanedCount = await this.subscriptionsService.cleanupExpiredReservations();
      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired reservations`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup reservations:', error);
    }
  }

  /**
   * Cancel expired pending payments every 6 hours
   * Payments older than 24 hours that haven't been completed
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async handleCancelExpiredPayments() {
    this.logger.log('Running expired payments cancellation task...');
    try {
      const cancelledCount = await this.paymentsService.cancelExpiredPayments();
      if (cancelledCount > 0) {
        this.logger.log(`Cancelled ${cancelledCount} expired payments`);
      }
    } catch (error) {
      this.logger.error('Failed to cancel expired payments:', error);
    }
  }

  /**
   * Log system health status every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleHealthCheck() {
    this.logger.log('System health check: OK');
    // Could add more comprehensive health checks here
  }
}
