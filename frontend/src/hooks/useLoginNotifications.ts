import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

export type LoginStatusType =
  | 'idle'
  | 'requesting'
  | 'initializing'
  | 'launching_browser'
  | 'loading_extension'
  | 'checking_session'
  | 'entering_credentials'
  | 'waiting_pin'
  | 'pin_displayed'
  | 'verifying'
  | 'extracting_keys'
  | 'triggering_messages'
  | 'success'
  | 'failed'
  | 'cooldown';

export interface LoginStatusEvent {
  type: 'login_status';
  lineAccountId: string;
  status: LoginStatusType;
  message: string;
  pinCode?: string;
  error?: string;
  requestId?: string;
  timestamp: string;
  // Keys included in success event
  keys?: {
    xLineAccess: string;
    xHmac: string;
  };
  chatMid?: string;
}

export interface LoginEvent {
  type: 'login_requested' | 'login_started' | 'login_completed' | 'login_failed' | 'login_cancelled';
  lineAccountId: string;
  message: string;
  success?: boolean;
  error?: string;
  nextRetryIn?: number;
  requestId?: string;
  timestamp: string;
  // Keys info from login_completed event
  keysInfo?: {
    hasKeys: boolean;
    chatMid?: string;
    extractedAt?: string;
    hasCurl: boolean;
    status?: string;
  };
}

export interface KeysCapturedEvent {
  type: 'keys_captured';
  lineAccountId: string;
  message: string;
  keys: {
    xLineAccess: string;
    xHmac?: string;
    chatMid?: string;
    extractedAt?: string;
  };
  hasCurl: boolean;
  timestamp: string;
}

export interface WorkerStateEvent {
  type: 'worker_state';
  lineAccountId: string;
  state: string;
  pinCode?: string;
  hasKeys?: boolean;
  hasChatMid?: boolean;
  error?: string;
  timestamp: string;
}

interface UseLoginNotificationsOptions {
  lineAccountId?: string;
  onStatusChange?: (event: LoginStatusEvent) => void;
  onLoginEvent?: (event: LoginEvent) => void;
  onWorkerState?: (event: WorkerStateEvent) => void;
  onKeysCaptured?: (event: KeysCapturedEvent) => void;
  showToasts?: boolean;
  autoConnect?: boolean;
}

interface LoginNotificationState {
  isConnected: boolean;
  lastStatus: LoginStatusEvent | null;
  lastEvent: LoginEvent | null;
  pinCode: string | null;
  // Track which account and request the PIN belongs to
  pinAccountId: string | null;
  pinRequestId: string | null;
  pinReceivedAt: Date | null;
  // Server-synced PIN countdown
  pinExpiresIn: number | null;
  pinStatus: 'FRESH' | 'NEW' | 'OLD' | 'NO_PIN' | null;
}

