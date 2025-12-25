import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type LineAccountDocument = LineAccount & Document;

@Schema({ _id: false })
export class LineAccountSettings {
  @Prop({ default: true })
  enableBot: boolean;

  @Prop({ default: false })
  enableAi: boolean;

  @Prop({ default: true })
  enableSlipVerification: boolean;

  @Prop({ default: 'immediate' })
  aiResponseMode: string;

  @Prop({ default: 'กำลังประมวลผล กรุณารอสักครู่...' })
  aiImmediateMessage: string;

  @Prop()
  aiCustomResponse: string;

  @Prop({ default: 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์' })
  aiSystemPrompt: string;

  @Prop({ default: 0.7 })
  aiTemperature: number;

  @Prop({ default: 'ขอบคุณสำหรับข้อความของคุณ' })
  aiFallbackMessage: string;

  @Prop({ default: 'immediate' })
  slipResponseMode: string;

  @Prop({ default: 'ขอบคุณสำหรับสลิป กำลังตรวจสอบ...' })
  slipImmediateMessage: string;

  @Prop()
  slipTemplateId: string;

  // Template selection per result type (success/duplicate/error/not_found)
  // Used by slip verification to pick the correct template automatically.
  @Prop({ type: Object, default: () => ({}) })
  slipTemplateIds: Record<string, string>;

  @Prop({ default: true })
  autoReplyEnabled: boolean;

  @Prop({ default: true })
  webhookEnabled: boolean;

  // Custom Messages (per account) - if empty, use system settings
  @Prop()
  customQuotaExceededMessage: string;

  @Prop()
  customBotDisabledMessage: string;

  @Prop()
  customSlipDisabledMessage: string;

  @Prop()
  customAiDisabledMessage: string;

  @Prop()
  customDuplicateSlipMessage: string;

  @Prop()
  customSlipErrorMessage: string;

  @Prop()
  customSlipSuccessMessage: string;

  // ============================================
  // ตัวเลือกการส่งข้อความ - ผู้ใช้เลือกได้
  // null = ใช้ค่าจากระบบ, true = ส่ง, false = ไม่ส่ง
  // ============================================
  
  // ส่งข้อความเมื่อบอทปิด
  @Prop({ type: Boolean, default: null })
  sendMessageWhenBotDisabled: boolean;

  // ส่งข้อความเมื่อระบบตรวจสลิปปิด
  @Prop({ type: Boolean, default: null })
  sendMessageWhenSlipDisabled: boolean;

  // ส่งข้อความเมื่อ AI ปิด
  @Prop({ type: Boolean, default: null })
  sendMessageWhenAiDisabled: boolean;
  
  // ส่งข้อความ "กำลังประมวลผล" ก่อนตรวจสลิป (ผู้ใช้เลือกได้)
  // true = ส่งก่อนแล้วค่อยส่งผล, false = ตรวจสอบแล้วส่งผลทีเดียว
  @Prop({ type: Boolean, default: true })
  sendProcessingMessage: boolean;

  // Slip Template Settings
  @Prop({ type: Object })
  slipSuccessTemplate: Record<string, any>; // Flex message template for success

  @Prop({ type: Object })
  slipDuplicateTemplate: Record<string, any>; // Flex message template for duplicate

  @Prop({ type: Object })
  slipErrorTemplate: Record<string, any>; // Flex message template for error
}

@Schema({ _id: false })
export class LineAccountStatistics {
  @Prop({ default: 0 })
  totalMessages: number;

  @Prop({ default: 0 })
  totalUsers: number;

  @Prop({ default: 0 })
  totalSlipsVerified: number;

  @Prop({ default: 0 })
  totalAiResponses: number;
}

@Schema({ timestamps: true, collection: 'line_accounts' })
export class LineAccount {
  @Prop({ required: true, unique: true, index: true })
  accountName: string;

  @Prop({ required: true, unique: true, index: true })
  channelId: string;

  // Webhook slug - unique identifier for webhook URL (auto-generated)
  // ใช้แทน channelId ใน URL เพื่อความปลอดภัยและป้องกันการซ้ำ
  @Prop({ unique: true, index: true })
  webhookSlug: string;

  @Prop({ required: true })
  channelSecret: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop()
  description: string;

  @Prop({ type: LineAccountSettings, default: () => ({}) })
  settings: LineAccountSettings;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastWebhookReceived: Date;

  @Prop({ type: LineAccountStatistics, default: () => ({}) })
  statistics: LineAccountStatistics;
}

export const LineAccountSchema = SchemaFactory.createForClass(LineAccount);
