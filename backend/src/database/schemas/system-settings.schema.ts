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

  // Reference to `banks.code` (e.g. KBANK, SCB) for showing logo/name consistently
  @Prop()
  bankCode?: string;
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

  // USDT API Keys (encrypted)
  @Prop()
  etherscanApiKey: string; // For ERC20 verification

  @Prop()
  bscscanApiKey: string; // For BEP20 verification

  @Prop()
  tronscanApiKey: string; // For TRC20 verification (optional, public API works)

  // USDT Auto-Verification
  @Prop({ default: true })
  usdtAutoVerify: boolean;

  // USDT configuration status (set automatically)
  @Prop({ default: false })
  usdtConfigured: boolean;

  // Quota Settings (control flags only - messages moved to SystemResponseTemplates)
  @Prop({ default: 10 })
  quotaWarningThreshold: number;

  @Prop({ default: true })
  quotaWarningEnabled: boolean;

  // Bot Disabled Settings (control flag only - message in SystemResponseTemplates)
  @Prop({ default: false })
  botDisabledSendMessage: boolean;

  // Global Slip Verification Settings (แอดมินเปิด/ปิดทั้งระบบ)
  @Prop({ default: true })
  globalSlipVerificationEnabled: boolean;

  // Global AI Settings (แอดมินเปิด/ปิด AI ทั้งระบบ)
  @Prop({ default: true })
  globalAiEnabled: boolean;

  // Default AI Models ที่อนุญาต
  @Prop({ type: [String], default: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'] })
  allowedAiModels: string[];

  // Slip Verification Disabled Settings (control flag only - message in SystemResponseTemplates)
  @Prop({ default: true })
  slipDisabledSendMessage: boolean;

  // AI Disabled Settings (control flag only - message in SystemResponseTemplates)
  @Prop({ default: false })
  aiDisabledSendMessage: boolean;

  // Duplicate Settings (control flag only - message in SlipTemplates)
  @Prop({ default: true })
  duplicateRefundEnabled: boolean;

  // Processing Settings (control flag only - message in SystemResponseTemplates)
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

  // Slip Preview Sample Data Settings (configurable by admin)
  @Prop({ default: 'นาย ธันเดอร์ มานะ' })
  previewSenderName: string;

  @Prop({ default: 'นาย ธันเดอร์ มานะ' })
  previewReceiverName: string;

  @Prop({ default: '004' })
  previewSenderBankCode: string;

  @Prop({ default: '014' })
  previewReceiverBankCode: string;

  @Prop({ default: '1,000.00' })
  previewAmount: string;

  // ===============================
  // Webhook Rate Limiting Settings
  // ===============================

  // Per LINE Account limits (per minute)
  @Prop({ default: true })
  webhookRateLimitEnabled: boolean;

  @Prop({ default: 100 })
  webhookRateLimitPerAccountPerMinute: number;

  @Prop({ default: 10 })
  webhookRateLimitPerAccountPerSecond: number;

  // Global limits (per minute)
  @Prop({ default: 1000 })
  webhookRateLimitGlobalPerMinute: number;

  @Prop({ default: 100 })
  webhookRateLimitGlobalPerSecond: number;

  // Rate limit response message
  @Prop({ default: 'Too many requests, please try again later' })
  webhookRateLimitMessage: string;

  // ===============================
  // Access Control Settings
  // ===============================

  /**
   * Allow new user registration
   */
  @Prop({ default: true })
  allowRegistration: boolean;

  /**
   * Message shown when registration is disabled
   */
  @Prop({ default: 'ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' })
  registrationDisabledMessage: string;

  /**
   * Allow user login
   */
  @Prop({ default: true })
  allowLogin: boolean;

  /**
   * Message shown when login is disabled
   */
  @Prop({ default: 'ระบบปิดให้บริการเข้าสู่ระบบชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' })
  loginDisabledMessage: string;

  // ===============================
  // Quota Reservation Cleanup Settings
  // ===============================

  /**
   * Enable automatic cleanup of stale quota reservations
   */
  @Prop({ default: true })
  quotaReservationCleanupEnabled: boolean;

  /**
   * Maximum age in minutes for quota reservations before cleanup
   * Default: 3 minutes (recommended: 2-3 minutes)
   */
  @Prop({ default: 3 })
  quotaReservationTimeoutMinutes: number;

  /**
   * How often to run the cleanup job in minutes
   * Default: 1 minute
   */
  @Prop({ default: 1 })
  quotaReservationCleanupIntervalMinutes: number;

  // ===============================
  // Slip Branding Settings
  // ===============================

  /**
   * Company/Brand name shown on slips
   */
  @Prop({ default: 'DooSlip' })
  slipBrandName: string;

  /**
   * Verification text shown at bottom of slip
   */
  @Prop({ default: 'สลิปจริง ตรวจสอบโดย DooSlip' })
  slipVerificationText: string;

  /**
   * Custom footer message
   */
  @Prop({ default: 'ผู้ให้บริการเช็คสลิปอันดับ 1' })
  slipFooterMessage: string;

  /**
   * Show PromptPay logo at bottom
   */
  @Prop({ default: true })
  slipShowPromptPayLogo: boolean;

  /**
   * Custom logo URL for slip branding
   */
  @Prop()
  slipBrandLogoUrl: string;

  /**
   * Custom logo as base64 (uploaded)
   */
  @Prop()
  slipBrandLogoBase64: string;

  /**
   * Button text for slip footer (optional)
   */
  @Prop()
  slipBrandButtonText: string;

  /**
   * Button URL for slip footer (must be https:// or tel:)
   */
  @Prop()
  slipBrandButtonUrl: string;

  /**
   * Primary color for success slips (hex)
   */
  @Prop({ default: '#22C55E' })
  slipSuccessColor: string;

  /**
   * Primary color for duplicate slips (hex)
   */
  @Prop({ default: '#F59E0B' })
  slipDuplicateColor: string;

  /**
   * Primary color for error slips (hex)
   */
  @Prop({ default: '#EF4444' })
  slipErrorColor: string;

  /**
   * Amount text color (hex)
   */
  @Prop({ default: '#1E3A5F' })
  slipAmountColor: string;

  @Prop()
  updatedBy: string;
}

export const SystemSettingsSchema = SchemaFactory.createForClass(SystemSettings);

SystemSettingsSchema.index({ settingsId: 1 }, { unique: true });
