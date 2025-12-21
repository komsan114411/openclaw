export interface User {
  _id: string;
  username: string;
  role: 'admin' | 'user';
  email?: string;
  fullName?: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface LineAccount {
  _id: string;
  accountName: string;
  channelId: string;
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
  verificationResult?: any;
  adminNotes?: string;
  createdAt: string;
  verifiedAt?: string;
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
}