export function useLoginNotifications(options: UseLoginNotificationsOptions = {}) {
  const {
    lineAccountId,
    onStatusChange,
    onLoginEvent,
    onWorkerState,
    onKeysCaptured,
    showToasts = true,
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<LoginNotificationState>({
    isConnected: false,
    lastStatus: null,
    lastEvent: null,
    pinCode: null,
    pinAccountId: null,
    pinRequestId: null,
    pinReceivedAt: null,
    pinExpiresIn: null,
    pinStatus: null,
  });

  // Use refs for callbacks and lineAccountId to avoid reconnecting on every render
  const onStatusChangeRef = useRef(onStatusChange);
  const onLoginEventRef = useRef(onLoginEvent);
  const onWorkerStateRef = useRef(onWorkerState);
  const onKeysCapturedRef = useRef(onKeysCaptured);
  const lineAccountIdRef = useRef(lineAccountId);

  // Keep refs updated
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onLoginEventRef.current = onLoginEvent;
  }, [onLoginEvent]);

  useEffect(() => {
    onWorkerStateRef.current = onWorkerState;
  }, [onWorkerState]);

  useEffect(() => {
    onKeysCapturedRef.current = onKeysCaptured;
  }, [onKeysCaptured]);

  useEffect(() => {
    const prevAccountId = lineAccountIdRef.current;
    lineAccountIdRef.current = lineAccountId;

    // Subscribe when account is set (even if same - to ensure subscription exists)
    if (socketRef.current?.connected && lineAccountId) {
      // Unsubscribe from previous account if different
      if (prevAccountId && prevAccountId !== lineAccountId) {
        console.log('[LoginNotifications] Unsubscribing from previous account:', prevAccountId);
        socketRef.current.emit('unsubscribe', { channel: `line-account:${prevAccountId}` });
      }

      // Always subscribe to current account (ensure subscription exists)
      console.log('[LoginNotifications] Subscribing to account:', lineAccountId);
      socketRef.current.emit('subscribe', { channel: `line-account:${lineAccountId}` });

      // Clear previous PIN state if account changed - CRITICAL for PIN isolation
      if (prevAccountId !== lineAccountId) {
        console.log('[LoginNotifications] Account changed, clearing all PIN state');
        setState(prev => ({
          ...prev,
          pinCode: null,
          pinAccountId: null,
          pinRequestId: null,
          pinReceivedAt: null,
          pinExpiresIn: null,
          pinStatus: null,
          lastStatus: null,
          lastEvent: null,
        }));
      }
    }
  }, [lineAccountId]);

  // Status message Thai translations
  const getStatusMessage = useCallback((status: LoginStatusType, message?: string): string => {
    const translations: Record<LoginStatusType, string> = {
      idle: 'พร้อมใช้งาน',
      requesting: 'กำลังส่งคำขอ...',
      initializing: 'กำลังเริ่มต้น...',
      launching_browser: 'กำลังเปิดเบราว์เซอร์...',
      loading_extension: 'กำลังโหลด LINE Extension...',
      checking_session: 'กำลังตรวจสอบ Session...',
      entering_credentials: 'กำลังกรอกข้อมูล...',
      waiting_pin: 'รอรหัส PIN...',
      pin_displayed: 'กรุณาใส่รหัส PIN บนแอป LINE',
      verifying: 'กำลังตรวจสอบ...',
      extracting_keys: 'กำลังดึง Keys...',
      triggering_messages: 'กำลังดึงข้อความ...',
      success: 'Login สำเร็จ!',
      failed: message || 'Login ล้มเหลว',
      cooldown: 'กำลังรอ Cooldown...',
    };
    return translations[status] || message || status;
  }, []);

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
      console.log('[LoginNotifications] Connected:', socket.id);
      setState(prev => ({ ...prev, isConnected: true }));

      // Join admin room to receive notifications (may fail without session)
      socket.emit('join', { userId: 'admin', role: 'admin' });

      // Subscribe to specific line account channel only (NOT the global login-notifications)
      // This ensures PIN isolation - only receive events for the account being viewed
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId) {
        console.log('[LoginNotifications] Subscribing to account on connect:', currentAccountId);
        socket.emit('subscribe', { channel: `line-account:${currentAccountId}` });
      } else {
        console.log('[LoginNotifications] No account selected on connect - will subscribe when account is selected');
      }
    });

    // Handle reconnection
    socket.on('reconnect', () => {
      console.log('[LoginNotifications] Reconnected:', socket.id);
      setState(prev => ({ ...prev, isConnected: true }));

      // Re-join admin room
      socket.emit('join', { userId: 'admin', role: 'admin' });

      // Re-subscribe to account channel if selected
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId) {
        console.log('[LoginNotifications] Re-subscribing to account after reconnect:', currentAccountId);
        socket.emit('subscribe', { channel: `line-account:${currentAccountId}` });
      }
    });

    // Handle connection error
    socket.on('connect_error', (error) => {
      console.error('[LoginNotifications] Connection error:', error.message);
      setState(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('disconnect', () => {
      console.log('[LoginNotifications] Disconnected');
      setState(prev => ({ ...prev, isConnected: false }));
    });

    // Handle login status updates
    socket.on('line-session:login-status', (data: LoginStatusEvent) => {
      // CRITICAL: Validate account ID to prevent PIN mixing
      const currentAccountId = lineAccountIdRef.current;

      // Log all received events for debugging
      console.log('[LoginNotifications] Status received:', {
        eventAccountId: data.lineAccountId,
        currentAccountId,
        status: data.status,
        hasPinCode: !!data.pinCode,
        pinCode: data.pinCode,
        rawData: data,
      });

      // If no current account, still accept PIN events (for debugging and recovery)
      // but log a warning
      if (!currentAccountId) {
        console.warn('[LoginNotifications] No current account set, but event received:', data.lineAccountId);
        // Still process PIN events even without current account selected
        // This helps in cases where account selection timing is delayed
        if (data.pinCode) {
          console.log('[LoginNotifications] PIN event received without current account - storing anyway');
        }
      }

      // Strict filtering: only accept events for the account we're viewing
      // But relax filtering for PIN events to ensure they're not missed
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        console.warn('[LoginNotifications] Ignoring event for different account:', {
          expected: currentAccountId,
          received: data.lineAccountId,
        });
        return;
      }

      console.log('[LoginNotifications] Processing event:', {
        account: data.lineAccountId,
        status: data.status,
        pin: data.pinCode || 'none',
      });

      setState(prev => {
        // IMPORTANT: Only update PIN if:
        // 1. New PIN is provided in this event, OR
        // 2. This is for the same request as the existing PIN
        // This prevents old PINs from persisting incorrectly

        let newPinCode = prev.pinCode;
        let newPinAccountId = prev.pinAccountId;
        let newPinRequestId = prev.pinRequestId;
        let newPinReceivedAt = prev.pinReceivedAt;

        // If we have a new PIN, update all PIN tracking fields
        if (data.pinCode) {
          newPinCode = data.pinCode;
          newPinAccountId = data.lineAccountId;
          newPinRequestId = data.requestId || null;
          newPinReceivedAt = new Date();
          console.log('[LoginNotifications] New PIN received:', {
            pin: data.pinCode,
            accountId: data.lineAccountId,
            requestId: data.requestId,
          });
        }

        // Clear PIN on success, failure, or idle status (login completed/cancelled)
        if (['success', 'failed', 'idle'].includes(data.status)) {
          newPinCode = null;
          newPinAccountId = null;
          newPinRequestId = null;
          newPinReceivedAt = null;
          console.log('[LoginNotifications] Clearing PIN due to status:', data.status);
        }

        // Verify PIN still belongs to current account (extra safety)
        if (newPinCode && newPinAccountId !== currentAccountId) {
          console.warn('[LoginNotifications] Clearing stale PIN for different account');
          newPinCode = null;
          newPinAccountId = null;
          newPinRequestId = null;
          newPinReceivedAt = null;
        }

        return {
          ...prev,
          lastStatus: data,
          pinCode: newPinCode,
          pinAccountId: newPinAccountId,
          pinRequestId: newPinRequestId,
          pinReceivedAt: newPinReceivedAt,
        };
      });

      // Show toast notification
      if (showToasts) {
        if (data.status === 'pin_displayed' && data.pinCode) {
          toast.success(`PIN: ${data.pinCode}`, {
            duration: 60000,
            icon: '🔑',
          });
        } else if (data.status === 'success') {
          toast.success('Login สำเร็จ!', { icon: '✅' });
        } else if (data.status === 'failed') {
          toast.error(data.error || 'Login ล้มเหลว', { icon: '❌' });
        } else if (data.status === 'cooldown') {
          toast('กำลังรอ Cooldown...', { icon: '⏳' });
        }
      }

      // Call callback via ref (stable reference)
      onStatusChangeRef.current?.(data);
    });

    // Handle login events
    socket.on('line-session:login-event', (data: LoginEvent) => {
      console.log('[LoginNotifications] Event:', data);

      // Filter by lineAccountId if specified
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        return;
      }

      setState(prev => ({ ...prev, lastEvent: data }));

      if (showToasts) {
        switch (data.type) {
          case 'login_completed':
            toast.success('Login สำเร็จ! Keys ถูกบันทึกแล้ว', { icon: '✅' });
            break;
          case 'login_failed':
            toast.error(`Login ล้มเหลว: ${data.error || 'Unknown error'}`, { icon: '❌' });
            break;
          case 'login_cancelled':
            toast('Login ถูกยกเลิก', { icon: '🚫' });
            break;
        }
      }

      // Call callback via ref (stable reference)
      onLoginEventRef.current?.(data);
    });

    // Handle worker state changes
    socket.on('line-session:worker-state', (data: WorkerStateEvent) => {
      console.log('[LoginNotifications] Worker state:', data);

      // Filter by lineAccountId if specified
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        return;
      }

      if (data.pinCode) {
        setState(prev => ({ ...prev, pinCode: data.pinCode || null }));
      }

      // Call callback via ref (stable reference)
      onWorkerStateRef.current?.(data);
    });

    // Handle keys captured event (for auto-refresh)
    socket.on('line-session:keys-captured', (data: KeysCapturedEvent) => {
      console.log('[LoginNotifications] Keys captured:', data);

      // Filter by lineAccountId if specified
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        return;
      }

      if (showToasts) {
        toast.success('Keys captured! cURL command พร้อมใช้งาน', {
          icon: '🔑',
          duration: 5000,
        });
      }

      // Call callback via ref (stable reference)
      onKeysCapturedRef.current?.(data);
    });

    // Handle PIN countdown sync from server
    socket.on('line-session:pin-countdown', (data: {
      lineAccountId: string;
      pinCode: string;
      expiresIn: number;
      status: 'FRESH' | 'NEW' | 'OLD';
      ageSeconds: number;
      isUsable: boolean;
      timestamp: string;
    }) => {
      // Filter by lineAccountId if specified
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        return;
      }

      console.log('[LoginNotifications] PIN countdown update:', data);

      // Update state with server-synced countdown
      setState(prev => ({
        ...prev,
        pinCode: data.pinCode,
        pinAccountId: data.lineAccountId,
        pinExpiresIn: data.expiresIn,
        pinStatus: data.status,
      }));
    });

    // Handle PIN expired event
    socket.on('line-session:pin-expired', (data: {
      lineAccountId: string;
      reason: string;
      timestamp: string;
    }) => {
      // Filter by lineAccountId if specified
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        return;
      }

      console.log('[LoginNotifications] PIN expired:', data);

      // Clear PIN state
      setState(prev => ({
        ...prev,
        pinCode: null,
        pinAccountId: null,
        pinRequestId: null,
        pinReceivedAt: null,
        pinExpiresIn: null,
        pinStatus: 'NO_PIN',
      }));

      // Show toast notification
      if (showToasts) {
        toast.error('PIN หมดอายุ - กรุณาล็อกอินใหม่', {
          icon: '⏰',
          duration: 5000,
        });
      }
    });

    return () => {
      socket.off('line-session:login-status');
      socket.off('line-session:login-event');
      socket.off('line-session:worker-state');
      socket.off('line-session:keys-captured');
      socket.off('line-session:pin-countdown');
      socket.off('line-session:pin-expired');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
      socket.off('connect_error');
      socket.disconnect();
    };
  }, [autoConnect, showToasts]);

  // Subscribe to specific account
  const subscribeToAccount = useCallback((accountId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { channel: `line-account:${accountId}` });
    }
  }, []);

  // Unsubscribe from account
  const unsubscribeFromAccount = useCallback((accountId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', { channel: `line-account:${accountId}` });
    }
  }, []);

  // Clear state - resets all PIN tracking for clean slate
  const clearState = useCallback(() => {
    console.log('[LoginNotifications] Clearing all state');
    setState({
      isConnected: state.isConnected,
      lastStatus: null,
      lastEvent: null,
      pinCode: null,
      pinAccountId: null,
      pinRequestId: null,
      pinReceivedAt: null,
      pinExpiresIn: null,
      pinStatus: null,
    });
  }, [state.isConnected]);

  return {
    ...state,
    subscribeToAccount,
    unsubscribeFromAccount,
    clearState,
    getStatusMessage,
  };
}
