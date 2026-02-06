'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineSessionUserApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Key,
  LogIn,
  Mail,
  Lock,
  Copy,
  Clock,
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Building2,
  Eye,
  EyeOff,
  Smartphone,
  Plus,
  Trash2,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  TrendingUp,
  TrendingDown,
  Download,
} from 'lucide-react';
import { useLoginNotifications } from '@/hooks';

// Interface for LINE Login (not LINE OA)
interface LineLogin {
  _id: string;
  name: string;
  status: string;
  bankName?: string;
  bankCode?: string;
  hasKeys: boolean;
  hasCredentials?: boolean;
  email?: string;
  extractedAt?: string;
  createdAt?: string;
}

interface Bank {
  bankCode: string;
  bankNameTh: string;
  bankNameEn: string;
  bankImg?: string;
  reLoginAtMins?: number;
}

interface SessionStatus {
  hasKeys: boolean;
  xLineAccess?: string;
  xHmac?: string;
  chatMid?: string;
  bankCode?: string;
  bankName?: string;
  status?: string;
  lastCheckedAt?: string;
  lastCheckResult?: string;
  extractedAt?: string;
  source?: string;
}

interface LoginStatus {
  success: boolean;
  status?: string;
  pin?: string;
  message?: string;
  stage?: string;
  error?: string;
}

interface CredentialsStatus {
  hasCredentials: boolean;
  email?: string;
  bankCode?: string;
  bankName?: string;
}

// Transaction interface for display
interface Transaction {
  _id: string;
  messageId: string;
  text?: string;
  originalMsg?: string;
  transactionType: string;
  amount?: string;
  balance?: string;
  messageDate?: string;
  bankCode?: string;
  createdAt?: string;
  from?: string;
  to?: string;
}

// Parse bank message to extract details
function parseBankMessage(text: string): {
  type: string;
  amount: string;
  fromAccount?: string;
  toAccount?: string;
  balance?: string;
  description?: string;
} {
  const result: ReturnType<typeof parseBankMessage> = {
    type: 'unknown',
    amount: '',
  };

  if (!text) return result;

  // GSB format: "มีการฝาก/โอนเงิน 40.00 บาท จากบัญชี KKBA 0020XXXX2"
  // SCB format: "เงินเข้า +1,000.00 บาท จาก xxx เข้าบัญชี xxx"
  // KBANK format: "รับโอนเงิน 500.00 บาท จาก K PLUS xxx"

  // Extract amount
  const amountMatch = text.match(/([+-]?[\d,]+\.?\d*)\s*บาท/);
  if (amountMatch) {
    result.amount = amountMatch[1].replace(/,/g, '');
  }

  // Extract from account
  const fromMatch = text.match(/จากบัญชี\s*([^\s]+(?:\s+\d+[X\d]+)?)/i) ||
                    text.match(/จาก\s+([A-Z\s]+\d+[X\d]*)/i) ||
                    text.match(/จาก\s+(.+?)(?:\s+เข้า|$)/i);
  if (fromMatch) {
    result.fromAccount = fromMatch[1].trim();
  }

  // Extract to account
  const toMatch = text.match(/เข้าบัญชี\s*([^\s]+(?:\s+\d+[X\d]+)?)/i) ||
                  text.match(/ไปยังบัญชี\s*([^\s]+)/i);
  if (toMatch) {
    result.toAccount = toMatch[1].trim();
  }

  // Extract balance
  const balanceMatch = text.match(/คงเหลือ\s*([+-]?[\d,]+\.?\d*)\s*บาท/i) ||
                       text.match(/ยอดคงเหลือ\s*([+-]?[\d,]+\.?\d*)/i);
  if (balanceMatch) {
    result.balance = balanceMatch[1].replace(/,/g, '');
  }

  // Determine type
  if (text.includes('ฝาก') || text.includes('เงินเข้า') || text.includes('รับโอน') || text.includes('โอนเงิน')) {
    result.type = 'deposit';
  } else if (text.includes('ถอน') || text.includes('เงินออก') || text.includes('โอนออก') || text.includes('ชำระ')) {
    result.type = 'withdraw';
  }

  result.description = text;

  return result;
}

interface TransactionSummary {
  deposits: { total: number; count: number };
  withdrawals: { total: number; count: number };
  totalTransactions: number;
  balance?: string;
}

