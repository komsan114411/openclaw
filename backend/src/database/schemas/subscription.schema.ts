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
