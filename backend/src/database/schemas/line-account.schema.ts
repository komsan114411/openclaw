import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type LineAccountDocument = LineAccount & Document;

@Schema({ _id: false })
export class LineAccountSettings {
  @Prop({ default: true })
  botEnabled: boolean;

  @Prop({ default: false })
  aiEnabled: boolean;

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

  @Prop({ default: true })
  slipVerificationEnabled: boolean;

  @Prop({ default: 'immediate' })
  slipResponseMode: string;

  @Prop({ default: 'ขอบคุณสำหรับสลิป กำลังตรวจสอบ...' })
  slipImmediateMessage: string;

  @Prop()
  slipTemplateId: string;

  @Prop({ default: true })
  autoReplyEnabled: boolean;

  @Prop({ default: true })
  webhookEnabled: boolean;
}

@Schema({ _id: false })
export class LineAccountStatistics {
  @Prop({ default: 0 })
  totalMessages: number;

  @Prop({ default: 0 })
  totalUsers: number;

  @Prop({ default: 0 })
  totalSlipsVerified: number;
}

@Schema({ timestamps: true, collection: 'line_accounts' })
export class LineAccount {
  @Prop({ required: true, unique: true })
  accountName: string;

  @Prop({ required: true, unique: true })
  channelId: string;

  @Prop({ required: true })
  channelSecret: string;

  @Prop({ required: true })
  channelAccessToken: string;

  @Prop({ required: true })
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

LineAccountSchema.index({ accountName: 1 }, { unique: true });
LineAccountSchema.index({ channelId: 1 }, { unique: true });
LineAccountSchema.index({ ownerId: 1 });
