import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiQuotaReservationDocument = AiQuotaReservation & Document;

export enum AiQuotaReservationStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
  ROLLED_BACK = 'rolled_back',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'ai_quota_reservations' })
export class AiQuotaReservation {
  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({ required: true, index: true })
  subscriptionId: string;

  @Prop({ required: true, index: true })
  lineAccountId: string;

  @Prop({ required: true, index: true })
  lineUserId: string;

  @Prop({ index: true })
  messageId?: string;

  @Prop({ type: String, enum: AiQuotaReservationStatus, required: true })
  status: AiQuotaReservationStatus;

  @Prop({ default: 1 })
  amount: number;

  @Prop()
  reason?: string;

  @Prop()
  confirmedAt?: Date;

  @Prop()
  rolledBackAt?: Date;

  @Prop({ index: true })
  expiresAt?: Date;
}

export const AiQuotaReservationSchema = SchemaFactory.createForClass(AiQuotaReservation);

AiQuotaReservationSchema.index({ ownerId: 1, createdAt: -1 });
AiQuotaReservationSchema.index({ lineAccountId: 1, createdAt: -1 });
AiQuotaReservationSchema.index({ subscriptionId: 1, status: 1 });
