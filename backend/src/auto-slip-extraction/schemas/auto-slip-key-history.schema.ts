import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AutoSlipKeyHistoryDocument = AutoSlipKeyHistory & Document;

/**
 * AutoSlipKeyHistory Schema
 *
 * Audit trail for all key extractions in auto-slip system.
 * Completely separate from existing LINE session key history.
 */
@Schema({
  collection: 'auto_slip_key_histories',
  timestamps: true,
})
export class AutoSlipKeyHistory {
  @Prop({ type: Types.ObjectId, ref: 'AutoSlipBankAccount', required: true, index: true })
  bankAccountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Keys (for audit - may be partially masked)
  @Prop()
  xLineAccessPreview: string; // First 20 chars only

  @Prop()
  xHmacPreview: string; // First 20 chars only

  // Extraction Info
  @Prop({ type: Date, required: true })
  extractedAt: Date;

  @Prop({
    required: true,
    enum: ['auto_login', 'manual_input', 'copied', 'relogin'],
  })
  source: string;

  @Prop({
    required: true,
    enum: ['success', 'failed', 'partial'],
  })
  status: string;

  // Additional Info
  @Prop()
  performedBy: string;

  @Prop()
  ipAddress: string;

  @Prop()
  errorMessage: string;

  @Prop()
  durationMs: number;

  @Prop({ type: Object })
  metadata: Record<string, unknown>;
}

export const AutoSlipKeyHistorySchema = SchemaFactory.createForClass(AutoSlipKeyHistory);

// Indexes
AutoSlipKeyHistorySchema.index({ bankAccountId: 1, extractedAt: -1 });
AutoSlipKeyHistorySchema.index({ userId: 1, extractedAt: -1 });
AutoSlipKeyHistorySchema.index({ source: 1, status: 1 });
