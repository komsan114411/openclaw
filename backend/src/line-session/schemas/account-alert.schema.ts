import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccountAlertDocument = AccountAlert & Document;

/**
 * Account Alert Schema
 * แจ้งเตือนธุรกรรมผิดปกติ (ไม่ใช่ deposit/withdraw)
 *
 * Collection: account_alerts
 */
@Schema({
  collection: 'account_alerts',
  timestamps: true,
})
export class AccountAlert {
  /**
   * อ้างอิง LINE Account / Session
   */
  @Prop({ required: true, index: true })
  lineAccountId: string;

  /**
   * อ้างอิง LineMessage ID
   */
  @Prop({ required: true })
  messageId: string;

  /**
   * ประเภทธุรกรรม: transfer, payment, fee, interest, bill, unknown
   */
  @Prop({ required: true })
  transactionType: string;

  /**
   * จำนวนเงิน (ถ้ามี)
   */
  @Prop()
  amount: string;

  /**
   * ข้อความต้นฉบับ (ตัดสั้น 200 chars)
   */
  @Prop()
  text: string;

  /**
   * เจ้าของ session (userId)
   */
  @Prop({ required: false, index: true })
  ownerId: string;

  /**
   * Admin อ่านแล้วหรือยัง
   */
  @Prop({ default: false })
  isReadByAdmin: boolean;

  /**
   * User อ่านแล้วหรือยัง
   */
  @Prop({ default: false })
  isReadByUser: boolean;

  /**
   * วันที่ข้อความ
   */
  @Prop()
  messageDate: Date;
}

export const AccountAlertSchema = SchemaFactory.createForClass(AccountAlert);

// Compound index for querying unread alerts per account (Admin)
AccountAlertSchema.index({ lineAccountId: 1, isReadByAdmin: 1, createdAt: -1 });

// Compound index for querying unread alerts per owner (User)
AccountAlertSchema.index({ ownerId: 1, isReadByUser: 1, createdAt: -1 });

// TTL Index: auto-delete after 90 days
AccountAlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
