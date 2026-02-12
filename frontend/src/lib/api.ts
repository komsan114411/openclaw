import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  withCredentials: true,
  timeout: 30000, // 30 seconds default timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Extended timeout API for long-running operations
const apiLongRunning = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  withCredentials: true,
  timeout: 180000, // 3 minutes for operations like enhanced login
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to read a cookie value by name
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// CSRF token interceptor - reads csrf-token cookie and sends as X-CSRF-Token header
function addCsrfToken(config: import('axios').InternalAxiosRequestConfig) {
  const safeMethods = ['get', 'head', 'options'];
  if (!safeMethods.includes((config.method || '').toLowerCase())) {
    const csrfToken = getCookie('csrf-token');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
}

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add CSRF token for state-changing requests
    addCsrfToken(config);
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

// Apply CSRF interceptor to long-running API client too
apiLongRunning.interceptors.request.use(
  (config) => {
    addCsrfToken(config);
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
  getGrowth: (days?: number) => api.get('/users/growth', { params: { days } }),
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
  aiQuota?: number;
  durationDays: number;
  description?: string;
  features?: string[];
  isFreeStarter?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  maxPurchasesPerUser?: number | null;
  isRecommended?: boolean;
}

interface UpdatePackageData {
  name?: string;
  price?: number;
  priceUsdt?: number;
  slipQuota?: number;
  aiQuota?: number;
  durationDays?: number;
  description?: string;
  features?: string[];
  isFreeStarter?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  maxPurchasesPerUser?: number | null;
  isRecommended?: boolean;
}

// Packages API
export const packagesApi = {
  getAll: (includeInactive?: boolean) =>
    includeInactive
      ? api.get('/packages/admin/all', { params: { includeInactive } })
      : api.get('/packages'),
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
  getStatistics: () => api.get('/subscriptions/statistics'),
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
  // LINE Session Settings
  lineSessionHealthCheckEnabled?: boolean;
  lineSessionHealthCheckIntervalMinutes?: number;
  lineSessionAutoReloginEnabled?: boolean;
  lineSessionReloginCheckIntervalMinutes?: number;
  lineSessionMaxConsecutiveFailures?: number;
  lineSessionExpiryWarningMinutes?: number;
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
  // Site Branding (public - no auth required)
  getSiteBranding: () => api.get('/system-settings/site-branding'),
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
  testClassification: (message: string, lineAccountId: string) =>
    api.post('/chatbot/test-classification', { message, lineAccountId }),
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


// LINE Session API (Admin Only)
export const lineSessionApi = {
  // Get all LINE sessions (for bank monitor - includes sessions without lineAccountId)
  getAll: () =>
    api.get('/admin/line-session/all'),

  // Get active session for a LINE account
  getSession: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}`),

  // Set keys manually
  setKeys: (lineAccountId: string, data: {
    xLineAccess: string;
    xHmac: string;
    userAgent?: string;
    lineVersion?: string;
    extractedFrom?: string;
  }) => api.post(`/admin/line-session/${lineAccountId}/keys`, data),

  // Parse keys from CURL command
  parseCurl: (lineAccountId: string, curlCommand: string) =>
    api.post(`/admin/line-session/${lineAccountId}/parse-curl`, { curlCommand }),

  // Copy keys from another account
  copyKeys: (lineAccountId: string, sourceAccountId: string) =>
    api.post(`/admin/line-session/${lineAccountId}/copy-keys`, { sourceAccountId }),

  // Get key history
  getHistory: (lineAccountId: string, limit?: number) =>
    api.get(`/admin/line-session/${lineAccountId}/history`, { params: { limit } }),

  // Get health status
  getHealth: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/health`),

  // Trigger manual relogin
  triggerRelogin: (lineAccountId: string, reason?: string) =>
    api.post(`/admin/line-session/${lineAccountId}/relogin`, { reason }),

  // === Auto Login (Puppeteer) ===

  // Get automation status
  getAutomationStatus: () =>
    api.get('/admin/line-session/automation/status'),

  // Save LINE credentials
  saveCredentials: (lineAccountId: string, email: string, password: string) =>
    api.post(`/admin/line-session/${lineAccountId}/credentials`, { email, password }),

  // Start auto login
  startLogin: (lineAccountId: string, email: string, password: string) =>
    api.post(`/admin/line-session/${lineAccountId}/login`, { email, password }),

  // Get login status
  getLoginStatus: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/login/status`),

  // Cancel login
  cancelLogin: (lineAccountId: string) =>
    api.delete(`/admin/line-session/${lineAccountId}/login`),

  // Check if credentials saved
  hasCredentials: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/credentials`),

  // === Bank Configuration ===

  // Get available banks
  getBanks: () =>
    api.get('/admin/line-session/banks'),

  // Configure bank for account
  setBank: (lineAccountId: string, data: {
    bankCode: string;
    bankName: string;
    accountNumber?: string;
    chatMid?: string;
  }) => api.post(`/admin/line-session/${lineAccountId}/bank`, data),

  // Get bank configuration
  getBank: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/bank`),

  // === Message Fetching ===

  // Fetch messages from LINE
  fetchMessages: (lineAccountId: string) =>
    api.post(`/admin/line-session/${lineAccountId}/messages/fetch`),

  // Get messages
  getMessages: (lineAccountId: string, params?: {
    limit?: number;
    offset?: number;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get(`/admin/line-session/${lineAccountId}/messages`, { params }),

  // Get transaction summary
  getTransactionSummary: (lineAccountId: string, startDate?: string, endDate?: string) =>
    api.get(`/admin/line-session/${lineAccountId}/messages/summary`, {
      params: { startDate, endDate },
    }),

  // === Enhanced Automation (GSB-like features) ===

  // Get enhanced automation status
  getEnhancedStatus: () =>
    api.get('/admin/line-session/enhanced/status'),

  // Get worker pool status
  getWorkerPoolStatus: () =>
    api.get('/admin/line-session/enhanced/pool'),

  // Get login coordinator statistics
  getCoordinatorStats: () =>
    api.get('/admin/line-session/enhanced/coordinator'),

  // Start enhanced login (uses extended timeout for long-running operation)
  startEnhancedLogin: (lineAccountId: string, email?: string, password?: string, source?: 'manual' | 'auto' | 'relogin') =>
    apiLongRunning.post(`/admin/line-session/${lineAccountId}/enhanced-login`, { email, password, source }),

  // Get enhanced login status
  getEnhancedLoginStatus: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/enhanced-login/status`),

  // Cancel enhanced login
  cancelEnhancedLogin: (lineAccountId: string) =>
    api.delete(`/admin/line-session/${lineAccountId}/enhanced-login`),

  // Get cooldown info
  getCooldownInfo: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/cooldown`),

  // Reset cooldown
  resetCooldown: (lineAccountId: string) =>
    api.post(`/admin/line-session/${lineAccountId}/reset-cooldown`),

  // Get login history
  getLoginHistory: (lineAccountId: string, limit?: number) =>
    api.get(`/admin/line-session/${lineAccountId}/login-history`, { params: { limit } }),

  // Close worker
  closeWorker: (lineAccountId: string) =>
    api.delete(`/admin/line-session/${lineAccountId}/worker`),

  // === cURL Command ===

  // Get cURL command for copying
  getCurl: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/curl`),

  // Get session details with login info
  getSessionDetails: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/details`),

  // === PIN Status (GSB-style) ===

  // Get PIN status
  getPinStatus: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/pin-status`),

  // Get full session status (PIN + Keys)
  getSessionStatus: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/session-status`),

  // Get keys status
  getKeysStatus: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/keys-status`),

  // Check if needs relogin
  needsRelogin: (lineAccountId: string) =>
    api.get(`/admin/line-session/${lineAccountId}/needs-relogin`),

  // === Auto-Fetch Settings ===

  // Get auto-fetch settings
  getAutoFetchSettings: () =>
    api.get('/admin/line-session/settings/auto-fetch'),

  // Update auto-fetch settings
  updateAutoFetchSettings: (data: {
    enabled?: boolean;
    intervalSeconds?: number;
    activeOnly?: boolean;
    fetchLimit?: number;
  }) => api.put('/admin/line-session/settings/auto-fetch', data),

  // Control auto-fetch (start/stop/restart)
  controlAutoFetch: (action: 'start' | 'stop' | 'restart') =>
    api.post(`/admin/line-session/settings/auto-fetch/${action}`),

  // Get auto-fetch status
  getAutoFetchStatus: () =>
    api.get('/admin/line-session/settings/auto-fetch/status'),

  // Fetch all messages from all accounts (batch)
  fetchAllMessages: () =>
    api.post('/admin/line-session/batch/messages/fetch-all'),

  // Delete old messages (admin cleanup)
  deleteOldMessages: (data: {
    sessionIds?: string[];
    olderThanDays?: number;
    olderThanMonths?: number;
  }) => api.delete('/admin/line-session/messages/cleanup', { data }),

  // Get message statistics
  getMessageStats: () =>
    api.get('/admin/line-session/messages/stats'),

  // Get batch transaction summary
  getBatchSummary: () =>
    api.get('/admin/line-session/batch/messages/summary'),

  // Preview cleanup before deleting
  previewCleanup: (data: {
    sessionIds?: string[];
    olderThanDays?: number;
    olderThanMonths?: number;
  }) => api.post('/admin/line-session/messages/cleanup-preview', data),

  // === Account Alerts ===

  // Get unread alert counts for all accounts
  getUnreadAlertCounts: () =>
    api.get('/admin/line-session/batch/alerts/unread-counts'),

  // Get alerts for a specific account (paginated)
  getAlerts: (lineAccountId: string, page = 1, limit = 20) =>
    api.get(`/admin/line-session/${lineAccountId}/alerts`, { params: { page, limit } }),

  // Mark all alerts as read for a specific account
  markAlertsRead: (lineAccountId: string) =>
    api.put(`/admin/line-session/${lineAccountId}/alerts/mark-read`),
};

