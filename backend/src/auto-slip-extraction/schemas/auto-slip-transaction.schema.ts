import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AutoSlipTransactionDocument = AutoSlipTransaction & Document;

/**
 * AutoSlipTransaction Schema
 *
 * Stores extracted bank transaction messages.
 * Completely separate from existing slip verification system.
 */
@Schema({
  collection: 'auto_slip_transactions',
  timestamps: true,
})
export class AutoSlipTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AutoSlipBankAccount', required: true, index: true })
  bankAccountId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  messageId: string; // Unique message ID from LINE

  // Parsed Data
  @Prop({ required: true, enum: ['deposit', 'withdraw', 'transfer', 'unknown'] })
  type: string;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({ type: Number })
  balance: number;

  @Prop()
  counterparty: string;

  @Prop()
  reference: string;

  // Raw Data
  @Prop({ required: true })
  rawMessage: string;

  @Prop({ type: Date, required: true })
  messageDate: Date;

  // Processing
  @Prop({ default: false })
  isProcessed: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  matchedPaymentId: Types.ObjectId;

  @Prop()
  bankCode: string;

  // Metadata
  @Prop({ type: Object })
  metadata: Record<string, unknown>;
}

export const AutoSlipTransactionSchema = SchemaFactory.createForClass(AutoSlipTransaction);

// Indexes
AutoSlipTransactionSchema.index({ bankAccountId: 1, messageDate: -1 });
AutoSlipTransactionSchema.index({ userId: 1, type: 1, messageDate: -1 });
AutoSlipTransactionSchema.index({ isProcessed: 1, type: 1 });
AutoSlipTransactionSchema.index({ bankCode: 1, messageDate: -1 });
