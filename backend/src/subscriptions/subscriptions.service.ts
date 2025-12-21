import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async addQuotaToExisting(userId: string, packageId: string, paymentId?: string): Promise<boolean> {
    const pkg = await this.packagesService.findById(packageId);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    // Find active subscription
    const activeSub = await this.subscriptionModel.findOne({
      userId,
      status: SubscriptionStatus.ACTIVE,
      endDate: { $gt: new Date() },
    });

    if (activeSub) {
      // Add quota to existing subscription
      activeSub.slipsQuota += pkg.slipQuota;
      // Extend end date
      const newEndDate = new Date(activeSub.endDate);
      newEndDate.setDate(newEndDate.getDate() + pkg.durationDays);
      activeSub.endDate = newEndDate;
      await activeSub.save();
      return true;
    } else {
      // Create new subscription
      await this.createSubscription(userId, packageId, paymentId);
      return true;
    }
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
    const activeSubscription = await this.subscriptionModel.findOne({
      userId,
      status: SubscriptionStatus.ACTIVE,
      endDate: { $gt: new Date() },
      $expr: { $lt: [{ $add: ['$slipsUsed', '$slipsReserved'] }, '$slipsQuota'] },
    });

    if (!activeSubscription) {
      return false;
    }

    activeSubscription.slipsUsed += amount;
    await activeSubscription.save();
    return true;
  }

  async reserveQuota(userId: string, amount = 1): Promise<string | null> {
    const activeSubscription = await this.subscriptionModel.findOne({
      userId,
      status: SubscriptionStatus.ACTIVE,
      endDate: { $gt: new Date() },
      $expr: { $lt: [{ $add: ['$slipsUsed', '$slipsReserved'] }, '$slipsQuota'] },
    });

    if (!activeSubscription) {
      return null;
    }

    activeSubscription.slipsReserved += amount;
    await activeSubscription.save();
    return activeSubscription._id.toString();
  }

  async confirmReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    const subscription = await this.subscriptionModel.findById(subscriptionId);
    if (!subscription || subscription.slipsReserved < amount) {
      return false;
    }

    subscription.slipsReserved -= amount;
    subscription.slipsUsed += amount;
    await subscription.save();
    return true;
  }

  async rollbackReservation(subscriptionId: string, amount = 1): Promise<boolean> {
    const subscription = await this.subscriptionModel.findById(subscriptionId);
    if (!subscription || subscription.slipsReserved < amount) {
      return false;
    }

    subscription.slipsReserved -= amount;
    await subscription.save();
    return true;
  }

  async getUserSubscriptions(userId: string, limit = 10): Promise<SubscriptionDocument[]> {
    return this.subscriptionModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
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
