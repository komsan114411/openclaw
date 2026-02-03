import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AutoSlipPinCodeDocument = AutoSlipPinCode & Document;

/**
 * AutoSlipPinCode Schema
 *
 * Temporary storage for PIN codes during LINE login.
 * PIN codes are short-lived (3 minutes max).
 */
@Schema({
  collection: 'auto_slip_pin_codes',
  timestamps: true,
})
export class AutoSlipPinCode {
  @Prop({ type: Types.ObjectId, ref: 'AutoSlipBankAccount', required: true, index: true })
  bankAccountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  pinCode: string; // 6-digit PIN

  @Prop({ type: Date, required: true })
  displayedAt: Date;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;

  @Prop({
    type: String,
    enum: ['fresh', 'new', 'old', 'expired', 'verified'],
    default: 'fresh',
  })
  status: string;

  @Prop({ type: Date })
  verifiedAt: Date;

  // Track whether PIN was successfully used
  @Prop({ default: false })
  wasUsed: boolean;
}

export const AutoSlipPinCodeSchema = SchemaFactory.createForClass(AutoSlipPinCode);

// TTL index - automatically delete documents 5 minutes after expiration
AutoSlipPinCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 300 });

// Indexes
AutoSlipPinCodeSchema.index({ bankAccountId: 1, status: 1 });
