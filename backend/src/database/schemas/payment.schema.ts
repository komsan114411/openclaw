import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PaymentType {
  BANK_TRANSFER = 'bank_transfer',
  USDT = 'usdt',
}

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId | string;

  @Prop({ type: Types.ObjectId, ref: 'Package', required: true })
  packageId: Types.ObjectId | string;

  @Prop({ required: true })
  amount: number;

  @Prop({ type: String, enum: PaymentType, required: true })
  paymentType: PaymentType;

  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Prop({ type: Buffer })
  slipImageData: Buffer;

  @Prop()
  transactionHash: string;

  @Prop()
  transRef: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  verificationResult: Record<string, any>;

  @Prop()
  adminNotes: string;

  @Prop()
  adminId: string;

  @Prop()
  verifiedAt: Date;

  /**
   * Tracks if quota was successfully granted for this payment.
   * Used to prevent double-granting and to identify payments needing recovery.
   */
  @Prop({ default: false })
  quotaGranted: boolean;

  /**
   * Reference to the subscription that was credited.
   * Used for audit trail and rollback scenarios.
   */
  @Prop()
  grantedSubscriptionId: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ userId: 1 });
PaymentSchema.index({ status: 1 });
// Prevent duplicate slip usage once verified.
// NOTE: We avoid blocking PENDING because slips may be re-uploaded / re-verified.
PaymentSchema.index(
  { transRef: 1 },
  { unique: true, partialFilterExpression: { transRef: { $type: 'string' }, status: PaymentStatus.VERIFIED } },
);

// Useful for querying user's pending payments by package
PaymentSchema.index({ userId: 1, packageId: 1, status: 1, createdAt: -1 });

// CRITICAL: Prevent duplicate pending payments for same user+package
// This ensures a user can only have ONE pending payment per package at a time
PaymentSchema.index(
  { userId: 1, packageId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: PaymentStatus.PENDING },
    name: 'unique_pending_payment_per_user_package'
  },
);
