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

  @Prop()
  quotaExceededMessage: string;

  @Prop({ default: 10 })
  quotaWarningThreshold: number;

  @Prop({ default: true })
  quotaWarningEnabled: boolean;

  // Duplicate Settings
  @Prop({ default: true })
  duplicateRefundEnabled: boolean;

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
