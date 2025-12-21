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
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ userId: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ transRef: 1 });
