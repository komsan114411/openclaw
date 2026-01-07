import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: Number, default: 0, min: 0 })
    balance: number; // ยอดเครดิตคงเหลือ (บาท)

    @Prop({ type: Number, default: 0, min: 0 })
    totalDeposited: number; // เติมสะสมทั้งหมด

    @Prop({ type: Number, default: 0, min: 0 })
    totalSpent: number; // ใช้ไปทั้งหมด

    @Prop({ type: Boolean, default: true })
    isActive: boolean;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Indexes
WalletSchema.index({ userId: 1 }, { unique: true });