// LINE Session User API (User-facing endpoints)
export const lineSessionUserApi = {
  // Get my LINE Logins
  getMySessions: () =>
    api.get('/user/line-session/my'),

  // Create new LINE Login
  createSession: (name: string) =>
    api.post('/user/line-session/create', { name }),

  // Delete LINE Login
  deleteSession: (sessionId: string) =>
    api.delete(`/user/line-session/${sessionId}`),

  // Get available banks
  getBanks: () =>
    api.get('/user/line-session/banks/list'),

  // Setup LINE session (simple: email, password, bank)
  setupSession: (sessionId: string, data: {
    email: string;
    password: string;
    bankCode: string;
  }) => api.post(`/user/line-session/${sessionId}/setup`, data),

  // Get credentials status
  getCredentialsStatus: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}/credentials`),

  // Get session info
  getSession: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}`),

  // Start enhanced login
  startEnhancedLogin: (sessionId: string, email?: string, password?: string, source?: 'manual' | 'auto' | 'relogin') =>
    api.post(`/user/line-session/${sessionId}/enhanced-login`, { email, password, source: source || 'manual' }),

  // Get enhanced login status
  getEnhancedLoginStatus: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}/enhanced-login/status`),

  // Cancel enhanced login
  cancelEnhancedLogin: (sessionId: string) =>
    api.delete(`/user/line-session/${sessionId}/enhanced-login`),

  // Get cooldown info
  getCooldownInfo: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}/cooldown`),

  // Reset cooldown
  resetCooldown: (sessionId: string) =>
    api.post(`/user/line-session/${sessionId}/reset-cooldown`),

  // Retry login after wrong PIN (quick retry)
  retryWrongPin: (sessionId: string) =>
    apiLongRunning.post(`/user/line-session/${sessionId}/retry-wrong-pin`),

  // Get full keys for copying
  getFullKeys: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}/keys`),

  // Set keys manually
  setKeys: (sessionId: string, data: {
    xLineAccess: string;
    xHmac: string;
    userAgent?: string;
    lineVersion?: string;
  }) => api.post(`/user/line-session/${sessionId}/keys`, data),

  // Get key history
  getHistory: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}/history`),

  // Validate keys by calling LINE API
  validateKeys: (sessionId: string) =>
    api.post(`/user/line-session/${sessionId}/validate-keys`),

  // Get transactions for session
  getTransactions: (sessionId: string, params?: { limit?: number; offset?: number; type?: string; search?: string }) =>
    api.get(`/user/line-session/${sessionId}/transactions`, { params }),

  // Fetch new transactions from LINE API
  fetchTransactions: (sessionId: string) =>
    api.post(`/user/line-session/${sessionId}/fetch-transactions`),

  // Get transaction summary
  getTransactionSummary: (sessionId: string) =>
    api.get(`/user/line-session/${sessionId}/transactions/summary`),

  // Get auto-fetch status (read-only)
  getAutoFetchStatus: () =>
    api.get('/user/line-session/settings/auto-fetch-status'),
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

