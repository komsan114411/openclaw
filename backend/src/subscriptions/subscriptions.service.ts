import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../database/schemas/subscription.schema';
import { PackagesService } from '../packages/packages.service';

// Maximum quota per subscription to prevent overflow
const MAX_QUOTA_PER_SUBSCRIPTION = 10_000_000;

export interface QuotaInfo {
  hasQuota: boolean;
  remainingQuota: number;
  totalQuota: number;
  usedQuota: number;
  reservedQuota: number;
  activeSubscriptions: number;
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
   * Add quota to existing subscription or create new one
   * Uses atomic operation to prevent race conditions
   */
  async addQuotaToExisting(userId: string, packageId: string, paymentId?: string): Promise<boolean> {
    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // Validate package quota
    if (!pkg.slipQuota || pkg.slipQuota <= 0) {
      throw new BadRequestException('Invalid package quota');
    }

    // Find active subscription and update atomically
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + pkg.durationDays);

    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
        // Prevent overflow - ensure new quota won't exceed maximum
        slipsQuota: { $lte: MAX_QUOTA_PER_SUBSCRIPTION - pkg.slipQuota },
      },
      {
        $inc: { slipsQuota: pkg.slipQuota },
        // Extend end date: use $max to ensure we always extend, not shorten
        $max: { endDate: newEndDate },
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Added ${pkg.slipQuota} quota to existing subscription for user ${userId}`);
      return true;
    }

    // No active subscription found or would overflow - create new one
    await this.createSubscription(userId, packageId, paymentId);
    this.logger.log(`Created new subscription with ${pkg.slipQuota} quota for user ${userId}`);
    return true;
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
   * Use quota directly (atomic operation to prevent race conditions)
   */
  async useQuota(userId: string, amount = 1): Promise<boolean> {
    if (amount <= 0) return false;

    // Use findOneAndUpdate for atomic operation to prevent race conditions
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
        // Check that used + reserved + amount <= quota
        $expr: { $lte: [{ $add: ['$slipsUsed', '$slipsReserved', amount] }, '$slipsQuota'] },
      },
      {
        $inc: { slipsUsed: amount },
      },
      { new: true },
    );

    if (!result) {
      this.logger.warn(`useQuota failed for user ${userId}: no available quota`);
      return false;
    }

    return true;
  }

  /**
   * Reserve quota (atomic operation to prevent race conditions)
   * Returns subscription ID if successful, null otherwise
   */
  async reserveQuota(userId: string, amount = 1): Promise<string | null> {
    if (amount <= 0) return null;

    // Use findOneAndUpdate for atomic operation to prevent race conditions
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
        // Check that used + reserved + amount <= quota
        $expr: { $lte: [{ $add: ['$slipsUsed', '$slipsReserved', amount] }, '$slipsQuota'] },
      },
      {
        $inc: { slipsReserved: amount },
      },
      { new: true },
    );

    if (!result) {
      this.logger.warn(`reserveQuota failed for user ${userId}: no available quota`);
      return null;
    }

    return result._id.toString();
  }

  /**
   * Confirm reservation (atomic operation)
   * Decreases reserved count and increases used count
   */
  async confirmReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    if (amount <= 0) return false;

    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        _id: subscriptionId,
        slipsReserved: { $gte: amount },
      },
      {
        $inc: {
          slipsReserved: -amount,
          slipsUsed: amount,
        },
      },
      { new: true },
    );

    if (!result) {
      this.logger.warn(`confirmReservation failed for subscription ${subscriptionId}`);
      return false;
    }

    return true;
  }

  /**
   * Rollback reservation (atomic operation)
   * Decreases reserved count to release the quota
   */
  async rollbackReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    if (amount <= 0) return false;

    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        _id: subscriptionId,
        slipsReserved: { $gte: amount },
      },
      {
        $inc: { slipsReserved: -amount },
      },
      { new: true },
    );

    if (!result) {
      this.logger.warn(`rollbackReservation failed for subscription ${subscriptionId}`);
      return false;
    }

    return true;
  }

  /**
   * Cleanup stale reservations (reserved quotas that weren't confirmed/rolled back)
   * This should be called periodically to prevent quota leaks
   */
  async cleanupStaleReservations(): Promise<number> {
    // Reset slipsReserved to 0 for subscriptions with stale reservations
    // This is a safety mechanism - normally reservations should be confirmed/rolled back
    const result = await this.subscriptionModel.updateMany(
      {
        status: SubscriptionStatus.ACTIVE,
        slipsReserved: { $gt: 0 },
        // Only cleanup if the subscription was last updated more than 10 minutes ago
        updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
      {
        $set: { slipsReserved: 0 },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(`Cleaned up stale reservations for ${result.modifiedCount} subscriptions`);
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
    const result = await this.subscriptionModel.updateMany(
      {
        status: SubscriptionStatus.ACTIVE,
        endDate: { $lt: new Date() },
      },
      { status: SubscriptionStatus.EXPIRED },
    );
    return result.modifiedCount;
  }
}
