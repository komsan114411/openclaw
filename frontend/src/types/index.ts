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
  metadata?: any;
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

export interface LineAccountSettings {
  enableBot?: boolean;
  enableAi?: boolean;
  enableSlipVerification?: boolean;
  aiResponseMode?: string;
  aiImmediateMessage?: string;
  aiSystemPrompt?: string;
  aiTemperature?: number;
  aiFallbackMessage?: string;
  slipResponseMode?: string;
  slipImmediateMessage?: string;
  slipTemplateId?: string;
  slipTemplateIds?: Partial<Record<'success' | 'duplicate' | 'error' | 'not_found', string>>;
  autoReplyEnabled?: boolean;
  webhookEnabled?: boolean;
}

export interface Package {
  _id: string;
  name: string;
  price: number;
  priceUsdt?: number;
  slipQuota: number;
  durationDays: number;
  description?: string;
  features: string[];
  isFreeStarter: boolean;
  isActive: boolean;
  sortOrder: number;
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
  verificationResult?: any;
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
  quotaExceededResponseType: string;
  quotaExceededMessage: string;
  quotaWarningThreshold: number;
  quotaWarningEnabled: boolean;
  duplicateRefundEnabled: boolean;
  contactAdminUrl: string;
  contactAdminLine: string;
  contactAdminEmail: string;
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
