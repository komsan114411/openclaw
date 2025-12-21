import { create } from 'zustand';
import { authApi } from '@/lib/api';

interface User {
  userId: string;
  username: string;
  role: 'admin' | 'user';
  email?: string;
  fullName?: string;
  forcePasswordChange: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // Only set true while performing auth-related requests (login/checkAuth).
  // Default must be false to avoid UI showing "loading" on first paint.
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(username, password);
      if (response.data.success) {
        set({ user: response.data.user, isLoading: false });
        return true;
      }
      set({ error: response.data.message || 'Login failed', isLoading: false });
      return false;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Login failed',
        isLoading: false,
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Ignore logout errors
    }
    set({ user: null, isLoading: false, error: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const response = await authApi.me();
      if (response.data.success) {
        set({ user: response.data.user, isLoading: false });
      } else {
        set({ user: null, isLoading: false });
      }
    } catch (error) {
      set({ user: null, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
