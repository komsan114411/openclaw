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
  | 'credential_error'
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

export interface NewTransactionEvent {
  type: 'new_transaction';
  lineSessionId: string;
  newCount: number;
  total: number;
  timestamp: string;
}

export interface LoginQueueEvent {
  type: 'queued' | 'slot_available' | 'queue_update';
  lineAccountId: string;
  ownerId: string;
  position?: number;
  estimatedWaitSeconds?: number;
  timestamp: string;
}

interface UseLoginNotificationsOptions {
  lineAccountId?: string;
  onStatusChange?: (event: LoginStatusEvent) => void;
  onLoginEvent?: (event: LoginEvent) => void;
  onWorkerState?: (event: WorkerStateEvent) => void;
  onKeysCaptured?: (event: KeysCapturedEvent) => void;
  onNewTransaction?: (event: NewTransactionEvent) => void;
  onQueueEvent?: (event: LoginQueueEvent) => void;
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
  // Login queue tracking
  queuePosition: number | null;
  queueEstimatedWait: number | null;
  isQueued: boolean;
}

export function useLoginNotifications(options: UseLoginNotificationsOptions = {}) {
  const {
    lineAccountId,
    onStatusChange,
    onLoginEvent,
    onWorkerState,
    onKeysCaptured,
    onNewTransaction,
    onQueueEvent,
    showToasts = true,
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const joinRetryCountRef = useRef(0);
  const joinRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    queuePosition: null,
    queueEstimatedWait: null,
    isQueued: false,
  });

  // Use refs for callbacks and lineAccountId to avoid reconnecting on every render
  const onStatusChangeRef = useRef(onStatusChange);
  const onLoginEventRef = useRef(onLoginEvent);
  const onWorkerStateRef = useRef(onWorkerState);
  const onKeysCapturedRef = useRef(onKeysCaptured);
  const onNewTransactionRef = useRef(onNewTransaction);
  const onQueueEventRef = useRef(onQueueEvent);
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
    onNewTransactionRef.current = onNewTransaction;
  }, [onNewTransaction]);

  useEffect(() => {
    onQueueEventRef.current = onQueueEvent;
  }, [onQueueEvent]);

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
      credential_error: 'อีเมลหรือรหัสผ่าน LINE ไม่ถูกต้อง กรุณาแก้ไขข้อมูลเข้าสู่ระบบ',
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

    // Helper: attempt to join room via cookie-based auth with retry on failure
    const attemptJoin = (sock: Socket, retryCount = 0) => {
      const MAX_RETRIES = 3;
      // Send empty body — gateway auto-authenticates from session_id cookie
      sock.emit('join', {}, (response: { success: boolean; verified?: boolean; message?: string }) => {
        if (response?.success) {
          console.log('[LoginNotifications] Join succeeded (cookie auth)');
          joinRetryCountRef.current = 0;

          // Now subscribe to specific line account channel
          const currentAccountId = lineAccountIdRef.current;
          if (currentAccountId) {
            console.log('[LoginNotifications] Subscribing to account on connect:', currentAccountId);
            sock.emit('subscribe', { channel: `line-account:${currentAccountId}` });
          } else {
            console.log('[LoginNotifications] No account selected on connect - will subscribe when account is selected');
          }
        } else {
          console.warn('[LoginNotifications] Join failed:', response?.message || 'unknown reason');
          if (retryCount < MAX_RETRIES) {
            const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 8000);
            console.log(`[LoginNotifications] Retrying join in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            joinRetryTimerRef.current = setTimeout(() => {
              if (sock.connected) {
                attemptJoin(sock, retryCount + 1);
              }
            }, backoffMs);
          } else {
            console.error('[LoginNotifications] Join failed after max retries — WebSocket events may not be received');
          }
        }
      });
    };

    socket.on('connect', () => {
      console.log('[LoginNotifications] Connected:', socket.id);
      setState(prev => ({ ...prev, isConnected: true }));
      joinRetryCountRef.current = 0;

      // Join room via cookie-based auth (gateway reads session_id cookie automatically)
      attemptJoin(socket);
    });

    // Handle reconnection
    socket.on('reconnect', () => {
      console.log('[LoginNotifications] Reconnected:', socket.id);
      setState(prev => ({ ...prev, isConnected: true }));
      joinRetryCountRef.current = 0;

      // Re-join via cookie-based auth (subscribe happens inside attemptJoin on success)
      attemptJoin(socket);
    });

    // Handle connection error
    socket.on('connect_error', (error) => {
      console.error('[LoginNotifications] Connection error:', error.message);
      setState(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('disconnect', () => {
      console.log('[LoginNotifications] Disconnected');
      // Clear retry timer on disconnect
      if (joinRetryTimerRef.current) {
        clearTimeout(joinRetryTimerRef.current);
        joinRetryTimerRef.current = null;
      }
      // Clear all transient state on disconnect so stale data doesn't persist
      setState(prev => ({
        ...prev,
        isConnected: false,
        lastStatus: null,
        lastEvent: null,
        pinCode: null,
        pinAccountId: null,
        pinRequestId: null,
        pinReceivedAt: null,
        pinExpiresIn: null,
        pinStatus: null,
        queuePosition: null,
        queueEstimatedWait: null,
        isQueued: false,
      }));
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
        } else if (data.status === 'credential_error') {
          toast.error('อีเมลหรือรหัสผ่าน LINE ไม่ถูกต้อง กรุณาแก้ไขข้อมูลเข้าสู่ระบบ', {
            icon: '🔑',
            duration: 10000,
          });
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

    // Handle new transaction event (auto-fetch completed)
    socket.on('line-session:new-transaction', (data: NewTransactionEvent) => {
      console.log('[LoginNotifications] New transaction:', data);

      // Filter by lineAccountId if specified
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineSessionId !== currentAccountId) {
        return;
      }

      // Call callback via ref (stable reference)
      onNewTransactionRef.current?.(data);
    });

    // Handle login queue events
    socket.on('login:queued', (data: {
      lineAccountId: string;
      ownerId: string;
      position: number;
      estimatedWaitSeconds: number;
      timestamp: string;
    }) => {
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) return;

      console.log('[LoginNotifications] Login queued:', data);

      setState(prev => ({
        ...prev,
        isQueued: true,
        queuePosition: data.position,
        queueEstimatedWait: data.estimatedWaitSeconds,
      }));

      if (showToasts) {
        const waitMin = Math.ceil(data.estimatedWaitSeconds / 60);
        toast(`คิวที่ ${data.position} รอประมาณ ${waitMin} นาที`, {
          icon: '🕐',
          duration: 8000,
        });
      }

      onQueueEventRef.current?.({ ...data, type: 'queued' });
    });

    socket.on('login:slot_available', (data: {
      lineAccountId: string;
      ownerId: string;
      timestamp: string;
    }) => {
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) return;

      console.log('[LoginNotifications] Login slot available:', data);

      setState(prev => ({
        ...prev,
        isQueued: false,
        queuePosition: null,
        queueEstimatedWait: null,
      }));

      if (showToasts) {
        toast.success('ถึงคิวแล้ว! กำลังเริ่มล็อกอินอัตโนมัติ...', {
          icon: '🔔',
          duration: 8000,
        });
      }

      onQueueEventRef.current?.({ ...data, type: 'slot_available' });
    });

    socket.on('login:queue_update', (data: {
      lineAccountId: string;
      ownerId: string;
      position: number;
      estimatedWaitSeconds: number;
      timestamp: string;
    }) => {
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) return;

      setState(prev => ({
        ...prev,
        queuePosition: data.position,
        queueEstimatedWait: data.estimatedWaitSeconds,
      }));

      onQueueEventRef.current?.({ ...data, type: 'queue_update' });
    });

    return () => {
      // Clear any pending join retry timer
      if (joinRetryTimerRef.current) {
        clearTimeout(joinRetryTimerRef.current);
        joinRetryTimerRef.current = null;
      }
      socket.off('line-session:login-status');
      socket.off('line-session:login-event');
      socket.off('line-session:worker-state');
      socket.off('line-session:keys-captured');
      socket.off('line-session:pin-countdown');
      socket.off('line-session:pin-expired');
      socket.off('line-session:new-transaction');
      socket.off('login:queued');
      socket.off('login:slot_available');
      socket.off('login:queue_update');
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
      queuePosition: null,
      queueEstimatedWait: null,
      isQueued: false,
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
