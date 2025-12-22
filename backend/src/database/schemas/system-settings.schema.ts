import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SystemSettingsDocument = SystemSettings & Document;

@Schema({ _id: false })
export class BankAccount {
  @Prop({ required: true })
  bankName: string;

  @Prop({ required: true })
  accountNumber: string;

  @Prop({ required: true })
  accountName: string;

  @Prop()
  bankCode: string;
}

@Schema({ timestamps: true, collection: 'system_settings' })
export class SystemSettings {
  @Prop({ default: 'main' })
  settingsId: string;

  // Public URL Settings
  @Prop()
  publicBaseUrl: string;

  // Slip API Settings
  @Prop()
  slipApiKey: string;

  @Prop({ default: 'thunder' })
  slipApiProvider: string;

  @Prop()
  slipApiKeySecondary: string;

  @Prop()
  slipApiProviderSecondary: string;

  @Prop({ default: false })
  slipApiFallbackEnabled: boolean;

  @Prop({ default: true })
  slipApiQuotaWarning: boolean;

  // AI Settings
  @Prop()
  aiApiKey: string;

  @Prop({ default: 'gpt-4-mini' })
  aiModel: string;

  // Payment Settings
  @Prop({ type: [BankAccount], default: [] })
  paymentBankAccounts: BankAccount[];

  // USDT Settings
  @Prop({ default: true })
  usdtEnabled: boolean;

  @Prop({ default: 'TRC20' })
  usdtNetwork: string;

  @Prop()
  usdtWalletAddress: string;

  @Prop()
  usdtQrImage: string;

  @Prop({ default: 'งดให้บริการชำระเงินด้วย USDT ชั่วคราว' })
  usdtDisabledMessage: string;

  // Quota Settings
  @Prop({ default: 'text' })
  quotaExceededResponseType: string;

  @Prop({ default: '⚠️ โควต้าการตรวจสอบสลิปของร้านค้านี้หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ' })
  quotaExceededMessage: string;

  @Prop({ default: 10 })
  quotaWarningThreshold: number;

  @Prop({ default: true })
  quotaWarningEnabled: boolean;

  @Prop({ default: '⚠️ โควต้าเหลือน้อยกว่า {threshold} สลิป กรุณาเติมแพ็คเกจ' })
  quotaLowWarningMessage: string;

  // Bot Disabled Settings
  @Prop({ default: false })
  botDisabledSendMessage: boolean;

  @Prop({ default: '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล' })
  botDisabledMessage: string;

  // Slip Verification Disabled Settings
  @Prop({ default: false })
  slipDisabledSendMessage: boolean;

  @Prop({ default: '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล' })
  slipDisabledMessage: string;

  // AI Disabled Settings
  @Prop({ default: false })
  aiDisabledSendMessage: boolean;

  @Prop({ default: '🔴 ระบบ AI ตอบกลับปิดให้บริการชั่วคราว' })
  aiDisabledMessage: string;

  // Duplicate Settings
  @Prop({ default: true })
  duplicateRefundEnabled: boolean;

  @Prop({ default: '⚠️ สลิปนี้เคยถูกใช้แล้ว กรุณาใช้สลิปใหม่' })
  duplicateSlipMessage: string;

  // Error Messages
  @Prop({ default: '❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง' })
  slipErrorMessage: string;

  @Prop({ default: '❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง' })
  imageDownloadErrorMessage: string;

  @Prop({ default: '❌ รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน' })
  invalidImageMessage: string;

  // Processing Messages
  @Prop({ default: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...' })
  slipProcessingMessage: string;

  @Prop({ default: true })
  showSlipProcessingMessage: boolean;

  // Auto Retry Settings
  @Prop({ default: 3 })
  maxRetryAttempts: number;

  @Prop({ default: 1000 })
  retryDelayMs: number;

  // Contact Settings
  @Prop()
  contactAdminUrl: string;

  @Prop()
  contactAdminLine: string;

  @Prop()
  contactAdminEmail: string;

  @Prop()
  updatedBy: string;
}

export const SystemSettingsSchema = SchemaFactory.createForClass(SystemSettings);

SystemSettingsSchema.index({ settingsId: 1 }, { unique: true });