// Auto-Slip Bank Account data types
interface CreateAutoSlipBankAccountData {
  bankType: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  lineEmail?: string;
  linePassword?: string;
}

interface UpdateAutoSlipBankAccountData {
  accountNumber?: string;
  accountName?: string;
  lineEmail?: string;
  linePassword?: string;
  monitoringEnabled?: boolean;
  checkInterval?: number;
  isActive?: boolean;
}

interface SetAutoSlipKeysData {
  xLineAccess: string;
  xHmac: string;
  chatMid?: string;
  userAgent?: string;
  lineVersion?: string;
}

// Auto-Slip API (User endpoints)
export const autoSlipApi = {
  // Bank Account CRUD
  getMyAccounts: () => api.get('/auto-slip/bank-accounts'),
  getAccount: (id: string) => api.get(`/auto-slip/bank-accounts/${id}`),
  createAccount: (data: CreateAutoSlipBankAccountData) =>
    api.post('/auto-slip/bank-accounts', data),
  updateAccount: (id: string, data: UpdateAutoSlipBankAccountData) =>
    api.patch(`/auto-slip/bank-accounts/${id}`, data),
  deleteAccount: (id: string) => api.delete(`/auto-slip/bank-accounts/${id}`),

  // Login & Keys
  triggerLogin: (id: string, email?: string, password?: string) =>
    api.post(`/auto-slip/bank-accounts/${id}/login`, { email, password }),
  setKeys: (id: string, data: SetAutoSlipKeysData) =>
    api.post(`/auto-slip/bank-accounts/${id}/keys`, data),
  getStatus: (id: string) => api.get(`/auto-slip/bank-accounts/${id}/status`),
  getLoginStatus: (id: string) => api.get(`/auto-slip/bank-accounts/${id}/login-status`),

  // Transactions (messages)
  getTransactions: (id: string, params?: { limit?: number; offset?: number; type?: string }) =>
    api.get(`/auto-slip/bank-accounts/${id}/messages`, { params }),
};

