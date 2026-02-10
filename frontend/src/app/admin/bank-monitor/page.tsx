'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineSessionApi, usersApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { Input, Select } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Users,
  MessageSquare,
  Key,
  Loader2,
  Copy,
  Mail,
  Terminal
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
  _id: string;
  lineAccountId: string;
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

export default function AdminBankMonitorPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState<BankSession[]>([]);
  const [lineAccounts, setLineAccounts] = useState<any[]>([]);
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
    totalMessages: 0,
    sessionsWithKeys: 0,
  });

  // Batch fetch state
  const [isBatchFetching, setIsBatchFetching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch LINE sessions directly (includes sessions from user/line-session without lineAccountId)
      console.log('[BankMonitor] Fetching sessions...');
      const [sessionsRes, banksRes, usersRes] = await Promise.all([
        lineSessionApi.getAll(),
        lineSessionApi.getBanks(),
        usersApi.getAll().catch(() => ({ data: [] })),
      ]);

      console.log('[BankMonitor] Sessions response:', sessionsRes.data);
      console.log('[BankMonitor] Users response:', usersRes.data);
      const allSessions = sessionsRes.data?.sessions || [];
      const banksList = banksRes.data?.banks || [];
      // Users API returns { success: true, users: [...] }
      const usersList: OwnerInfo[] = usersRes.data?.users || usersRes.data || [];

      // Create user lookup map
      const usersMap = new Map<string, OwnerInfo>();
      usersList.forEach((user: OwnerInfo) => {
        usersMap.set(user._id, user);
      });

      setLineAccounts([]);
      setBanks(banksList);
      setOwners(usersList);

      // Map sessions to BankSession format
      const sessionsData: BankSession[] = allSessions.map((session: any) => {
        const owner = session.ownerId ? usersMap.get(session.ownerId) : null;

        return {
          _id: session._id,
          lineAccountId: session.lineAccountId || session._id,
          accountName: session.name || 'ไม่มีชื่อ',
          bankCode: session.bankCode,
          bankName: session.bankName,
          accountNumber: session.accountNumber,
          chatMid: session.chatMid,
          balance: session.balance,
          status: session.status || 'pending',
          isActive: true,
          lastCheckedAt: session.lastCheckedAt,
          consecutiveFailures: session.consecutiveFailures,
          // Owner info
          ownerId: session.ownerId,
          ownerName: owner?.name || owner?.username || 'ไม่ทราบเจ้าของ',
          ownerEmail: owner?.email,
          lineEmail: session.lineEmail,
          linePassword: session.linePassword,
          // Message stats
          messageCount: 0,
          // Keys - full values for admin
          hasKeys: session.hasKeys || false,
          xLineAccess: session.xLineAccess,
          xHmac: session.xHmac,
          cUrlBash: session.cUrlBash,
          userAgent: session.userAgent,
          lineVersion: session.lineVersion,
          hasCredentials: session.hasCredentials,
          extractedAt: session.extractedAt,
        };
      });

      setSessions(sessionsData);
      setStats({
        totalSessions: sessionsData.length,
        activeSessions: sessionsData.filter(s => s.status === 'active').length,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalMessages: 0,
        sessionsWithKeys: sessionsData.filter(s => s.hasKeys).length,
      });
    } catch (error) {
      toast.error('Failed to load bank sessions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchDetailMessages = async (lineAccountId: string, page: number, type: string) => {
    try {
      const offset = (page - 1) * DETAIL_ITEMS_PER_PAGE;
      const params: { limit: number; offset: number; type?: string } = {
        limit: DETAIL_ITEMS_PER_PAGE,
        offset,
      };
      if (type) params.type = type;

      const [messagesRes, summaryRes] = await Promise.all([
        lineSessionApi.getMessages(lineAccountId, params),
        lineSessionApi.getTransactionSummary(lineAccountId),
      ]);

      const total = messagesRes.data?.total || 0;
      setMessages(messagesRes.data?.messages || []);
      setDetailTotal(total);
      setDetailTotalPages(Math.ceil(total / DETAIL_ITEMS_PER_PAGE));
      setDetailCurrentPage(page);
      setSummary(summaryRes.data?.summary || null);
    } catch (error) {
      toast.error('Failed to load transaction details');
    }
  };

  const openDetailModal = async (session: BankSession) => {
    setSelectedSession(session);
    setShowDetailModal(true);
    setIsLoadingDetail(true);
    setDetailFilterType('');
    setDetailSearchQuery('');
    setDetailCurrentPage(1);

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
      await fetchDetailMessages(selectedSession.lineAccountId, 1, detailFilterType);
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
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
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
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>;
      case 'valid_grace_period':
        // [FIX] Keys ใช้งานได้ (เพิ่งล็อกอินสำเร็จ อยู่ใน grace period)
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>;
      case 'expired':
        return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expired</Badge>;
      case 'error':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Error</Badge>;
      case 'no_session':
        return <Badge className="bg-slate-100 text-slate-500 border-slate-200">No Session</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Pending</Badge>;
      case 'validating':
        // [FIX] กำลังตรวจสอบ Keys
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Validating</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Unknown</Badge>;
    }
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
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Bank Monitor
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Monitor bank transactions from LINE sessions ({stats.sessionsWithKeys}/{stats.totalSessions} มี Keys)
            </p>
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
                  <Loader2 className="w-4 h-4 mr-1 sm:mr-2 animate-spin" /> <span className="hidden sm:inline">Fetching...</span><span className="sm:hidden">...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Fetch All</span><span className="sm:hidden">Fetch</span> ({stats.sessionsWithKeys})
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={fetchData}
              className="h-10 sm:h-12 rounded-xl font-bold text-xs sm:text-sm"
            >
              <RefreshCw className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-4 md:p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 md:gap-3 mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Sessions</span>
            </div>
            <p className="text-xl md:text-2xl font-black text-white">{stats.totalSessions}</p>
          </div>
          <div className="p-4 md:p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 md:gap-3 mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Active</span>
            </div>
            <p className="text-xl md:text-2xl font-black text-emerald-400">{stats.activeSessions}</p>
          </div>
          <div className="p-4 md:p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 md:gap-3 mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">เงินเข้า</span>
            </div>
            <p className="text-base md:text-xl font-black text-green-400">
              {stats.totalDeposits.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
            </p>
          </div>
          <div className="p-4 md:p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-2 md:gap-3 mb-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-rose-500/20 flex items-center justify-center shrink-0">
                <TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-rose-400" />
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">เงินออก</span>
            </div>
            <p className="text-base md:text-xl font-black text-rose-400">
              {stats.totalWithdrawals.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
            </p>
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
            className="px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50 min-w-[180px]"
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
            <h3 className="text-lg font-bold text-slate-400 mb-2">No Bank Sessions Found</h3>
            <p className="text-sm text-slate-500">
              Configure bank monitoring in LINE Account settings to start tracking transactions.
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
                            {new Date(session.lastCheckedAt).toLocaleString('th-TH')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pl-13 sm:pl-0">
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
                      {session.balance ? (
                        <>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">Balance</p>
                          <p className="text-lg sm:text-xl font-black text-emerald-400">
                            {Number(session.balance).toLocaleString()} <span className="text-xs">THB</span>
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest">ข้อความ</p>
                          <p className="text-lg sm:text-xl font-black text-blue-400">
                            {session.messageCount || 0}
                          </p>
                        </>
                      )}
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
                      <p className="text-white font-bold truncate">{selectedSession.accountNumber || 'No Account'}</p>
                    </div>
                  </div>
                  {getStatusBadge(selectedSession.status)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-white/10 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">Current Balance</p>
                    <p className="text-xl sm:text-2xl font-black text-white">
                      {selectedSession.balance ? `${Number(selectedSession.balance).toLocaleString()} THB` : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">Chat MID</p>
                    <p className="text-xs sm:text-sm font-mono text-white/80 truncate">
                      {selectedSession.chatMid || 'Not configured'}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="p-4 sm:p-6 bg-emerald-50 rounded-2xl sm:rounded-[2rem] border border-emerald-200">
                      <div className="flex items-center gap-3 mb-3 sm:mb-4">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">เงินเข้า</p>
                          <p className="text-sm sm:text-lg font-black text-emerald-700">{summary.deposits?.count || 0} รายการ</p>
                        </div>
                      </div>
                      <p className="text-xl sm:text-2xl font-black text-emerald-600">
                        {Number(summary.deposits?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                    <div className="p-4 sm:p-6 bg-rose-50 rounded-2xl sm:rounded-[2rem] border border-rose-200">
                      <div className="flex items-center gap-3 mb-3 sm:mb-4">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                          <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">เงินออก</p>
                          <p className="text-sm sm:text-lg font-black text-rose-700">{summary.withdrawals?.count || 0} รายการ</p>
                        </div>
                      </div>
                      <p className="text-xl sm:text-2xl font-black text-rose-600">
                        {Number(summary.withdrawals?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fetch Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Messages</p>
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
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <select
                    value={detailFilterType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setDetailFilterType(newType);
                      setDetailSearchQuery('');
                      if (selectedSession) {
                        fetchDetailMessages(selectedSession.lineAccountId, 1, newType);
                      }
                    }}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-emerald-500 min-w-[160px]"
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

                {/* Info bar */}
                {detailTotal > 0 && (
                  <div className="px-2">
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      แสดง {((detailCurrentPage - 1) * DETAIL_ITEMS_PER_PAGE) + 1}-{Math.min(detailCurrentPage * DETAIL_ITEMS_PER_PAGE, detailTotal)} จาก {detailTotal} รายการ
                      {detailFilterType && <span className="ml-1 text-emerald-600">({detailFilterType})</span>}
                      {detailSearchQuery.trim() && <span className="ml-1 text-blue-600">ค้นหา: &quot;{detailSearchQuery}&quot; ({filteredMessages.length} ผลลัพธ์)</span>}
                    </p>
                  </div>
                )}

                {/* Messages List */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Recent Transactions</p>
                  {filteredMessages.length === 0 ? (
                    <div className="p-8 bg-slate-50 rounded-[2rem] text-center">
                      <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">
                        {detailSearchQuery.trim() ? 'ไม่พบรายการที่ค้นหา' : 'No transactions yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
                      {filteredMessages.map((msg, index) => (
                        <div key={msg._id || index} className="p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-100">
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
                              {msg.transactionType || 'unknown'}
                            </Badge>
                            <span className="text-[9px] text-slate-400 shrink-0 ml-2">
                              {msg.messageDate ? new Date(msg.messageDate).toLocaleString('th-TH') : '-'}
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <p className="text-xs text-slate-600 truncate">
                              {msg.text?.substring(0, 80) || 'No text'}
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
                          fetchDetailMessages(selectedSession.lineAccountId, detailCurrentPage - 1, detailFilterType);
                        }
                      }}
                      disabled={detailCurrentPage <= 1}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        detailCurrentPage <= 1
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-600 hover:bg-slate-100"
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
                              fetchDetailMessages(selectedSession.lineAccountId, page, detailFilterType);
                            }
                          }}
                          className={cn(
                            "w-9 h-9 rounded-lg text-sm font-bold transition-colors",
                            page === detailCurrentPage
                              ? "bg-emerald-500 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          {page}
                        </button>
                      ));
                    })()}

                    <button
                      onClick={() => {
                        if (selectedSession && detailCurrentPage < detailTotalPages) {
                          fetchDetailMessages(selectedSession.lineAccountId, detailCurrentPage + 1, detailFilterType);
                        }
                      }}
                      disabled={detailCurrentPage >= detailTotalPages}
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                        detailCurrentPage >= detailTotalPages
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-600 hover:bg-slate-100"
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
                Close
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
                    {keysSession.extractedAt ? new Date(keysSession.extractedAt).toLocaleString('th-TH') : '-'}
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
    </DashboardLayout>
  );
}
