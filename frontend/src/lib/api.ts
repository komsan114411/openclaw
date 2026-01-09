import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Debug log for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { name?: string; email?: string }) =>
    api.put('/auth/profile', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/password', { currentPassword, newPassword }),
};

// LINE Accounts API
export const lineAccountsApi = {
  getMyAccounts: () => api.get('/line-accounts/my'),
  getById: (id: string) => api.get(`/line-accounts/${id}`),
  create: (data: {
    accountName: string;
    channelId: string;
    channelSecret: string;
    accessToken: string;
  }) => api.post('/line-accounts', data),
  update: (id: string, data: {
    accountName?: string;
    channelId?: string;
    channelSecret?: string;
    accessToken?: string;
  }) => api.put(`/line-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/line-accounts/${id}`),
  updateSettings: (id: string, settings: Record<string, unknown>) =>
    api.put(`/line-accounts/${id}/settings`, { settings }),
  getStatistics: (id: string) => api.get(`/line-accounts/${id}/statistics`),
  testConnection: (id: string) => api.post(`/line-accounts/${id}/test-connection`),
  getWebhookUrl: (id: string) => api.get(`/line-accounts/${id}/webhook-url`),
  regenerateWebhookSlug: (id: string) => api.post(`/line-accounts/${id}/regenerate-webhook-slug`),
};

// Admin LINE Accounts API
export const adminLineAccountsApi = {
  getAll: () => api.get('/admin/line-accounts'),
  getById: (id: string) => api.get(`/admin/line-accounts/${id}`),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/admin/line-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/admin/line-accounts/${id}`),
};

// Subscriptions API
export const subscriptionsApi = {
  getMy: () => api.get('/subscriptions/my'),
  getQuota: () => api.get('/subscriptions/quota'),
  purchase: (packageId: string) => api.post('/subscriptions/purchase', { packageId }),
  getHistory: () => api.get('/subscriptions/history'),
};

// Admin Subscriptions API
export const adminSubscriptionsApi = {
  getAll: () => api.get('/admin/subscriptions'),
  getByUser: (userId: string) => api.get(`/admin/subscriptions/user/${userId}`),
  create: (data: { userId: string; packageId: string; quota: number; expiresAt?: string }) =>
    api.post('/admin/subscriptions', data),
  update: (id: string, data: { quota?: number; expiresAt?: string; isActive?: boolean }) =>
    api.put(`/admin/subscriptions/${id}`, data),
  addQuota: (id: string, amount: number) =>
    api.post(`/admin/subscriptions/${id}/add-quota`, { amount }),
  deductQuota: (id: string, amount: number) =>
    api.post(`/admin/subscriptions/${id}/deduct-quota`, { amount }),
};

// Packages API
export const packagesApi = {
  getAll: () => api.get('/packages'),
  getActive: () => api.get('/packages/active'),
  getById: (id: string) => api.get(`/packages/${id}`),
};

// Admin Packages API
export const adminPackagesApi = {
  getAll: () => api.get('/admin/packages'),
  create: (data: {
    name: string;
    description?: string;
    quota: number;
    price: number;
    validDays: number;
    isActive?: boolean;
    features?: string[];
  }) => api.post('/admin/packages', data),
  update: (id: string, data: {
    name?: string;
    description?: string;
    quota?: number;
    price?: number;
    validDays?: number;
    isActive?: boolean;
    features?: string[];
  }) => api.put(`/admin/packages/${id}`, data),
  delete: (id: string) => api.delete(`/admin/packages/${id}`),
};

// Users API (Admin)
export const adminUsersApi = {
  getAll: () => api.get('/admin/users'),
  getById: (id: string) => api.get(`/admin/users/${id}`),
  update: (id: string, data: { name?: string; email?: string; role?: string; isActive?: boolean }) =>
    api.put(`/admin/users/${id}`, data),
  delete: (id: string) => api.delete(`/admin/users/${id}`),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/admin/users/${id}/reset-password`, { newPassword }),
};

// Slip History API
export const slipHistoryApi = {
  getMy: (params?: { limit?: number; status?: string }) =>
    api.get('/slip-history/my', { params }),
  getByAccount: (accountId: string, params?: { limit?: number; status?: string }) =>
    api.get(`/slip-history/account/${accountId}`, { params }),
};

// Admin Slip History API
export const adminSlipHistoryApi = {
  getAll: (params?: { limit?: number; status?: string; userId?: string }) =>
    api.get('/admin/slip-history', { params }),
  getStatistics: () => api.get('/admin/slip-history/statistics'),
};

