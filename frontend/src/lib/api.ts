import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Remove Content-Type for FormData to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const status = error.response?.status;

    // Handle 401 Unauthorized or 403 Forbidden (system access disabled)
    if (status === 401 || status === 403) {
      if (typeof window !== 'undefined') {
        // Clear auth storage to prevent redirect loop (stale session in other tabs)
        try {
          localStorage.removeItem('auth-storage');
        } catch (e) {
          // Ignore storage errors
        }

        const path = window.location.pathname;
        // Don't redirect if already on login page to avoid refresh loop
        if (!path.startsWith('/login') && !path.startsWith('/register')) {
          // For 403, include the error message as a query param
          if (status === 403 && error.response?.data?.message) {
            const message = encodeURIComponent(error.response.data.message);
            window.location.href = `/login?error=${message}`;
          } else {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { api };

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  register: (data: { username: string; password: string; email?: string; fullName?: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// User data types
interface CreateUserData {
  username: string;
  password: string;
  email?: string;
  fullName?: string;
  role?: 'admin' | 'user';
}

interface UpdateUserData {
  username?: string;
  email?: string;
  fullName?: string;
  role?: 'admin' | 'user';
  isActive?: boolean;
}

// Users API
export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: CreateUserData) => api.post('/users', data),
  update: (id: string, data: UpdateUserData) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  block: (id: string, reason?: string) => api.post(`/users/${id}/block`, { reason }),
  unblock: (id: string) => api.post(`/users/${id}/unblock`),
  getStatistics: () => api.get('/users/statistics'),
};

export const activityLogsApi = {
  getAll: (params?: {
    limit?: number;
    actorUserId?: string;
    subjectUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
  }) => api.get('/activity-logs', { params }),
  getMy: (limit?: number) => api.get('/activity-logs/my', { params: { limit } }),
};

// LINE Account types
interface CreateLineAccountData {
  accountName: string;
  channelId: string;
  channelSecret: string;
  accessToken: string;
  description?: string;
  slipTemplateId?: string;
  slipTemplateIds?: Partial<Record<'success' | 'duplicate' | 'error' | 'not_found', string>>;
  ownerId?: string;
}

interface UpdateLineAccountData {
  accountName?: string;
  channelSecret?: string;
  accessToken?: string;
  description?: string;
  slipTemplateId?: string;
  slipTemplateIds?: Partial<Record<'success' | 'duplicate' | 'error' | 'not_found', string>>;
  isActive?: boolean;
}

// LINE Accounts API
export const lineAccountsApi = {
  getAll: () => api.get('/line-accounts'),
  getMyAccounts: () => api.get('/line-accounts/my'),
  getMyTemplates: () => api.get('/line-accounts/my/templates'),
  getById: (id: string) => api.get(`/line-accounts/${id}`),
  create: (data: CreateLineAccountData) =>
    api.post('/line-accounts', data),
  update: (id: string, data: UpdateLineAccountData) =>
    api.put(`/line-accounts/${id}`, data),
  updateSettings: (id: string, settings: Record<string, unknown>) =>
    api.put(`/line-accounts/${id}/settings`, settings),
  delete: (id: string) => api.delete(`/line-accounts/${id}`),
  getChatHistory: (id: string, userId?: string, limit?: number) =>
    api.get(`/line-accounts/${id}/chat-history`, { params: { userId, limit } }),
  getStatistics: () => api.get('/line-accounts/statistics'),
  testConnection: (id: string) => api.post(`/line-accounts/${id}/test-connection`),
  testConnectionWithToken: (accessToken: string) =>
    api.post('/line-accounts/test-connection', { accessToken }),
  regenerateWebhook: (id: string) => api.post(`/line-accounts/${id}/regenerate-webhook`),
};

// Package data types
interface CreatePackageData {
  name: string;
  price: number;
  priceUsdt?: number;
  slipQuota: number;
  durationDays: number;
  description?: string;
  features?: string[];
  isFreeStarter?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

interface UpdatePackageData {
  name?: string;
  price?: number;
  priceUsdt?: number;
  slipQuota?: number;
  durationDays?: number;
  description?: string;
  features?: string[];
  isFreeStarter?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

// Packages API
export const packagesApi = {
  getAll: (includeInactive?: boolean) =>
    api.get('/packages', { params: { includeInactive } }),
  getById: (id: string) => api.get(`/packages/${id}`),
  create: (data: CreatePackageData) => api.post('/packages', data),
  update: (id: string, data: UpdatePackageData) => api.put(`/packages/${id}`, data),
  delete: (id: string) => api.delete(`/packages/${id}`),
  activate: (id: string) => api.post(`/packages/${id}/activate`),
};

// Subscriptions API
export const subscriptionsApi = {
  getMy: () => api.get('/subscriptions/my'),
  getQuota: () => api.get('/subscriptions/quota'),
  getAiQuota: () => api.get('/subscriptions/ai-quota'),
  getAll: () => api.get('/subscriptions'),
  grant: (userId: string, packageId: string) =>
    api.post('/subscriptions/grant', { userId, packageId }),
};

// Payments API
export const paymentsApi = {
  getAll: (status?: string) => api.get('/payments', { params: { status } }),
  getMy: () => api.get('/payments/my'),
  getById: (id: string) => api.get(`/payments/${id}`),
  create: (data: { packageId: string; paymentType: string; amount: number }) =>
    api.post('/payments', data),
  submitSlip: (params: { packageId: string; slipFile: File; paymentId?: string }) => {
    const formData = new FormData();
    formData.append('packageId', params.packageId);
    if (params.paymentId) formData.append('paymentId', params.paymentId);
    formData.append('slip', params.slipFile);
    return api.post('/payments/slip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  submitUsdt: (packageId: string, transactionHash: string) =>
    api.post('/payments/usdt', { packageId, transactionHash }),
  approve: (id: string) => api.post(`/payments/${id}/approve`),
  reject: (id: string, notes?: string) =>
    api.post(`/payments/${id}/reject`, { notes }),
  checkEligibility: (packageId: string) =>
    api.get(`/payments/check-eligibility/${packageId}`),
};

// Bank data types
interface CreateBankData {
  code: string;
  name: string;
  nameTh?: string;
  nameEn?: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  logoBase64?: string;
  isActive?: boolean;
  sortOrder?: number;
}

interface UpdateBankData {
  code?: string;
  name?: string;
  nameTh?: string;
  nameEn?: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  logoBase64?: string;
  isActive?: boolean;
  sortOrder?: number;
}

// Banks API
export const banksApi = {
  // Public endpoints
  getAll: () => api.get('/banks'),
  search: (query: string) => api.get('/banks/search', { params: { q: query } }),
  // Admin endpoints
  getAllAdmin: () => api.get('/admin/banks'),
  create: (data: CreateBankData) => api.post('/admin/banks', data),
  update: (id: string, data: UpdateBankData) => api.put(`/admin/banks/${id}`, data),
  uploadLogo: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post(`/admin/banks/${id}/logo`, formData);
  },
  initDefaults: () => api.post('/admin/banks/init-defaults'),
  syncFromThunder: () => api.post('/admin/banks/sync-from-thunder'),
  initThunderBanks: (apiKey: string) => api.post('/admin/banks/init-thunder-banks', { apiKey }),
};

// System Settings data types
interface UpdateSystemSettingsData {
  slipApiKey?: string;
  aiApiKey?: string;
  publicBaseUrl?: string;
  slipApiProvider?: string;
  aiModel?: string;
  usdtEnabled?: boolean;
  usdtNetwork?: string;
  usdtWalletAddress?: string;
  usdtQrImage?: string;
  usdtDisabledMessage?: string;
  // Control flags only - messages managed via SystemResponseTemplates
  quotaWarningThreshold?: number;
  quotaWarningEnabled?: boolean;
  duplicateRefundEnabled?: boolean;
  contactAdminUrl?: string;
  contactAdminLine?: string;
  contactAdminEmail?: string;
  // Preview Settings
  previewSenderName?: string;
  previewReceiverName?: string;
  previewSenderBankCode?: string;
  previewReceiverBankCode?: string;
  previewAmount?: string;
  // Floating Contact Button Settings
  floatingContactEnabled?: boolean;
  floatingContactUrl?: string;
  floatingContactIconUrl?: string;
  floatingContactIconBase64?: string;
  floatingContactSize?: number;
  floatingContactBottom?: number;
  floatingContactRight?: number;
  floatingContactTooltip?: string;
  floatingContactBgColor?: string;
  floatingContactShowOnMobile?: boolean;
}

interface AddBankAccountData {
  bankCode?: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

// Access Control data types
interface AccessControlData {
  allowRegistration?: boolean;
  registrationDisabledMessage?: string;
  allowLogin?: boolean;
  loginDisabledMessage?: string;
}

// System Settings API
export const systemSettingsApi = {
  get: () => api.get('/system-settings'),
  updateSystemSettings: (data: UpdateSystemSettingsData) =>
    api.put('/system-settings', data),
  testUsdtApi: (network: 'TRC20' | 'ERC20' | 'BEP20', apiKey: string) =>
    api.post('/system-settings/test-usdt-api', { network, apiKey }),
  addBankAccount: (data: AddBankAccountData) => api.post('/system-settings/bank-accounts', data),
  removeBankAccount: (index: number) =>
    api.delete(`/system-settings/bank-accounts/${index}`),
  getApiStatus: () => api.get('/system-settings/api-status'),
  getPaymentInfo: () => api.get('/system-settings/payment-info'),
  getPreviewConfig: () => api.get('/system-settings/preview-config'),
  // Access Control (public - no auth required)
  getAccessStatus: () => api.get('/system-settings/access-status'),
  // Access Control (admin only)
  getAccessControl: () => api.get('/system-settings/access-control'),
  updateAccessControl: (data: AccessControlData) =>
    api.put('/system-settings/access-control', data),
  // AI Settings (admin only)
  getAiSettings: () => api.get('/system-settings/ai-settings'),
  updateAiSettings: (data: { globalAiEnabled?: boolean; allowedAiModels?: string[] }) =>
    api.put('/system-settings/ai-settings', data),
  toggleGlobalAi: (enabled: boolean) =>
    api.put('/system-settings/ai-toggle', { enabled }),
  // Floating Contact Button (public)
  getFloatingContact: () => api.get('/system-settings/floating-contact'),
  // Slip Provider Settings (admin only)
  getSlipProviderSettings: () => api.get('/system-settings/slip-provider-settings'),
  updateSlipProviderSettings: (data: {
    slipApiProvider?: string;
    slipApiProviderSecondary?: string;
    slipApiFallbackEnabled?: boolean;
    slipProviderFailoverOrder?: string[];
    slipApiKey?: string;
    slipApiKeySecondary?: string;
    slipApiKeyThunder?: string;
    slipApiKeySlipMate?: string;
    slipApiQuotaWarning?: boolean;
    globalSlipVerificationEnabled?: boolean;
  }) => api.put('/system-settings/slip-provider-settings', data),
  getSlipProviderStatus: () => api.get('/system-settings/slip-provider-status'),
  testSlipProvider: (provider: string, apiKey?: string) =>
    api.post('/system-settings/test-slip-provider', { provider, apiKey }),
  toggleGlobalSlip: (enabled: boolean) =>
    api.put('/system-settings/slip-toggle', { enabled }),
};

// Slip Verification API
export const slipApi = {
  testConnection: (apiKey: string) =>
    api.post('/slip-verification/test-connection', { apiKey }),
  getHistory: (lineAccountId: string, limit?: number) =>
    api.get(`/slip-verification/history/${lineAccountId}`, { params: { limit } }),
};

// Chatbot API
export const chatbotApi = {
  testConnection: (apiKey: string) =>
    api.post('/chatbot/test-connection', { apiKey }),
  test: (message: string, systemPrompt?: string) =>
    api.post('/chatbot/test', { message, systemPrompt }),
};

// Chat Messages API
export const chatMessagesApi = {
  getUsers: (accountId: string) =>
    api.get(`/chat-messages/${accountId}/users`),
  getMessages: (accountId: string, userId: string, limit?: number, before?: string) =>
    api.get(`/chat-messages/${accountId}/${userId}`, { params: { limit, before } }),
  sendMessage: (accountId: string, userId: string, message: string) =>
    api.post(`/chat-messages/${accountId}/${userId}/send`, { message }),
  markAsRead: (accountId: string, userId: string) =>
    api.post(`/chat-messages/${accountId}/${userId}/read`),
  getUnreadCount: (accountId: string) =>
    api.get(`/chat-messages/${accountId}/unread-count`),
  deleteChatHistory: (accountId: string, userId: string) =>
    api.delete(`/chat-messages/${accountId}/${userId}`),
  getImage: (accountId: string, messageId: string) => {
    const base = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');
    // base is expected to include "/api"
    return `${base}/chat-messages/${accountId}/image/${messageId}`;
  },
  getUserProfile: (accountId: string, userId: string) =>
    api.get(`/chat-messages/${accountId}/profile/${userId}`),
};

// Slip Template data types
interface CreateSlipTemplateData {
  name: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  description?: string;
  headerText?: string;
  headerColor?: string;
  bodyText?: string;
  footerText?: string;
  isDefault?: boolean;
}

interface UpdateSlipTemplateData {
  name?: string;
  type?: 'success' | 'duplicate' | 'error' | 'not_found';
  description?: string;
  headerText?: string;
  headerColor?: string;
  bodyText?: string;
  footerText?: string;
  isDefault?: boolean;
}

// Slip Templates API (User - per LINE account)
export const slipTemplatesApi = {
  getAll: (accountId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates`),
  getGlobal: () =>
    api.get('/slip-templates/global'),
  getList: (accountId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates-list`),
  create: (accountId: string, data: CreateSlipTemplateData) =>
    api.post(`/line-accounts/${accountId}/slip-templates`, data),
  update: (accountId: string, templateId: string, data: UpdateSlipTemplateData) =>
    api.put(`/line-accounts/${accountId}/slip-templates/${templateId}`, data),
  delete: (accountId: string, templateId: string) =>
    api.delete(`/line-accounts/${accountId}/slip-templates/${templateId}`),
  setDefault: (accountId: string, templateId: string) =>
    api.put(`/line-accounts/${accountId}/slip-templates/${templateId}/default`),
  preview: (accountId: string, templateId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates/${templateId}/preview`),
  initDefaults: (accountId: string) =>
    api.post(`/line-accounts/${accountId}/slip-templates/init-defaults`),
  // Safe delete with usage check
  checkUsage: (accountId: string, templateId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates/${templateId}/usage`),
  safeDelete: (accountId: string, templateId: string, confirmationText?: string) =>
    api.delete(`/line-accounts/${accountId}/slip-templates/${templateId}/safe-delete`, {
      data: { confirmationText },
    }),
  // Select template for LINE account
  selectTemplate: (accountId: string, type: string, templateId: string) =>
    api.put(`/line-accounts/${accountId}/slip-templates/select/${type}/${templateId}`),
  getSelectedTemplates: (accountId: string) =>
    api.get(`/line-accounts/${accountId}/slip-templates/selected`),
};

// Admin Slip Templates API (Global templates management)
export const adminSlipTemplatesApi = {
  getAll: () => api.get('/admin/slip-templates/global'),
  create: (data: CreateSlipTemplateData) => api.post('/admin/slip-templates/global', data),
  update: (templateId: string, data: UpdateSlipTemplateData) =>
    api.put(`/admin/slip-templates/global/${templateId}`, data),
  delete: (templateId: string) => api.delete(`/admin/slip-templates/global/${templateId}`),
  setDefault: (templateId: string) =>
    api.put(`/admin/slip-templates/global/${templateId}/default`),
  preview: (templateId: string) =>
    api.get(`/admin/slip-templates/global/${templateId}/preview`),
  checkUsage: (templateId: string) =>
    api.get(`/admin/slip-templates/global/${templateId}/usage`),
  safeDelete: (templateId: string, confirmationText?: string) =>
    api.delete(`/admin/slip-templates/global/${templateId}/safe-delete`, {
      data: { confirmationText },
    }),
  initDefaults: () => api.post('/admin/slip-templates/global/init-defaults'),
  repair: () => api.post('/admin/slip-templates/global/repair'),
  reset: () => api.post('/admin/slip-templates/global/reset'),
  debug: () => api.get('/admin/slip-templates/global/debug'),
};

// Thunder API (Slip Verification Service)
export const thunderApi = {
  getQuota: (customToken?: string) =>
    api.get('/thunder/quota', { params: customToken ? { token: customToken } : {} }),
  checkHealth: (customToken?: string) =>
    api.get('/thunder/health', { params: customToken ? { token: customToken } : {} }),
};

// System Response Template data types
interface SystemResponseStyling {
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  icon?: string;
  showIcon?: boolean;
  showContactButton?: boolean;
  contactButtonText?: string;
  contactButtonUrl?: string;
  showRetryButton?: boolean;
  retryButtonText?: string;
}

interface UpdateSystemResponseTemplateData {
  name?: string;
  description?: string;
  responseFormat?: 'text' | 'flex';
  textMessage?: string;
  title?: string;
  mainMessage?: string;
  subMessage?: string;
  customFlexTemplate?: Record<string, unknown>;
  useCustomTemplate?: boolean;
  styling?: SystemResponseStyling;
  isActive?: boolean;
  sortOrder?: number;
  // Legacy fields for compatibility
  message?: string;
  altText?: string;
  flexJson?: string;
}

// System Response Templates API (Admin Only)
export const systemResponseTemplatesApi = {
  getAll: () => api.get('/admin/system-response-templates'),
  getByType: (type: string) => api.get(`/admin/system-response-templates/${type}`),
  update: (type: string, data: UpdateSystemResponseTemplateData) => api.put(`/admin/system-response-templates/${type}`, data),
  reset: (type: string) => api.post(`/admin/system-response-templates/${type}/reset`),
  resetAll: () => api.post('/admin/system-response-templates/reset-all'),
  preview: (type: string, variables?: Record<string, string>) =>
    api.post(`/admin/system-response-templates/${type}/preview`, { variables }),
};

// Wallet API (Credit System)
export const walletApi = {
  // User endpoints
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (limit?: number, offset?: number) =>
    api.get('/wallet/transactions', { params: { limit, offset } }),
  deposit: (slipImage: string) =>
    api.post('/wallet/deposit', { slipImage }),
  depositUsdt: (amount: number, transactionHash: string) =>
    api.post('/wallet/deposit/usdt', { amount, transactionHash }),

  // USDT Rate & Verification
  getUsdtRate: () => api.get('/wallet/usdt/rate'),
  calculateUsdtCredits: (amount: number) =>
    api.get('/wallet/usdt/calculate', { params: { amount } }),
  verifyUsdtTransaction: (txHash: string, expectedAmount?: number, expectedWallet?: string) =>
    api.get(`/wallet/usdt/verify/${txHash}`, { params: { expectedAmount, expectedWallet } }),

  // Admin endpoints
  getAllTransactions: (params?: { limit?: number; offset?: number; type?: string; status?: string }) =>
    api.get('/wallet/admin/transactions', { params }),
  getStatistics: () => api.get('/wallet/admin/statistics'),
  getUserBalance: (userId: string) => api.get(`/wallet/admin/user/${userId}/balance`),
  getUserTransactions: (userId: string, limit?: number, offset?: number) =>
    api.get(`/wallet/admin/user/${userId}/transactions`, { params: { limit, offset } }),
  addCredits: (userId: string, amount: number, description: string) =>
    api.post(`/wallet/admin/user/${userId}/add-credits`, { amount, description }),
  deductCredits: (userId: string, amount: number, description: string) =>
    api.post(`/wallet/admin/user/${userId}/deduct-credits`, { amount, description }),
  // Admin transaction approval
  getTransactionById: (id: string) => api.get(`/wallet/admin/transaction/${id}`),
  getUserStatistics: (userId: string) => api.get(`/wallet/admin/user/${userId}/statistics`),
  approveTransaction: (id: string, notes?: string) =>
    api.post(`/wallet/admin/transaction/${id}/approve`, { notes }),
  rejectTransaction: (id: string, reason?: string) =>
    api.post(`/wallet/admin/transaction/${id}/reject`, { reason }),

};


// Rate Limit API (Admin Only)
export const rateLimitApi = {
  // Get statistics
  getStats: (period?: number) =>
    api.get('/rate-limit/stats', { params: { period } }),

  // Get logs with filtering
  getLogs: (params?: {
    limit?: number;
    type?: string;
    action?: string;
    clientIp?: string;
    accountSlug?: string;
    isTest?: boolean;
  }) => api.get('/rate-limit/logs', { params }),

  // Get current in-memory metrics
  getMetrics: () => api.get('/rate-limit/metrics'),

  // Get available LINE accounts for testing
  getAccounts: () => api.get('/rate-limit/accounts'),

  // Run custom rate limit test (simulation)
  runTest: (data: {
    testType: 'per_ip' | 'per_account' | 'global';
    requestCount: number;
    delayMs?: number;
    testIp?: string;
    testAccount?: string;
  }) => api.post('/rate-limit/test', data),

  // Run real webhook test
  runWebhookTest: (data: {
    accountId?: string;
    requestCount: number;
    delayMs?: number;
  }) => api.post('/rate-limit/test/webhook', data),

  // Run preset test (simulation or real webhook)
  runQuickTest: (preset: 'light' | 'medium' | 'heavy' | 'ddos_simulation', mode?: 'simulation' | 'real_webhook', accountId?: string) =>
    api.post('/rate-limit/test/quick', { preset, mode, accountId }),

  // Get test history
  getTestHistory: (limit?: number) =>
    api.get('/rate-limit/test/history', { params: { limit } }),

  // Clear test logs
  clearTestLogs: () => api.delete('/rate-limit/test/logs'),
};
