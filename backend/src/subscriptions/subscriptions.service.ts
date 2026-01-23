import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../database/schemas/subscription.schema';
import { PackagesService } from '../packages/packages.service';
import { isValidObjectId } from '../common/utils/validation.util';

export interface QuotaInfo {
  hasQuota: boolean;
  remainingQuota: number;
  totalQuota: number;
  usedQuota: number;
  reservedQuota: number;
  activeSubscriptions: number;
}

// Detailed status for different scenarios
export type QuotaStatus = 
  | 'has_quota'           // Has active subscription with remaining quota
  | 'quota_exhausted'     // Has active subscription but no quota left
  | 'package_expired'     // Had subscription but all expired
  | 'no_subscription';    // Never had any subscription

export interface DetailedQuotaInfo extends QuotaInfo {
  status: QuotaStatus;
  hasExpiredSubscriptions: boolean;
  hasPreviousSubscriptions: boolean;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @Inject(forwardRef(() => PackagesService))
    private packagesService: PackagesService,
  ) {}

  async createSubscription(
    userId: string,
    packageId: string,
    paymentId?: string,
  ): Promise<SubscriptionDocument> {
    if (!isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + pkg.durationDays);

    const subscription = new this.subscriptionModel({
      userId,
      packageId,
      paymentId,
      startDate,
      endDate,
      slipsQuota: pkg.slipQuota,
      slipsUsed: 0,
      slipsReserved: 0,
      status: SubscriptionStatus.ACTIVE,
    });

    return subscription.save();
  }

  /**
   * Add quota to existing subscription or create new one.
   * CRITICAL: This method is idempotent - calling it multiple times with the same paymentId
   * will only add quota once. This prevents double-granting from race conditions.
   *
   * @returns Object with subscriptionId and whether the payment was already processed
   */
  async addQuotaToExisting(
    userId: string,
    packageId: string,
    paymentId: string,
  ): Promise<{ success: boolean; subscriptionId: string; alreadyProcessed: boolean }> {
    if (!paymentId) {
      throw new BadRequestException('Payment ID is required for quota tracking');
    }

    if (!isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // CRITICAL: First check if this payment was already processed (idempotency check)
    // This is a fast check before attempting the atomic update
    const existingProcessed = await this.subscriptionModel.findOne({
      userId,
      processedPaymentIds: paymentId,
    });

    if (existingProcessed) {
      this.logger.warn(`Payment ${paymentId} already processed for user ${userId} - skipping duplicate`);
      return {
        success: true,
        subscriptionId: existingProcessed._id.toString(),
        alreadyProcessed: true,
      };
    }

    // ATOMIC OPERATION: Update existing subscription with idempotency protection
    // The key is using $nin in the query to ensure paymentId is NOT already processed
    // AND using $addToSet to atomically add it (prevents duplicates even in race conditions)
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
        // CRITICAL: Only update if this payment hasn't been processed yet
        processedPaymentIds: { $nin: [paymentId] },
      },
      [
        {
          $set: {
            slipsQuota: { $add: ['$slipsQuota', pkg.slipQuota] },
            endDate: {
              $dateAdd: {
                startDate: '$endDate',
                unit: 'day',
                amount: pkg.durationDays,
              },
            },
            // Add paymentId to processed list atomically
            processedPaymentIds: {
              $cond: {
                if: { $in: [paymentId, { $ifNull: ['$processedPaymentIds', []] }] },
                then: '$processedPaymentIds',
                else: { $concatArrays: [{ $ifNull: ['$processedPaymentIds', []] }, [paymentId]] },
              },
            },
          },
        },
      ],
      { new: true },
    );

    if (result) {
      this.logger.log(
        `Added ${pkg.slipQuota} quota and ${pkg.durationDays} days to subscription ${result._id} for user ${userId} (payment: ${paymentId})`,
      );
      return {
        success: true,
        subscriptionId: result._id.toString(),
        alreadyProcessed: false,
      };
    }

    // Check if the reason for no result is that payment was already processed
    // (race condition: another process added it between our check and update)
    const recheck = await this.subscriptionModel.findOne({
      userId,
      processedPaymentIds: paymentId,
    });

    if (recheck) {
      this.logger.warn(`Payment ${paymentId} was processed by another process - returning existing subscription`);
      return {
        success: true,
        subscriptionId: recheck._id.toString(),
        alreadyProcessed: true,
      };
    }

    // No active subscription found, create new one with the paymentId tracked
    const newSubscription = await this.createSubscriptionWithPayment(userId, packageId, paymentId);
    this.logger.log(`Created new subscription ${newSubscription._id} for user ${userId} (payment: ${paymentId})`);
    return {
      success: true,
      subscriptionId: newSubscription._id.toString(),
      alreadyProcessed: false,
    };
  }

  /**
   * Grant free quota to a user (admin use only).
   * Generates a unique grant ID for idempotency tracking.
   *
   * @param adminId - The admin granting the quota (for audit)
   * @returns Object with subscriptionId
   */
  async grantFreeQuota(
    userId: string,
    packageId: string,
    adminId: string,
  ): Promise<{ success: boolean; subscriptionId: string }> {
    // Generate a unique grant ID for idempotency
    const grantId = `admin-grant-${adminId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = await this.addQuotaToExisting(userId, packageId, grantId);

    this.logger.log(`Admin ${adminId} granted package ${packageId} to user ${userId} (grant: ${grantId})`);

    return {
      success: result.success,
      subscriptionId: result.subscriptionId,
    };
  }

  /**
   * Create a new subscription with payment tracking
   */
  private async createSubscriptionWithPayment(
    userId: string,
    packageId: string,
    paymentId: string,
  ): Promise<SubscriptionDocument> {
    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + pkg.durationDays);

    const subscription = new this.subscriptionModel({
      userId,
      packageId,
      paymentId,
      startDate,
      endDate,
      slipsQuota: pkg.slipQuota,
      slipsUsed: 0,
      slipsReserved: 0,
      status: SubscriptionStatus.ACTIVE,
      processedPaymentIds: [paymentId], // Track this payment immediately
    });

    return subscription.save();
  }

  async checkQuota(userId: string): Promise<QuotaInfo> {
    const activeSubscriptions = await this.subscriptionModel.find({
      userId,
      status: SubscriptionStatus.ACTIVE,
      endDate: { $gt: new Date() },
    });

    if (activeSubscriptions.length === 0) {
      return {
        hasQuota: false,
        remainingQuota: 0,
        totalQuota: 0,
        usedQuota: 0,
        reservedQuota: 0,
        activeSubscriptions: 0,
      };
    }

    const totalQuota = activeSubscriptions.reduce((sum, sub) => sum + sub.slipsQuota, 0);
    const usedQuota = activeSubscriptions.reduce((sum, sub) => sum + sub.slipsUsed, 0);
    const reservedQuota = activeSubscriptions.reduce((sum, sub) => sum + sub.slipsReserved, 0);
    const remainingQuota = totalQuota - usedQuota - reservedQuota;

    return {
      hasQuota: remainingQuota > 0,
      remainingQuota,
      totalQuota,
      usedQuota,
      reservedQuota,
      activeSubscriptions: activeSubscriptions.length,
    };
  }

  /**
   * Check quota with detailed status for different scenarios
   * Returns specific status for: has_quota, quota_exhausted, package_expired, no_subscription
   */
  async checkQuotaDetailed(userId: string): Promise<DetailedQuotaInfo> {
    // Check for active (non-expired) subscriptions
    const activeSubscriptions = await this.subscriptionModel.find({
      userId,
      status: SubscriptionStatus.ACTIVE,
      endDate: { $gt: new Date() },
    });

    // Check for any subscriptions (including expired)
    const allSubscriptions = await this.subscriptionModel.find({ userId });
    const expiredSubscriptions = allSubscriptions.filter(
      sub => sub.status === SubscriptionStatus.ACTIVE && sub.endDate <= new Date()
    );

    const hasPreviousSubscriptions = allSubscriptions.length > 0;
    const hasExpiredSubscriptions = expiredSubscriptions.length > 0;

    if (activeSubscriptions.length === 0) {
      let status: QuotaStatus;
      if (hasExpiredSubscriptions) {
        status = 'package_expired';
      } else if (hasPreviousSubscriptions) {
        status = 'package_expired'; // Cancelled or completed subscriptions
      } else {
        status = 'no_subscription';
      }

      return {
        hasQuota: false,
        remainingQuota: 0,
        totalQuota: 0,
        usedQuota: 0,
        reservedQuota: 0,
        activeSubscriptions: 0,
        status,
        hasExpiredSubscriptions,
        hasPreviousSubscriptions,
      };
    }

    const totalQuota = activeSubscriptions.reduce((sum, sub) => sum + sub.slipsQuota, 0);
    const usedQuota = activeSubscriptions.reduce((sum, sub) => sum + sub.slipsUsed, 0);
    const reservedQuota = activeSubscriptions.reduce((sum, sub) => sum + sub.slipsReserved, 0);
    const remainingQuota = totalQuota - usedQuota - reservedQuota;

    const status: QuotaStatus = remainingQuota > 0 ? 'has_quota' : 'quota_exhausted';

    return {
      hasQuota: remainingQuota > 0,
      remainingQuota,
      totalQuota,
      usedQuota,
      reservedQuota,
      activeSubscriptions: activeSubscriptions.length,
      status,
      hasExpiredSubscriptions,
      hasPreviousSubscriptions,
    };
  }

  async useQuota(userId: string, amount = 1): Promise<boolean> {
    // Use atomic findOneAndUpdate to prevent race conditions
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
        $expr: { $lte: [{ $add: ['$slipsUsed', '$slipsReserved', amount] }, '$slipsQuota'] },
      },
      {
        $inc: { slipsUsed: amount },
      },
      { new: true },
    );

    if (!result) {
      this.logger.warn(`Failed to use quota for user ${userId}: insufficient quota or no active subscription`);
      return false;
    }

    return true;
  }

  /**
   * Reserve quota atomically to prevent race conditions
   * Uses findOneAndUpdate with conditions to ensure atomic check-and-reserve
   * Now includes reservedAt timestamp for stale reservation cleanup
   */
  async reserveQuota(userId: string, amount = 1): Promise<string | null> {
    // Atomic operation: check quota availability and reserve in one operation
    // Also set reservedAt timestamp for cleanup job to track stale reservations
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
        // Ensure there's enough quota: used + reserved + amount <= total
        $expr: { $lte: [{ $add: ['$slipsUsed', '$slipsReserved', amount] }, '$slipsQuota'] },
      },
      {
        $inc: { slipsReserved: amount },
        $set: { reservedAt: new Date() }, // Track when reservation was made
      },
      { new: true },
    );

    if (!result) {
      this.logger.warn(`Failed to reserve quota for user ${userId}: insufficient quota or no active subscription`);
      return null;
    }

    this.logger.log(`Reserved ${amount} quota for user ${userId}, subscription ${result._id}`);
    return result._id.toString();
  }

  /**
   * Confirm reservation: move from reserved to used atomically
   * Clears reservedAt when no more reservations remain
   */
  async confirmReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    if (!isValidObjectId(subscriptionId)) {
      this.logger.error(`Invalid subscription ID format: ${subscriptionId}`);
      return false;
    }

    // Atomic operation: decrement reserved and increment used
    // Use aggregation pipeline to conditionally clear reservedAt when slipsReserved becomes 0
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        _id: subscriptionId,
        slipsReserved: { $gte: amount }, // Ensure we have enough reserved
      },
      [
        {
          $set: {
            slipsReserved: { $subtract: ['$slipsReserved', amount] },
            slipsUsed: { $add: ['$slipsUsed', amount] },
            // Clear reservedAt if no more reservations remain
            reservedAt: {
              $cond: {
                if: { $lte: [{ $subtract: ['$slipsReserved', amount] }, 0] },
                then: null,
                else: '$reservedAt',
              },
            },
          },
        },
      ],
      { new: true },
    );

    if (!result) {
      this.logger.error(`Failed to confirm reservation for subscription ${subscriptionId}`);
      return false;
    }

    this.logger.log(`Confirmed reservation: ${amount} quota for subscription ${subscriptionId}`);
    return true;
  }

  /**
   * Rollback reservation: release reserved quota atomically
   * Clears reservedAt when no more reservations remain
   */
  async rollbackReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    if (!isValidObjectId(subscriptionId)) {
      this.logger.error(`Invalid subscription ID format: ${subscriptionId}`);
      return false;
    }

    // Atomic operation: decrement reserved
    // Use aggregation pipeline to conditionally clear reservedAt when slipsReserved becomes 0
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        _id: subscriptionId,
        slipsReserved: { $gte: amount }, // Ensure we have enough reserved to rollback
      },
      [
        {
          $set: {
            slipsReserved: { $subtract: ['$slipsReserved', amount] },
            // Clear reservedAt if no more reservations remain
            reservedAt: {
              $cond: {
                if: { $lte: [{ $subtract: ['$slipsReserved', amount] }, 0] },
                then: null,
                else: '$reservedAt',
              },
            },
          },
        },
      ],
      { new: true },
    );

    if (!result) {
      this.logger.warn(`Failed to rollback reservation for subscription ${subscriptionId}: may already be rolled back`);
      return false;
    }

    this.logger.log(`Rolled back reservation: ${amount} quota for subscription ${subscriptionId}`);
    return true;
  }

  /**
   * Cleanup expired reservations - should be called periodically
   * This handles cases where reservations were made but never confirmed/rolled back
   */
  async cleanupExpiredReservations(): Promise<number> {
    // Reset all reserved quotas for expired subscriptions
    const result = await this.subscriptionModel.updateMany(
      {
        status: SubscriptionStatus.ACTIVE,
        endDate: { $lt: new Date() },
        slipsReserved: { $gt: 0 },
      },
      {
        $set: { slipsReserved: 0 },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Cleaned up ${result.modifiedCount} expired reservations`);
    }

    return result.modifiedCount;
  }

  async getUserSubscriptions(userId: string, limit = 10): Promise<SubscriptionDocument[]> {
    return this.subscriptionModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async getActiveSubscription(userId: string): Promise<{
    packageName: string;
    quota: number;
    remainingQuota: number;
    startDate: Date;
    expiresAt: Date;
  } | null> {
    const subscription = await this.subscriptionModel.findOne({
      userId,
      status: SubscriptionStatus.ACTIVE,
      endDate: { $gt: new Date() },
    });

    if (!subscription) {
      return null;
    }

    const pkg = await this.packagesService.findById(subscription.packageId);
    
    return {
      packageName: pkg?.name || 'Standard',
      quota: subscription.slipsQuota,
      remainingQuota: subscription.slipsQuota - subscription.slipsUsed - subscription.slipsReserved,
      startDate: subscription.startDate,
      expiresAt: subscription.endDate,
    };
  }

  async expireSubscriptions(): Promise<number> {
    // First cleanup any remaining reservations
    await this.cleanupExpiredReservations();

    // Then expire the subscriptions
    const result = await this.subscriptionModel.updateMany(
      {
        status: SubscriptionStatus.ACTIVE,
        endDate: { $lt: new Date() },
      },
      { 
        status: SubscriptionStatus.EXPIRED,
        slipsReserved: 0, // Ensure no orphaned reservations
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} subscriptions`);
    }

    return result.modifiedCount;
  }

  /**
   * Cleanup stale reservations that have been pending too long
   * This handles cases where the process crashed before confirming/rolling back
   * 
   * @param maxAgeMinutes - Maximum age in minutes for reservations (default: 3 minutes)
   * @returns Number of subscriptions that had their reservations cleaned up
   */
  async cleanupStaleReservations(maxAgeMinutes = 3): Promise<number> {
    // Calculate the cutoff time
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    // Find and clean up stale reservations using reservedAt timestamp
    const result = await this.subscriptionModel.updateMany(
      {
        slipsReserved: { $gt: 0 },
        status: SubscriptionStatus.ACTIVE,
        reservedAt: { $lt: cutoffTime }, // Only cleanup reservations older than cutoff
      },
      {
        $set: { 
          slipsReserved: 0,
          reservedAt: null,
        },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Cleaned up ${result.modifiedCount} stale reservations (older than ${maxAgeMinutes} minutes)`,
      );
    }

    return result.modifiedCount;
  }

  /**
   * Force cleanup all reservations (emergency use only)
   * Use with caution - this will release ALL pending reservations
   */
  async forceCleanupAllReservations(): Promise<number> {
    const result = await this.subscriptionModel.updateMany(
      {
        slipsReserved: { $gt: 0 },
        status: SubscriptionStatus.ACTIVE,
      },
      {
        $set: { 
          slipsReserved: 0,
          reservedAt: null,
        },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(`Force-cleaned ALL ${result.modifiedCount} reservations`);
    }

    return result.modifiedCount;
  }

  /**
   * Get subscription statistics for admin dashboard
   */
  async getStatistics(): Promise<{
    totalActive: number;
    totalExpired: number;
    totalQuotaUsed: number;
    totalQuotaRemaining: number;
  }> {
    const [activeStats, expiredCount] = await Promise.all([
      this.subscriptionModel.aggregate([
        { $match: { status: SubscriptionStatus.ACTIVE, endDate: { $gt: new Date() } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalUsed: { $sum: '$slipsUsed' },
            totalQuota: { $sum: '$slipsQuota' },
            totalReserved: { $sum: '$slipsReserved' },
          },
        },
      ]),
      this.subscriptionModel.countDocuments({ status: SubscriptionStatus.EXPIRED }),
    ]);

    const stats = activeStats[0] || { count: 0, totalUsed: 0, totalQuota: 0, totalReserved: 0 };

    return {
      totalActive: stats.count,
      totalExpired: expiredCount,
      totalQuotaUsed: stats.totalUsed,
      totalQuotaRemaining: stats.totalQuota - stats.totalUsed - stats.totalReserved,
    };
  }
}
