import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SystemResponseTemplateDocument = SystemResponseTemplate & Document;

// ประเภทของ System Response Template
export enum SystemResponseType {
  NO_SLIP_FOUND = 'no_slip_found',        // ไม่พบสลิปในรูป
  QR_UNCLEAR = 'qr_unclear',              // QR code ไม่ชัด
  QUOTA_EXCEEDED = 'quota_exceeded',      // โควต้าหมด
  QUOTA_LOW = 'quota_low',                // โควต้าใกล้หมด
  INVALID_IMAGE = 'invalid_image',        // รูปไม่ถูกต้อง
  IMAGE_DOWNLOAD_ERROR = 'image_download_error', // ดาวน์โหลดรูปไม่ได้
  GENERAL_ERROR = 'general_error',        // ข้อผิดพลาดทั่วไป
  BOT_DISABLED = 'bot_disabled',          // บอทปิดให้บริการ
  SLIP_DISABLED = 'slip_disabled',        // ระบบตรวจสลิปปิด
  PROCESSING = 'processing',              // กำลังประมวลผล
}

// รูปแบบการตอบกลับ
export enum ResponseFormat {
  TEXT = 'text',
  FLEX = 'flex',
}

@Schema({ _id: false })
export class ResponseStyling {
  @Prop({ default: '#FF6B6B' })
  primaryColor: string;

  @Prop({ default: '#FFFFFF' })
  textColor: string;

  @Prop({ default: '#FFF5F5' })
  backgroundColor: string;

  @Prop({ default: '❌' })
  icon: string;

  @Prop({ default: true })
  showIcon: boolean;

  @Prop({ default: true })
  showContactButton: boolean;

  @Prop({ default: 'ติดต่อผู้ดูแล' })
  contactButtonText: string;

  @Prop()
  contactButtonUrl: string;

  @Prop({ default: true })
  showRetryButton: boolean;

  @Prop({ default: 'ลองใหม่อีกครั้ง' })
  retryButtonText: string;
}

@Schema({ timestamps: true, collection: 'system_response_templates' })
export class SystemResponseTemplate {
  @Prop({
    required: true,
    enum: SystemResponseType,
    unique: true,
  })
  type: SystemResponseType;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({
    required: true,
    enum: ResponseFormat,
    default: ResponseFormat.FLEX,
  })
  responseFormat: ResponseFormat;

  // ข้อความ Text (ใช้เมื่อ responseFormat = text)
  @Prop({ required: true })
  textMessage: string;

  // หัวข้อ (สำหรับ Flex Message)
  @Prop()
  title: string;

  // ข้อความหลัก (สำหรับ Flex Message)
  @Prop()
  mainMessage: string;

  // ข้อความรอง (สำหรับ Flex Message)
  @Prop()
  subMessage: string;

  // Flex Template แบบ Custom (ถ้าต้องการ override)
  @Prop({ type: Object })
  customFlexTemplate: Record<string, any>;

  // ใช้ Custom Template หรือไม่
  @Prop({ default: false })
  useCustomTemplate: boolean;

  // Styling Options
  @Prop({ type: ResponseStyling, default: () => ({}) })
  styling: ResponseStyling;

  // สถานะการใช้งาน
  @Prop({ default: true })
  isActive: boolean;

  // ลำดับการแสดง
  @Prop({ default: 0 })
  sortOrder: number;

  // แก้ไขล่าสุดโดย
  @Prop()
  updatedBy: string;
}

export const SystemResponseTemplateSchema = SchemaFactory.createForClass(SystemResponseTemplate);

// Indexes
SystemResponseTemplateSchema.index({ type: 1 }, { unique: true });
SystemResponseTemplateSchema.index({ isActive: 1 });
SystemResponseTemplateSchema.index({ sortOrder: 1 });
