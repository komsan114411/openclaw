import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditTransactionDocument = CreditTransaction & Document;

export enum TransactionType {
    DEPOSIT = 'deposit',       // เติมเครดิต
    PURCHASE = 'purchase',     // ซื้อแพ็คเกจ
    REFUND = 'refund',         // คืนเงิน
    BONUS = 'bonus',           // โบนัส/โปรโมชั่น
    ADJUSTMENT = 'adjustment', // ปรับยอด (admin)
}

export enum TransactionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    REJECTED = 'rejected',
    CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class CreditTransaction {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true, index: true })
    walletId: Types.ObjectId;

    @Prop({ type: String, enum: TransactionType, required: true, index: true })
    type: TransactionType;

    @Prop({ type: Number, required: true })
    amount: number; // จำนวนเงิน (+ สำหรับเติม, - สำหรับใช้)

    @Prop({ type: Number, required: true })
    balanceAfter: number; // ยอดคงเหลือหลังทำรายการ

    @Prop({ type: String })
    transRef?: string; // เลขอ้างอิงสลิป (สำหรับ deposit)

    @Prop({ type: Types.ObjectId, ref: 'Package' })
    packageId?: Types.ObjectId; // แพ็คเกจที่ซื้อ (สำหรับ purchase)

    @Prop({ type: String, required: true })
    description: string; // คำอธิบายธุรกรรม

    @Prop({ type: Buffer })
    slipImageData?: Buffer; // รูปสลิป (สำหรับ deposit)

    @Prop({ type: String, enum: TransactionStatus, default: TransactionStatus.PENDING, index: true })
    status: TransactionStatus;

    @Prop({ type: Object })
    verificationResult?: Record<string, any>; // ผลตรวจสอบสลิป

    @Prop({ type: Types.ObjectId, ref: 'User' })
    processedBy?: Types.ObjectId; // Admin ที่ approve/reject

    @Prop({ type: String })
    adminNotes?: string; // หมายเหตุจาก admin

    @Prop({ type: Date })
    completedAt?: Date;
}

export const CreditTransactionSchema = SchemaFactory.createForClass(CreditTransaction);

// Indexes
CreditTransactionSchema.index({ userId: 1, createdAt: -1 });
CreditTransactionSchema.index({ transRef: 1 }, { sparse: true });
CreditTransactionSchema.index({ status: 1, createdAt: -1 });
