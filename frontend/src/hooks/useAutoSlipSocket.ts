import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

/**
 * Auto-Slip WebSocket Events
 * Handles real-time updates for bank login status, PIN, and keys
 */

export interface AutoSlipPinRequiredEvent {
  bankAccountId: string;
  userId: string;
  pinCode: string;
  displayedAt: string;
  expiresAt: string;
  status: string;
}

export interface AutoSlipPinClearedEvent {
  bankAccountId: string;
  userId: string;
  reason: 'success' | 'timeout' | 'cancelled';
  timestamp: string;
}

export interface AutoSlipKeysExtractedEvent {
  bankAccountId: string;
  userId: string;
  extractedAt: string;
  source: string;
  success?: boolean;
  message?: string;
}

export interface AutoSlipStatusChangedEvent {
  bankAccountId: string;
  userId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
  timestamp: string;
}

export interface AutoSlipErrorEvent {
  bankAccountId: string;
  userId: string;
  error: string;
  errorCode?: string;
  timestamp: string;
}

interface UseAutoSlipSocketOptions {
  bankAccountId?: string;
  userId?: string;
  onPinRequired?: (event: AutoSlipPinRequiredEvent) => void;
  onPinCleared?: (event: AutoSlipPinClearedEvent) => void;
  onKeysExtracted?: (event: AutoSlipKeysExtractedEvent) => void;
  onStatusChanged?: (event: AutoSlipStatusChangedEvent) => void;
  onError?: (event: AutoSlipErrorEvent) => void;
  onLoginComplete?: (event: AutoSlipKeysExtractedEvent) => void;
  showToasts?: boolean;
  autoConnect?: boolean;
}

interface AutoSlipSocketState {
  isConnected: boolean;
  pinCode: string | null;
  pinExpiresAt: Date | null;
  pinRemainingSeconds: number;
  loginStatus: string | null;
  hasKeys: boolean;
  lastError: string | null;
}

