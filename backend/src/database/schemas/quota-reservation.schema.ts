import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuotaReservationDocument = QuotaReservation & Document;

export enum QuotaReservationStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
  ROLLED_BACK = 'rolled_back',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true, collection: 'quota_reservations' })
export class QuotaReservation {
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

  @Prop({ type: String, enum: QuotaReservationStatus, required: true })
  status: QuotaReservationStatus;

  @Prop()
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

export const QuotaReservationSchema = SchemaFactory.createForClass(QuotaReservation);

QuotaReservationSchema.index({ ownerId: 1, createdAt: -1 });
QuotaReservationSchema.index({ lineAccountId: 1, createdAt: -1 });
QuotaReservationSchema.index({ subscriptionId: 1, status: 1 });