// System Settings API
export const systemSettingsApi = {
  get: () => api.get('/system-settings'),
  update: (data: Record<string, unknown>) => api.put('/system-settings', data),
  getPublic: () => api.get('/system-settings/public'),
  getPreviewConfig: () => api.get('/system-settings/preview-config'),
  updatePreviewConfig: (config: {
    senderName?: string;
    receiverName?: string;
    senderBankCode?: string;
    receiverBankCode?: string;
    amount?: string;
  }) => api.put('/system-settings/preview-config', { previewConfig: config }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getAdminStats: () => api.get('/admin/dashboard/stats'),
};

// Banks API
export const banksApi = {
  getAll: () => api.get('/banks'),
  getActive: () => api.get('/banks/active'),
  getById: (id: string) => api.get(`/banks/${id}`),
  getByCode: (code: string) => api.get(`/banks/code/${code}`),
};

// Admin Banks API
export const adminBanksApi = {
  getAll: () => api.get('/admin/banks'),
  create: (data: {
    code: string;
    name: string;
    shortName?: string;
    color?: string;
    logoUrl?: string;
    isActive?: boolean;
  }) => api.post('/admin/banks', data),
  update: (id: string, data: {
    code?: string;
    name?: string;
    shortName?: string;
    color?: string;
    logoUrl?: string;
    isActive?: boolean;
  }) => api.put(`/admin/banks/${id}`, data),
  delete: (id: string) => api.delete(`/admin/banks/${id}`),
  uploadLogo: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post(`/admin/banks/${id}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  initDefaults: () => api.post('/admin/banks/init-defaults'),
};

// System Response Templates API
export const systemResponseTemplatesApi = {
  getAll: () => api.get('/system-response-templates'),
  getByType: (type: string) => api.get(`/system-response-templates/${type}`),
  update: (type: string, data: {
    textMessage?: string;
    flexTemplate?: Record<string, unknown>;
    isActive?: boolean;
    useFlexMessage?: boolean;
  }) => api.put(`/system-response-templates/${type}`, data),
  preview: (type: string) => api.get(`/system-response-templates/${type}/preview`),
  reset: (type: string) => api.post(`/system-response-templates/${type}/reset`),
  initDefaults: () => api.post('/system-response-templates/init-defaults'),
};

// Configurable Messages API
export const configurableMessagesApi = {
  getAll: () => api.get('/configurable-messages'),
  getByKey: (key: string) => api.get(`/configurable-messages/${key}`),
  update: (key: string, data: {
    message?: string;
    isEnabled?: boolean;
    flexTemplate?: Record<string, unknown>;
    useFlexMessage?: boolean;
  }) => api.put(`/configurable-messages/${key}`, data),
  reset: (key: string) => api.post(`/configurable-messages/${key}/reset`),
  preview: (key: string) => api.get(`/configurable-messages/${key}/preview`),
};

// Thunder API (Slip Verification Service)
export const thunderApi = {
  getQuota: (customToken?: string) =>
    api.get('/thunder/quota', customToken ? { headers: { 'X-Custom-Token': customToken } } : {}),
  testConnection: (apiKey: string) =>
    api.post('/thunder/test-connection', { apiKey }),
  verifySlip: (file: File, customToken?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/thunder/verify', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(customToken ? { 'X-Custom-Token': customToken } : {}),
      },
    });
  },
};

// Chatbot API
export const chatbotApi = {
  getSettings: () => api.get('/chatbot/settings'),
  updateSettings: (data: {
    provider?: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }) => api.put('/chatbot/settings', data),
  testConnection: (apiKey: string) =>
    api.post('/chatbot/test-connection', { apiKey }),
  test: (message: string, systemPrompt?: string) =>
    api.post('/chatbot/test', { message, systemPrompt }),
};

// Chat Messages API
export const chatMessagesApi = {
  getUsers: (accountId: string) =>
    api.get(`/chat-messages/accounts/${accountId}/users`),
  getMessages: (accountId: string, lineUserId: string, limit?: number) =>
    api.get(`/chat-messages/accounts/${accountId}/users/${lineUserId}`, { params: { limit } }),
  sendMessage: (accountId: string, lineUserId: string, message: string) =>
    api.post(`/chat-messages/accounts/${accountId}/users/${lineUserId}/send`, { message }),
};

// Slip Template Data Types
export interface CreateSlipTemplateData {
  name: string;
  description?: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault?: boolean;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  showAmount?: boolean;
  showSender?: boolean;
  showReceiver?: boolean;
  showDate?: boolean;
  showTime?: boolean;
  showTransRef?: boolean;
  showBankLogo?: boolean;
  showFee?: boolean;
  showRefs?: boolean;
  showSenderAccount?: boolean;
  showReceiverAccount?: boolean;
  showReceiverProxy?: boolean;
  flexTemplate?: Record<string, unknown>;
  textTemplate?: string;
}

export interface UpdateSlipTemplateData extends Partial<CreateSlipTemplateData> {
  isActive?: boolean;
  isDefault?: boolean;
}

// Slip Templates API (for LINE Account specific templates)
export const slipTemplatesApi = {
  // Get all templates for a LINE account (includes global templates)
  getAll: (accountId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates`),
  // Get global templates (for user selection)
  getGlobal: () =>
    api.get('/slip-templates/global'),
  // Get template list (simplified)
  getList: (accountId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates-list`),
  // Create template for a LINE account
  create: (accountId: string, data: CreateSlipTemplateData) =>
    api.post(`/line-accounts/${accountId}/slip-templates`, data),
  // Update template
  update: (accountId: string, templateId: string, data: UpdateSlipTemplateData) =>
    api.put(`/line-accounts/${accountId}/slip-templates/${templateId}`, data),
  // Delete template
  delete: (accountId: string, templateId: string) =>
    api.delete(`/line-accounts/${accountId}/slip-templates/${templateId}`),
  // Set template as default
  setDefault: (accountId: string, templateId: string) =>
    api.put(`/line-accounts/${accountId}/slip-templates/${templateId}/default`),
  // Preview template
  preview: (accountId: string, templateId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates/${templateId}/preview`),
  // Initialize default templates for account
  initDefaults: (accountId: string) =>
    api.post(`/line-accounts/${accountId}/slip-templates/init-defaults`),
  // Check template usage before delete
  checkUsage: (accountId: string, templateId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates/${templateId}/usage`),
  // Safe delete with usage check
  safeDelete: (accountId: string, templateId: string, confirmationText?: string) =>
    api.delete(`/line-accounts/${accountId}/slip-templates/${templateId}/safe-delete`, {
      data: { confirmationText },
    }),
};

// System Responses API
export const systemResponsesApi = {
  getAll: () => api.get('/system-responses'),
  getByKey: (key: string) => api.get(`/system-responses/${key}`),
  update: (key: string, data: { message: string; isActive?: boolean }) =>
    api.put(`/system-responses/${key}`, data),
  reset: (key: string) => api.post(`/system-responses/${key}/reset`),
  resetAll: () => api.post('/system-responses/reset-all'),
};

// Wallet API
export const walletApi = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (params?: { limit?: number; type?: string }) =>
    api.get('/wallet/transactions', { params }),
  deposit: (data: { amount: number; slipFile: File }) => {
    const formData = new FormData();
    formData.append('amount', data.amount.toString());
    formData.append('slip', data.slipFile);
    return api.post('/wallet/deposit', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  purchasePackage: (packageId: string) =>
    api.post('/wallet/purchase', { packageId }),
};

// Admin Wallet API
export const adminWalletApi = {
  getAllTransactions: (params?: { limit?: number; status?: string; type?: string }) =>
    api.get('/admin/wallet/transactions', { params }),
  approveDeposit: (transactionId: string) =>
    api.post(`/admin/wallet/transactions/${transactionId}/approve`),
  rejectDeposit: (transactionId: string, reason?: string) =>
    api.post(`/admin/wallet/transactions/${transactionId}/reject`, { reason }),
  adjustBalance: (userId: string, amount: number, reason: string) =>
    api.post('/admin/wallet/adjust', { userId, amount, reason }),
};

// Credits API
export const creditsApi = {
  getBalance: () => api.get('/credits/balance'),
  getHistory: (params?: { limit?: number }) =>
    api.get('/credits/history', { params }),
};

// Admin Credits API
export const adminCreditsApi = {
  getAllBalances: () => api.get('/admin/credits/balances'),
  adjust: (userId: string, amount: number, reason: string) =>
    api.post('/admin/credits/adjust', { userId, amount, reason }),
  getHistory: (params?: { userId?: string; limit?: number }) =>
    api.get('/admin/credits/history', { params }),
};
