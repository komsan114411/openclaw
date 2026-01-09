import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  isInitialized: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (data: { username: string; password: string; email?: string; fullName?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

// Flag to track if checkAuth has been called this session
let _authChecked = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(username, password);
          if (response.data.success) {
            set({ user: response.data.user, isLoading: false, isInitialized: true });
            _authChecked = true;
            return true;
          }
          set({ error: response.data.message || 'Login failed', isLoading: false, isInitialized: true });
          return false;
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Login failed',
            isLoading: false,
            isInitialized: true,
          });
          return false;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register(data);
          if (response.data.success) {
            set({ user: response.data.user, isLoading: false, isInitialized: true });
            _authChecked = true;
            return true;
          }
          set({ error: response.data.message || 'Registration failed', isLoading: false, isInitialized: true });
          return false;
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Registration failed',
            isLoading: false,
            isInitialized: true,
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
        _authChecked = false;
        set({ user: null, isLoading: false, error: null, isInitialized: true });
      },

      checkAuth: async () => {
        // CRITICAL: Multiple protections against infinite loop
        // 1. Check if already initialized (from rehydration)
        // 2. Check if currently loading
        // 3. Check module-level flag for this session
        const state = get();
        if (state.isInitialized || state.isLoading || _authChecked) {
          return;
        }

        _authChecked = true; // Mark as checked BEFORE async call
        set({ isLoading: true });

        try {
          const response = await authApi.me();
          if (response.data.success) {
            set({ user: response.data.user, isLoading: false, isInitialized: true });
          } else {
            set({ user: null, isLoading: false, isInitialized: true });
          }
        } catch (error) {
          set({ user: null, isLoading: false, isInitialized: true });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist user data
      partialize: (state) => ({
        user: state.user,
      }),
      // CRITICAL: Always set initialized after rehydration to prevent loop
      onRehydrateStorage: () => (state) => {
        if (state) {
          // ALWAYS set initialized to true - this prevents checkAuth loop
          state.isInitialized = true;
          // If we had a session, mark auth as checked
          if (state.user) {
            _authChecked = true;
          }
        }
      },
    }
  )
);
