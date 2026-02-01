import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LineSessionDocument = LineSession & Document;

/**
 * LINE Session Schema
 * เก็บ keys ที่สกัดได้จาก LINE Login
 *
 * Collection: line_sessions
 * แยกอิสระจาก line_accounts - ใช้แค่ lineAccountId อ้างอิง
 */
@Schema({
  collection: 'line_sessions',
  timestamps: true,
})
export class LineSession {
  /**
   * เจ้าของ Session (userId)
   * ใช้สำหรับ ownership check
   */
  @Prop({ required: true, index: true })
  ownerId: string;

  /**
   * ชื่อที่ผู้ใช้ตั้ง เช่น "LINE ส่วนตัว", "LINE งาน"
   */
  @Prop({ required: true })
  name: string;

  /**
   * อ้างอิง LINE Account (optional - ไม่จำเป็นต้องมี)
   * เก็บเป็น string ไม่ใช่ ObjectId ref เพื่อให้ module นี้เป็นอิสระ
   */
  @Prop({ index: true })
  lineAccountId: string;

  /**
   * LINE Email สำหรับ auto login
   */
  @Prop()
  lineEmail: string;

  /**
   * LINE Password (encrypted)
   * ใช้ AES encryption
   */
  @Prop()
  linePassword: string;

  /**
   * รหัสธนาคาร (e.g., '014' = SCB, '030' = GSB, '004' = KBANK)
   */
  @Prop()
  bankCode: string;

  /**
   * ชื่อธนาคาร
   */
  @Prop()
  bankName: string;

  /**
   * เลขบัญชีธนาคาร
   */
  @Prop()
  accountNumber: string;

  /**
   * ChatMid - ID ของ chat กับ LINE OA ธนาคาร
   * ใช้สำหรับดึงข้อความ
   */
  @Prop()
  chatMid: string;

  /**
   * ยอดเงินคงเหลือล่าสุด
   */
  @Prop({ default: '0' })
  balance: string;

  /**
   * LINE Access Token
   * ใช้สำหรับ authenticate กับ LINE API
   */
  @Prop()
  xLineAccess: string;

  /**
   * HMAC Signature
   * ใช้สำหรับ sign requests
   */
  @Prop()
  xHmac: string;

  /**
   * User Agent ที่ใช้ตอนสกัด keys
   */
  @Prop()
  userAgent: string;

  /**
   * LINE Chrome Extension Version
   */
  @Prop({ default: '3.4.0' })
  lineVersion: string;

  /**
   * เวลาที่สกัด keys
   */
  @Prop({ default: Date.now })
  extractedAt: Date;

  /**
   * เวลาหมดอายุ (ถ้าทราบ)
   */
  @Prop()
  expiresAt: Date;

  /**
   * เวลาที่ตรวจสอบ keys ล่าสุด
   */
  @Prop()
  lastCheckedAt: Date;

  /**
   * ผลการตรวจสอบล่าสุด
   */
  @Prop({ default: 'unknown' })
  lastCheckResult: string; // 'valid', 'expired', 'error', 'unknown'

  /**
   * Session ที่ใช้งานอยู่หรือไม่
   */
  @Prop({ default: true })
  isActive: boolean;

  /**
   * แหล่งที่มาของ keys
   */
  @Prop({ default: 'manual' })
  source: string; // 'manual_login', 'auto_relogin', 'copied', 'manual_input'

  /**
   * สถานะ session
   */
  @Prop({ default: 'active' })
  status: string; // 'active', 'expired', 'invalid', 'pending_relogin'

  /**
   * จำนวนครั้งที่ตรวจสอบแล้วล้มเหลวติดต่อกัน
   */
  @Prop({ default: 0 })
  consecutiveFailures: number;

  /**
   * ข้อมูลเพิ่มเติม
   */
  @Prop({ type: Object })
  metadata: Record<string, any>;

  /**
   * cURL Bash Command (for copying)
   * สร้างจาก keys ที่สกัดได้
   */
  @Prop()
  cUrlBash: string;

  /**
   * ผู้ดำเนินการล็อกอินล่าสุด
   */
  @Prop()
  performedBy: string;
}

export const LineSessionSchema = SchemaFactory.createForClass(LineSession);

// Indexes
LineSessionSchema.index({ ownerId: 1, isActive: 1 });
LineSessionSchema.index({ lineAccountId: 1, isActive: 1 });
LineSessionSchema.index({ status: 1 });
LineSessionSchema.index({ expiresAt: 1 });
LineSessionSchema.index({ lastCheckedAt: 1 });
