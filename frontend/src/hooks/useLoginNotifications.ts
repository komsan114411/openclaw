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
  showToasts?: boolean;
  autoConnect?: boolean;
}

interface LoginNotificationState {
  isConnected: boolean;
  lastStatus: LoginStatusEvent | null;
  lastEvent: LoginEvent | null;
  pinCode: string | null;
}

export function useLoginNotifications(options: UseLoginNotificationsOptions = {}) {
  const {
    lineAccountId,
    onStatusChange,
    onLoginEvent,
    onWorkerState,
    showToasts = true,
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<LoginNotificationState>({
    isConnected: false,
    lastStatus: null,
    lastEvent: null,
    pinCode: null,
  });

  // Use refs for callbacks and lineAccountId to avoid reconnecting on every render
  const onStatusChangeRef = useRef(onStatusChange);
  const onLoginEventRef = useRef(onLoginEvent);
  const onWorkerStateRef = useRef(onWorkerState);
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
    lineAccountIdRef.current = lineAccountId;
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

      // Subscribe to login-notifications channel (public channel)
      socket.emit('subscribe', { channel: 'login-notifications' });

      // Subscribe to specific line account if provided
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId) {
        socket.emit('subscribe', { channel: `line-account:${currentAccountId}` });
      }
    });

    socket.on('disconnect', () => {
      console.log('[LoginNotifications] Disconnected');
      setState(prev => ({ ...prev, isConnected: false }));
    });

    // Handle login status updates
    socket.on('line-session:login-status', (data: LoginStatusEvent) => {
      console.log('[LoginNotifications] Status:', data);

      // Filter by lineAccountId if specified (using ref for stable reference)
      const currentAccountId = lineAccountIdRef.current;
      if (currentAccountId && data.lineAccountId !== currentAccountId) {
        return;
      }

      setState(prev => ({
        ...prev,
        lastStatus: data,
        pinCode: data.pinCode || prev.pinCode,
      }));

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

    return () => {
      socket.off('line-session:login-status');
      socket.off('line-session:login-event');
      socket.off('line-session:worker-state');
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

  // Clear state
  const clearState = useCallback(() => {
    setState({
      isConnected: state.isConnected,
      lastStatus: null,
      lastEvent: null,
      pinCode: null,
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
