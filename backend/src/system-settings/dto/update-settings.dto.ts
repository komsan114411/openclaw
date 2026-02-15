import { IsString, IsBoolean, IsNumber, IsArray, IsOptional, Min, Max, IsUrl, Matches } from 'class-validator';

/**
 * DTO for updating system settings
 * Only fields defined here can be updated - prevents mass assignment attacks
 */
export class UpdateSystemSettingsDto {
  // Public URL Settings
  @IsOptional()
  @IsString()
  publicBaseUrl?: string;

  // Slip API Settings
  @IsOptional()
  @IsString()
  slipApiKey?: string;

  @IsOptional()
  @IsString()
  slipApiProvider?: string;

  @IsOptional()
  @IsString()
  slipApiKeySecondary?: string;

  @IsOptional()
  @IsString()
  slipApiProviderSecondary?: string;

  @IsOptional()
  @IsBoolean()
  slipApiFallbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  slipApiQuotaWarning?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  slipProviderFailoverOrder?: string[];

  @IsOptional()
  @IsString()
  slipApiKeyThunder?: string;

  @IsOptional()
  @IsString()
  slipApiKeySlipMate?: string;

  // AI Settings
  @IsOptional()
  @IsString()
  aiApiKey?: string;

  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsBoolean()
  globalAiEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedAiModels?: string[];

  @IsOptional()
  @IsBoolean()
  aiDisabledSendMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  aiQuotaExhaustedSendMessage?: boolean;

  // USDT Settings
  @IsOptional()
  @IsBoolean()
  usdtEnabled?: boolean;

  @IsOptional()
  @IsString()
  usdtNetwork?: string;

  @IsOptional()
  @IsString()
  usdtWalletAddress?: string;

  @IsOptional()
  @IsString()
  usdtQrImage?: string;

  @IsOptional()
  @IsString()
  usdtDisabledMessage?: string;

  @IsOptional()
  @IsString()
  etherscanApiKey?: string;

  @IsOptional()
  @IsString()
  bscscanApiKey?: string;

  @IsOptional()
  @IsString()
  tronscanApiKey?: string;

  @IsOptional()
  @IsBoolean()
  usdtAutoVerify?: boolean;

  // Quota Settings
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quotaWarningThreshold?: number;

  @IsOptional()
  @IsBoolean()
  quotaWarningEnabled?: boolean;

  // Bot/Slip Settings
  @IsOptional()
  @IsBoolean()
  botDisabledSendMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  globalSlipVerificationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  slipDisabledSendMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  duplicateRefundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  showSlipProcessingMessage?: boolean;

  // Auto Retry Settings
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxRetryAttempts?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(10000)
  retryDelayMs?: number;

  // Contact Settings
  @IsOptional()
  @IsString()
  contactAdminUrl?: string;

  @IsOptional()
  @IsString()
  contactAdminLine?: string;

  @IsOptional()
  @IsString()
  contactAdminEmail?: string;

  // Preview Settings
  @IsOptional()
  @IsString()
  previewSenderName?: string;

  @IsOptional()
  @IsString()
  previewReceiverName?: string;

  @IsOptional()
  @IsString()
  previewSenderBankCode?: string;

  @IsOptional()
  @IsString()
  previewReceiverBankCode?: string;

  @IsOptional()
  @IsString()
  previewAmount?: string;

  // Webhook Rate Limiting
  @IsOptional()
  @IsBoolean()
  webhookRateLimitEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(10000)
  webhookRateLimitPerAccountPerMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  webhookRateLimitPerAccountPerSecond?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(100000)
  webhookRateLimitGlobalPerMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(10000)
  webhookRateLimitGlobalPerSecond?: number;

  @IsOptional()
  @IsString()
  webhookRateLimitMessage?: string;

  // Access Control
  @IsOptional()
  @IsBoolean()
  allowRegistration?: boolean;

  @IsOptional()
  @IsString()
  registrationDisabledMessage?: string;

  @IsOptional()
  @IsBoolean()
  allowLogin?: boolean;

  @IsOptional()
  @IsString()
  loginDisabledMessage?: string;

  // Quota Reservation Cleanup
  @IsOptional()
  @IsBoolean()
  quotaReservationCleanupEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  quotaReservationTimeoutMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  quotaReservationCleanupIntervalMinutes?: number;

  // Slip Branding
  @IsOptional()
  @IsString()
  slipBrandName?: string;

  @IsOptional()
  @IsString()
  slipVerificationText?: string;

  @IsOptional()
  @IsString()
  slipFooterMessage?: string;

  @IsOptional()
  @IsBoolean()
  slipShowPromptPayLogo?: boolean;

  @IsOptional()
  @IsString()
  slipBrandLogoUrl?: string;

  @IsOptional()
  @IsString()
  slipBrandLogoBase64?: string;

  @IsOptional()
  @IsString()
  slipBrandButtonText?: string;

  @IsOptional()
  @IsString()
  slipBrandButtonUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be hex format (e.g. #22C55E)' })
  slipSuccessColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be hex format (e.g. #F59E0B)' })
  slipDuplicateColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be hex format (e.g. #EF4444)' })
  slipErrorColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be hex format (e.g. #1E3A5F)' })
  slipAmountColor?: string;

  // Floating Contact Button
  @IsOptional()
  @IsBoolean()
  floatingContactEnabled?: boolean;

  @IsOptional()
  @IsString()
  floatingContactUrl?: string;

  @IsOptional()
  @IsString()
  floatingContactIconUrl?: string;

  @IsOptional()
  @IsString()
  floatingContactIconBase64?: string;

  @IsOptional()
  @IsNumber()
  @Min(24)
  @Max(200)
  floatingContactSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  floatingContactBottom?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  floatingContactRight?: number;

  @IsOptional()
  @IsString()
  floatingContactTooltip?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be hex format (e.g. #25D366)' })
  floatingContactBgColor?: string;

  @IsOptional()
  @IsBoolean()
  floatingContactShowOnMobile?: boolean;

  // Site Branding
  @IsOptional()
  @IsString()
  siteLogoBase64?: string;

  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  siteTagline?: string;

  // LINE Session Settings
  @IsOptional()
  @IsBoolean()
  lineSessionHealthCheckEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  lineSessionHealthCheckIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  lineSessionAutoReloginEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(60)
  lineSessionReloginCheckIntervalMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  lineSessionMaxConsecutiveFailures?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  lineSessionExpiryWarningMinutes?: number;
}
