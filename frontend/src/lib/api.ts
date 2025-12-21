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

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
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
  getStatistics: () => api.get('/users/statistics'),
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
  submitSlip: (packageId: string, slipFile: File) => {
    const formData = new FormData();
    formData.append('packageId', packageId);
    formData.append('slip', slipFile);
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
