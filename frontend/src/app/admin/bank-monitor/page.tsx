'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineSessionApi, usersApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { io, Socket } from 'socket.io-client';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Download,
  Wallet,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Key,
  Loader2,
  Copy,
  Mail,
  Terminal,
  Bell,
  CheckCheck
} from 'lucide-react';

interface BankSession {
  _id: string;
  lineAccountId: string;
  accountName?: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  chatMid?: string;
  balance?: string;
  status?: string;
  isActive?: boolean;
  lastCheckedAt?: string;
  consecutiveFailures?: number;
  // Owner info
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  lineEmail?: string;
  linePassword?: string;
  // Message stats
  messageCount?: number;
  newMessagesCount?: number;
  lastMessageAt?: string;
  // Keys - full values for admin
  hasKeys?: boolean;
  xLineAccess?: string;
  xHmac?: string;
  cUrlBash?: string;
  userAgent?: string;
  lineVersion?: string;
  hasCredentials?: boolean;
  extractedAt?: string;
}

interface OwnerInfo {
  _id: string;
  username: string;
  email: string;
  name?: string;
}

interface TransactionMessage {
  id: string;
  messageId: string;
  text?: string;
  transactionType: string;
  amount?: string;
  balance?: string;
  messageDate?: string;
  bankCode?: string;
}

interface TransactionSummary {
  deposits: { total: number; count: number };
  withdrawals: { total: number; count: number };
}

interface AccountAlertItem {
  _id: string;
  lineAccountId: string;
  messageId: string;
  transactionType: string;
  amount: string;
  text: string;
  isRead: boolean;
  messageDate: string;
  createdAt: string;
}