export default function LineSessionPage() {
  const [lineSessions, setLineSessions] = useState<LineLogin[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<LineLogin | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Delete confirm
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<LineLogin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Setup form
  const [setupForm, setSetupForm] = useState({
    email: '',
    password: '',
    bankCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  // Per-account tracking Sets (แทน global boolean เพื่อรองรับหลายบัญชีพร้อมกัน)
  const [settingUpAccounts, setSettingUpAccounts] = useState<Set<string>>(new Set());
  const [pollingAccounts, setPollingAccounts] = useState<Set<string>>(new Set());

  // Session/Login status - Track แยกตามบัญชี
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [credentialsStatus, setCredentialsStatus] = useState<CredentialsStatus | null>(null);
  
  // [FIX] Track login status แยกตามบัญชี - ป้องกันปัญหาหลายบัญชีปนกัน
  const [loginStatusMap, setLoginStatusMap] = useState<Map<string, LoginStatus>>(new Map());
  const [loginSuccessMap, setLoginSuccessMap] = useState<Map<string, {
    show: boolean;
    keys?: { xLineAccess?: string; xHmac?: string; chatMid?: string };
  }>>(new Map());
  
  // Helper functions สำหรับ track status แยกตามบัญชี
  const getLoginStatus = useCallback((accountId: string) => loginStatusMap.get(accountId) || null, [loginStatusMap]);
  const getLoginSuccess = useCallback((accountId: string) => loginSuccessMap.get(accountId) || { show: false }, [loginSuccessMap]);
  
  const setLoginStatusForAccount = useCallback((accountId: string, status: LoginStatus | null) => {
    setLoginStatusMap(prev => {
      const newMap = new Map(prev);
      if (status) {
        newMap.set(accountId, status);
      } else {
        newMap.delete(accountId);
      }
      return newMap;
    });
  }, []);
  
  const setLoginSuccessForAccount = useCallback((accountId: string, success: { show: boolean; keys?: { xLineAccess?: string; xHmac?: string; chatMid?: string } }) => {
    setLoginSuccessMap(prev => {
      const newMap = new Map(prev);
      newMap.set(accountId, success);
      return newMap;
    });
  }, []);
  
  // Per-account polling/settingUp helpers
  const addPolling = useCallback((id: string) => setPollingAccounts(prev => new Set(prev).add(id)), []);
  const removePolling = useCallback((id: string) => setPollingAccounts(prev => {
    const next = new Set(prev); next.delete(id); return next;
  }), []);
  const isPollingAccount = useCallback((id: string) => pollingAccounts.has(id), [pollingAccounts]);

  const addSettingUp = useCallback((id: string) => setSettingUpAccounts(prev => new Set(prev).add(id)), []);
  const removeSettingUp = useCallback((id: string) => setSettingUpAccounts(prev => {
    const next = new Set(prev); next.delete(id); return next;
  }), []);
  const isSettingUpAccount = useCallback((id: string) => settingUpAccounts.has(id), [settingUpAccounts]);

  // Current account status (for backward compatibility)
  const loginStatus = selectedSession ? getLoginStatus(selectedSession._id) : null;
  const loginSuccess = selectedSession ? getLoginSuccess(selectedSession._id) : { show: false };
  const isSettingUp = selectedSession ? isSettingUpAccount(selectedSession._id) : false;
  const isPolling = selectedSession ? isPollingAccount(selectedSession._id) : false;

  // WebSocket login notifications (real-time status + PIN clear)
  // [FIX] ใช้ event.lineAccountId เพื่อ track status แยกตามบัญชี
  useLoginNotifications({
    lineAccountId: selectedSession?._id,
    showToasts: false,
    onStatusChange: (event) => {
      const accountId = event.lineAccountId;
      if (!accountId) return;

      const inProgressStatuses = [
        'requesting', 'initializing', 'launching_browser', 'loading_extension',
        'checking_session', 'entering_credentials', 'waiting_pin', 'pin_displayed',
        'verifying', 'extracting_keys', 'triggering_messages',
      ];
      const isInProgress = inProgressStatuses.includes(event.status);
      const isCompleted = ['success', 'failed', 'idle'].includes(event.status);

      // [FIX] อัพเดท status สำหรับบัญชีที่ event มาจาก (ไม่ใช่บัญชีที่เลือก)
      const prevStatus = getLoginStatus(accountId);
      setLoginStatusForAccount(accountId, {
        success: event.status !== 'failed',
        status: event.status,
        pin: event.pinCode || prevStatus?.pin || undefined,
        message: event.message,
        stage: event.status,
        error: event.error,
      });

      // แสดง toast เฉพาะบัญชีที่เลือก
      if (accountId === selectedSession?._id) {
        if (event.pinCode) {
          toast.success(`PIN: ${event.pinCode}`, { duration: 60000, icon: '🔑' });
        }
      }

      if (isCompleted) {
        removePolling(accountId);
        if (event.status === 'success') {
          // Clear PIN and login status for this account
          setLoginStatusForAccount(accountId, null);

          // Show success state with keys from event for this account
          setLoginSuccessForAccount(accountId, {
            show: true,
            keys: event.keys ? {
              xLineAccess: event.keys.xLineAccess,
              xHmac: event.keys.xHmac,
              chatMid: event.chatMid,
            } : undefined,
          });

          // Fetch updated session status to get full keys
          if (accountId === selectedSession?._id) {
            fetchSessionStatus(accountId);
            fetchData();
            toast.success('ล็อกอินสำเร็จ! ดึง Keys เรียบร้อยแล้ว', { icon: '✅', duration: 5000 });
          }
        } else if (event.status === 'failed') {
          setLoginStatusForAccount(accountId, null);
          setLoginSuccessForAccount(accountId, { show: false });
          if (accountId === selectedSession?._id) {
            toast.error(event.error || 'Login ล้มเหลว', { icon: '❌' });
          }
        }
      } else if (isInProgress) {
        addPolling(accountId);
      }
    },
    // [NEW] Listen for new transactions - auto-refresh when backend fetches new messages
    onNewTransaction: (event) => {
      // event: { lineSessionId, newCount, total }
      if (event.lineSessionId === selectedSession?._id) {
        toast.success(`ดึงรายการใหม่ ${event.newCount} รายการ`, { icon: '📥' });
        // Refresh transactions list
        fetchTransactions(selectedSession._id);
      }
    },
  });

  // Keys modal
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [fullKeys, setFullKeys] = useState<Record<string, unknown> | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionSummary, setTransactionSummary] = useState<TransactionSummary | null>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  // Auto-refresh state
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [autoFetchConfig, setAutoFetchConfig] = useState<{
    enabled: boolean;
    intervalSeconds: number;
    isRunning: boolean;
    lastFetchTime: string | null;
  } | null>(null);

  // Fetch LINE sessions and banks
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sessionsRes, banksRes, autoFetchRes] = await Promise.all([
        lineSessionUserApi.getMySessions(),
        lineSessionUserApi.getBanks(),
        lineSessionUserApi.getAutoFetchStatus().catch(() => null),
      ]);

      setLineSessions(sessionsRes.data.sessions || []);
      setBanks(banksRes.data.banks || []);

      // Set auto-fetch config from backend
      if (autoFetchRes?.data) {
        setAutoFetchConfig({
          enabled: autoFetchRes.data.config?.enabled || false,
          intervalSeconds: autoFetchRes.data.config?.intervalSeconds || 60,
          isRunning: autoFetchRes.data.isRunning || false,
          lastFetchTime: autoFetchRes.data.lastFetchTime || null,
        });
      }
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch session status for selected session
  const fetchSessionStatus = useCallback(async (sessionId: string) => {
    try {
      const [sessionRes, credRes] = await Promise.all([
        lineSessionUserApi.getSession(sessionId),
        lineSessionUserApi.getCredentialsStatus(sessionId),
      ]);

      setSessionStatus(sessionRes.data.session);
      setCredentialsStatus(credRes.data);
    } catch {
      setSessionStatus(null);
      setCredentialsStatus(null);
    }
  }, []);

  // Fetch transactions for selected session
  const fetchTransactions = useCallback(async (sessionId: string, silent = false) => {
    if (!silent) setIsLoadingTransactions(true);
    try {
      const [txRes, summaryRes] = await Promise.all([
        lineSessionUserApi.getTransactions(sessionId, { limit: 20 }),
        lineSessionUserApi.getTransactionSummary(sessionId),
      ]);

      setTransactions(txRes.data.transactions || []);
      setTransactionSummary(summaryRes.data.summary || null);
      setLastRefreshTime(new Date());
    } catch {
      // Silently fail - transactions are optional
      setTransactions([]);
      setTransactionSummary(null);
    } finally {
      if (!silent) setIsLoadingTransactions(false);
    }
  }, []);

  // Auto-fetching state
  const [isAutoFetching, setIsAutoFetching] = useState(false);

  // Auto-fetch from LINE API (silent - no toast/loading)
  const autoFetchFromLineApi = useCallback(async (sessionId: string) => {
    setIsAutoFetching(true);
    try {
      // Trigger backend to fetch from LINE API
      const res = await lineSessionUserApi.fetchTransactions(sessionId);
      if (res.data.success && res.data.newMessages > 0) {
        // Only show toast if new messages found
        toast.success(`พบรายการใหม่ ${res.data.newMessages} รายการ`, { icon: '📥', duration: 3000 });
      }
      // Always refresh UI from database
      await fetchTransactions(sessionId, true);

      // Refresh auto-fetch status
      const autoFetchRes = await lineSessionUserApi.getAutoFetchStatus().catch(() => null);
      if (autoFetchRes?.data) {
        setAutoFetchConfig({
          enabled: autoFetchRes.data.config?.enabled || false,
          intervalSeconds: autoFetchRes.data.config?.intervalSeconds || 60,
          isRunning: autoFetchRes.data.isRunning || false,
          lastFetchTime: autoFetchRes.data.lastFetchTime || null,
        });
      }
    } catch {
      // Silent fail - just refresh from database
      await fetchTransactions(sessionId, true);
    } finally {
      setIsAutoFetching(false);
    }
  }, [fetchTransactions]);

  // Auto-refresh transactions based on backend config
  useEffect(() => {
    // Only run if auto-fetch is enabled and we're viewing transactions
    if (!selectedSession?.hasKeys || !showTransactions || !autoFetchConfig?.enabled) {
      setCountdown(0);
      return;
    }

    const intervalSeconds = autoFetchConfig.intervalSeconds || 60;

    // Start countdown
    setCountdown(intervalSeconds);

    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Time to fetch from LINE API (not just refresh UI)
          autoFetchFromLineApi(selectedSession._id);
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [selectedSession?._id, selectedSession?.hasKeys, showTransactions, autoFetchConfig?.enabled, autoFetchConfig?.intervalSeconds, autoFetchFromLineApi]);

  // Trigger fetch from LINE API
  const handleFetchTransactions = async () => {
    if (!selectedSession) return;

    setIsFetchingTransactions(true);
    try {
      const res = await lineSessionUserApi.fetchTransactions(selectedSession._id);
      if (res.data.success) {
        toast.success(res.data.message || 'ดึงรายการสำเร็จ');
        // Refresh transactions list
        await fetchTransactions(selectedSession._id);
      } else {
        toast.error(res.data.message || 'ไม่สามารถดึงรายการได้');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsFetchingTransactions(false);
    }
  };

  // When session is selected
  // [FIX] ไม่ต้อง clear status เมื่อเปลี่ยนบัญชี - เพราะ track แยกตามบัญชีแล้ว
  useEffect(() => {
    if (selectedSession) {
      fetchSessionStatus(selectedSession._id);
      // Fetch transactions if session has keys
      if (selectedSession.hasKeys) {
        fetchTransactions(selectedSession._id);
      } else {
        setTransactions([]);
        setTransactionSummary(null);
      }
      // ไม่ต้อง clear loginStatus และ loginSuccess เพราะ track แยกตามบัญชีแล้ว
      setSetupForm({ email: '', password: '', bankCode: '' });
    }
  }, [selectedSession, fetchSessionStatus, fetchTransactions]);

  // Poll login status
  // [FIX] ใช้ setLoginStatusForAccount แทน setLoginStatus
  const pollLoginStatus = useCallback(async (sessionId: string) => {
    try {
      const res = await lineSessionUserApi.getEnhancedLoginStatus(sessionId);
      const rawStatus = res.data;
      
      // Map backend response to frontend LoginStatus format
      // Backend returns: { status, pin, message, error, worker: { pinCode, ... } }
      const mappedStatus: LoginStatus = {
        success: rawStatus.success !== false,
        status: rawStatus.status,
        // PIN can come from top-level 'pin' or from 'worker.pinCode'
        pin: rawStatus.pin || rawStatus.worker?.pinCode,
        message: rawStatus.message,
        stage: rawStatus.stage || rawStatus.status,
        error: rawStatus.error,
      };
      
      setLoginStatusForAccount(sessionId, mappedStatus);

      // If still in progress, continue polling
      const inProgressStatuses = [
        'requesting', 'waiting_for_pin', 'waiting_pin', 'pin_displayed',
        'extracting_keys', 'triggering_messages', 'capturing_curl',
        'starting', 'initializing', 'launching_browser',
        'loading_extension', 'checking_session', 'entering_credentials', 'verifying'
      ];
      if (inProgressStatuses.includes(mappedStatus.status || '')) {
        return true; // Continue polling
      }

      // If completed, refresh session status and close PIN display
      if (mappedStatus.status === 'completed' || mappedStatus.status === 'success') {
        // Clear PIN and login status for this account
        setLoginStatusForAccount(sessionId, null);
        
        // Show success state for this account
        setLoginSuccessForAccount(sessionId, { show: true });
        
        // Fetch updated session status to get keys
        await fetchSessionStatus(sessionId);
        await fetchData(); // Refresh list
        
        toast.success('ล็อกอินสำเร็จ! ดึง Keys เรียบร้อยแล้ว', { icon: '✅', duration: 5000 });
      } else if (mappedStatus.status === 'failed' || mappedStatus.status === 'error') {
        // ปิด PIN display เมื่อ error for this account
        setLoginStatusForAccount(sessionId, null);
        setLoginSuccessForAccount(sessionId, { show: false });
        toast.error(mappedStatus.error || mappedStatus.message || 'เกิดข้อผิดพลาด');
      }

      return false; // Stop polling
    } catch {
      return false;
    }
  }, [fetchSessionStatus, fetchData, setLoginStatusForAccount, setLoginSuccessForAccount]);

  // Start polling effect (per-account)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (selectedSession && pollingAccounts.has(selectedSession._id)) {
      const accountId = selectedSession._id;
      intervalId = setInterval(async () => {
        const shouldContinue = await pollLoginStatus(accountId);
        if (!shouldContinue) {
          removePolling(accountId);
        }
      }, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pollingAccounts, selectedSession, pollLoginStatus, removePolling]);

  // Create new LINE Login
  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      toast.error('กรุณากรอกชื่อ LINE Login');
      return;
    }

    setIsCreating(true);
    try {
      const res = await lineSessionUserApi.createSession(newSessionName.trim());
      if (res.data.success) {
        toast.success('สร้าง LINE Login สำเร็จ');
        setShowCreateModal(false);
        setNewSessionName('');
        await fetchData();
        // Auto select the newly created session
        if (res.data.session) {
          setSelectedSession(res.data.session);
        }
      } else {
        toast.error(res.data.message || 'ไม่สามารถสร้าง LINE Login ได้');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsCreating(false);
    }
  };

  // Delete LINE Login
  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;

    setIsDeleting(true);
    try {
      const res = await lineSessionUserApi.deleteSession(sessionToDelete._id);
      if (res.data.success) {
        toast.success('ลบ LINE Login สำเร็จ');
        setShowDeleteModal(false);
        setSessionToDelete(null);
        if (selectedSession?._id === sessionToDelete._id) {
          setSelectedSession(null);
          setSessionStatus(null);
          setCredentialsStatus(null);
        }
        await fetchData();
      } else {
        toast.error(res.data.message || 'ไม่สามารถลบได้');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle setup and login
  const handleSetup = async () => {
    if (!selectedSession) return;

    const accountId = selectedSession._id;

    // Prevent double-click while already in progress (per-account)
    if (isSettingUpAccount(accountId) || isPollingAccount(accountId)) {
      toast('กำลังดำเนินการอยู่ กรุณารอสักครู่...', { icon: '⏳' });
      return;
    }

    if (!setupForm.email || !setupForm.password || !setupForm.bankCode) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    addSettingUp(accountId);
    // Set initial status to show loading state immediately
    setLoginStatusForAccount(accountId, { success: true, status: 'starting', message: 'กำลังเริ่มต้น...' });

    try {
      const res = await lineSessionUserApi.setupSession(accountId, {
        email: setupForm.email,
        password: setupForm.password,
        bankCode: setupForm.bankCode,
      });

      // Check for PIN in response (from API directly, not WebSocket)
      if (res.data.pinCode) {
        // PIN received directly from API response!
        setLoginStatusForAccount(accountId, {
          success: true,
          status: 'waiting_for_pin',
          pin: res.data.pinCode,
          message: 'รอยืนยัน PIN บนมือถือ',
        });
        toast.success(`PIN: ${res.data.pinCode}`, { duration: 60000, icon: '🔑' });
        addPolling(accountId);
      } else if (res.data.success !== false) {
        // No PIN yet, start polling
        setLoginStatusForAccount(accountId, res.data);
        addPolling(accountId);
        toast.success('เริ่มกระบวนการ Login แล้ว');
      } else {
        // Error from API
        setLoginStatusForAccount(accountId, null);
        toast.error(res.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setLoginStatusForAccount(accountId, null);
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      removeSettingUp(accountId);
    }
  };

  // Cancel login
  const handleCancelLogin = async () => {
    if (!selectedSession) return;

    try {
      await lineSessionUserApi.cancelEnhancedLogin(selectedSession._id);
      setLoginStatusForAccount(selectedSession._id, null);
      removePolling(selectedSession._id);
      toast.success('ยกเลิกแล้ว');
    } catch {
      toast.error('ไม่สามารถยกเลิกได้');
    }
  };

  // Retry after wrong PIN (quick retry)
  const handleRetryWrongPin = async () => {
    if (!selectedSession) return;

    const accountId = selectedSession._id;

    try {
      setLoginStatusForAccount(accountId, {
        success: true,
        status: 'requesting',
        message: 'กำลังขอ PIN ใหม่...',
      });
      // NOTE: Don't addPolling here! The API call takes ~13s (browser restart + login).
      // If polling starts now, first poll sees 'idle' and stops polling before PIN arrives.
      // Start polling AFTER the API response.

      const res = await lineSessionUserApi.retryWrongPin(accountId);

      if (res.data.pinCode) {
        setLoginStatusForAccount(accountId, {
          success: true,
          status: 'waiting_for_pin',
          pin: res.data.pinCode,
          message: 'รอยืนยัน PIN บนมือถือ',
        });
        toast.success(`PIN ใหม่: ${res.data.pinCode}`, { duration: 60000, icon: '🔑' });
        addPolling(accountId);
      } else if (res.data.success !== false) {
        setLoginStatusForAccount(accountId, res.data);
        toast.success('กำลังขอ PIN ใหม่...');
        addPolling(accountId);
      } else {
        setLoginStatusForAccount(accountId, null);
        toast.error(res.data.message || res.data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setLoginStatusForAccount(accountId, null);
      toast.error(error.response?.data?.message || 'ไม่สามารถขอ PIN ใหม่ได้');
    }
  };

  // Re-login (use saved credentials)
  const handleRelogin = async () => {
    if (!selectedSession) return;

    const accountId = selectedSession._id;

    // Prevent double-click while already in progress (per-account)
    if (isSettingUpAccount(accountId) || isPollingAccount(accountId)) {
      toast('กำลังดำเนินการอยู่ กรุณารอสักครู่...', { icon: '⏳' });
      return;
    }

    addSettingUp(accountId);
    // Set initial status to show loading state immediately
    setLoginStatusForAccount(accountId, { success: true, status: 'starting', message: 'กำลังเริ่มต้น...' });

    try {
      const res = await lineSessionUserApi.startEnhancedLogin(accountId, undefined, undefined, 'relogin');

      // Check for PIN in response (from API directly, not WebSocket)
      if (res.data.pinCode) {
        // PIN received directly from API response!
        setLoginStatusForAccount(accountId, {
          success: true,
          status: 'waiting_for_pin',
          pin: res.data.pinCode,
          message: 'รอยืนยัน PIN บนมือถือ',
        });
        toast.success(`PIN: ${res.data.pinCode}`, { duration: 60000, icon: '🔑' });
        addPolling(accountId);
      } else if (res.data.success !== false) {
        // No PIN yet, start polling
        setLoginStatusForAccount(accountId, res.data);
        addPolling(accountId);
        toast.success('เริ่มกระบวนการ Re-login แล้ว');
      } else {
        // Error from API
        setLoginStatusForAccount(accountId, null);
        toast.error(res.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setLoginStatusForAccount(accountId, null);
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      removeSettingUp(accountId);
    }
  };

  // View full keys
  const handleViewKeys = async () => {
    if (!selectedSession) return;

    setIsLoadingKeys(true);
    try {
      const res = await lineSessionUserApi.getFullKeys(selectedSession._id);
      if (res.data.success) {
        setFullKeys(res.data.keys);
        setShowKeysModal(true);
      } else {
        toast.error(res.data.message || 'ไม่พบ Keys');
      }
    } catch {
      toast.error('ไม่สามารถโหลด Keys ได้');
    } finally {
      setIsLoadingKeys(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`คัดลอก ${label} แล้ว`);
  };

  // Get status display
  const getStatusDisplay = (status?: string) => {
    switch (status) {
      case 'active':
        return { color: 'success' as const, text: 'ใช้งานได้', icon: CheckCircle2 };
      case 'valid_grace_period':
        // [FIX] Keys ใช้งานได้ (เพิ่งล็อกอินสำเร็จ อยู่ใน grace period)
        return { color: 'success' as const, text: 'ใช้งานได้', icon: CheckCircle2 };
      case 'expired':
        return { color: 'error' as const, text: 'หมดอายุ', icon: XCircle };
      case 'pending':
        return { color: 'warning' as const, text: 'รอดึง Keys', icon: Clock };
      case 'pending_relogin':
        return { color: 'error' as const, text: 'ต้อง Login ใหม่', icon: XCircle };
      case 'invalid':
        return { color: 'error' as const, text: 'Keys ไม่ถูกต้อง', icon: XCircle };
      case 'relogin_in_progress':
        return { color: 'warning' as const, text: 'กำลัง Re-login', icon: Loader2 };
      case 'waiting_pin':
        return { color: 'warning' as const, text: 'รอยืนยัน PIN', icon: Smartphone };
      case 'validating':
        // [FIX] กำลังตรวจสอบ Keys
        return { color: 'warning' as const, text: 'กำลังตรวจสอบ', icon: Loader2 };
      default:
        return { color: 'default' as const, text: status || 'ไม่ทราบ', icon: AlertTriangle };
    }
  };

  // Get login status display
  const getLoginStatusDisplay = (status?: string) => {
    switch (status) {
      case 'starting':
      case 'initializing':
      case 'launching_browser':
        return { text: 'กำลังเริ่ม...', color: 'text-blue-500' };
      case 'loading_extension':
      case 'checking_session':
        return { text: 'กำลังโหลด LINE...', color: 'text-blue-500' };
      case 'entering_credentials':
        return { text: 'กำลังกรอกข้อมูล...', color: 'text-blue-500' };
      case 'waiting_for_pin':
      case 'waiting_pin':
      case 'pin_displayed':
        return { text: 'รอยืนยัน PIN', color: 'text-amber-500' };
      case 'verifying':
        return { text: 'กำลังตรวจสอบ...', color: 'text-blue-500' };
      case 'extracting_keys':
        return { text: 'กำลังดึง Keys...', color: 'text-emerald-500' };
      case 'triggering_messages':
        return { text: 'กำลังดึงข้อมูล Chat...', color: 'text-emerald-500' };
      case 'capturing_curl':
        return { text: 'กำลังบันทึก cURL...', color: 'text-emerald-500' };
      case 'completed':
      case 'success':
        return { text: 'สำเร็จ', color: 'text-emerald-500' };
      case 'failed':
      case 'error':
        return { text: 'ล้มเหลว', color: 'text-red-500' };
      default:
        return { text: status || 'ไม่ทราบ', color: 'text-slate-500' };
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white">
                <Key className="w-6 h-6" />
              </div>
              LINE Session
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              จัดการ LINE Login และดึง Keys อัตโนมัติ
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            เพิ่ม LINE Login
          </Button>
        </div>

        {lineSessions.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<Key className="w-12 h-12" />}
              title="ยังไม่มี LINE Login"
              description="กดปุ่ม 'เพิ่ม LINE Login' เพื่อเริ่มต้นใช้งาน"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Session Selection */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-500" />
                LINE Login ของคุณ
              </h2>
              <div className="space-y-2">
                {lineSessions.map((session) => (
                  <div
                    key={session._id}
                    className={`relative group p-3 rounded-xl transition-all cursor-pointer ${
                      selectedSession?._id === session._id
                        ? 'bg-emerald-500/10 border-2 border-emerald-500'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-emerald-500/50'
                    }`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">
                          {session.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                          {session.hasKeys ? (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" />
                              มี Keys
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3" />
                              รอตั้งค่า
                            </span>
                          )}
                          {session.bankName && (
                            <span className="text-slate-400">| {session.bankName}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete(session);
                          setShowDeleteModal(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Setup & Status */}
            <Card className="lg:col-span-2 p-6">
              {!selectedSession ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Key className="w-16 h-16 mb-4 opacity-30" />
                  <p>เลือก LINE Login เพื่อเริ่มต้น</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Session Info */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {selectedSession.name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {credentialsStatus?.email || 'ยังไม่ได้ตั้งค่า'}
                      </p>
                    </div>
                    {sessionStatus?.status && (
                      <Badge variant={getStatusDisplay(sessionStatus.status).color}>
                        {getStatusDisplay(sessionStatus.status).text}
                      </Badge>
                    )}
                  </div>

                  {/* Current Keys Status */}
                  {sessionStatus?.hasKeys && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <div>
                            <p className="font-medium text-emerald-800 dark:text-emerald-200">
                              มี Keys แล้ว
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              ธนาคาร: {sessionStatus.bankName || '-'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleViewKeys}
                          disabled={isLoadingKeys}
                          className="gap-2"
                        >
                          {isLoadingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                          ดู Keys
                        </Button>
                      </div>
                      {sessionStatus.extractedAt && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                          ดึงเมื่อ: {new Date(sessionStatus.extractedAt).toLocaleString('th-TH')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Login Success - แสดงข้อความสำเร็จและ Keys */}
                  {loginSuccess.show && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 animate-in fade-in duration-300">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-emerald-500 rounded-full">
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-emerald-800 dark:text-emerald-200 text-lg">
                            ล็อกอินสำเร็จ!
                          </p>
                          <p className="text-sm text-emerald-600 dark:text-emerald-400">
                            ดึง Keys เรียบร้อยแล้ว สามารถคัดลอกได้ด้านล่าง
                          </p>
                        </div>
                      </div>

                      {/* Quick Keys Display - ใช้ keys จาก event หรือ sessionStatus */}
                      <div className="space-y-3 mt-4">
                        {/* xLineAccess */}
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">xLineAccess</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const key = loginSuccess.keys?.xLineAccess || sessionStatus?.xLineAccess;
                                if (key) {
                                  copyToClipboard(key, 'xLineAccess');
                                } else {
                                  handleViewKeys();
                                }
                              }}
                              className="h-6 px-2 text-xs"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              คัดลอก
                            </Button>
                          </div>
                          <p className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
                            {(loginSuccess.keys?.xLineAccess || sessionStatus?.xLineAccess)
                              ? `${(loginSuccess.keys?.xLineAccess || sessionStatus?.xLineAccess || '').substring(0, 50)}...`
                              : 'กดดู Keys เพื่อดูข้อมูลเต็ม'}
                          </p>
                        </div>

                        {/* xHmac */}
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">xHmac</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const key = loginSuccess.keys?.xHmac || sessionStatus?.xHmac;
                                if (key) {
                                  copyToClipboard(key, 'xHmac');
                                } else {
                                  handleViewKeys();
                                }
                              }}
                              className="h-6 px-2 text-xs"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              คัดลอก
                            </Button>
                          </div>
                          <p className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
                            {(loginSuccess.keys?.xHmac || sessionStatus?.xHmac)
                              ? `${(loginSuccess.keys?.xHmac || sessionStatus?.xHmac || '').substring(0, 50)}...`
                              : 'กดดู Keys เพื่อดูข้อมูลเต็ม'}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleViewKeys}
                            disabled={isLoadingKeys}
                            className="flex-1 gap-2"
                          >
                            {isLoadingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            ดู Keys ทั้งหมด
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => selectedSession && setLoginSuccessForAccount(selectedSession._id, { show: false })}
                            className="gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            ปิด
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Login Status (when in progress) */}
                  {loginStatus && (['waiting_for_pin', 'waiting_pin', 'pin_displayed', 'extracting_keys', 'triggering_messages', 'capturing_curl', 'starting', 'initializing', 'launching_browser', 'loading_extension', 'checking_session', 'entering_credentials', 'verifying'].includes(loginStatus.status || '')) && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-3 mb-3">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        <p className={`font-medium ${getLoginStatusDisplay(loginStatus.status).color}`}>
                          {getLoginStatusDisplay(loginStatus.status).text}
                        </p>
                      </div>

                      {loginStatus.pin && (
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Smartphone className="w-5 h-5 text-emerald-500" />
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              ยืนยัน PIN บนมือถือ
                            </p>
                          </div>
                          <p className="text-4xl font-bold tracking-[0.5em] text-emerald-600 dark:text-emerald-400">
                            {loginStatus.pin}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                            เปิดแอป LINE บนมือถือแล้วกดยืนยันตัวเลขนี้
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        {loginStatus.pin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRetryWrongPin}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" />
                            PIN ผิด? ขอ PIN ใหม่
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelLogin}
                          className="text-red-500 hover:text-red-600"
                        >
                          ยกเลิก
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Setup Form */}
                  {(!loginStatus || loginStatus.status === 'completed' || loginStatus.status === 'success' || loginStatus.status === 'failed' || loginStatus.status === 'error') && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        {credentialsStatus?.hasCredentials ? 'Login ใหม่' : 'ตั้งค่า Login'}
                      </h4>

                      {credentialsStatus?.hasCredentials && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                          <p className="text-blue-700 dark:text-blue-300">
                            มีข้อมูล Login บันทึกไว้แล้ว: {credentialsStatus.email}
                          </p>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleRelogin}
                            disabled={isSettingUp}
                            className="mt-2 gap-2"
                          >
                            {isSettingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Re-login ด้วยข้อมูลเดิม
                          </Button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            <Mail className="w-4 h-4 inline mr-1" />
                            Email LINE
                          </label>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            value={setupForm.email}
                            onChange={(e) => setSetupForm(prev => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            <Lock className="w-4 h-4 inline mr-1" />
                            Password LINE
                          </label>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="********"
                              value={setupForm.password}
                              onChange={(e) => setSetupForm(prev => ({ ...prev, password: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          <Building2 className="w-4 h-4 inline mr-1" />
                          ธนาคาร
                        </label>
                        <Select
                          value={setupForm.bankCode}
                          onChange={(e) => setSetupForm(prev => ({ ...prev, bankCode: e.target.value }))}
                        >
                          <option value="">-- เลือกธนาคาร --</option>
                          {banks.map((bank) => (
                            <option key={bank.bankCode} value={bank.bankCode}>
                              {bank.bankNameTh}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <Button
                        variant="primary"
                        onClick={handleSetup}
                        disabled={isSettingUp || !setupForm.email || !setupForm.password || !setupForm.bankCode}
                        className="w-full gap-2"
                      >
                        {isSettingUp ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            กำลังดำเนินการ...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            เริ่มดึง Keys
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2">
                      วิธีใช้งาน
                    </h4>
                    <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                      <li>กรอก Email และ Password ของ LINE</li>
                      <li>เลือกธนาคารที่ต้องการใช้</li>
                      <li>กดปุ่ม "เริ่มดึง Keys"</li>
                      <li>ยืนยัน PIN ที่แสดงบนหน้าจอในแอป LINE มือถือ</li>
                      <li>ระบบจะดึง Keys อัตโนมัติเมื่อยืนยันสำเร็จ</li>
                    </ol>
                  </div>

                  {/* Transactions Section - Only show if session has keys */}
                  {sessionStatus?.hasKeys && (
                    <div className="border-t pt-6 mt-6">
                      {/* Auto-fetch status banner */}
                      {autoFetchConfig && (
                        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center justify-between ${
                          autoFetchConfig.enabled && autoFetchConfig.isRunning
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
                        }`}>
                          <div className="flex items-center gap-2">
                            <RefreshCw className={`w-4 h-4 ${
                              autoFetchConfig.enabled && autoFetchConfig.isRunning
                                ? 'text-emerald-500 animate-spin'
                                : 'text-slate-400'
                            }`} style={{ animationDuration: '3s' }} />
                            <span className={
                              autoFetchConfig.enabled && autoFetchConfig.isRunning
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-slate-600 dark:text-slate-400'
                            }>
                              {autoFetchConfig.enabled && autoFetchConfig.isRunning
                                ? `ดึงรายการอัตโนมัติทุก ${autoFetchConfig.intervalSeconds} วินาที`
                                : 'การดึงรายการอัตโนมัติปิดอยู่'}
                            </span>
                          </div>
                          {autoFetchConfig.lastFetchTime && (
                            <span className="text-xs text-slate-500">
                              ดึงล่าสุด: {new Date(autoFetchConfig.lastFetchTime).toLocaleTimeString('th-TH')}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                            <History className="w-5 h-5 text-emerald-500" />
                            รายการธุรกรรม
                            {showTransactions && autoFetchConfig?.enabled && (
                              <span className="text-xs font-normal text-slate-500 ml-2">
                                {isAutoFetching ? (
                                  <span className="text-emerald-500 flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    กำลังดึงรายการ...
                                  </span>
                                ) : countdown > 0 ? (
                                  `(ดึงใหม่ใน ${countdown} วินาที)`
                                ) : null}
                              </span>
                            )}
                          </h4>
                          {lastRefreshTime && (
                            <p className="text-xs text-slate-400 mt-1">
                              อัพเดทล่าสุด: {lastRefreshTime.toLocaleTimeString('th-TH')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowTransactions(!showTransactions)}
                            className="gap-2"
                          >
                            {showTransactions ? <XCircle className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {showTransactions ? 'ซ่อน' : 'ดูรายการ'}
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleFetchTransactions}
                            disabled={isFetchingTransactions}
                            className="gap-2"
                          >
                            {isFetchingTransactions ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            ดึงรายการใหม่
                          </Button>
                        </div>
                      </div>

                      {/* Transaction Summary */}
                      {transactionSummary && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">เงินเข้า</span>
                            </div>
                            <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                              {transactionSummary.deposits.count} รายการ
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              ฿{transactionSummary.deposits.total?.toLocaleString() || 0}
                            </p>
                          </div>
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <ArrowUpCircle className="w-4 h-4 text-red-500" />
                              <span className="text-xs text-red-600 dark:text-red-400">เงินออก</span>
                            </div>
                            <p className="font-semibold text-red-700 dark:text-red-300">
                              {transactionSummary.withdrawals.count} รายการ
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400">
                              ฿{transactionSummary.withdrawals.total?.toLocaleString() || 0}
                            </p>
                          </div>
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <History className="w-4 h-4 text-blue-500" />
                              <span className="text-xs text-blue-600 dark:text-blue-400">ทั้งหมด</span>
                            </div>
                            <p className="font-semibold text-blue-700 dark:text-blue-300">
                              {transactionSummary.totalTransactions} รายการ
                            </p>
                          </div>
                          {transactionSummary.balance && (
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <TrendingUp className="w-4 h-4 text-purple-500" />
                                <span className="text-xs text-purple-600 dark:text-purple-400">ยอดคงเหลือ</span>
                              </div>
                              <p className="font-semibold text-purple-700 dark:text-purple-300">
                                ฿{parseFloat(transactionSummary.balance).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Transaction List */}
                      {showTransactions && (
                        <div className="space-y-2">
                          {isLoadingTransactions ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                            </div>
                          ) : transactions.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                              <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
                              <p>ยังไม่มีรายการธุรกรรม</p>
                              <p className="text-xs mt-1">กดปุ่ม "ดึงรายการใหม่" เพื่อดึงข้อมูลจาก LINE</p>
                            </div>
                          ) : (
                            <div className="max-h-[500px] overflow-y-auto space-y-3">
                              {transactions.map((tx) => {
                                // Parse bank message to extract full details
                                const parsed = parseBankMessage(tx.text || tx.originalMsg || '');
                                const displayAmount = tx.amount || parsed.amount;
                                const displayBalance = tx.balance || parsed.balance;
                                const fromAccount = tx.from || parsed.fromAccount;
                                const toAccount = tx.to || parsed.toAccount;
                                const txType = tx.transactionType || parsed.type;

                                return (
                                  <div
                                    key={tx._id}
                                    className={`p-4 rounded-xl border ${
                                      txType === 'deposit'
                                        ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                                        : txType === 'withdraw'
                                        ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {/* Header: Type + Amount */}
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${
                                          txType === 'deposit'
                                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                            : txType === 'withdraw'
                                            ? 'bg-red-100 dark:bg-red-900/30'
                                            : 'bg-slate-100 dark:bg-slate-800'
                                        }`}>
                                          {txType === 'deposit' ? (
                                            <ArrowDownCircle className="w-5 h-5 text-emerald-500" />
                                          ) : txType === 'withdraw' ? (
                                            <ArrowUpCircle className="w-5 h-5 text-red-500" />
                                          ) : (
                                            <History className="w-5 h-5 text-slate-500" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="font-semibold text-slate-900 dark:text-white">
                                            {txType === 'deposit' ? 'เงินเข้า' :
                                             txType === 'withdraw' ? 'เงินออก' : 'รายการ'}
                                          </p>
                                          {tx.messageDate && (
                                            <p className="text-xs text-slate-500">
                                              {new Date(tx.messageDate).toLocaleString('th-TH')}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        {displayAmount && (
                                          <p className={`text-xl font-bold ${
                                            txType === 'deposit'
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : txType === 'withdraw'
                                              ? 'text-red-600 dark:text-red-400'
                                              : 'text-slate-600 dark:text-slate-400'
                                          }`}>
                                            {txType === 'deposit' ? '+' : txType === 'withdraw' ? '-' : ''}฿{parseFloat(displayAmount).toLocaleString()}
                                          </p>
                                        )}
                                        {displayBalance && (
                                          <p className="text-xs text-slate-500">
                                            คงเหลือ: ฿{parseFloat(displayBalance).toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Account Details: From → To */}
                                    {(fromAccount || toAccount) && (
                                      <div className="flex items-center gap-2 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg mb-3">
                                        {fromAccount && (
                                          <div className="flex-1">
                                            <p className="text-xs text-slate-500 mb-0.5">จากบัญชี</p>
                                            <p className="font-medium text-sm text-slate-800 dark:text-slate-200">
                                              {fromAccount}
                                            </p>
                                          </div>
                                        )}
                                        {fromAccount && toAccount && (
                                          <div className="text-slate-400">
                                            →
                                          </div>
                                        )}
                                        {toAccount && (
                                          <div className="flex-1 text-right">
                                            <p className="text-xs text-slate-500 mb-0.5">เข้าบัญชี</p>
                                            <p className="font-medium text-sm text-slate-800 dark:text-slate-200">
                                              {toAccount}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Full Message */}
                                    {(tx.text || tx.originalMsg) && (
                                      <div className="p-2 bg-white/30 dark:bg-slate-900/30 rounded-lg">
                                        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">
                                          {tx.text || tx.originalMsg}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewSessionName('');
        }}
        title="เพิ่ม LINE Login ใหม่"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              ชื่อ LINE Login
            </label>
            <Input
              placeholder="เช่น LINE ส่วนตัว, LINE ธุรกิจ"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">
              ตั้งชื่อเพื่อให้จำได้ว่าใช้สำหรับอะไร
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewSessionName('');
              }}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSession}
              disabled={isCreating || !newSessionName.trim()}
              className="gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังสร้าง...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  สร้าง
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSessionToDelete(null);
        }}
        title="ยืนยันการลบ"
      >
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            คุณต้องการลบ LINE Login <strong className="text-slate-900 dark:text-white">{sessionToDelete?.name}</strong> ใช่หรือไม่?
          </p>
          <p className="text-sm text-red-500">
            การดำเนินการนี้จะลบ Keys และข้อมูล Login ทั้งหมดที่เกี่ยวข้อง
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSessionToDelete(null);
              }}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteSession}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังลบ...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  ลบ
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Keys Modal */}
      <Modal
        isOpen={showKeysModal}
        onClose={() => setShowKeysModal(false)}
        title="LINE Keys"
        size="lg"
      >
        {fullKeys && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                xLineAccess
              </label>
              <div className="flex gap-2">
                <Input
                  value={(fullKeys.xLineAccess as string) || ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(fullKeys.xLineAccess as string, 'xLineAccess')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                xHmac
              </label>
              <div className="flex gap-2">
                <Input
                  value={(fullKeys.xHmac as string) || ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(fullKeys.xHmac as string, 'xHmac')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {fullKeys.chatMid ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Chat MID
                </label>
                <div className="flex gap-2">
                  <Input
                    value={String(fullKeys.chatMid) || ''}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(String(fullKeys.chatMid), 'chatMid')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* cURL Bash Command */}
            {fullKeys.cUrlBash ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  cURL Bash
                </label>
                <div className="flex gap-2">
                  <textarea
                    value={String(fullKeys.cUrlBash) || ''}
                    readOnly
                    className="flex-1 p-3 font-mono text-xs bg-slate-900 text-slate-200 border border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-0"
                    rows={4}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(String(fullKeys.cUrlBash), 'cURL Bash')}
                    className="shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  คำสั่ง cURL สำหรับทดสอบ API
                </p>
              </div>
            ) : null}

            <div className="pt-4 border-t">
              <p className="text-xs text-slate-500">
                สถานะ: {String(fullKeys.status || '-')}<br />
                ดึงเมื่อ: {fullKeys.extractedAt ? new Date(String(fullKeys.extractedAt)).toLocaleString('th-TH') : '-'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
