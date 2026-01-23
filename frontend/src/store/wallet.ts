import { create } from 'zustand';
import { walletApi } from '@/lib/api';

interface WalletState {
  balance: number;
  isLoading: boolean;
  lastUpdated: Date | null;
  fetchBalance: (force?: boolean) => Promise<number>;
  refreshBalance: () => Promise<number>;
  setBalance: (balance: number) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  isLoading: false,
  lastUpdated: null,

  /**
   * Fetch balance from API
   * @param force - If true, fetch even if already loading (for forced refresh)
   * @returns The fetched balance
   */
  fetchBalance: async (force = false) => {
    // Prevent multiple simultaneous fetches unless forced
    if (!force && get().isLoading) {
      return get().balance;
    }

    set({ isLoading: true });
    try {
      const res = await walletApi.getBalance();
      const newBalance = res.data.balance || 0;
      set({
        balance: newBalance,
        isLoading: false,
        lastUpdated: new Date(),
      });
      return newBalance;
    } catch {
      set({ isLoading: false });
      return get().balance;
    }
  },

  /**
   * Force refresh balance (alias for fetchBalance(true))
   */
  refreshBalance: async () => {
    return get().fetchBalance(true);
  },

  setBalance: (balance: number) => {
    set({ balance, lastUpdated: new Date() });
  },

  reset: () => {
    set({ balance: 0, isLoading: false, lastUpdated: null });
  },
}));
