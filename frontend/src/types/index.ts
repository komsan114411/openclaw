export interface User {
  _id: string;
  username: string;
  role: 'admin' | 'user';
  email?: string;
  fullName?: string;
  isActive: boolean;
  isBlocked?: boolean;
  blockedAt?: string;
  blockedBy?: string;
  blockedReason?: string;
  forcePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface ActivityLog {
  _id: string;
  actorUserId?: string;
  actorRole: 'admin' | 'user' | 'system';
  subjectUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LineAccount {
  _id: string;
  accountName: string;
  channelId: string;
  webhookSlug?: string; // Unique slug for webhook URL
  channelSecret: string;
  accessToken: string;
  ownerId: string;
  owner?: {
    _id: string;
    username: string;
    email?: string;
    fullName?: string;
    lineUserPicture?: string;
  };
  description?: string;
  settings?: LineAccountSettings;
  isActive: boolean;
  statistics?: {
    totalMessages: number;
    totalUsers: number;
    totalSlipsVerified: number;
    totalAiResponses: number;
    totalSlipErrors: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IntentRuleConfig {
  enabled: boolean;
  useAi: boolean;
  customPrompt: string;
  responseTemplate: string;
  confidenceThreshold?: number;
}

export interface LineAccountSettings {
  enableBot?: boolean;
  enableAi?: boolean;
  enableSlipVerification?: boolean;
  aiResponseMode?: string;
  aiImmediateMessage?: string;
  aiSystemPrompt?: string;
  aiTemperature?: number;
  aiFallbackMessage?: string;
  aiModel?: string;  // AI Model สำหรับบัญชีนี้ (null = ใช้ค่าจากระบบ)
  slipResponseMode?: string;
  slipImmediateMessage?: string;
  slipTemplateId?: string;
  slipTemplateIds?: Partial<Record<'success' | 'duplicate' | 'error' | 'not_found', string>>;
  autoReplyEnabled?: boolean;
  webhookEnabled?: boolean;
  // Custom messages per account
  customQuotaExceededMessage?: string;
  customBotDisabledMessage?: string;
  customSlipDisabledMessage?: string;
  customAiDisabledMessage?: string;
  customDuplicateSlipMessage?: string;
  customSlipErrorMessage?: string;
  customSlipSuccessMessage?: string;
  // Message sending options
  sendMessageWhenBotDisabled?: boolean | null;
  sendMessageWhenSlipDisabled?: boolean | null;
  sendMessageWhenAiDisabled?: boolean | null;
  sendMessageWhenAiQuotaExhausted?: boolean | null;
  sendProcessingMessage?: boolean;
  // Smart AI
  enableSmartAi?: boolean;
  smartAiClassifierModel?: string;
  duplicateDetectionWindowMinutes?: number;
  spamThresholdMessagesPerMinute?: number;
  gameLinks?: Array<{ name: string; url: string }>;
  knowledgeBase?: Array<{ topic: string; answer: string; enabled: boolean }>;
  intentRules?: Record<string, IntentRuleConfig>;
  // Smart AI Advanced
  smartAiConfidenceThreshold?: number;
  smartAiMaxTokens?: number;
  smartAiResponseDelayMs?: number;
  smartAiMaxRetries?: number;
  smartAiRetryDelayMs?: number;
  smartAiFallbackAction?: string;
}

export interface Package {
  _id: string;
  name: string;
  price: number;
  priceUsdt?: number;
  slipQuota: number;
  aiQuota?: number;  // AI quota ที่ได้รับ
  durationDays: number;
  description?: string;
  features: string[];
  isFreeStarter: boolean;
  isActive: boolean;
  sortOrder: number;
  maxPurchasesPerUser?: number | null; // จำนวนครั้งที่ซื้อได้ต่อผู้ใช้ (null/0 = ไม่จำกัด)
  isRecommended?: boolean; // แพ็คเกจแนะนำ - แสดงเป็น highlight
}

export interface Subscription {
  _id?: string;
  userId?: string;
  packageId?: string;
  packageName?: string;
  paymentId?: string;
  startDate?: string;
  endDate?: string;
  expiresAt?: string;
  quota?: number;
  remainingQuota?: number;
  slipsQuota?: number;
  slipsUsed?: number;
  slipsReserved?: number;
  status?: 'active' | 'expired' | 'cancelled';
}

export interface SlipVerificationResult {
  success?: boolean;
  data?: {
    sendingBank?: string;
    receivingBank?: string;
    sendingAccountName?: string;
    receivingAccountName?: string;
    amount?: number;
    transRef?: string;
    date?: string;
    time?: string;
  };
  error?: string;
  message?: string;
}

export interface Payment {
  _id: string;
  userId: string;
  packageId: string;
  amount: number;
  paymentType: 'bank_transfer' | 'usdt';
  status: 'pending' | 'verified' | 'rejected' | 'failed' | 'cancelled';
  transRef?: string;
  slipImageUrl?: string;
  transactionHash?: string;
  verificationResult?: SlipVerificationResult;
  adminNotes?: string;
  notes?: string;
  rejectionReason?: string;
  createdAt: string;
  verifiedAt?: string;
  rejectedAt?: string;
}

export interface QuotaInfo {
  hasQuota: boolean;
  remainingQuota: number;
  totalQuota: number;
  usedQuota: number;
  reservedQuota: number;
  activeSubscriptions: number;
  // AI Quota
  aiHasQuota?: boolean;
  aiRemainingQuota?: number;
  aiTotalQuota?: number;
  aiUsedQuota?: number;
}

export interface ChatMessage {
  _id: string;
  lineAccountId: string;
  lineUserId: string;
  lineUserName?: string;
  direction: 'in' | 'out';
  messageType: 'text' | 'image' | 'sticker' | 'flex' | 'other';
  messageText?: string;
  createdAt: string;
}

export interface SystemSettings {
  slipApiKeyPreview: string;
  aiApiKeyPreview: string;
  publicBaseUrl?: string;
  slipApiProvider: string;
  aiModel: string;
  bankAccounts: BankAccount[];
  usdtEnabled: boolean;
  usdtNetwork: string;
  usdtWalletAddress: string;
  usdtQrImage: string;
  usdtDisabledMessage: string;
  // Control flags only - messages managed via SystemResponseTemplates
  quotaWarningThreshold: number;
  quotaWarningEnabled: boolean;
  duplicateRefundEnabled: boolean;
  contactAdminUrl: string;
  contactAdminLine: string;
  contactAdminEmail: string;
  // Slip Preview Sample Data Settings
  previewSenderName?: string;
  previewReceiverName?: string;
  previewSenderBankCode?: string;
  previewReceiverBankCode?: string;
  previewAmount?: string;
  // Global AI Settings
  globalAiEnabled?: boolean;
  allowedAiModels?: string[];
  aiDisabledSendMessage?: boolean;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
  bankCode?: string;
  bank?: {
    code: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    shortName?: string;
    logoUrl?: string;
    logoBase64?: string;
  };
}

export interface Bank {
  _id: string;
  code: string;
  name: string;
  nameTh?: string;
  nameEn?: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  logoBase64?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface SlipTemplateListItem {
  _id: string;
  name: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault?: boolean;
  isGlobal?: boolean;
  description?: string;
  // Design fields for preview
  primaryColor?: string;
  secondaryColor?: string;
  headerText?: string;
  footerText?: string;
  // Display toggle fields
  showAmount?: boolean;
  showSender?: boolean;
  showReceiver?: boolean;
  showDate?: boolean;
  showTime?: boolean;
  showTransRef?: boolean;
  showBankLogo?: boolean;
  showFee?: boolean;
  showSenderAccount?: boolean;
  showReceiverAccount?: boolean;
  // Advanced styling
  themePreset?: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  headerIcon?: string;
  amountColor?: string;
  bodyBackgroundColor?: string;
  cardBackgroundColor?: string;
  showFooterBranding?: boolean;
  footerBrandingText?: string;
  footerBrandingName?: string;
  layoutStyle?: string;
}

export interface WalletTransaction {
  _id: string;
  userId?: string;
  type: 'deposit' | 'purchase' | 'refund' | 'bonus' | 'adjustment' | 'subscription';
  amount: number;
  balanceBefore?: number;
  balanceAfter: number;
  description: string;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled' | 'approved' | 'success' | 'failed';
  createdAt: string;
  slipImage?: string;
  metadata?: Record<string, any>;
}

export interface WalletBalance {
  balance: number;
  totalDeposited?: number;
  totalSpent?: number;
}

export interface UsdtSettings {
  enabled: boolean;
  address?: string;
  walletAddress?: string;  // Alias for address
  network: string;
  qrImage?: string;
  qrCodeUrl?: string;  // Alias for qrImage
  disabledMessage?: string;
  autoVerify?: boolean;
}

export interface UnifiedTransaction {
  _id: string;
  type: 'package' | 'deposit' | 'purchase' | 'bonus' | 'refund' | 'adjustment';
  amount: number;
  status: string;
  description: string;
  createdAt: string;
  slipImageUrl?: string;
  paymentType?: string;
  source: 'payment' | 'wallet';
}
