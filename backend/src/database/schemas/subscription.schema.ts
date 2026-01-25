import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  packageId: string;

  @Prop()
  paymentId: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, default: 0 })
  slipsQuota: number;

  @Prop({ default: 0 })
  slipsUsed: number;

  @Prop({ default: 0 })
  slipsReserved: number;

  /**
   * Timestamp when quota was last reserved.
   * Used by cleanup job to release stale reservations.
   * Updated every time slipsReserved is incremented.
   */
  @Prop()
  reservedAt: Date;

  // ============================================
  // AI Quota (แยกจาก slip quota)
  // ============================================

  @Prop({ required: true, default: 0 })
  aiQuota: number;

  @Prop({ default: 0 })
  aiUsed: number;

  @Prop({ default: 0 })
  aiReserved: number;

  /**
   * Timestamp when AI quota was last reserved.
   * Used by cleanup job to release stale AI reservations.
   */
  @Prop()
  aiReservedAt: Date;

  @Prop({ type: String, enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  /**
   * Array of payment IDs that have been processed for this subscription.
   * Used to prevent double-granting quota from the same payment.
   * This is the source of truth for idempotency.
   */
  @Prop({ type: [String], default: [] })
  processedPaymentIds: string[];
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1 });
// Index for fast lookup of processed payments
SubscriptionSchema.index({ processedPaymentIds: 1 });
// Index for cleanup job to find stale reservations
SubscriptionSchema.index({ slipsReserved: 1, reservedAt: 1 });
// Index for AI quota cleanup job
SubscriptionSchema.index({ aiReserved: 1, aiReservedAt: 1 });
