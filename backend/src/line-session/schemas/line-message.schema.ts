import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LineMessageDocument = LineMessage & Document;

/**
 * LINE Message Schema
 * เก็บข้อความจาก LINE OA ธนาคาร
 *
 * Collection: line_messages
 */
@Schema({
  collection: 'line_messages',
  timestamps: true,
})
export class LineMessage {
  /**
   * อ้างอิง LINE Session
   */
  @Prop({ required: true, index: true })
  sessionId: string;

  /**
   * อ้างอิง LINE Account
   */
  @Prop({ required: true, index: true })
  lineAccountId: string;

  /**
   * Message ID จาก LINE
   */
  @Prop({ required: true, unique: true })
  messageId: string;

  /**
   * ผู้ส่ง (chatMid ของ LINE OA ธนาคาร)
   */
  @Prop()
  from: string;

  /**
   * ผู้รับ (chatMid ของ user)
   */
  @Prop()
  to: string;

  /**
   * เวลาที่สร้างข้อความ (timestamp จาก LINE)
   */
  @Prop()
  createdTime: string;

  /**
   * เวลาที่ส่งถึง
   */
  @Prop()
  deliveredTime: string;

  /**
   * เนื้อหาข้อความ
   */
  @Prop()
  text: string;

  /**
   * ข้อความต้นฉบับ (ALT_TEXT)
   */
  @Prop()
  originalMsg: string;

  /**
   * รหัสธนาคาร
   */
  @Prop({ index: true })
  bankCode: string;

  /**
   * ประเภทรายการ ('deposit', 'withdraw', 'transfer', 'unknown')
   */
  @Prop()
  transactionType: string;

  /**
   * จำนวนเงิน
   */
  @Prop()
  amount: string;

  /**
   * ยอดคงเหลือ
   */
  @Prop()
  balance: string;

  /**
   * วันที่ข้อความ
   */
  @Prop({ index: true })
  messageDate: Date;

  /**
   * ประมวลผลแล้วหรือยัง
   */
  @Prop({ default: false })
  isProcessed: boolean;

  /**
   * ข้อมูล metadata เพิ่มเติม
   */
  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const LineMessageSchema = SchemaFactory.createForClass(LineMessage);

// Indexes
LineMessageSchema.index({ lineAccountId: 1, messageDate: -1 });
LineMessageSchema.index({ bankCode: 1, messageDate: -1 });
LineMessageSchema.index({ transactionType: 1 });
