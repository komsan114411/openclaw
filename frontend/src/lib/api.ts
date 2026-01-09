import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Create axios instance with optimized settings
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  withCredentials: true,
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track pending requests to prevent duplicates
const pendingRequests = new Map<string, AbortController>();

// Generate a unique key for each request
const getRequestKey = (config: InternalAxiosRequestConfig): string => {
  return `${config.method}-${config.url}-${JSON.stringify(config.params || {})}`;
};

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Remove Content-Type for FormData to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    // Cancel duplicate GET requests (not POST/PUT/DELETE)
    if (config.method?.toLowerCase() === 'get') {
      const requestKey = getRequestKey(config);
      
      // Cancel previous request with same key
      if (pendingRequests.has(requestKey)) {
        pendingRequests.get(requestKey)?.abort();
      }

      // Create new abort controller
      const controller = new AbortController();
      config.signal = controller.signal;
      pendingRequests.set(requestKey, controller);
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
    // Clean up pending request tracking
    const requestKey = getRequestKey(response.config);
    pendingRequests.delete(requestKey);
    
    return response;
  },
  (error: AxiosError) => {
    // Clean up pending request tracking
    if (error.config) {
      const requestKey = getRequestKey(error.config);
      pendingRequests.delete(requestKey);
    }

    // Don't handle cancelled requests
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      // Only redirect if not already on auth pages
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const authPages = ['/login', '/register', '/change-password'];
        const isAuthPage = authPages.some(page => currentPath.startsWith(page));
        
        if (!isAuthPage) {
          // Use replace to prevent back button issues
          window.location.replace('/login');
        }
      }
    }

    // Handle network errors gracefully
    if (!error.response) {
      console.warn('Network error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
export { api };

// Auth API with optimized endpoints
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
  ownerId?: string;
}

interface UpdateLineAccountData {
  accountName?: string;
  channelSecret?: string;
  accessToken?: string;
  description?: string;
  slipTemplateId?: string;
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
  quotaExceededResponseType?: string;
  quotaExceededMessage?: string;
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
}

interface AddBankAccountData {
  bankCode?: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
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
    api.get(`/chat-messages/accounts/${accountId}/users`),
  getMessages: (accountId: string, lineUserId: string, limit?: number) =>
    api.get(`/chat-messages/accounts/${accountId}/users/${lineUserId}`, { params: { limit } }),
  sendMessage: (accountId: string, lineUserId: string, message: string) =>
    api.post(`/chat-messages/accounts/${accountId}/users/${lineUserId}/send`, { message }),
};

// Slip Templates API
export const slipTemplatesApi = {
  getAll: () => api.get('/slip-templates'),
  getMy: () => api.get('/slip-templates/my'),
  getById: (id: string) => api.get(`/slip-templates/${id}`),
  create: (data: {
    name: string;
    description?: string;
    bankAccounts: Array<{
      bankCode: string;
      accountNumber: string;
      accountName: string;
    }>;
    minAmount?: number;
    maxAmount?: number;
    isActive?: boolean;
  }) => api.post('/slip-templates', data),
  update: (id: string, data: {
    name?: string;
    description?: string;
    bankAccounts?: Array<{
      bankCode: string;
      accountNumber: string;
      accountName: string;
    }>;
    minAmount?: number;
    maxAmount?: number;
    isActive?: boolean;
  }) => api.put(`/slip-templates/${id}`, data),
  delete: (id: string) => api.delete(`/slip-templates/${id}`),
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
