import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',  // Being verified - prevents concurrent verification
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

  /**
   * Timestamp when processing started.
   * Used to detect and cleanup stuck PROCESSING payments.
   */
  @Prop()
  processingStartedAt: Date;

  /**
   * Hash of slip image for quick duplicate detection.
   * Computed before verification to enable early duplicate blocking.
   */
  @Prop({ index: true })
  slipHash: string;

  /**
   * Idempotency key for verification operations.
   * Prevents duplicate verification attempts.
   */
  @Prop({ index: true })
  verificationIdempotencyKey: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ userId: 1 });
PaymentSchema.index({ status: 1 });

// CRITICAL: Prevent duplicate slip usage once verified OR being processed.
// This blocks the same transRef from being used in multiple VERIFIED or PROCESSING payments.
PaymentSchema.index(
  { transRef: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transRef: { $type: 'string' },
      status: { $in: [PaymentStatus.VERIFIED, PaymentStatus.PROCESSING] }
    },
    name: 'unique_transref_verified_or_processing'
  },
);

// CRITICAL: Prevent same slip hash from being processed simultaneously.
// This catches duplicates BEFORE transRef is known (early detection).
PaymentSchema.index(
  { slipHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      slipHash: { $type: 'string' },
      status: { $in: [PaymentStatus.PROCESSING] }
    },
    name: 'unique_sliphash_processing'
  },
);

// Useful for querying user's pending payments by package
PaymentSchema.index({ userId: 1, packageId: 1, status: 1, createdAt: -1 });

// CRITICAL: Prevent duplicate pending/processing payments for same user+package
// This ensures a user can only have ONE pending OR processing payment per package at a time
PaymentSchema.index(
  { userId: 1, packageId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
    name: 'unique_pending_processing_payment_per_user_package'
  },
);

// Index for cleanup job: find stuck PROCESSING payments
PaymentSchema.index({ status: 1, processingStartedAt: 1 });
