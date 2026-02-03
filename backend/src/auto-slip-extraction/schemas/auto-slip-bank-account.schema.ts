import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BankStatus } from '../constants/bank-status.enum';

export type AutoSlipBankAccountDocument = AutoSlipBankAccount & Document;

/**
 * AutoSlipBankAccount Schema
 *
 * Stores bank accounts for auto-slip extraction feature.
 * Completely separate from existing slip verification system.
 */
@Schema({
  collection: 'auto_slip_bank_accounts',
  timestamps: true,
})
export class AutoSlipBankAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['SCB', 'KBANK', 'GSB', 'BBL', 'KTB', 'TMB', 'BAY'] })
  bankType: string;

  @Prop({ required: true })
  bankCode: string; // '014', '004', '030', etc.

  @Prop({ required: true })
  accountNumber: string;

  @Prop({ required: true })
  accountName: string;

  // LINE Credentials (encrypted)
  @Prop({ required: true })
  lineEmail: string;

  @Prop()
  linePasswordEncrypted: string; // AES-256-GCM encrypted

  // Extracted Keys
  @Prop()
  xLineAccess: string;

  @Prop()
  xHmac: string;

  @Prop()
  chatMid: string;

  @Prop()
  cUrlBash: string; // cURL command for API calls

  // Link to LINE Session (for event correlation)
  @Prop({ type: Types.ObjectId, ref: 'LineSession', index: true })
  lineSessionId: Types.ObjectId;

  // Status (State Machine)
  @Prop({
    type: String,
    enum: BankStatus,
    default: BankStatus.INIT,
    index: true,
  })
  status: BankStatus;

  @Prop({ type: Date })
  lastStatusChange: Date;

  @Prop()
  lastError: string;

  @Prop({ default: 0 })
  errorCount: number;

  // Monitoring
  @Prop({ type: Number })
  balance: number;

  @Prop({ default: 300000 }) // 5 minutes default
  checkInterval: number;

  @Prop({ default: true })
  monitoringEnabled: boolean;

  @Prop({ type: Date })
  lastKeyCheck: Date;

  @Prop({ type: Date })
  lastMessageFetch: Date;

  @Prop({ type: Date })
  keysExtractedAt: Date;

  @Prop({ type: Date })
  keysExpiresAt: Date;

  // User Agent and Version
  @Prop()
  userAgent: string;

  @Prop()
  lineVersion: string;

  // Metadata
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object })
  metadata: Record<string, unknown>;
}

export const AutoSlipBankAccountSchema = SchemaFactory.createForClass(AutoSlipBankAccount);

// Indexes
AutoSlipBankAccountSchema.index({ userId: 1, bankCode: 1, accountNumber: 1 }, { unique: true });
AutoSlipBankAccountSchema.index({ status: 1, monitoringEnabled: 1 });
AutoSlipBankAccountSchema.index({ lastMessageFetch: 1 });
