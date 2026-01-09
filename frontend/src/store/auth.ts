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
  lastChecked: number;
  login: (username: string, password: string) => Promise<boolean>;
  register: (data: { username: string; password: string; email?: string; fullName?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  setInitialized: () => void;
}

// Module-level flags for preventing duplicate calls
let _authChecked = false;
let _authCheckInProgress = false;

// Minimum time between auth checks (5 seconds)
const AUTH_CHECK_COOLDOWN = 5000;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      error: null,
      lastChecked: 0,

      login: async (username: string, password: string) => {
        // Prevent multiple simultaneous login attempts
        const state = get();
        if (state.isLoading) {
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(username, password);
          if (response.data.success) {
            set({ 
              user: response.data.user, 
              isLoading: false, 
              isInitialized: true,
              lastChecked: Date.now()
            });
            _authChecked = true;
            return true;
          }
          set({ 
            error: response.data.message || 'Login failed', 
            isLoading: false, 
            isInitialized: true 
          });
          return false;
        } catch (error: any) {
          const errorMessage = error.response?.data?.message || 
                              error.message || 
                              'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
          set({
            error: errorMessage,
            isLoading: false,
            isInitialized: true,
          });
          return false;
        }
      },

      register: async (data) => {
        const state = get();
        if (state.isLoading) {
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register(data);
          if (response.data.success) {
            set({ 
              user: response.data.user, 
              isLoading: false, 
              isInitialized: true,
              lastChecked: Date.now()
            });
            _authChecked = true;
            return true;
          }
          set({ 
            error: response.data.message || 'Registration failed', 
            isLoading: false, 
            isInitialized: true 
          });
          return false;
        } catch (error: any) {
          const errorMessage = error.response?.data?.message || 
                              error.message || 
                              'เกิดข้อผิดพลาดในการลงทะเบียน';
          set({
            error: errorMessage,
            isLoading: false,
            isInitialized: true,
          });
          return false;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authApi.logout();
        } catch (error) {
          // Ignore logout errors - still clear local state
          console.warn('Logout API error (ignored):', error);
        }
        _authChecked = false;
        _authCheckInProgress = false;
        set({ 
          user: null, 
          isLoading: false, 
          error: null, 
          isInitialized: true,
          lastChecked: 0
        });
      },

      checkAuth: async () => {
        const state = get();
        const now = Date.now();

        // Multiple layers of protection against infinite loops and duplicate calls
        // 1. Already initialized - skip
        // 2. Currently loading - skip
        // 3. Module flag already checked - skip
        // 4. Check in progress - skip
        // 5. Recently checked (within cooldown) - skip
        if (state.isInitialized) {
          return;
        }

        if (state.isLoading || _authCheckInProgress) {
          return;
        }

        if (_authChecked) {
          // Already checked but not initialized - just set initialized
          set({ isInitialized: true });
          return;
        }

        if (state.lastChecked && (now - state.lastChecked) < AUTH_CHECK_COOLDOWN) {
          set({ isInitialized: true });
          return;
        }

        // Mark as in progress BEFORE any async operation
        _authCheckInProgress = true;
        _authChecked = true;
        set({ isLoading: true });

        try {
          const response = await authApi.me();
          if (response.data.success && response.data.user) {
            set({ 
              user: response.data.user, 
              isLoading: false, 
              isInitialized: true,
              lastChecked: now
            });
          } else {
            set({ 
              user: null, 
              isLoading: false, 
              isInitialized: true,
              lastChecked: now
            });
          }
        } catch (error: any) {
          // Handle all errors gracefully - don't throw, don't retry
          // This includes CORS errors, network errors, 401s, etc.
          console.warn('Auth check failed (non-critical):', error?.message || 'Unknown error');
          set({ 
            user: null, 
            isLoading: false, 
            isInitialized: true,
            lastChecked: now
          });
        } finally {
          _authCheckInProgress = false;
        }
      },

      clearError: () => set({ error: null }),
      
      setInitialized: () => {
        _authChecked = true;
        set({ isInitialized: true });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist essential user data
      partialize: (state) => ({
        user: state.user,
        lastChecked: state.lastChecked,
      }),
      // Handle rehydration carefully to prevent loops
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('Auth storage rehydration error:', error);
          return;
        }
        
        if (state) {
          // ALWAYS set initialized after rehydration
          state.isInitialized = true;
          state.isLoading = false;
          
          // If we had a valid session, mark as checked
          if (state.user) {
            _authChecked = true;
          }
        }
      },
    }
  )
);

// Export a function to reset auth state (useful for testing)
export const resetAuthState = () => {
  _authChecked = false;
  _authCheckInProgress = false;
  useAuthStore.setState({
    user: null,
    isLoading: false,
    isInitialized: false,
    error: null,
    lastChecked: 0,
  });
};
