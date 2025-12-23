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
    if (error.response?.status === 401) {
      // Handle unauthorized
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
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

// Users API
export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
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

// LINE Accounts API
export const lineAccountsApi = {
  getAll: () => api.get('/line-accounts'),
  getMyAccounts: () => api.get('/line-accounts/my'),
  getById: (id: string) => api.get(`/line-accounts/${id}`),
  create: (data: any) => api.post('/line-accounts', data),
  update: (id: string, data: any) => api.put(`/line-accounts/${id}`, data),
  updateSettings: (id: string, settings: any) =>
    api.put(`/line-accounts/${id}/settings`, settings),
  delete: (id: string) => api.delete(`/line-accounts/${id}`),
  getChatHistory: (id: string, userId?: string, limit?: number) =>
    api.get(`/line-accounts/${id}/chat-history`, { params: { userId, limit } }),
  getStatistics: () => api.get('/line-accounts/statistics'),
};

// Packages API
export const packagesApi = {
  getAll: (includeInactive?: boolean) =>
    api.get('/packages', { params: { includeInactive } }),
  getById: (id: string) => api.get(`/packages/${id}`),
  create: (data: any) => api.post('/packages', data),
  update: (id: string, data: any) => api.put(`/packages/${id}`, data),
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

// Banks API
export const banksApi = {
  getAll: () => api.get('/banks'),
  getById: (id: string) => api.get(`/banks/${id}`),
  create: (data: any) => api.post('/banks', data),
  update: (id: string, data: any) => api.put(`/banks/${id}`, data),
  delete: (id: string) => api.delete(`/banks/${id}`),
  toggleActive: (id: string) => api.post(`/banks/${id}/toggle-active`),
  syncFromThunder: () => api.post('/admin/banks/sync-from-thunder'),
};

// System Settings API
export const systemSettingsApi = {
  get: () => api.get('/system-settings'),
  update: (data: any) => api.put('/system-settings', data),
  addBankAccount: (data: any) => api.post('/system-settings/bank-accounts', data),
  removeBankAccount: (index: number) =>
    api.delete(`/system-settings/bank-accounts/${index}`),
  getApiStatus: () => api.get('/system-settings/api-status'),
  getPaymentInfo: () => api.get('/system-settings/payment-info'),
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
  getImage: (accountId: string, messageId: string) =>
    `/api/chat-messages/${accountId}/image/${messageId}`,
  getUserProfile: (accountId: string, userId: string) =>
    api.get(`/chat-messages/${accountId}/profile/${userId}`),
};

// Slip Templates API
export const slipTemplatesApi = {
  getAll: (accountId: string) =>
    api.get(`/user/line-accounts/${accountId}/slip-templates`),
  getList: (accountId: string) =>
    api.get(`/user/line-accounts/${accountId}/slip-templates-list`),
  create: (accountId: string, data: any) =>
    api.post(`/user/line-accounts/${accountId}/slip-templates`, data),
  update: (accountId: string, templateId: string, data: any) =>
    api.put(`/user/line-accounts/${accountId}/slip-templates/${templateId}`, data),
  delete: (accountId: string, templateId: string) =>
    api.delete(`/user/line-accounts/${accountId}/slip-templates/${templateId}`),
  setDefault: (accountId: string, templateId: string) =>
    api.put(`/user/line-accounts/${accountId}/slip-templates/${templateId}/default`),
  preview: (accountId: string, templateId: string) =>
    api.get(`/user/line-accounts/${accountId}/slip-templates/${templateId}/preview`),
  initDefaults: (accountId: string) =>
    api.post(`/user/line-accounts/${accountId}/slip-templates/init-defaults`),
};

// Thunder API (Slip Verification Service)
export const thunderApi = {
  getQuota: (customToken?: string) =>
    api.get('/thunder/quota', { params: customToken ? { token: customToken } : {} }),
  checkHealth: (customToken?: string) =>
    api.get('/thunder/health', { params: customToken ? { token: customToken } : {} }),
};
