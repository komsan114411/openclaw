import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from '../database/schemas/subscription.schema';
import { PackagesService } from '../packages/packages.service';

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

  /**
   * Validate ObjectId format
   */
  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  async createSubscription(
    userId: string,
    packageId: string,
    paymentId?: string,
  ): Promise<SubscriptionDocument> {
    if (!this.isValidObjectId(packageId)) {
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

  async addQuotaToExisting(userId: string, packageId: string, paymentId?: string): Promise<boolean> {
    if (!this.isValidObjectId(packageId)) {
      throw new BadRequestException('Invalid package ID format');
    }

    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // Use atomic findOneAndUpdate to prevent race conditions
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + pkg.durationDays);

    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        userId,
        status: SubscriptionStatus.ACTIVE,
        endDate: { $gt: new Date() },
      },
      {
        $inc: { slipsQuota: pkg.slipQuota },
        $set: { endDate: newEndDate },
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Added ${pkg.slipQuota} quota to existing subscription for user ${userId}`);
      return true;
    }

    // No active subscription found, create new one
    await this.createSubscription(userId, packageId, paymentId);
    this.logger.log(`Created new subscription for user ${userId}`);
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
   */
  async reserveQuota(userId: string, amount = 1): Promise<string | null> {
    // Atomic operation: check quota availability and reserve in one operation
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
   */
  async confirmReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    if (!this.isValidObjectId(subscriptionId)) {
      this.logger.error(`Invalid subscription ID format: ${subscriptionId}`);
      return false;
    }

    // Atomic operation: decrement reserved and increment used
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        _id: subscriptionId,
        slipsReserved: { $gte: amount }, // Ensure we have enough reserved
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
      this.logger.error(`Failed to confirm reservation for subscription ${subscriptionId}`);
      return false;
    }

    this.logger.log(`Confirmed reservation: ${amount} quota for subscription ${subscriptionId}`);
    return true;
  }

  /**
   * Rollback reservation: release reserved quota atomically
   */
  async rollbackReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    if (!this.isValidObjectId(subscriptionId)) {
      this.logger.error(`Invalid subscription ID format: ${subscriptionId}`);
      return false;
    }

    // Atomic operation: decrement reserved
    const result = await this.subscriptionModel.findOneAndUpdate(
      {
        _id: subscriptionId,
        slipsReserved: { $gte: amount }, // Ensure we have enough reserved to rollback
      },
      {
        $inc: { slipsReserved: -amount },
      },
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
