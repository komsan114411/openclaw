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
  _hasHydrated: boolean; // Track if store has hydrated from storage
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
      isInitialized: false,
      error: null,
      _hasHydrated: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(username, password);
          if (response.data.success) {
            set({ user: response.data.user, isLoading: false, isInitialized: true });
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
        set({ user: null, isLoading: false, error: null, isInitialized: true });
      },

      checkAuth: async () => {
        // Only check isLoading to prevent concurrent calls
        // Let each component's useRef handle calling this only once
        if (get().isLoading) {
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
      // Only persist user data
      partialize: (state) => ({
        user: state.user,
      }),
      // On rehydration complete, set flag and initialize
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          // If we have a persisted user, mark as initialized
          // so the UI can show immediately while checkAuth verifies
          if (state.user) {
            state.isInitialized = true;
          }
        }
      },
    }
  )
);
