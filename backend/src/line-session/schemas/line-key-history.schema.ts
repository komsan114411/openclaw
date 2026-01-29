import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LineKeyHistoryDocument = LineKeyHistory & Document;

/**
 * LINE Key History Schema
 * เก็บประวัติการสกัด keys ทั้งหมด (Audit Trail)
 *
 * Collection: line_key_histories
 */
@Schema({
  collection: 'line_key_histories',
  timestamps: true,
})
export class LineKeyHistory {
  /**
   * อ้างอิง LINE Account
   */
  @Prop({ required: true, index: true })
  lineAccountId: string;

  /**
   * LINE Access Token (เก็บเพื่อ audit)
   */
  @Prop()
  xLineAccess: string;

  /**
   * HMAC Signature (เก็บเพื่อ audit)
   */
  @Prop()
  xHmac: string;

  /**
   * เวลาที่สกัด keys
   */
  @Prop({ default: Date.now })
  extractedAt: Date;

  /**
   * แหล่งที่มาของ keys
   */
  @Prop({ required: true })
  source: string; // 'manual_login', 'auto_relogin', 'copied', 'manual_input'

  /**
   * สถานะ ณ ตอนสกัด
   */
  @Prop({ default: 'success' })
  status: string; // 'success', 'failed', 'partial'

  /**
   * ผู้ดำเนินการ (ถ้ามี)
   */
  @Prop()
  performedBy: string;

  /**
   * IP Address ที่ทำการสกัด
   */
  @Prop()
  ipAddress: string;

  /**
   * ข้อมูลเพิ่มเติม
   */
  @Prop({ type: Object })
  metadata: Record<string, any>;

  /**
   * ข้อความ error (ถ้ามี)
   */
  @Prop()
  errorMessage: string;

  /**
   * ระยะเวลาที่ใช้ในการสกัด (ms)
   */
  @Prop()
  durationMs: number;
}

export const LineKeyHistorySchema = SchemaFactory.createForClass(LineKeyHistory);

// Indexes
LineKeyHistorySchema.index({ lineAccountId: 1, extractedAt: -1 });
LineKeyHistorySchema.index({ source: 1 });
LineKeyHistorySchema.index({ status: 1 });
LineKeyHistorySchema.index({ extractedAt: -1 });