export function useAutoSlipSocket(options: UseAutoSlipSocketOptions = {}) {
  const {
    bankAccountId,
    userId,
    onPinRequired,
    onPinCleared,
    onKeysExtracted,
    onStatusChanged,
    onError,
    onLoginComplete,
    showToasts = true,
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const [state, setState] = useState<AutoSlipSocketState>({
    isConnected: false,
    pinCode: null,
    pinExpiresAt: null,
    pinRemainingSeconds: 0,
    loginStatus: null,
    hasKeys: false,
    lastError: null,
  });

  // Refs for callbacks to avoid reconnection on every render
  const callbackRefs = useRef({
    onPinRequired,
    onPinCleared,
    onKeysExtracted,
    onStatusChanged,
    onError,
    onLoginComplete,
  });

  // Keep refs updated
  useEffect(() => {
    callbackRefs.current = {
      onPinRequired,
      onPinCleared,
      onKeysExtracted,
      onStatusChanged,
      onError,
      onLoginComplete,
    };
  }, [onPinRequired, onPinCleared, onKeysExtracted, onStatusChanged, onError, onLoginComplete]);

  // Countdown timer for PIN
  useEffect(() => {
    if (state.pinExpiresAt && state.pinRemainingSeconds > 0) {
      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.floor((state.pinExpiresAt!.getTime() - Date.now()) / 1000));
        setState(prev => ({
          ...prev,
          pinRemainingSeconds: remaining,
        }));
        
        if (remaining <= 0) {
          // PIN expired
          setState(prev => ({
            ...prev,
            pinCode: null,
            pinExpiresAt: null,
            pinRemainingSeconds: 0,
          }));
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
        }
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
    }
  }, [state.pinExpiresAt]);

  // Connect to WebSocket
  useEffect(() => {
    if (!autoConnect) return;

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(`${backendUrl}/ws`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[AutoSlipSocket] Connected:', socket.id);
      setState(prev => ({ ...prev, isConnected: true }));

      // Join user room
      if (userId) {
        socket.emit('join', { userId, role: 'user' });
      }

      // Subscribe to bank account channel
      if (bankAccountId) {
        console.log('[AutoSlipSocket] Subscribing to bank account:', bankAccountId);
        socket.emit('subscribe_bank_account', { bankAccountId });
      }
    });

    socket.on('reconnect', () => {
      console.log('[AutoSlipSocket] Reconnected');
      setState(prev => ({ ...prev, isConnected: true }));

      if (userId) {
        socket.emit('join', { userId, role: 'user' });
      }
      if (bankAccountId) {
        socket.emit('subscribe_bank_account', { bankAccountId });
      }
    });

    socket.on('disconnect', () => {
      console.log('[AutoSlipSocket] Disconnected');
      setState(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('connect_error', (error) => {
      console.error('[AutoSlipSocket] Connection error:', error.message);
      setState(prev => ({ ...prev, isConnected: false }));
    });

    // Handle PIN required event
    socket.on('auto-slip:pin_required', (data: AutoSlipPinRequiredEvent) => {
      console.log('[AutoSlipSocket] PIN required:', data);

      // Only process if for current bank account
      if (bankAccountId && data.bankAccountId !== bankAccountId) {
        console.log('[AutoSlipSocket] Ignoring PIN for different account');
        return;
      }

      const expiresAt = new Date(data.expiresAt);
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

      setState(prev => ({
        ...prev,
        pinCode: data.pinCode,
        pinExpiresAt: expiresAt,
        pinRemainingSeconds: remaining,
        loginStatus: data.status,
      }));

      if (showToasts) {
        toast.success(`รหัส PIN: ${data.pinCode}`, {
          duration: 60000,
          icon: '🔑',
        });
      }

      callbackRefs.current.onPinRequired?.(data);
    });

    // Handle PIN cleared event
    socket.on('auto-slip:pin_cleared', (data: AutoSlipPinClearedEvent) => {
      console.log('[AutoSlipSocket] PIN cleared:', data);

      if (bankAccountId && data.bankAccountId !== bankAccountId) {
        return;
      }

      // Clear PIN state
      setState(prev => ({
        ...prev,
        pinCode: null,
        pinExpiresAt: null,
        pinRemainingSeconds: 0,
      }));

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      if (showToasts && data.reason === 'success') {
        toast.success('ยืนยัน PIN สำเร็จ!', { icon: '✅' });
      } else if (showToasts && data.reason === 'timeout') {
        toast.error('PIN หมดอายุ', { icon: '⏰' });
      }

      callbackRefs.current.onPinCleared?.(data);
    });

    // Handle keys extracted event
    socket.on('auto-slip:keys_extracted', (data: AutoSlipKeysExtractedEvent) => {
      console.log('[AutoSlipSocket] Keys extracted:', data);

      if (bankAccountId && data.bankAccountId !== bankAccountId) {
        return;
      }

      setState(prev => ({
        ...prev,
        hasKeys: true,
        loginStatus: 'KEYS_READY',
      }));

      if (showToasts) {
        toast.success('ดึง Keys สำเร็จ!', { icon: '🔑', duration: 5000 });
      }

      callbackRefs.current.onKeysExtracted?.(data);
    });

    // Handle login complete event (explicitly closes PIN modal)
    socket.on('auto-slip:login_complete', (data: AutoSlipKeysExtractedEvent) => {
      console.log('[AutoSlipSocket] Login complete:', data);

      if (bankAccountId && data.bankAccountId !== bankAccountId) {
        return;
      }

      // Clear PIN and update status
      setState(prev => ({
        ...prev,
        pinCode: null,
        pinExpiresAt: null,
        pinRemainingSeconds: 0,
        hasKeys: true,
        loginStatus: 'KEYS_READY',
      }));

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      if (showToasts) {
        toast.success('ล็อกอินสำเร็จ! Keys พร้อมใช้งาน', { icon: '✅', duration: 5000 });
      }

      callbackRefs.current.onLoginComplete?.(data);
    });

    // Handle status changed event
    socket.on('auto-slip:status_changed', (data: AutoSlipStatusChangedEvent) => {
      console.log('[AutoSlipSocket] Status changed:', data);

      if (bankAccountId && data.bankAccountId !== bankAccountId) {
        return;
      }

      setState(prev => ({
        ...prev,
        loginStatus: data.newStatus,
      }));

      callbackRefs.current.onStatusChanged?.(data);
    });

    // Handle error event
    socket.on('auto-slip:error', (data: AutoSlipErrorEvent) => {
      console.log('[AutoSlipSocket] Error:', data);

      if (bankAccountId && data.bankAccountId !== bankAccountId) {
        return;
      }

      // Clear PIN on error
      setState(prev => ({
        ...prev,
        pinCode: null,
        pinExpiresAt: null,
        pinRemainingSeconds: 0,
        lastError: data.error,
        loginStatus: 'ERROR_SOFT',
      }));

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      if (showToasts) {
        toast.error(data.error || 'เกิดข้อผิดพลาด', { icon: '❌' });
      }

      callbackRefs.current.onError?.(data);
    });

    return () => {
      socket.off('auto-slip:pin_required');
      socket.off('auto-slip:pin_cleared');
      socket.off('auto-slip:keys_extracted');
      socket.off('auto-slip:login_complete');
      socket.off('auto-slip:status_changed');
      socket.off('auto-slip:error');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
      socket.off('connect_error');
      socket.disconnect();

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [autoConnect, bankAccountId, userId, showToasts]);

  // Subscribe to bank account
  const subscribeToBankAccount = useCallback((accountId: string) => {
    if (socketRef.current?.connected) {
      console.log('[AutoSlipSocket] Subscribing to bank account:', accountId);
      socketRef.current.emit('subscribe_bank_account', { bankAccountId: accountId });
    }
  }, []);

  // Unsubscribe from bank account
  const unsubscribeFromBankAccount = useCallback((accountId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_bank_account', { bankAccountId: accountId });
    }
  }, []);

  // Clear state
  const clearState = useCallback(() => {
    setState({
      isConnected: state.isConnected,
      pinCode: null,
      pinExpiresAt: null,
      pinRemainingSeconds: 0,
      loginStatus: null,
      hasKeys: false,
      lastError: null,
    });

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [state.isConnected]);

  return {
    ...state,
    subscribeToBankAccount,
    unsubscribeFromBankAccount,
    clearState,
  };
}
