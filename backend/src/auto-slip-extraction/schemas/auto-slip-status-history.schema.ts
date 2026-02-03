import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BankStatus } from '../constants/bank-status.enum';

export type AutoSlipStatusHistoryDocument = AutoSlipStatusHistory & Document;

/**
 * AutoSlipStatusHistory Schema
 *
 * Tracks all status changes for bank accounts (audit trail).
 */
@Schema({
  collection: 'auto_slip_status_histories',
  timestamps: true,
})
export class AutoSlipStatusHistory {
  @Prop({ type: Types.ObjectId, ref: 'AutoSlipBankAccount', required: true, index: true })
  bankAccountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BankStatus, required: true })
  previousStatus: BankStatus;

  @Prop({ type: String, enum: BankStatus, required: true })
  newStatus: BankStatus;

  @Prop()
  reason: string;

  @Prop()
  triggeredBy: string; // 'system', 'user', 'auto_recovery'

  @Prop({ type: Object })
  metadata: Record<string, unknown>;

  @Prop({ type: Date, default: Date.now })
  changedAt: Date;
}

export const AutoSlipStatusHistorySchema = SchemaFactory.createForClass(AutoSlipStatusHistory);

// Indexes
AutoSlipStatusHistorySchema.index({ bankAccountId: 1, changedAt: -1 });
AutoSlipStatusHistorySchema.index({ userId: 1, changedAt: -1 });
