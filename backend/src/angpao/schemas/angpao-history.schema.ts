import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AngpaoHistoryDocument = AngpaoHistory & Document;

@Schema({ timestamps: true, collection: 'angpao_history' })
export class AngpaoHistory {
  @Prop({ required: true, index: true })
  voucherHash: string;

  @Prop({ required: true, index: true })
  lineAccountId: string;

  @Prop({ required: true, index: true })
  lineUserId: string;

  /** Masked phone number (e.g., 08X-XXXX-5678) — never store full phone */
  @Prop()
  phoneNumberMasked: string;

  /** Amount in THB */
  @Prop()
  amount: number;

  @Prop({
    required: true,
    enum: ['success', 'already_redeemed', 'expired', 'not_found',
      'own_voucher', 'invalid_phone', 'out_of_stock', 'rate_limited', 'error'],
  })
  status: string;

  /** Sender display name (from TrueWallet API) */
  @Prop()
  ownerName: string;

  /** Raw API response (sanitized — no phone numbers) */
  @Prop({ type: Object })
  rawResponse: Record<string, unknown>;

  @Prop()
  createdAt: Date;
}

export const AngpaoHistorySchema = SchemaFactory.createForClass(AngpaoHistory);

// Compound index for checking existing redemptions (per phone)
AngpaoHistorySchema.index({ voucherHash: 1, phoneNumberMasked: 1, status: 1 });

// Index for cross-phone check (other phone already redeemed?)
AngpaoHistorySchema.index({ voucherHash: 1, status: 1 });

// Index for listing history per account
AngpaoHistorySchema.index({ lineAccountId: 1, createdAt: -1 });

// TTL: auto-delete after 90 days
AngpaoHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
