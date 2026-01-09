import { create } from 'zustand';
import { walletApi } from '@/lib/api';

interface WalletState {
  balance: number;
  isLoading: boolean;
  lastUpdated: Date | null;
  fetchBalance: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  setBalance: (balance: number) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  isLoading: false,
  lastUpdated: null,

  fetchBalance: async () => {
    // Prevent multiple simultaneous fetches
    if (get().isLoading) return;
    
    set({ isLoading: true });
    try {
      const res = await walletApi.getBalance();
      set({ 
        balance: res.data.balance || 0, 
        isLoading: false,
        lastUpdated: new Date()
      });
    } catch {
      set({ isLoading: false });
    }
  },

  refreshBalance: async () => {
    // Force refresh without checking isLoading
    set({ isLoading: true });
    try {
      const res = await walletApi.getBalance();
      set({ 
        balance: res.data.balance || 0, 
        isLoading: false,
        lastUpdated: new Date()
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setBalance: (balance: number) => {
    set({ balance, lastUpdated: new Date() });
  },

  reset: () => {
    set({ balance: 0, isLoading: false, lastUpdated: null });
  },
}));