export default function AdminBankMonitorPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState<BankSession[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBank, setFilterBank] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [banks, setBanks] = useState<any[]>([]);
  const [owners, setOwners] = useState<OwnerInfo[]>([]);

  // Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<BankSession | null>(null);
  const [messages, setMessages] = useState<TransactionMessage[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Detail pagination/filter/search
  const [detailCurrentPage, setDetailCurrentPage] = useState(1);
  const [detailTotalPages, setDetailTotalPages] = useState(0);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailFilterType, setDetailFilterType] = useState<string>('');
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [isDetailPageLoading, setIsDetailPageLoading] = useState(false);
  const [detailStartDate, setDetailStartDate] = useState('');
  const [detailEndDate, setDetailEndDate] = useState('');
  const DETAIL_ITEMS_PER_PAGE = 50;

  // Keys modal
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [keysSession, setKeysSession] = useState<BankSession | null>(null);
  const [showFullKeys, setShowFullKeys] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalSessions: 0,
    activeSessions: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    latestBalance: 0,
    totalMessages: 0,
    sessionsWithKeys: 0,
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const AUTO_REFRESH_INTERVAL = 60000; // 60 seconds

  // Batch fetch state
  const [isBatchFetching, setIsBatchFetching] = useState(false);
  // Alert state
  const [alertCounts, setAlertCounts] = useState<Record<string, number>>({});
  const [alertApiStatus, setAlertApiStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertSession, setAlertSession] = useState<BankSession | null>(null);
  const [alerts, setAlerts] = useState<AccountAlertItem[]>([]);
  const [alertPage, setAlertPage] = useState(1);
  const [alertTotalPages, setAlertTotalPages] = useState(0);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Standalone function to refresh alert counts (lightweight, called more frequently)
  const refreshAlertCounts = useCallback(async () => {
    try {
      const alertRes = await lineSessionApi.getUnreadAlertCounts();
      const counts = alertRes.data?.counts || {};
      setAlertCounts(counts);
      setAlertApiStatus('ok');
    } catch (err) {
      console.error('[AlertCounts] Refresh failed:', err);
      setAlertApiStatus('error');
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [sessionsRes, banksRes, usersRes, msgStatsRes] = await Promise.all([
        lineSessionApi.getAll(),
        lineSessionApi.getBanks(),
        usersApi.getAll().catch(() => ({ data: [] })),
        lineSessionApi.getMessageStats().catch(() => ({ data: { totalMessages: 0, perSession: [] } })),
      ]);

      const allSessions = sessionsRes.data?.sessions || [];
      const banksList = banksRes.data?.banks || [];
      const usersList: OwnerInfo[] = usersRes.data?.users || usersRes.data || [];

      // Create user lookup map
      const usersMap = new Map<string, OwnerInfo>();
      usersList.forEach((user: OwnerInfo) => {
        usersMap.set(user._id, user);
      });

      // Create message count lookup from stats endpoint
      const perSession: Array<{ _id: string; lineAccountId?: string; count: number }> =
        msgStatsRes.data?.perSession || [];
      const msgCountMap = new Map<string, number>();
      perSession.forEach((s) => {
        if (s.lineAccountId) msgCountMap.set(s.lineAccountId, s.count);
        msgCountMap.set(s._id, s.count);
      });

      // Fetch alert counts
      try {
        const alertRes = await lineSessionApi.getUnreadAlertCounts();
        console.log('[AlertCounts] Raw response:', alertRes.data);
        const counts = alertRes.data?.counts || {};
        const totalUnread = alertRes.data?.totalUnread || (Object.values(counts) as number[]).reduce((s, c) => s + c, 0);
        setAlertCounts(counts);
        setAlertApiStatus('ok');
        console.log(`[AlertCounts] Total unread: ${totalUnread}, accounts: ${Object.keys(counts).length}`, counts);
      } catch (alertErr) {
        console.error('[AlertCounts] Failed to fetch:', alertErr);
        setAlertCounts({});
        setAlertApiStatus('error');
      }

      setBanks(banksList);
      setOwners(usersList);

      // Map sessions to BankSession format
      const sessionsData: BankSession[] = allSessions.map((session: Record<string, unknown>) => {
        const ownerId = session.ownerId as string | undefined;
        const owner = ownerId ? usersMap.get(ownerId) : null;
        const lineAccountId = (session.lineAccountId as string) || (session._id as string);

        return {
          _id: session._id as string,
          lineAccountId,
          accountName: (session.name as string) || 'ไม่มีชื่อ',
          bankCode: session.bankCode as string | undefined,
          bankName: session.bankName as string | undefined,
          accountNumber: session.accountNumber as string | undefined,
          chatMid: session.chatMid as string | undefined,
          balance: session.balance as string | undefined,
          status: (session.status as string) || 'pending',
          isActive: true,
          lastCheckedAt: session.lastCheckedAt as string | undefined,
          consecutiveFailures: session.consecutiveFailures as number | undefined,
          ownerId,
          ownerName: owner?.name || owner?.username || 'ไม่ทราบเจ้าของ',
          ownerEmail: owner?.email,
          lineEmail: session.lineEmail as string | undefined,
          linePassword: session.linePassword as string | undefined,
          messageCount: msgCountMap.get(lineAccountId) || msgCountMap.get(session._id as string) || 0,
          hasKeys: (session.hasKeys as boolean) || false,
          xLineAccess: session.xLineAccess as string | undefined,
          xHmac: session.xHmac as string | undefined,
          cUrlBash: session.cUrlBash as string | undefined,
          userAgent: session.userAgent as string | undefined,
          lineVersion: session.lineVersion as string | undefined,
          hasCredentials: session.hasCredentials as boolean | undefined,
          extractedAt: session.extractedAt as string | undefined,
        };
      });

      // Debug: log session lineAccountIds for alert matching
      console.log('[AlertDebug] Session lineAccountIds:', sessionsData.map(s => ({ id: s._id, laid: s.lineAccountId })));

      // Fetch batch transaction summary (single query instead of N individual calls)
      const batchSummaryRes = await lineSessionApi.getBatchSummary()
        .catch((err) => {
          console.error('[Bank Monitor] getBatchSummary failed:', err?.response?.status, err?.response?.data || err?.message);
          return { data: { totalDeposits: { total: 0, count: 0 }, totalWithdrawals: { total: 0, count: 0 } } };
        });

      console.log('[Bank Monitor] batchSummary response:', batchSummaryRes.data);
      const totalDeposits = batchSummaryRes.data?.totalDeposits?.total || 0;
      const totalWithdrawals = batchSummaryRes.data?.totalWithdrawals?.total || 0;
      const latestBalance = batchSummaryRes.data?.latestBalance?.total || 0;
      const totalMessages = msgStatsRes.data?.totalMessages || 0;

      setSessions(sessionsData);
      setStats({
        totalSessions: sessionsData.length,
        activeSessions: sessionsData.filter(s => s.status === 'active').length,
        totalDeposits,
        totalWithdrawals,
        latestBalance,
        totalMessages,
        sessionsWithKeys: sessionsData.filter(s => s.hasKeys).length,
      });
      setLastUpdatedAt(new Date());
    } catch (error) {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Periodic alert count refresh (every 30 seconds — lightweight, independent of full data refresh)
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAlertCounts();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshAlertCounts]);

  // WebSocket for real-time alerts
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    // Strip '/api' suffix if present for socket.io connection
    const wsUrl = backendUrl.replace(/\/api\/?$/, '');
    const socket = io(`${wsUrl}/ws`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WebSocket] Connected, joining admins room...');
      socket.emit('join', { userId: 'admin', role: 'admin' });
      // Re-sync alert counts on (re)connect
      refreshAlertCounts();
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WebSocket] Connection error:', err.message);
    });

    socket.on('account:new-alert', (data: { lineAccountId: string; transactionType: string; amount?: number; text?: string }) => {
      console.log('[WebSocket] Received account:new-alert:', data);
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
      socketRef.current = null;
    };
  }, [refreshAlertCounts]);

  const translateAlertType = (type: string): string => {
    const names: Record<string, string> = {
      transfer: 'โอนเงิน', payment: 'ชำระเงิน', fee: 'ค่าธรรมเนียม',
      interest: 'ดอกเบี้ย', bill: 'ชำระบิล', unknown: 'อื่นๆ',
      deposit: 'เงินเข้า', withdraw: 'เงินออก',
    };
    return names[type] || type;
  };

  const openAlertModal = async (session: BankSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setAlertSession(session);
    setShowAlertModal(true);
    setAlertPage(1);
    setIsLoadingAlerts(true);
    try {
      const res = await lineSessionApi.getAlerts(session.lineAccountId, 1);
      setAlerts(res.data?.alerts || []);
      setAlertTotalPages(res.data?.totalPages || 0);
      // Mark as read
      await lineSessionApi.markAlertsRead(session.lineAccountId);
      setAlertCounts(prev => ({ ...prev, [session.lineAccountId]: 0 }));
    } catch {
      toast.error('ไม่สามารถโหลดแจ้งเตือนได้');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const fetchAlertPage = async (page: number) => {
    if (!alertSession) return;
    setIsLoadingAlerts(true);
    try {
      const res = await lineSessionApi.getAlerts(alertSession.lineAccountId, page);
      setAlerts(res.data?.alerts || []);
      setAlertPage(page);
      setAlertTotalPages(res.data?.totalPages || 0);
    } catch {
      toast.error('ไม่สามารถโหลดแจ้งเตือนได้');
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  const fetchDetailMessages = async (lineAccountId: string, page: number, type: string, skipSummary = false, startDate?: string, endDate?: string) => {
    try {
      setIsDetailPageLoading(true);
      const offset = (page - 1) * DETAIL_ITEMS_PER_PAGE;
      const params: { limit: number; offset: number; type?: string; startDate?: string; endDate?: string } = {
        limit: DETAIL_ITEMS_PER_PAGE,
        offset,
      };
      if (type) params.type = type;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      if (skipSummary) {
        const messagesRes = await lineSessionApi.getMessages(lineAccountId, params);
        const total = messagesRes.data?.total || 0;
        setMessages(messagesRes.data?.messages || []);
        setDetailTotal(total);
        setDetailTotalPages(Math.ceil(total / DETAIL_ITEMS_PER_PAGE));
        setDetailCurrentPage(page);
      } else {
        const [messagesRes, summaryRes] = await Promise.all([
          lineSessionApi.getMessages(lineAccountId, params),
          lineSessionApi.getTransactionSummary(lineAccountId, startDate, endDate),
        ]);

        const total = messagesRes.data?.total || 0;
        setMessages(messagesRes.data?.messages || []);
        setDetailTotal(total);
        setDetailTotalPages(Math.ceil(total / DETAIL_ITEMS_PER_PAGE));
        setDetailCurrentPage(page);
        setSummary(summaryRes.data?.summary || null);
      }
    } catch (error) {
      toast.error('ไม่สามารถโหลดรายการธุรกรรม');
    } finally {
      setIsDetailPageLoading(false);
    }
  };

  const openDetailModal = async (session: BankSession) => {
    setSelectedSession(session);
    setShowDetailModal(true);
    setIsLoadingDetail(true);
    setDetailFilterType('');
    setDetailSearchQuery('');
    setDetailCurrentPage(1);
    setDetailStartDate('');
    setDetailEndDate('');

    try {
      await fetchDetailMessages(session.lineAccountId, 1, '');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleFetchMessages = async () => {
    if (!selectedSession) return;
    setIsFetching(true);
    try {
      const res = await lineSessionApi.fetchMessages(selectedSession.lineAccountId);
      toast.success(`ดึงได้ ${res.data.newMessages || 0} ข้อความใหม่`);

      // Reload messages with current filter
      await fetchDetailMessages(selectedSession.lineAccountId, 1, detailFilterType, false, detailStartDate, detailEndDate);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถดึงข้อความได้');
    } finally {
      setIsFetching(false);
    }
  };

  // Batch fetch all messages
  const handleBatchFetchAll = async () => {
    setIsBatchFetching(true);
    try {
      const res = await lineSessionApi.fetchAllMessages();
      if (res.data.success) {
        toast.success(res.data.message || `ดึงข้อความสำเร็จ ${res.data.totalNewMessages} ข้อความใหม่`);
        // Refresh data
        await fetchData();
      } else {
        toast.error('ไม่สามารถดึงข้อความได้');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsBatchFetching(false);
    }
  };

  const filteredSessions = sessions.filter(session => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      session.accountName?.toLowerCase().includes(searchLower) ||
      session.bankName?.toLowerCase().includes(searchLower) ||
      session.accountNumber?.includes(searchTerm) ||
      session.ownerName?.toLowerCase().includes(searchLower) ||
      session.lineEmail?.toLowerCase().includes(searchLower);
    const matchesBank = !filterBank || session.bankCode === filterBank;
    const matchesOwner = !filterOwner || session.ownerId === filterOwner;
    return matchesSearch && matchesBank && matchesOwner;
  });

  // Client-side search within current page
  const filteredMessages = detailSearchQuery.trim()
    ? messages.filter((msg) => {
        const query = detailSearchQuery.toLowerCase();
        return (
          msg.text?.toLowerCase().includes(query) ||
          msg.amount?.toLowerCase().includes(query) ||
          msg.transactionType?.toLowerCase().includes(query) ||
          msg.balance?.toLowerCase().includes(query)
        );
      })
    : messages;

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">ใช้งาน</Badge>;
      case 'valid_grace_period':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">ใช้งาน</Badge>;
      case 'expired':
        return <Badge className="bg-rose-100 text-rose-700 border-rose-200">หมดอายุ</Badge>;
      case 'error':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">ข้อผิดพลาด</Badge>;
      case 'no_session':
        return <Badge className="bg-slate-100 text-slate-500 border-slate-200">ไม่มี Session</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">รอดำเนินการ</Badge>;
      case 'validating':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">กำลังตรวจสอบ</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200">ไม่ทราบ</Badge>;
    }
  };

  // Format date in Thai timezone (Asia/Bangkok) — ensures correct time regardless of browser timezone
  const formatThaiDate = (dateStr: string | Date | undefined | null): string => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`คัดลอก ${label} แล้ว`);
  };

  // Open keys modal
  const openKeysModal = (session: BankSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setKeysSession(session);
    setShowKeysModal(true);
    setShowFullKeys(false);
  };

  // Compute total unread alerts
  const totalUnreadAlerts = (Object.values(alertCounts) as number[]).reduce((sum, c) => sum + c, 0);
  const alertAccountCount = Object.keys(alertCounts).length;

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-8 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                ตรวจสอบธนาคาร
              </h1>
              {totalUnreadAlerts > 0 ? (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full animate-pulse">
                  <Bell className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-bold text-red-400">
                    {totalUnreadAlerts} แจ้งเตือน ({alertAccountCount} บัญชี)
                  </span>
                </span>
              ) : alertApiStatus === 'error' ? (
                <span className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs text-amber-400">
                  <XCircle className="w-3 h-3" /> Alert API Error
                </span>
              ) : alertApiStatus === 'ok' ? (
                <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-xs text-green-400">
                  <CheckCircle className="w-3 h-3" /> ไม่มีแจ้งเตือน
                </span>
              ) : null}
            </div>
            <p className="text-slate-400 text-sm mt-1">
              ตรวจสอบธุรกรรมธนาคารจาก LINE sessions ({stats.sessionsWithKeys}/{stats.totalSessions} มี Keys)
            </p>
            {lastUpdatedAt && (
              <p className="text-slate-500 text-xs mt-0.5">
                อัปเดตล่าสุด: {formatThaiDate(lastUpdatedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="primary"
              onClick={handleBatchFetchAll}
              disabled={isBatchFetching || stats.sessionsWithKeys === 0}
              className="h-10 sm:h-12 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-xs sm:text-sm"
            >
              {isBatchFetching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 sm:mr-2 animate-spin" /> <span className="hidden sm:inline">กำลังดึง...</span><span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">ดึงทั้งหมด</span><span className="sm:hidden">ดึง</span> ({stats.sessionsWithKeys})
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={fetchData}
              className="h-10 sm:h-12 rounded-xl font-bold text-xs sm:text-sm"
            >
              <RefreshCw className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">รีเฟรช</span>
            </Button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "h-10 sm:h-12 px-3 rounded-xl font-bold text-xs sm:text-sm border transition-colors flex items-center gap-1.5",
                autoRefresh
                  ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white"
              )}
              title={autoRefresh ? 'ปิดรีเฟรชอัตโนมัติ' : 'เปิดรีเฟรชอัตโนมัติ (ทุก 60 วินาที)'}
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">{autoRefresh ? 'อัตโนมัติ: เปิด' : 'อัตโนมัติ: ปิด'}</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <div className="p-4 md:p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Sessions</span>
            </div>
            <p className="text-xl font-black text-white">{stats.totalSessions}</p>
          </div>
          <div className="p-4 md:p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">ใช้งาน</span>
            </div>
            <p className="text-xl font-black text-emerald-400">{stats.activeSessions}</p>
          </div>
          <div className="p-4 md:p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">เงินเข้า</span>
            </div>
            <p className="text-sm md:text-base font-black text-green-400">
              {stats.totalDeposits.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
            </p>
          </div>
          <div className="p-4 md:p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">เงินออก</span>
            </div>
            <p className="text-sm md:text-base font-black text-rose-400">
              {stats.totalWithdrawals.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
            </p>
          </div>
          <div className="p-4 md:p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">ยอดคงเหลือล่าสุด</span>
            </div>
            <p className="text-sm md:text-base font-black text-amber-400">
              {stats.latestBalance.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
            </p>
          </div>
          <div className="p-4 md:p-5 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-violet-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">ข้อความ</span>
            </div>
            <p className="text-xl font-black text-violet-400">{stats.totalMessages.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อบัญชี, ธนาคาร, เจ้าของ, LINE email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          {/* Owner Filter */}
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="w-full sm:w-auto px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50 sm:min-w-[180px]"
          >
            <option value="">เจ้าของทั้งหมด</option>
            {owners.map((owner) => (
              <option key={owner._id} value={owner._id}>
                {owner.name || owner.username || owner.email}
              </option>
            ))}
          </select>
          {/* Bank Filter */}
          <select
            value={filterBank}
            onChange={(e) => setFilterBank(e.target.value)}
            className="px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-emerald-500/50"
          >
            <option value="">ธนาคารทั้งหมด</option>
            {banks.map((bank: any) => (
              <option key={bank.bankCode} value={bank.bankCode}>
                {bank.bankNameTh || bank.bankNameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Sessions List - Grouped by Owner */}
        {filteredSessions.length === 0 ? (
          <div className="p-12 bg-slate-800/30 rounded-2xl border border-slate-700/30 text-center">
            <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-400 mb-2">ไม่พบ Bank Sessions</h3>
            <p className="text-sm text-slate-500">
              ตั้งค่า Bank Monitor ใน LINE Account เพื่อเริ่มติดตามธุรกรรม
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Group sessions by owner */}
            {Object.entries(
              filteredSessions.reduce((groups, session) => {
                const ownerKey = session.ownerId || 'unknown';
                const ownerName = session.ownerName || 'ไม่ทราบเจ้าของ';
                if (!groups[ownerKey]) {
                  groups[ownerKey] = { ownerName, ownerEmail: session.ownerEmail, sessions: [] };
                }
                groups[ownerKey].sessions.push(session);
                return groups;
              }, {} as Record<string, { ownerName: string; ownerEmail?: string; sessions: BankSession[] }>)
            ).map(([ownerId, group]) => (
              <div key={ownerId} className="space-y-3">
                {/* Owner Header */}
                <div className="flex items-center gap-3 px-4 py-2 bg-violet-500/10 rounded-xl border border-violet-500/20">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-violet-300">{group.ownerName}</h3>
                    {group.ownerEmail && (
                      <p className="text-xs text-violet-400/70">{group.ownerEmail}</p>
                    )}
                  </div>
                  <Badge className="ml-auto bg-violet-500/20 text-violet-300 border-violet-500/30">
                    {group.sessions.length} บัญชี
                  </Badge>
                </div>
                
                {/* Sessions for this owner */}
                <div className="space-y-3 pl-4 border-l-2 border-violet-500/20">
                  {group.sessions.map((session) => (
              <div
                key={session._id}
                className="p-4 md:p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 hover:border-emerald-500/30 transition-all cursor-pointer group"
                onClick={() => openDetailModal(session)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={cn(
                      "w-10 h-10 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center border shrink-0",
                      session.hasKeys
                        ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/20"
                        : "bg-gradient-to-br from-slate-500/20 to-slate-600/20 border-slate-500/20"
                    )}>
                      <Building2 className={cn("w-5 h-5 sm:w-7 sm:h-7", session.hasKeys ? "text-emerald-400" : "text-slate-500")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                          {session.accountName}
                        </h3>
                        {getStatusBadge(session.status)}
                        {session.hasKeys ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-xs border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            <span className="hidden xs:inline">มี</span> Keys
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs border border-red-500/20">
                            <XCircle className="w-3 h-3" />
                            <span className="hidden xs:inline">ไม่มี</span> Keys
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-400">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-lg border border-violet-500/20">
                          <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          <span className="font-medium truncate max-w-[120px] sm:max-w-none">{session.ownerName || 'ไม่ทราบเจ้าของ'}</span>
                        </span>
                        {session.bankName || session.bankCode ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" />
                            {session.bankName || session.bankCode}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-500">
                            <Building2 className="w-3.5 h-3.5" />
                            ยังไม่ตั้งค่า
                          </span>
                        )}
                        {session.accountNumber && (
                          <span className="flex items-center gap-1">
                            <Wallet className="w-3.5 h-3.5" />
                            {session.accountNumber}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-slate-500 mt-1">
                        {session.lineEmail && (
                          <span className="truncate max-w-[180px]">LINE: {session.lineEmail}</span>
                        )}
                        {session.lastCheckedAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatThaiDate(session.lastCheckedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pl-13 sm:pl-0">
                    {/* Alert Badge */}
                    {alertCounts[session.lineAccountId] > 0 && (
                      <button
                        onClick={(e) => openAlertModal(session, e)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
                        title="มีรายการผิดปกติ"
                      >
                        <Bell className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {alertCounts[session.lineAccountId]}
                        </span>
                      </button>
                    )}
                    {session.hasKeys && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => openKeysModal(session, e)}
                        className="gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-xs"
                      >
                        <Key className="w-3.5 h-3.5" />
                        Keys
                      </Button>
                    )}
                    <div className="text-right">
                      {session.balance && (
                        <div className="mb-1">
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">ยอดคงเหลือ</p>
                          <p className="text-lg sm:text-xl font-black text-emerald-400">
                            {Number(session.balance).toLocaleString()} <span className="text-xs">THB</span>
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">ข้อความ</p>
                        <p className={cn("font-black", session.balance ? "text-sm text-blue-400" : "text-lg sm:text-xl text-blue-400")}>
                          {session.messageCount || 0}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all hidden sm:block" />
                  </div>
                </div>
              </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={`Bank Monitor: ${selectedSession?.accountName}`}
        size="xl"
      >
        {selectedSession && (
          <div className="space-y-6 pt-4 max-h-[75vh] overflow-y-auto px-2 custom-scrollbar pb-6">
            {/* Owner Info Card */}
            <div className="p-3 sm:p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-2xl border border-violet-500/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">เจ้าของบัญชี</p>
                    <p className="text-white font-bold truncate">{selectedSession.ownerName || 'ไม่ทราบ'}</p>
                  </div>
                </div>
                {selectedSession.lineEmail && (
                  <div className="sm:text-right pl-13 sm:pl-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">LINE Email</p>
                    <p className="text-sm text-slate-300 truncate">{selectedSession.lineEmail}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Account Info */}
            <div className="p-4 sm:p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl sm:rounded-[2rem] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-[60px] -mr-24 -mt-24 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] sm:text-[10px] font-black text-white/70 uppercase tracking-widest">
                        {selectedSession.bankName || selectedSession.bankCode}
                      </p>
                      <p className="text-white font-bold truncate">{selectedSession.accountNumber || 'ไม่มีเลขบัญชี'}</p>
                    </div>
                  </div>
                  {getStatusBadge(selectedSession.status)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-white/10 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">ยอดคงเหลือปัจจุบัน</p>
                    <p className="text-xl sm:text-2xl font-black text-white">
                      {selectedSession.balance ? `${Number(selectedSession.balance).toLocaleString()} THB` : 'ไม่มีข้อมูล'}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">Chat MID</p>
                    <p className="text-xs sm:text-sm font-mono text-white/80 truncate">
                      {selectedSession.chatMid || 'ยังไม่ตั้งค่า'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {isLoadingDetail ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : (
              <>
                {summary && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="p-4 sm:p-5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">เงินเข้า</p>
                          <p className="text-sm font-black text-emerald-300">{summary.deposits?.count || 0} รายการ</p>
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-emerald-400">
                        {Number(summary.deposits?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                    <div className="p-4 sm:p-5 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
                          <TrendingDown className="w-4 h-4 text-rose-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">เงินออก</p>
                          <p className="text-sm font-black text-rose-300">{summary.withdrawals?.count || 0} รายการ</p>
                        </div>
                      </div>
                      <p className="text-lg sm:text-xl font-black text-rose-400">
                        {Number(summary.withdrawals?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                    <div className={cn(
                      "p-4 sm:p-5 rounded-2xl border",
                      (summary.deposits?.total || 0) - (summary.withdrawals?.total || 0) >= 0
                        ? "bg-amber-500/10 border-amber-500/20"
                        : "bg-red-500/10 border-red-500/20"
                    )}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                          (summary.deposits?.total || 0) - (summary.withdrawals?.total || 0) >= 0
                            ? "bg-amber-500/20" : "bg-red-500/20"
                        )}>
                          <Wallet className={cn(
                            "w-4 h-4",
                            (summary.deposits?.total || 0) - (summary.withdrawals?.total || 0) >= 0
                              ? "text-amber-400" : "text-red-400"
                          )} />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">คงเหลือสุทธิ</p>
                          <p className="text-sm font-black text-slate-300">
                            {(summary.deposits?.count || 0) + (summary.withdrawals?.count || 0)} รายการรวม
                          </p>
                        </div>
                      </div>
                      <p className={cn(
                        "text-lg sm:text-xl font-black",
                        (summary.deposits?.total || 0) - (summary.withdrawals?.total || 0) >= 0
                          ? "text-amber-400" : "text-red-400"
                      )}>
                        {((summary.deposits?.total || 0) - (summary.withdrawals?.total || 0)).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fetch Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ข้อความ</p>
                    <p className="text-sm text-slate-600">{detailTotal} รายการทั้งหมด</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleFetchMessages}
                    isLoading={isFetching}
                    className="h-10 rounded-xl font-bold w-full sm:w-auto"
                  >
                    <Download className="w-4 h-4 mr-2" /> ดึงข้อความใหม่
                  </Button>
                </div>

                {/* Search + Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ค้นหาข้อความ, จำนวนเงิน..."
                      value={detailSearchQuery}
                      onChange={(e) => setDetailSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <select
                    value={detailFilterType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setDetailFilterType(newType);
                      setDetailSearchQuery('');
                      if (selectedSession) {
                        fetchDetailMessages(selectedSession.lineAccountId, 1, newType, false, detailStartDate, detailEndDate);
                      }
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/50 sm:min-w-[160px]"
                  >
                    <option value="">ทั้งหมด</option>
                    <option value="deposit">เงินเข้า</option>
                    <option value="withdraw">เงินออก</option>
                    <option value="transfer">โอน</option>
                    <option value="payment">ชำระเงิน</option>
                    <option value="fee">ค่าธรรมเนียม</option>
                    <option value="interest">ดอกเบี้ย</option>
                    <option value="bill">ชำระบิล</option>
                    <option value="unknown">อื่นๆ</option>
                  </select>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">วันที่เริ่มต้น</label>
                    <input
                      type="date"
                      value={detailStartDate}
                      onChange={(e) => setDetailStartDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">วันที่สิ้นสุด</label>
                    <input
                      type="date"
                      value={detailEndDate}
                      onChange={(e) => setDetailEndDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        if (selectedSession) {
                          fetchDetailMessages(selectedSession.lineAccountId, 1, detailFilterType, false, detailStartDate, detailEndDate);
                        }
                      }}
                      disabled={!detailStartDate && !detailEndDate}
                      className={cn(
                        "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-bold transition-colors",
                        detailStartDate || detailEndDate
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "bg-slate-700/50 text-slate-500 cursor-not-allowed"
                      )}
                    >
                      กรอง
                    </button>
                    {(detailStartDate || detailEndDate) && (
                      <button
                        onClick={() => {
                          setDetailStartDate('');
                          setDetailEndDate('');
                          if (selectedSession) {
                            fetchDetailMessages(selectedSession.lineAccountId, 1, detailFilterType);
                          }
                        }}
                        className="px-3 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                </div>

                {/* Info bar */}
                {detailTotal > 0 && (
                  <div className="px-2">
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      แสดง {((detailCurrentPage - 1) * DETAIL_ITEMS_PER_PAGE) + 1}-{Math.min(detailCurrentPage * DETAIL_ITEMS_PER_PAGE, detailTotal)} จาก {detailTotal} รายการ
                      {detailFilterType && (
                        <span className="ml-1 text-emerald-600">
                          ({{ deposit: 'เงินเข้า', withdraw: 'เงินออก', transfer: 'โอน', payment: 'ชำระเงิน', fee: 'ค่าธรรมเนียม', interest: 'ดอกเบี้ย', bill: 'ชำระบิล', unknown: 'อื่นๆ' }[detailFilterType] || detailFilterType})
                        </span>
                      )}
                      {(detailStartDate || detailEndDate) && (
                        <span className="ml-1 text-violet-600">
                          ช่วงวันที่: {detailStartDate || '...'} ถึง {detailEndDate || '...'}
                        </span>
                      )}
                      {detailSearchQuery.trim() && <span className="ml-1 text-blue-600">ค้นหา: &quot;{detailSearchQuery}&quot; ({filteredMessages.length} ผลลัพธ์)</span>}
                    </p>
                  </div>
                )}

                {/* Messages List */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">รายการธุรกรรมล่าสุด</p>
                  {filteredMessages.length === 0 ? (
                    <div className="p-8 bg-slate-800/30 rounded-[2rem] text-center border border-slate-700/30">
                      <Wallet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">
                        {detailSearchQuery.trim() ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการธุรกรรม'}
                      </p>
                    </div>
                  ) : (
                    <div className="relative space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                      {isDetailPageLoading && (
                        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center z-10 rounded-xl">
                          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                        </div>
                      )}
                      {filteredMessages.map((msg, index) => (
                        <div key={msg.id || msg.messageId || index} className="p-3 sm:p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <Badge className={cn(
                              "text-[9px] font-bold",
                              msg.transactionType === 'deposit' && "bg-emerald-100 text-emerald-700",
                              msg.transactionType === 'withdraw' && "bg-rose-100 text-rose-700",
                              msg.transactionType === 'transfer' && "bg-blue-100 text-blue-700",
                              msg.transactionType === 'payment' && "bg-violet-100 text-violet-700",
                              msg.transactionType === 'fee' && "bg-amber-100 text-amber-700",
                              msg.transactionType === 'interest' && "bg-cyan-100 text-cyan-700",
                              msg.transactionType === 'bill' && "bg-orange-100 text-orange-700",
                              msg.transactionType === 'unknown' && "bg-slate-100 text-slate-600"
                            )}>
                              {{ deposit: 'เงินเข้า', withdraw: 'เงินออก', transfer: 'โอน', payment: 'ชำระเงิน', fee: 'ค่าธรรมเนียม', interest: 'ดอกเบี้ย', bill: 'ชำระบิล', unknown: 'อื่นๆ' }[msg.transactionType] || msg.transactionType || 'อื่นๆ'}
                            </Badge>
                            <span className="text-[9px] text-slate-400 shrink-0 ml-2">
                              {formatThaiDate(msg.messageDate)}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <p className="text-xs text-slate-400 truncate">
                              {msg.text?.substring(0, 80) || 'ไม่มีข้อความ'}
                            </p>
                            {msg.amount && (
                              <p className={cn(
                                "text-sm font-bold shrink-0",
                                msg.transactionType === 'deposit' ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {msg.transactionType === 'deposit' ? '+' : '-'}{Number(msg.amount).toLocaleString()} THB
                              </p>
                            )}
                          </div>
                          {msg.balance && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              คงเหลือ: {Number(msg.balance).toLocaleString()} THB
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagination Controls */}
                {detailTotalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-2">
                    <button
                      onClick={() => {
                        if (selectedSession && detailCurrentPage > 1) {
                          fetchDetailMessages(selectedSession.lineAccountId, detailCurrentPage - 1, detailFilterType, true, detailStartDate, detailEndDate);
                        }
                      }}
                      disabled={detailCurrentPage <= 1}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        detailCurrentPage <= 1
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-400 hover:bg-slate-700/50"
                      )}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {(() => {
                      const pages: number[] = [];
                      let start = Math.max(1, detailCurrentPage - 2);
                      let end = Math.min(detailTotalPages, detailCurrentPage + 2);
                      if (detailCurrentPage <= 2) end = Math.min(detailTotalPages, 5);
                      if (detailCurrentPage >= detailTotalPages - 1) start = Math.max(1, detailTotalPages - 4);
                      for (let i = start; i <= end; i++) pages.push(i);
                      return pages.map((page) => (
                        <button
                          key={page}
                          onClick={() => {
                            if (selectedSession && page !== detailCurrentPage) {
                              fetchDetailMessages(selectedSession.lineAccountId, page, detailFilterType, true, detailStartDate, detailEndDate);
                            }
                          }}
                          className={cn(
                            "w-9 h-9 rounded-lg text-sm font-bold transition-colors",
                            page === detailCurrentPage
                              ? "bg-emerald-500 text-white"
                              : "text-slate-400 hover:bg-slate-700/50"
                          )}
                        >
                          {page}
                        </button>
                      ));
                    })()}

                    <button
                      onClick={() => {
                        if (selectedSession && detailCurrentPage < detailTotalPages) {
                          fetchDetailMessages(selectedSession.lineAccountId, detailCurrentPage + 1, detailFilterType, true, detailStartDate, detailEndDate);
                        }
                      }}
                      disabled={detailCurrentPage >= detailTotalPages}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        detailCurrentPage >= detailTotalPages
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-400 hover:bg-slate-700/50"
                      )}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <span className="text-xs text-slate-400 ml-2">
                      หน้า {detailCurrentPage} / {detailTotalPages}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Close Button */}
            <div className="flex gap-4 pt-6 border-t border-slate-100">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={() => setShowDetailModal(false)}
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
        onClose={() => {
          setShowKeysModal(false);
          setKeysSession(null);
          setShowFullKeys(false);
        }}
        title={`LINE Keys: ${keysSession?.accountName}`}
        size="xl"
      >
        {keysSession && (
          <div className="space-y-6 pt-4 max-h-[75vh] overflow-y-auto px-2 custom-scrollbar pb-6">
            {/* Session Info */}
            <div className="p-3 sm:p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-2xl border border-violet-500/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">เจ้าของ</p>
                  <p className="text-white font-bold truncate">{keysSession.ownerName || 'ไม่ทราบ'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">ธนาคาร</p>
                  <p className="text-white font-medium">{keysSession.bankName || keysSession.bankCode || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">LINE Email</p>
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className="text-white font-medium truncate">{keysSession.lineEmail || '-'}</p>
                    {keysSession.lineEmail && (
                      <button
                        onClick={() => copyToClipboard(keysSession.lineEmail!, 'LINE Email')}
                        className="p-1 hover:bg-slate-700 rounded shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">LINE Password</p>
                  <div className="flex items-center gap-2 min-w-0">
                    <Key className="w-4 h-4 text-slate-400 shrink-0" />
                    <p className="text-white font-medium font-mono truncate">{keysSession.linePassword || '-'}</p>
                    {keysSession.linePassword && (
                      <button
                        onClick={() => copyToClipboard(keysSession.linePassword!, 'LINE Password')}
                        className="p-1 hover:bg-slate-700 rounded shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">สถานะ</p>
                  <p className="text-white font-medium">{keysSession.status || '-'}</p>
                </div>
              </div>
            </div>

            {/* Toggle show full keys */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
              <span className="text-sm text-slate-400">แสดง Keys เต็ม</span>
              <button
                onClick={() => setShowFullKeys(!showFullKeys)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors",
                  showFullKeys ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400"
                )}
              >
                {showFullKeys ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {showFullKeys ? 'ซ่อน' : 'แสดง'}
              </button>
            </div>

            {/* Keys */}
            <div className="space-y-4">
              {/* xLineAccess */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">xLineAccess</span>
                  {keysSession.xLineAccess && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(keysSession.xLineAccess!, 'xLineAccess')}
                      className="h-7 px-2 text-xs"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      คัดลอก
                    </Button>
                  )}
                </div>
                <p className="font-mono text-xs text-slate-300 break-all">
                  {keysSession.xLineAccess
                    ? (showFullKeys ? keysSession.xLineAccess : `${keysSession.xLineAccess.substring(0, 50)}...`)
                    : <span className="text-slate-500">ไม่มีข้อมูล</span>
                  }
                </p>
              </div>

              {/* xHmac */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">xHmac</span>
                  {keysSession.xHmac && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(keysSession.xHmac!, 'xHmac')}
                      className="h-7 px-2 text-xs"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      คัดลอก
                    </Button>
                  )}
                </div>
                <p className="font-mono text-xs text-slate-300 break-all">
                  {keysSession.xHmac
                    ? (showFullKeys ? keysSession.xHmac : `${keysSession.xHmac.substring(0, 50)}...`)
                    : <span className="text-slate-500">ไม่มีข้อมูล</span>
                  }
                </p>
              </div>

              {/* chatMid */}
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chat MID</span>
                  {keysSession.chatMid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(keysSession.chatMid!, 'Chat MID')}
                      className="h-7 px-2 text-xs"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      คัดลอก
                    </Button>
                  )}
                </div>
                <p className="font-mono text-xs text-slate-300 break-all">
                  {keysSession.chatMid || <span className="text-slate-500">ไม่มีข้อมูล</span>}
                </p>
              </div>

              {/* cURL Bash */}
              {keysSession.cUrlBash && (
                <div className="p-4 bg-slate-900 rounded-xl border border-slate-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      cURL Command
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(keysSession.cUrlBash!, 'cURL')}
                      className="h-7 px-2 text-xs"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      คัดลอก
                    </Button>
                  </div>
                  <textarea
                    value={keysSession.cUrlBash}
                    readOnly
                    className="w-full p-3 font-mono text-xs bg-slate-950 text-emerald-400 border border-slate-800 rounded-lg resize-none focus:outline-none"
                    rows={4}
                  />
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="p-3 sm:p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">ข้อมูลเพิ่มเติม</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">User Agent:</span>
                  <p className="text-slate-300 truncate">{keysSession.userAgent || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500">LINE Version:</span>
                  <p className="text-slate-300">{keysSession.lineVersion || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500">ดึง Keys เมื่อ:</span>
                  <p className="text-slate-300">
                    {formatThaiDate(keysSession.extractedAt)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">มี Credentials:</span>
                  <p className="text-slate-300">{keysSession.hasCredentials ? 'ใช่' : 'ไม่'}</p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="flex gap-4 pt-4 border-t border-slate-700">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={() => setShowKeysModal(false)}
              >
                ปิด
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {/* Alert Modal */}
      <Modal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={`การแจ้งเตือน — ${alertSession?.accountName || ''}`}
        size="xl"
      >
        {alertSession && (
          <div className="space-y-4 pt-4 max-h-[75vh] overflow-y-auto px-2 custom-scrollbar pb-6">
            {/* Account info */}
            <div className="p-3 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-xl border border-red-500/20">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{alertSession.accountName}</p>
                  <p className="text-xs text-slate-400">{alertSession.bankName || alertSession.bankCode || 'ไม่ระบุธนาคาร'}</p>
                </div>
              </div>
            </div>

            {/* Alerts list */}
            {isLoadingAlerts ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-8 bg-slate-800/30 rounded-2xl text-center border border-slate-700/30">
                <CheckCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">ไม่มีรายการแจ้งเตือน</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert._id}
                    className={cn(
                      "p-3 rounded-xl border transition-colors",
                      alert.isRead
                        ? "bg-slate-800/30 border-slate-700/30"
                        : "bg-slate-800/50 border-slate-700/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <Badge className={cn(
                        "text-[9px] font-bold",
                        alert.transactionType === 'transfer' && "bg-blue-100 text-blue-700",
                        alert.transactionType === 'payment' && "bg-violet-100 text-violet-700",
                        alert.transactionType === 'fee' && "bg-amber-100 text-amber-700",
                        alert.transactionType === 'interest' && "bg-cyan-100 text-cyan-700",
                        alert.transactionType === 'bill' && "bg-orange-100 text-orange-700",
                        alert.transactionType === 'withdraw' && "bg-red-100 text-red-700",
                        alert.transactionType === 'unknown' && "bg-slate-100 text-slate-600"
                      )}>
                        {translateAlertType(alert.transactionType)}
                      </Badge>
                      <div className="flex items-center gap-2">
                        {alert.amount && (
                          <span className="text-sm font-bold text-white">
                            {Number(alert.amount).toLocaleString()} THB
                          </span>
                        )}
                        {!alert.isRead && (
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 truncate mb-1">
                      {alert.text || 'ไม่มีข้อความ'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatThaiDate(alert.messageDate || alert.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {alertTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => fetchAlertPage(alertPage - 1)}
                  disabled={alertPage <= 1}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    alertPage <= 1 ? "text-slate-600 cursor-not-allowed" : "text-slate-400 hover:bg-slate-700/50"
                  )}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-400">
                  หน้า {alertPage} / {alertTotalPages}
                </span>
                <button
                  onClick={() => fetchAlertPage(alertPage + 1)}
                  disabled={alertPage >= alertTotalPages}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    alertPage >= alertTotalPages ? "text-slate-600 cursor-not-allowed" : "text-slate-400 hover:bg-slate-700/50"
                  )}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Close Button */}
            <div className="flex gap-4 pt-4 border-t border-slate-700">
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
    </DashboardLayout>
  );
}
