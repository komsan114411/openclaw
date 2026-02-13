'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
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
  Search,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Receipt,
  Percent,
  FileText,
  HelpCircle,
  Bell,
  CheckCheck,
  AlertCircle,
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
  } else if (/บัตรเดบิต|debit|POS|EDC|ซื้อสินค้า/i.test(text)) {
    result.type = 'payment';
  } else if (/ค่าธรรมเนียม|fee|ค่าบริการ|annual\s*fee|ค่ารักษา/i.test(text)) {
    result.type = 'fee';
  } else if (/ดอกเบี้ย|interest/i.test(text)) {
    result.type = 'interest';
  } else if (/ชำระบิล|bill\s*pay|สินเชื่อ|ผ่อน|งวด/i.test(text)) {
    result.type = 'bill';
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

interface AccountAlertItem {
  _id: string;
  lineAccountId: string;
  messageId: string;
  transactionType: string;
  amount: string;
  text: string;
  isReadByAdmin: boolean;
  isReadByUser: boolean;
  messageDate: string;
  createdAt: string;
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
        // Refresh transactions list (keep current search/filter/page)
        fetchTransactions(selectedSession._id, false, currentPage, searchQuery, filterType);
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

  // Search + Pagination + Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const ITEMS_PER_PAGE = 50;

  // Auto-refresh state
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [autoFetchConfig, setAutoFetchConfig] = useState<{
    enabled: boolean;
    intervalSeconds: number;
    isRunning: boolean;
    lastFetchTime: string | null;
  } | null>(null);

  // Alert state
  const [alertCounts, setAlertCounts] = useState<Record<string, number>>({});
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertSession, setAlertSession] = useState<LineLogin | null>(null);
  const [alerts, setAlerts] = useState<AccountAlertItem[]>([]);
  const [alertPage, setAlertPage] = useState(1);
  const [alertTotalPages, setAlertTotalPages] = useState(0);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const alertSocketRef = useRef<Socket | null>(null);

  // Refresh alert counts
  const refreshAlertCounts = useCallback(async () => {
    try {
      const res = await lineSessionUserApi.getUnreadAlertCounts();
      const counts = res.data?.counts || {};
      setAlertCounts(counts);
    } catch {
      // Silent fail
    }
  }, []);

  // Fetch LINE sessions and banks
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sessionsRes, banksRes, autoFetchRes] = await Promise.all([
        lineSessionUserApi.getMySessions(),
        lineSessionUserApi.getBanks(),
        lineSessionUserApi.getAutoFetchStatus().catch(() => null),
        refreshAlertCounts(),
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

  // Alert polling every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAlertCounts();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshAlertCounts]);

  // WebSocket for real-time alerts (user)
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const wsUrl = backendUrl.replace(/\/api\/?$/, '');
    const socket = io(`${wsUrl}/ws`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    alertSocketRef.current = socket;

    socket.on('connect', () => {
      // Join as user (not admin) to receive user-specific alerts
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.userId) {
            socket.emit('join', { userId: payload.userId, role: 'user' });
          }
        } catch {
          // ignore parse errors
        }
      }
      refreshAlertCounts();
    });

    socket.on('account:new-alert', (data: { lineAccountId: string; transactionType: string; amount?: number; text?: string }) => {
      setAlertCounts(prev => ({
        ...prev,
        [data.lineAccountId]: (prev[data.lineAccountId] || 0) + 1,
      }));
      const typeNames: Record<string, string> = {
        transfer: 'โอนเงิน', payment: 'ชำระเงิน', fee: 'ค่าธรรมเนียม',
        interest: 'ดอกเบี้ย', bill: 'ชำระบิล', unknown: 'อื่นๆ',
        withdraw: 'ถอนเงิน',
      };
      toast(`พบรายการผิดปกติ: ${typeNames[data.transactionType] || data.transactionType}`, { icon: '\uD83D\uDD14' });
    });

    return () => {
      socket.disconnect();
      alertSocketRef.current = null;
    };
  }, [refreshAlertCounts]);

  // Alert helper functions
  const translateAlertType = (type: string): string => {
    const names: Record<string, string> = {
      transfer: 'โอนเงิน', payment: 'ชำระเงิน', fee: 'ค่าธรรมเนียม',
      interest: 'ดอกเบี้ย', bill: 'ชำระบิล', unknown: 'อื่นๆ',
      deposit: 'เงินเข้า', withdraw: 'เงินออก',
    };
    return names[type] || type;
  };

  const openAlertModal = async (session: LineLogin, e: React.MouseEvent) => {
    e.stopPropagation();
    setAlertSession(session);
    setShowAlertModal(true);
    setAlertPage(1);
    setIsLoadingAlerts(true);
    try {
      const res = await lineSessionUserApi.getAlerts(session._id, 1);
      setAlerts(res.data?.alerts || []);
      setAlertTotalPages(res.data?.totalPages || 0);
      // Mark as read for user
      await lineSessionUserApi.markAlertsRead(session._id);
      setAlertCounts(prev => ({ ...prev, [session._id]: 0 }));
    } catch {
      toast.error('ไม่สามารถโหลดแจ้งเตือนได้');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const fetchAlertPage = async (page: number) => {
    if (!alertSession) return;
    setAlertPage(page);
    setIsLoadingAlerts(true);
    try {
      const res = await lineSessionUserApi.getAlerts(alertSession._id, page);
      setAlerts(res.data?.alerts || []);
      setAlertTotalPages(res.data?.totalPages || 0);
    } catch {
      toast.error('ไม่สามารถโหลดแจ้งเตือนได้');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

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
  const fetchTransactions = useCallback(async (
    sessionId: string,
    silent = false,
    page = 1,
    search = '',
    type = '',
  ) => {
    if (!silent) setIsLoadingTransactions(true);
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const params: { limit: number; offset: number; search?: string; type?: string } = {
        limit: ITEMS_PER_PAGE,
        offset,
      };
      if (search.trim()) params.search = search.trim();
      if (type) params.type = type;

      const [txRes, summaryRes] = await Promise.all([
        lineSessionUserApi.getTransactions(sessionId, params),
        lineSessionUserApi.getTransactionSummary(sessionId),
      ]);

      setTransactions(txRes.data.transactions || []);
      setTotalPages(txRes.data.totalPages || 1);
      setTotalTransactions(txRes.data.total || 0);
      setCurrentPage(page);
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
      // Always refresh UI from database (keep current search/filter/page)
      await fetchTransactions(sessionId, true, currentPage, searchQuery, filterType);

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
      await fetchTransactions(sessionId, true, currentPage, searchQuery, filterType);
    } finally {
      setIsAutoFetching(false);
    }
  }, [fetchTransactions, currentPage, searchQuery, filterType]);

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
        // Refresh transactions list (keep current search/filter, reset to page 1)
        setCurrentPage(1);
        await fetchTransactions(selectedSession._id, false, 1, searchQuery, filterType);
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
      // Reset search/filter/page when switching sessions
      setSearchQuery('');
      setFilterType('');
      setCurrentPage(1);
      // Fetch transactions if session has keys
      if (selectedSession.hasKeys) {
        fetchTransactions(selectedSession._id);
      } else {
        setTransactions([]);
        setTransactionSummary(null);
        setTotalPages(0);
        setTotalTransactions(0);
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
      case 'credential_error':
        return { color: 'error' as const, text: 'อีเมล/รหัสผ่านผิด', icon: XCircle };
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
      case 'credential_error':
        return { text: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', color: 'text-red-500' };
      default:
        return { text: status || 'ไม่ทราบ', color: 'text-slate-500' };
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6">
          {/* Animated logo/icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative p-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-xl">
              <Key className="w-12 h-12 text-white animate-pulse" />
            </div>
          </div>

          {/* Loading text */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              กำลังโหลดข้อมูล...
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              กรุณารอสักครู่
            </p>
          </div>

          {/* Skeleton cards preview */}
          <div className="w-full max-w-5xl px-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-700/50 rounded-xl animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <div className="h-64 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-700/50 rounded-xl animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2 sm:gap-3">
              <div className="relative p-2 sm:p-3 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-xl sm:rounded-2xl text-white shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-500/50 transition-shadow">
                <Key className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8" />
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-xl sm:rounded-2xl blur-xl"></div>
              </div>
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                LINE Session
              </span>
            </h1>
            <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm sm:text-base font-medium">
              จัดการ LINE Login และดึง Keys อัตโนมัติ
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            className="gap-2 w-full sm:w-auto min-h-[44px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transform hover:scale-105 transition-all duration-200 font-semibold group"
          >
            <div className="p-0.5 bg-white/20 rounded-full group-hover:bg-white/30 transition-colors">
              <Plus className="w-4 h-4" />
            </div>
            เพิ่ม LINE Login
          </Button>
        </div>

        {lineSessions.length === 0 ? (
          <Card className="p-8 sm:p-12 md:p-16 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/30 border-2 border-dashed border-emerald-300 dark:border-emerald-500/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 dark:from-emerald-500/10 dark:to-teal-500/10"></div>
            <div className="relative flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative animate-bounce">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full blur-2xl opacity-30 scale-150"></div>
                <div className="relative p-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl shadow-2xl shadow-emerald-500/40">
                  <Key className="w-12 h-12 sm:w-16 sm:h-16 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  ยังไม่มี LINE Login
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base max-w-md">
                  เริ่มต้นใช้งานด้วยการเพิ่ม LINE Login ของคุณ เพื่อดึง Keys อัตโนมัติ
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => setShowCreateModal(true)}
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transform hover:scale-105 transition-all duration-200 font-semibold px-8 py-3"
              >
                <Plus className="w-5 h-5" />
                เพิ่ม LINE Login ตอนนี้
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 sm:gap-6 lg:gap-8">
            {/* Session Selection */}
            <Card className="p-4 sm:p-5 h-fit lg:sticky lg:top-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/90 dark:to-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-xl shadow-xl">
              {/* Premium Header */}
              <div className="mb-5 sm:mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl blur-md opacity-40"></div>
                      <div className="relative p-2.5 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 rounded-xl shadow-lg">
                        <Smartphone className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">LINE Login</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">เลือกบัญชีเพื่อจัดการ</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center min-w-[2.5rem] h-10 px-3 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 rounded-xl border border-emerald-500/20 dark:border-emerald-400/30 shadow-sm">
                    <span className="text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">{lineSessions.length}</span>
                  </div>
                </div>
              </div>

              {/* Session List */}
              <div className="space-y-2.5 max-h-[calc(100vh-240px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-500">
                {lineSessions.map((session) => (
                  <div
                    key={session._id}
                    className={`relative group cursor-pointer transition-all duration-300 ${
                      selectedSession?._id === session._id ? 'transform scale-[1.02]' : 'hover:transform hover:scale-[1.01]'
                    }`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className={`relative rounded-2xl transition-all duration-300 ${
                      selectedSession?._id === session._id
                        ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 p-[2px] shadow-lg shadow-emerald-500/25'
                        : 'bg-gradient-to-r from-slate-200/50 via-slate-300/30 to-slate-200/50 dark:from-slate-700/30 dark:via-slate-600/20 dark:to-slate-700/30 p-[1px] hover:from-emerald-500/50 hover:via-teal-500/50 hover:to-emerald-500/50'
                    }`}>
                      <div className={`relative rounded-2xl p-4 transition-all duration-300 ${
                        selectedSession?._id === session._id
                          ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-teal-500/10 dark:from-emerald-500/20 dark:via-emerald-500/10 dark:to-teal-500/20 backdrop-blur-xl'
                          : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl hover:bg-white/90 dark:hover:bg-slate-800/90'
                      }`}>
                        {selectedSession?._id === session._id && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-gradient-to-b from-emerald-400 via-teal-500 to-emerald-400 rounded-r-full shadow-lg shadow-emerald-500/50"></div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 pl-2">
                            <div className="flex items-center gap-2 mb-2">
                              {session.hasKeys && (
                                <div className="relative">
                                  <div className="absolute inset-0 bg-emerald-500 rounded-full blur-sm animate-pulse"></div>
                                  <div className="relative w-2 h-2 bg-emerald-500 rounded-full"></div>
                                </div>
                              )}
                              <h3 className="font-semibold text-slate-900 dark:text-white truncate text-base">{session.name}</h3>
                            </div>
                            <div className="flex flex-col gap-2">
                              {session.hasKeys ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 border border-emerald-500/20 rounded-lg w-fit shadow-sm">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">มี Keys</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 rounded-lg w-fit">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
                                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">รอตั้งค่า</span>
                                </div>
                              )}
                              {session.bankName && (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-500/10 dark:bg-slate-500/20 border border-slate-500/20 rounded-lg w-fit">
                                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{session.bankName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {alertCounts[session._id] > 0 && (
                              <button
                                onClick={(e) => openAlertModal(session, e)}
                                className="relative flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-red-500/10 to-rose-500/10 hover:from-red-500/20 hover:to-rose-500/20 border border-red-500/30 rounded-lg transition-all duration-200 shadow-lg shadow-red-500/10"
                                title="มีรายการผิดปกติ"
                              >
                                <Bell className="w-3.5 h-3.5 text-red-500 dark:text-red-400 animate-pulse" />
                                <span className="bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-lg">{alertCounts[session._id]}</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSessionToDelete(session);
                                setShowDeleteModal(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg transition-all duration-200 min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="ลบ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-4 pt-4 border-t border-dashed border-slate-300/50 dark:border-slate-600/50">
                  <div className="flex items-center justify-center gap-2 p-4 rounded-xl bg-slate-100/50 dark:bg-slate-800/30 border border-dashed border-slate-300/50 dark:border-slate-600/50 text-slate-400 dark:text-slate-500 hover:border-emerald-500/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all duration-200 cursor-pointer group/add"
                    onClick={() => setShowCreateModal(true)}
                  >
                    <Plus className="w-4 h-4 group-hover/add:rotate-90 transition-transform duration-300" />
                    <span className="text-xs font-medium">เพิ่ม LINE Login เพื่อเริ่มต้น</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Setup & Status */}
            <Card className="p-3 sm:p-4 md:p-6 shadow-sm border border-slate-200 dark:border-slate-700/50">
              {!selectedSession ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-emerald-500/10 blur-3xl rounded-full" />
                    <div className="relative p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-3xl border-2 border-dashed border-emerald-300 dark:border-emerald-700/30">
                      <Key className="w-16 h-16 text-emerald-500 dark:text-emerald-400 opacity-40" />
                    </div>
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    เลือก LINE Login เพื่อเริ่มต้น
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                    คลิกที่ LINE Login ด้านซ้ายเพื่อดูรายละเอียดและจัดการ
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Session Info */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 dark:from-blue-500/10 dark:via-purple-500/10 dark:to-pink-500/10 p-6 border border-blue-200/20 dark:border-blue-700/20">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate mb-1">
                          {selectedSession.name}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate flex items-center gap-2">
                          <Mail className="w-4 h-4 opacity-50" />
                          {credentialsStatus?.email || 'ยังไม่ได้ตั้งค่า'}
                        </p>
                      </div>
                      {sessionStatus?.status && (
                        <Badge variant={getStatusDisplay(sessionStatus.status).color} className="text-sm px-4 py-2 shadow-sm">
                          {getStatusDisplay(sessionStatus.status).text}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Current Keys Status */}
                  {sessionStatus?.hasKeys && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 p-6 border-2 border-emerald-300/50 dark:border-emerald-600/50 shadow-lg shadow-emerald-500/10">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                      <div className="relative">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
                              <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl shadow-lg">
                                <Key className="w-6 h-6 text-white" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-lg text-emerald-800 dark:text-emerald-100 mb-1">
                                มี Keys แล้ว
                              </p>
                              <p className="text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                                <Building2 className="w-4 h-4" />
                                ธนาคาร: {sessionStatus.bankName || '-'}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleViewKeys}
                            disabled={isLoadingKeys}
                            className="gap-2 w-full sm:w-auto min-h-[44px] bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border-emerald-200 dark:border-emerald-700 font-medium shadow-md"
                          >
                            {isLoadingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            ดู Keys
                          </Button>
                        </div>
                        {sessionStatus.extractedAt && (
                          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-emerald-300/30 dark:border-emerald-700/30">
                            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <p className="text-xs text-emerald-700 dark:text-emerald-300">
                              ดึงเมื่อ: {new Date(sessionStatus.extractedAt).toLocaleString('th-TH')}
                            </p>
                          </div>
                        )}
                      </div>
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

                  {/* Credential Error Banner */}
                  {sessionStatus?.status === 'credential_error' && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-3 mb-2">
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <p className="font-medium text-red-800 dark:text-red-200">
                          อีเมลหรือรหัสผ่าน LINE ไม่ถูกต้อง
                        </p>
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-400 ml-8">
                        ระบบหยุด Login อัตโนมัติแล้ว กรุณาตรวจสอบและแก้ไขอีเมล/รหัสผ่านด้านล่าง แล้วกด Login ใหม่อีกครั้ง
                      </p>
                    </div>
                  )}

                  {/* Login Status (when in progress) */}
                  {loginStatus && (['waiting_for_pin', 'waiting_pin', 'pin_displayed', 'extracting_keys', 'triggering_messages', 'capturing_curl', 'starting', 'initializing', 'launching_browser', 'loading_extension', 'checking_session', 'entering_credentials', 'verifying'].includes(loginStatus.status || '')) && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-yellow-900/30 p-6 border-2 border-amber-300/50 dark:border-amber-600/50 shadow-xl shadow-amber-500/20">
                      <div className="absolute top-0 left-0 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>

                      <div className="relative">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="relative">
                            <div className="absolute inset-0 bg-amber-400 rounded-full blur-xl opacity-40 animate-pulse"></div>
                            <div className="relative p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl shadow-lg">
                              <Loader2 className="w-6 h-6 text-white animate-spin" />
                            </div>
                          </div>
                          <p className={`font-semibold text-lg ${getLoginStatusDisplay(loginStatus.status).color}`}>
                            {getLoginStatusDisplay(loginStatus.status).text}
                          </p>
                        </div>

                      {loginStatus.pin && (
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20 p-8 border-2 border-emerald-400/30 dark:border-emerald-500/30 shadow-2xl mb-4">
                          <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 to-teal-400/5 animate-pulse"></div>

                          <div className="relative text-center">
                            <div className="flex items-center justify-center gap-3 mb-4">
                              <div className="relative">
                                <div className="absolute inset-0 bg-emerald-400 rounded-full blur-lg opacity-50 animate-pulse"></div>
                                <Smartphone className="relative w-8 h-8 text-emerald-500 dark:text-emerald-400" />
                              </div>
                              <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                                ยืนยัน PIN บนมือถือ
                              </p>
                            </div>

                            <div className="relative inline-block">
                              <div className="absolute inset-0 bg-emerald-400/20 dark:bg-emerald-400/30 blur-2xl animate-pulse"></div>
                              <p className="relative text-6xl sm:text-7xl font-black tracking-[0.5em] text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 py-4">
                                {loginStatus.pin}
                              </p>
                            </div>

                            <div className="mt-4 flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
                              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-300 dark:to-slate-600"></div>
                              <p className="text-xs sm:text-sm font-medium px-3">
                                เปิดแอป LINE บนมือถือแล้วกดยืนยันตัวเลขนี้
                              </p>
                              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-300 dark:to-slate-600"></div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
                        {loginStatus.pin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRetryWrongPin}
                            className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 min-h-[40px] text-xs sm:text-sm font-medium"
                          >
                            <RefreshCw className="w-4 h-4 mr-1.5" />
                            PIN ผิด? ขอ PIN ใหม่
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelLogin}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 min-h-[40px] text-xs sm:text-sm font-medium"
                        >
                          ยกเลิก
                        </Button>
                      </div>
                      </div>
                    </div>
                  )}

                  {/* Setup Form */}
                  {(!loginStatus || loginStatus.status === 'completed' || loginStatus.status === 'success' || loginStatus.status === 'failed' || loginStatus.status === 'error' || loginStatus.status === 'credential_error') && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl shadow-md">
                          <LogIn className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                          {credentialsStatus?.hasCredentials ? 'Login ใหม่' : 'ตั้งค่า Login'}
                        </h4>
                      </div>

                      {credentialsStatus?.hasCredentials && (
                        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 border border-blue-200/50 dark:border-blue-700/50 shadow-md">
                          <div className="flex items-center gap-3 mb-3">
                            <CheckCircle2 className="w-5 h-5 text-blue-500" />
                            <p className="font-semibold text-blue-800 dark:text-blue-200">
                              มีข้อมูล Login บันทึกไว้แล้ว
                            </p>
                          </div>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3 ml-8">
                            {credentialsStatus.email}
                          </p>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleRelogin}
                            disabled={isSettingUp}
                            className="mt-2 gap-2 w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg"
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
                        className="relative w-full gap-3 h-14 text-base font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 transition-all duration-300 overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                        {isSettingUp ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin relative z-10" />
                            <span className="relative z-10">กำลังดำเนินการ...</span>
                          </>
                        ) : (
                          <>
                            <div className="relative">
                              <div className="absolute inset-0 bg-yellow-400 rounded-full blur-md opacity-50 animate-pulse"></div>
                              <Zap className="relative w-5 h-5 text-yellow-300" />
                            </div>
                            <span className="relative z-10">เริ่มดึง Keys</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 p-6 border border-slate-200/50 dark:border-slate-700/50 shadow-md">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg shadow-md">
                        <HelpCircle className="w-5 h-5 text-white" />
                      </div>
                      <h4 className="font-bold text-lg text-slate-900 dark:text-white">
                        วิธีใช้งาน
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                          1
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 pt-1.5 leading-relaxed">
                          กรอก Email และ Password ของ LINE
                        </p>
                      </div>
                      <div className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                          2
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 pt-1.5 leading-relaxed">
                          เลือกธนาคารที่ต้องการใช้
                        </p>
                      </div>
                      <div className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                          3
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 pt-1.5 leading-relaxed">
                          กดปุ่ม "เริ่มดึง Keys"
                        </p>
                      </div>
                      <div className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                          4
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 pt-1.5 leading-relaxed">
                          ยืนยัน PIN ที่แสดงบนหน้าจอในแอป LINE มือถือ
                        </p>
                      </div>
                      <div className="flex items-start gap-3 group">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                          5
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 pt-1.5 leading-relaxed">
                          ระบบจะดึง Keys อัตโนมัติเมื่อยืนยันสำเร็จ
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Transactions Section - Only show if session has keys */}
                  {sessionStatus?.hasKeys && (
                    <div className="relative mt-8 pt-8">
                      {/* Gradient divider */}
                      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent blur-sm" />
                      {/* Auto-fetch status banner */}
                      {autoFetchConfig && (
                        <div className={`mb-4 p-3 sm:p-4 rounded-xl text-xs sm:text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 backdrop-blur-sm border shadow-lg transition-all duration-300 ${
                          autoFetchConfig.enabled && autoFetchConfig.isRunning
                            ? 'bg-gradient-to-r from-emerald-500/10 via-emerald-400/10 to-emerald-500/10 border-emerald-300/50 dark:border-emerald-600/50 shadow-emerald-500/20'
                            : 'bg-white/30 dark:bg-slate-800/30 border-slate-200/50 dark:border-slate-700/50'
                        }`}>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`p-2 rounded-lg ${
                              autoFetchConfig.enabled && autoFetchConfig.isRunning
                                ? 'bg-emerald-500/20'
                                : 'bg-slate-200/50 dark:bg-slate-700/50'
                            }`}>
                              <RefreshCw className={`w-4 h-4 ${
                                autoFetchConfig.enabled && autoFetchConfig.isRunning
                                  ? 'text-emerald-600 dark:text-emerald-400 animate-spin'
                                  : 'text-slate-400'
                              }`} style={{ animationDuration: '3s' }} />
                            </div>
                            <span className={`font-medium ${
                              autoFetchConfig.enabled && autoFetchConfig.isRunning
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}>
                              {autoFetchConfig.enabled && autoFetchConfig.isRunning
                                ? `ดึงรายการอัตโนมัติทุก ${autoFetchConfig.intervalSeconds} วินาที`
                                : 'การดึงรายการอัตโนมัติปิดอยู่'}
                            </span>
                          </div>
                          {autoFetchConfig.lastFetchTime && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 bg-white/40 dark:bg-slate-700/40 px-3 py-1 rounded-full">
                              ดึงล่าสุด: {new Date(autoFetchConfig.lastFetchTime).toLocaleTimeString('th-TH')}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-4">
                        <div className="min-w-0">
                          <h4 className="font-medium text-slate-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
                            <History className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 flex-shrink-0" />
                            รายการธุรกรรม
                            {showTransactions && autoFetchConfig?.enabled && (
                              <span className="text-xs font-normal ml-2">
                                {isAutoFetching ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    กำลังดึงรายการ...
                                  </span>
                                ) : countdown > 0 ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
                                    ดึงใหม่ใน {countdown} วินาที
                                  </span>
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
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
                          <div className="group p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent backdrop-blur-sm rounded-xl border border-emerald-200/50 dark:border-emerald-700/50 hover:border-emerald-400/70 dark:hover:border-emerald-500/70 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                                <ArrowDownCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">เงินเข้า</span>
                            </div>
                            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mb-1">
                              {transactionSummary.deposits.count} รายการ
                            </p>
                            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                              ฿{transactionSummary.deposits.total?.toLocaleString() || 0}
                            </p>
                          </div>
                          <div className="group p-4 bg-gradient-to-br from-red-500/10 via-red-400/5 to-transparent backdrop-blur-sm rounded-xl border border-red-200/50 dark:border-red-700/50 hover:border-red-400/70 dark:hover:border-red-500/70 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-0.5">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 rounded-full bg-red-500/20 border border-red-500/30">
                                <ArrowUpCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                              </div>
                              <span className="text-xs font-medium text-red-700 dark:text-red-400">เงินออก</span>
                            </div>
                            <p className="text-xl font-bold text-red-700 dark:text-red-300 mb-1">
                              {transactionSummary.withdrawals.count} รายการ
                            </p>
                            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                              ฿{transactionSummary.withdrawals.total?.toLocaleString() || 0}
                            </p>
                          </div>
                          <div className="group p-4 bg-gradient-to-br from-blue-500/10 via-blue-400/5 to-transparent backdrop-blur-sm rounded-xl border border-blue-200/50 dark:border-blue-700/50 hover:border-blue-400/70 dark:hover:border-blue-500/70 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="p-2 rounded-full bg-blue-500/20 border border-blue-500/30">
                                <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              </div>
                              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">ทั้งหมด</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                              {transactionSummary.totalTransactions} รายการ
                            </p>
                          </div>
                          {transactionSummary.balance && (
                            <div className="group p-4 bg-gradient-to-br from-purple-500/10 via-purple-400/5 to-transparent backdrop-blur-sm rounded-xl border border-purple-200/50 dark:border-purple-700/50 hover:border-purple-400/70 dark:hover:border-purple-500/70 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-0.5">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <span className="text-xs font-medium text-purple-700 dark:text-purple-400">ยอดคงเหลือ</span>
                              </div>
                              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                                ฿{parseFloat(transactionSummary.balance).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Transaction List */}
                      {showTransactions && (
                        <div className="space-y-2">
                          {/* Search + Filter Bar */}
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                            <div className="relative flex-1">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input
                                type="text"
                                placeholder="ค้นหาข้อความ, จำนวนเงิน..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && selectedSession) {
                                    setCurrentPage(1);
                                    fetchTransactions(selectedSession._id, false, 1, searchQuery, filterType);
                                  }
                                }}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 min-h-[42px]"
                              />
                            </div>
                            <div className="flex gap-2 sm:gap-3">
                              <select
                                value={filterType}
                                onChange={(e) => {
                                  setFilterType(e.target.value);
                                  setCurrentPage(1);
                                  if (selectedSession) {
                                    fetchTransactions(selectedSession._id, false, 1, searchQuery, e.target.value);
                                  }
                                }}
                                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 min-h-[42px] cursor-pointer"
                              >
                                <option value="">ทั้งหมด</option>
                                <option value="deposit">เงินเข้า</option>
                                <option value="withdraw">เงินออก</option>
                                <option value="transfer">โอน</option>
                                <option value="payment">ชำระเงิน/บัตรเดบิต</option>
                                <option value="fee">ค่าธรรมเนียม</option>
                                <option value="interest">ดอกเบี้ย</option>
                                <option value="bill">ชำระบิล/สินเชื่อ</option>
                                <option value="unknown">อื่นๆ</option>
                              </select>
                              <button
                                onClick={() => {
                                  setCurrentPage(1);
                                  if (selectedSession) {
                                    fetchTransactions(selectedSession._id, false, 1, searchQuery, filterType);
                                  }
                                }}
                                className="px-4 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs sm:text-sm font-semibold hover:from-emerald-600 hover:to-emerald-700 active:from-emerald-700 active:to-emerald-800 transition-all duration-200 min-h-[42px] flex-shrink-0 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 transform hover:-translate-y-0.5"
                              >
                                ค้นหา
                              </button>
                            </div>
                          </div>

                          {/* Result Count */}
                          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            แสดง {transactions.length} จาก {totalTransactions} รายการ
                            {searchQuery && ` (ค้นหา: "${searchQuery}")`}
                            {filterType && ` (${
                              filterType === 'deposit' ? 'เงินเข้า' :
                              filterType === 'withdraw' ? 'เงินออก' :
                              filterType === 'transfer' ? 'โอน' :
                              filterType === 'payment' ? 'ชำระเงิน' :
                              filterType === 'fee' ? 'ค่าธรรมเนียม' :
                              filterType === 'interest' ? 'ดอกเบี้ย' :
                              filterType === 'bill' ? 'ชำระบิล' :
                              filterType === 'unknown' ? 'อื่นๆ' : filterType
                            })`}
                          </p>

                          {isLoadingTransactions ? (
                            <div className="flex flex-col items-center justify-center py-12 space-y-3">
                              <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                                <Loader2 className="relative w-8 h-8 animate-spin text-emerald-500" />
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลดรายการ...</p>
                            </div>
                          ) : transactions.length === 0 ? (
                            <div className="text-center py-12 px-4">
                              <div className="relative inline-block mb-4">
                                <div className="absolute inset-0 bg-slate-200 dark:bg-slate-700 blur-xl opacity-50 rounded-full" />
                                <div className="relative p-6 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                  <History className="w-12 h-12 text-slate-400 dark:text-slate-500" />
                                </div>
                              </div>
                              <h4 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                {searchQuery || filterType ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการธุรกรรม'}
                              </h4>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {searchQuery || filterType
                                  ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง'
                                  : 'กดปุ่ม "ดึงรายการใหม่" เพื่อดึงข้อมูลจาก LINE'}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
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
                                    className={`p-4 rounded-xl border-l-4 border-r border-t border-b transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
                                      txType === 'deposit'
                                        ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-l-emerald-500 border-emerald-200/50 dark:border-emerald-800/50 hover:border-emerald-400/70 dark:hover:border-emerald-600/70 hover:shadow-emerald-500/20'
                                        : txType === 'withdraw'
                                        ? 'bg-red-50/50 dark:bg-red-900/10 border-l-red-500 border-red-200/50 dark:border-red-800/50 hover:border-red-400/70 dark:hover:border-red-600/70 hover:shadow-red-500/20'
                                        : txType === 'transfer'
                                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-l-blue-500 border-blue-200/50 dark:border-blue-800/50 hover:border-blue-400/70 dark:hover:border-blue-600/70 hover:shadow-blue-500/20'
                                        : txType === 'payment'
                                        ? 'bg-orange-50/50 dark:bg-orange-900/10 border-l-orange-500 border-orange-200/50 dark:border-orange-800/50 hover:border-orange-400/70 dark:hover:border-orange-600/70 hover:shadow-orange-500/20'
                                        : txType === 'fee'
                                        ? 'bg-slate-50/50 dark:bg-slate-800/50 border-l-slate-500 border-slate-300/50 dark:border-slate-600/50 hover:border-slate-400/70 hover:shadow-slate-500/20'
                                        : txType === 'interest'
                                        ? 'bg-cyan-50/50 dark:bg-cyan-900/10 border-l-cyan-500 border-cyan-200/50 dark:border-cyan-800/50 hover:border-cyan-400/70 dark:hover:border-cyan-600/70 hover:shadow-cyan-500/20'
                                        : txType === 'bill'
                                        ? 'bg-purple-50/50 dark:bg-purple-900/10 border-l-purple-500 border-purple-200/50 dark:border-purple-800/50 hover:border-purple-400/70 dark:hover:border-purple-600/70 hover:shadow-purple-500/20'
                                        : 'bg-slate-50/50 dark:bg-slate-800/50 border-l-slate-500 border-slate-200/50 dark:border-slate-700/50 hover:border-slate-400/70 hover:shadow-slate-500/20'
                                    }`}
                                  >
                                    {/* Header: Type + Amount */}
                                    <div className="flex items-start sm:items-center justify-between mb-2 sm:mb-3 gap-2">
                                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                        <div className={`p-1.5 sm:p-2 rounded-full flex-shrink-0 ${
                                          txType === 'deposit'
                                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                            : txType === 'withdraw'
                                            ? 'bg-red-100 dark:bg-red-900/30'
                                            : txType === 'transfer'
                                            ? 'bg-blue-100 dark:bg-blue-900/30'
                                            : txType === 'payment'
                                            ? 'bg-orange-100 dark:bg-orange-900/30'
                                            : txType === 'fee'
                                            ? 'bg-slate-200 dark:bg-slate-700'
                                            : txType === 'interest'
                                            ? 'bg-cyan-100 dark:bg-cyan-900/30'
                                            : txType === 'bill'
                                            ? 'bg-purple-100 dark:bg-purple-900/30'
                                            : 'bg-slate-100 dark:bg-slate-800'
                                        }`}>
                                          {txType === 'deposit' ? (
                                            <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                                          ) : txType === 'withdraw' ? (
                                            <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                                          ) : txType === 'transfer' ? (
                                            <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                                          ) : txType === 'payment' ? (
                                            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                                          ) : txType === 'fee' ? (
                                            <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                                          ) : txType === 'interest' ? (
                                            <Percent className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500" />
                                          ) : txType === 'bill' ? (
                                            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                                          ) : (
                                            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">
                                            {txType === 'deposit' ? 'เงินเข้า' :
                                             txType === 'withdraw' ? 'เงินออก' :
                                             txType === 'transfer' ? 'โอน' :
                                             txType === 'payment' ? 'ชำระเงิน' :
                                             txType === 'fee' ? 'ค่าธรรมเนียม' :
                                             txType === 'interest' ? 'ดอกเบี้ย' :
                                             txType === 'bill' ? 'ชำระบิล' : 'อื่นๆ'}
                                          </p>
                                          {tx.messageDate && (
                                            <p className="text-[10px] sm:text-xs text-slate-500">
                                              {new Date(tx.messageDate).toLocaleString('th-TH')}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        {displayAmount && (
                                          <p className={`text-base sm:text-xl font-bold ${
                                            txType === 'deposit'
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : txType === 'withdraw'
                                              ? 'text-red-600 dark:text-red-400'
                                              : txType === 'transfer'
                                              ? 'text-blue-600 dark:text-blue-400'
                                              : txType === 'payment'
                                              ? 'text-orange-600 dark:text-orange-400'
                                              : txType === 'fee'
                                              ? 'text-slate-600 dark:text-slate-400'
                                              : txType === 'interest'
                                              ? 'text-cyan-600 dark:text-cyan-400'
                                              : txType === 'bill'
                                              ? 'text-purple-600 dark:text-purple-400'
                                              : 'text-slate-600 dark:text-slate-400'
                                          }`}>
                                            {txType === 'deposit' || txType === 'interest' ? '+' : txType === 'withdraw' || txType === 'payment' || txType === 'fee' || txType === 'bill' || txType === 'transfer' ? '-' : ''}฿{parseFloat(displayAmount).toLocaleString()}
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
                                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 sm:gap-2 p-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg mb-2 sm:mb-3 border border-white/50 dark:border-slate-700/50">
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

                          {/* Pagination */}
                          {totalPages > 1 && (
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-6 pt-6 relative">
                              {/* Gradient divider */}
                              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-600 to-transparent" />
                              <button
                                onClick={() => {
                                  if (selectedSession && currentPage > 1) {
                                    const newPage = currentPage - 1;
                                    setCurrentPage(newPage);
                                    fetchTransactions(selectedSession._id, false, newPage, searchQuery, filterType);
                                  }
                                }}
                                disabled={currentPage <= 1}
                                className="p-2.5 rounded-full border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>

                              {/* Page numbers: show up to 5 pages around current */}
                              {(() => {
                                const pages: number[] = [];
                                let start = Math.max(1, currentPage - 2);
                                let end = Math.min(totalPages, currentPage + 2);
                                // Adjust if near edges
                                if (currentPage <= 2) end = Math.min(totalPages, 5);
                                if (currentPage >= totalPages - 1) start = Math.max(1, totalPages - 4);
                                for (let i = start; i <= end; i++) pages.push(i);
                                return pages.map((p) => (
                                  <button
                                    key={p}
                                    onClick={() => {
                                      if (selectedSession && p !== currentPage) {
                                        setCurrentPage(p);
                                        fetchTransactions(selectedSession._id, false, p, searchQuery, filterType);
                                      }
                                    }}
                                    className={`min-w-[36px] px-3 h-9 rounded-full text-sm font-semibold transition-all duration-200 ${
                                      p === currentPage
                                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/40 scale-105'
                                        : 'bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 hover:shadow-md hover:-translate-y-0.5'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ));
                              })()}

                              <button
                                onClick={() => {
                                  if (selectedSession && currentPage < totalPages) {
                                    const newPage = currentPage + 1;
                                    setCurrentPage(newPage);
                                    fetchTransactions(selectedSession._id, false, newPage, searchQuery, filterType);
                                  }
                                }}
                                disabled={currentPage >= totalPages}
                                className="p-2.5 rounded-full border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>

                              <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">
                                หน้า {currentPage} / {totalPages}
                              </span>
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
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewSessionName('');
              }}
              className="w-full sm:w-auto min-h-[44px]"
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
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setSessionToDelete(null);
              }}
              className="w-full sm:w-auto min-h-[44px]"
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

      {/* Alert Modal */}
      <Modal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={`การแจ้งเตือน — ${alertSession?.name || ''}`}
        size="xl"
      >
        {alertSession && (
          <div className="space-y-4 pt-4 max-h-[75vh] overflow-y-auto px-2 pb-6">
            {/* Account info */}
            <div className="p-3 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-xl border border-red-500/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{alertSession.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{alertSession.bankName || 'ไม่ระบุธนาคาร'}</p>
                </div>
              </div>
            </div>

            {/* Alerts list */}
            {isLoadingAlerts ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-8 bg-slate-100 dark:bg-slate-800/30 rounded-2xl text-center border border-slate-200 dark:border-slate-700/30">
                <CheckCheck className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">ไม่มีรายการแจ้งเตือน</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert._id}
                    className={`relative p-4 rounded-xl border-l-4 transition-all ${
                      alert.isReadByUser
                        ? "bg-slate-50 dark:bg-slate-800/30 border-slate-300 dark:border-slate-700"
                        : "bg-white dark:bg-slate-800/60 border-slate-400 dark:border-slate-600 shadow-sm"
                    } ${
                      alert.transactionType === 'withdraw' ? 'border-l-red-500' :
                      alert.transactionType === 'payment' ? 'border-l-amber-500' :
                      alert.transactionType === 'fee' ? 'border-l-orange-500' :
                      'border-l-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={
                        alert.transactionType === 'withdraw' ? 'error' :
                        alert.transactionType === 'payment' ? 'warning' :
                        alert.transactionType === 'fee' ? 'warning' :
                        'default'
                      } className="text-xs font-bold px-3 py-1">
                        {translateAlertType(alert.transactionType)}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {alert.amount && (
                          <span className="text-base font-bold text-slate-900 dark:text-white">
                            {Number(alert.amount).toLocaleString()} <span className="text-xs text-slate-500">THB</span>
                          </span>
                        )}
                        {!alert.isReadByUser && (
                          <div className="relative">
                            <span className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-75"></span>
                            <span className="relative block w-3 h-3 rounded-full bg-red-500"></span>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate mb-2">
                      {alert.text || 'ไม่มีข้อความ'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span className="inline-block w-1 h-1 rounded-full bg-slate-400"></span>
                      {alert.messageDate ? new Date(alert.messageDate).toLocaleString('th-TH') : alert.createdAt ? new Date(alert.createdAt).toLocaleString('th-TH') : '-'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {alertTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  onClick={() => fetchAlertPage(alertPage - 1)}
                  disabled={alertPage <= 1}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all font-medium ${
                    alertPage <= 1
                      ? "text-slate-300 dark:text-slate-700 cursor-not-allowed bg-slate-100 dark:bg-slate-800/30"
                      : "text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-4 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                  {alertPage} / {alertTotalPages}
                </span>
                <button
                  onClick={() => fetchAlertPage(alertPage + 1)}
                  disabled={alertPage >= alertTotalPages}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all font-medium ${
                    alertPage >= alertTotalPages
                      ? "text-slate-300 dark:text-slate-700 cursor-not-allowed bg-slate-100 dark:bg-slate-800/30"
                      : "text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Close Button */}
            <div className="flex gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={() => setShowAlertModal(false)}
              >
                ปิด
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Keys Modal */}
      <Modal
        isOpen={showKeysModal}
        onClose={() => setShowKeysModal(false)}
        title="LINE Keys"
        size="lg"
      >
        {fullKeys && (
          <div className="space-y-5">
            {/* xLineAccess */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">
                xLineAccess
              </label>
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-slate-950 dark:bg-slate-900 border border-emerald-500/20 rounded-lg overflow-hidden">
                  <p className="font-mono text-xs text-emerald-400 break-all select-all">
                    {(fullKeys.xLineAccess as string) || ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(fullKeys.xLineAccess as string, 'xLineAccess')}
                  className="shrink-0 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-600 dark:text-emerald-400 transition-all"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* xHmac */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
                xHmac
              </label>
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-slate-950 dark:bg-slate-900 border border-blue-500/20 rounded-lg overflow-hidden">
                  <p className="font-mono text-xs text-blue-400 break-all select-all">
                    {(fullKeys.xHmac as string) || ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(fullKeys.xHmac as string, 'xHmac')}
                  className="shrink-0 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 hover:border-blue-500/50 text-blue-600 dark:text-blue-400 transition-all"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Chat MID */}
            {fullKeys.chatMid ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">
                  Chat MID
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-slate-950 dark:bg-slate-900 border border-purple-500/20 rounded-lg overflow-hidden">
                    <p className="font-mono text-xs text-purple-400 break-all select-all">
                      {String(fullKeys.chatMid) || ''}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(String(fullKeys.chatMid), 'chatMid')}
                    className="shrink-0 bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 hover:border-purple-500/50 text-purple-600 dark:text-purple-400 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            {/* cURL Bash Command */}
            {fullKeys.cUrlBash ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
                  cURL Bash
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 p-4 bg-slate-950 dark:bg-slate-900 border-2 border-cyan-500/20 rounded-lg overflow-hidden">
                    <pre className="font-mono text-xs text-cyan-300 whitespace-pre-wrap break-all select-all leading-relaxed">
{String(fullKeys.cUrlBash) || ''}
                    </pre>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(String(fullKeys.cUrlBash), 'cURL Bash')}
                    className="shrink-0 bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 hover:border-cyan-500/50 text-cyan-600 dark:text-cyan-400 transition-all h-10"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-2">
                  <span className="inline-block w-1 h-1 rounded-full bg-cyan-500"></span>
                  คำสั่ง cURL สำหรับทดสอบ API
                </p>
              </div>
            ) : null}

            {/* Status Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg">
                <p className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">สถานะ:</span>
                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium">
                      {String(fullKeys.status || '-')}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">ดึงเมื่อ:</span>
                    <span>{fullKeys.extractedAt ? new Date(String(fullKeys.extractedAt)).toLocaleString('th-TH') : '-'}</span>
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
