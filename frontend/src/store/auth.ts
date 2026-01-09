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
  isInitialized: boolean; // Track if initial auth check is done
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (data: { username: string; password: string; email?: string; fullName?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  setInitialized: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isInitialized: false, // Start as not initialized
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(username, password);
          if (response.data.success) {
            set({ user: response.data.user, isLoading: false, isInitialized: true });
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

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register(data);
          if (response.data.success) {
            set({ user: response.data.user, isLoading: false, isInitialized: true });
            return true;
          }
          set({ error: response.data.message || 'Registration failed', isLoading: false });
          return false;
        } catch (error: any) {
          set({
            error: error.response?.data?.message || 'Registration failed',
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
        set({ user: null, isLoading: false, error: null, isInitialized: true });
      },

      checkAuth: async () => {
        // If already initialized or currently checking, don't start another check
        const state = get();
        if (state.isInitialized || state.isLoading) {
          return;
        }

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

      setInitialized: () => set({ isInitialized: true }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist user data, NOT isInitialized (it's runtime state)
      partialize: (state) => ({
        user: state.user,
      }),
      // On rehydration, always mark as initialized to prevent infinite loop
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Always set initialized to true after rehydration
          // checkAuth will NOT be called if isInitialized is true
          state.isInitialized = true;
        }
      },
    }
  )
);