// Auto-Slip Admin API
export const autoSlipAdminApi = {
  // View all accounts
  getAllAccounts: () => api.get('/admin/auto-slip/accounts'),
  getAccountDetails: (id: string) => api.get(`/admin/auto-slip/accounts/${id}`),

  // Admin actions
  resetAccount: (id: string) => api.post(`/admin/auto-slip/accounts/${id}/reset`),
  enableMonitoring: (id: string) => api.post(`/admin/auto-slip/accounts/${id}/enable-monitoring`),
  disableMonitoring: (id: string) => api.post(`/admin/auto-slip/accounts/${id}/disable-monitoring`),
  updateCheckInterval: (id: string, intervalMs: number) =>
    api.post(`/admin/auto-slip/accounts/${id}/check-interval`, { intervalMs }),
  triggerFetch: (id: string) => api.post(`/admin/auto-slip/accounts/${id}/fetch`),

  // System management
  getOrchestratorStats: () => api.get('/admin/auto-slip/orchestrator/stats'),
  getOrchestratorStatus: () => api.get('/admin/auto-slip/orchestrator/status'),
  getGlobalSettings: () => api.get('/admin/auto-slip/settings'),
  getFetcherStatus: () => api.get('/admin/auto-slip/fetcher/status'),
  releaseAllLocks: () => api.post('/admin/auto-slip/locks/release-all'),
};
