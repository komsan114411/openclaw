'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineSessionApi, lineAccountsApi, usersApi } from '@/lib/api';
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
  Download,
  Wallet,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Filter,
  User,
  Users,
  MessageSquare,
  Key,
  Loader2
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
  // Message stats
  messageCount?: number;
  newMessagesCount?: number;
  lastMessageAt?: string;
  // Keys status
  hasKeys?: boolean;
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
      // Fetch LINE accounts, banks, and users
      const [accountsRes, banksRes, usersRes] = await Promise.all([
        lineAccountsApi.getAll(),
        lineSessionApi.getBanks(),
        usersApi.getAll().catch(() => ({ data: [] })),
      ]);

      const accounts = accountsRes.data || [];
      const banksList = banksRes.data?.banks || [];
      const usersList: OwnerInfo[] = usersRes.data || [];

      // Create user lookup map
      const usersMap = new Map<string, OwnerInfo>();
      usersList.forEach((user: OwnerInfo) => {
        usersMap.set(user._id, user);
      });

      setLineAccounts(accounts);
      setBanks(banksList);
      setOwners(usersList);

      // Fetch sessions for each account
      const sessionsData: BankSession[] = [];
      let totalDeposits = 0;
      let totalWithdrawals = 0;

      for (const account of accounts) {
        try {
          const [sessionRes, bankRes, messagesRes] = await Promise.allSettled([
            lineSessionApi.getSession(account._id),
            lineSessionApi.getBank(account._id),
            lineSessionApi.getMessages(account._id, { limit: 1 }).catch(() => ({ data: null })),
          ]);

          // API returns { success, hasSession, session: {...} }
          const sessionData = sessionRes.status === 'fulfilled' ? sessionRes.value.data : null;
          const session = sessionData?.session; // Extract actual session object
          const hasSession = sessionData?.hasSession;
          const bankConfig = bankRes.status === 'fulfilled' ? bankRes.value.data : null;
          const messagesData = messagesRes.status === 'fulfilled' ? messagesRes.value.data : null;

          // Show ALL LINE accounts (even without session)
          // Get transaction summary
          const summaryRes = await lineSessionApi.getTransactionSummary(account._id).catch(() => ({ data: null }));
          const accountSummary = summaryRes.data;

          // Get owner info from lookup map
          const ownerId = account.ownerId || session?.lineAccountId;
          const owner = ownerId ? usersMap.get(ownerId) : null;

          sessionsData.push({
            _id: session?.id || account._id,
            lineAccountId: account._id,
            accountName: account.accountName || account.name || 'ไม่มีชื่อ',
            bankCode: bankConfig?.bankCode,
            bankName: bankConfig?.bankName,
            accountNumber: bankConfig?.accountNumber,
            chatMid: bankConfig?.chatMid || session?.chatMid,
            balance: bankConfig?.balance,
            status: session?.status || (hasSession ? 'unknown' : 'no_session'),
            isActive: account.isActive,
            lastCheckedAt: session?.lastCheckedAt,
            consecutiveFailures: session?.consecutiveFailures,
            // Owner info
            ownerId: ownerId,
            ownerName: owner?.name || owner?.username || 'ไม่ทราบเจ้าของ',
            ownerEmail: owner?.email,
            lineEmail: account.lineEmail,
            // Message stats
            messageCount: messagesData?.total || 0,
            // hasKeys comes from session object directly
            hasKeys: session?.hasKeys || false,
          });

          if (accountSummary) {
            totalDeposits += accountSummary.deposits?.total || 0;
            totalWithdrawals += accountSummary.withdrawals?.total || 0;
          }
        } catch (error) {
          // Skip accounts with errors
          console.error('Error fetching account:', account._id, error);
        }
      }

      setSessions(sessionsData);
      setStats({
        totalSessions: sessionsData.length,
        activeSessions: sessionsData.filter(s => s.status === 'active').length,
        totalDeposits,
        totalWithdrawals,
        totalMessages: sessionsData.reduce((acc, s) => acc + (s.messageCount || 0), 0),
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

  const openDetailModal = async (session: BankSession) => {
    setSelectedSession(session);
    setShowDetailModal(true);
    setIsLoadingDetail(true);

    try {
      const [messagesRes, summaryRes] = await Promise.all([
        lineSessionApi.getMessages(session.lineAccountId, { limit: 50 }),
        lineSessionApi.getTransactionSummary(session.lineAccountId),
      ]);

      setMessages(messagesRes.data?.messages || []);
      setSummary(summaryRes.data || null);
    } catch (error) {
      toast.error('Failed to load transaction details');
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

      // Reload messages
      const [messagesRes, summaryRes] = await Promise.all([
        lineSessionApi.getMessages(selectedSession.lineAccountId, { limit: 50 }),
        lineSessionApi.getTransactionSummary(selectedSession.lineAccountId),
      ]);
      setMessages(messagesRes.data?.messages || []);
      setSummary(summaryRes.data || null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถดึงข้อความได้');
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

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>;
      case 'expired':
        return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expired</Badge>;
      case 'error':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Error</Badge>;
      case 'no_session':
        return <Badge className="bg-slate-100 text-slate-500 border-slate-200">No Session</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Pending</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Unknown</Badge>;
    }
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
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handleBatchFetchAll}
              disabled={isBatchFetching || stats.sessionsWithKeys === 0}
              className="h-12 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              {isBatchFetching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" /> Fetch All ({stats.sessionsWithKeys})
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={fetchData}
              className="h-12 rounded-xl font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Sessions</span>
            </div>
            <p className="text-2xl font-black text-white">{stats.totalSessions}</p>
          </div>
          <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active</span>
            </div>
            <p className="text-2xl font-black text-emerald-400">{stats.activeSessions}</p>
          </div>
          <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Deposits</span>
            </div>
            <p className="text-xl font-black text-green-400">
              {stats.totalDeposits.toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
            </p>
          </div>
          <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-rose-400" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Withdrawals</span>
            </div>
            <p className="text-xl font-black text-rose-400">
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

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="p-12 bg-slate-800/30 rounded-2xl border border-slate-700/30 text-center">
            <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-400 mb-2">No Bank Sessions Found</h3>
            <p className="text-sm text-slate-500">
              Configure bank monitoring in LINE Account settings to start tracking transactions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <div
                key={session._id}
                className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50 hover:border-emerald-500/30 transition-all cursor-pointer group"
                onClick={() => openDetailModal(session)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center border",
                      session.hasKeys
                        ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/20"
                        : "bg-gradient-to-br from-slate-500/20 to-slate-600/20 border-slate-500/20"
                    )}>
                      <Building2 className={cn("w-7 h-7", session.hasKeys ? "text-emerald-400" : "text-slate-500")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {session.accountName}
                        </h3>
                        {getStatusBadge(session.status)}
                        {/* Keys Status Badge */}
                        {session.hasKeys ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-xs border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            มี Keys
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs border border-red-500/20">
                            <XCircle className="w-3 h-3" />
                            ไม่มี Keys
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                        {/* Owner Info - Highlighted */}
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded-lg border border-violet-500/20">
                          <User className="w-3.5 h-3.5" />
                          <span className="font-medium">{session.ownerName || 'ไม่ทราบเจ้าของ'}</span>
                        </span>
                        {session.bankName || session.bankCode ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {session.bankName || session.bankCode}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-500">
                            <Building2 className="w-4 h-4" />
                            ยังไม่ตั้งค่าธนาคาร
                          </span>
                        )}
                        {session.accountNumber && (
                          <span className="flex items-center gap-1">
                            <Wallet className="w-4 h-4" />
                            {session.accountNumber}
                          </span>
                        )}
                      </div>
                      {/* LINE Email & Stats */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        {session.lineEmail && (
                          <span className="flex items-center gap-1">
                            LINE: {session.lineEmail}
                          </span>
                        )}
                        {session.messageCount !== undefined && session.messageCount > 0 && (
                          <span className="flex items-center gap-1 text-blue-400">
                            📩 {session.messageCount} ข้อความ
                          </span>
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
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {session.balance ? (
                        <>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Balance</p>
                          <p className="text-xl font-black text-emerald-400">
                            {Number(session.balance).toLocaleString()} THB
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ข้อความ</p>
                          <p className="text-xl font-black text-blue-400">
                            {session.messageCount || 0}
                          </p>
                        </>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                  </div>
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
            <div className="p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-2xl border border-violet-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">เจ้าของบัญชี</p>
                    <p className="text-white font-bold">{selectedSession.ownerName || 'ไม่ทราบ'}</p>
                  </div>
                </div>
                {selectedSession.lineEmail && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">LINE Email</p>
                    <p className="text-sm text-slate-300">{selectedSession.lineEmail}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Account Info */}
            <div className="p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-[2rem] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-[60px] -mr-24 -mt-24 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">
                        {selectedSession.bankName || selectedSession.bankCode}
                      </p>
                      <p className="text-white font-bold">{selectedSession.accountNumber || 'No Account'}</p>
                    </div>
                  </div>
                  {getStatusBadge(selectedSession.status)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">Current Balance</p>
                    <p className="text-2xl font-black text-white">
                      {selectedSession.balance ? `${Number(selectedSession.balance).toLocaleString()} THB` : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">Chat MID</p>
                    <p className="text-sm font-mono text-white/80 truncate">
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Deposits</p>
                          <p className="text-lg font-black text-emerald-700">{summary.deposits?.count || 0} transactions</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-emerald-600">
                        {Number(summary.deposits?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                    <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                          <TrendingDown className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">Withdrawals</p>
                          <p className="text-lg font-black text-rose-700">{summary.withdrawals?.count || 0} transactions</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-rose-600">
                        {Number(summary.withdrawals?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fetch Button */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Messages</p>
                    <p className="text-sm text-slate-600">{messages.length} messages loaded</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleFetchMessages}
                    isLoading={isFetching}
                    className="h-10 rounded-xl font-bold"
                  >
                    <Download className="w-4 h-4 mr-2" /> Fetch Now
                  </Button>
                </div>

                {/* Messages List */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Recent Transactions</p>
                  {messages.length === 0 ? (
                    <div className="p-8 bg-slate-50 rounded-[2rem] text-center">
                      <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">No transactions yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                      {messages.map((msg, index) => (
                        <div key={msg._id || index} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <Badge className={cn(
                              "text-[9px] font-bold",
                              msg.transactionType === 'deposit' && "bg-emerald-100 text-emerald-700",
                              msg.transactionType === 'withdraw' && "bg-rose-100 text-rose-700",
                              msg.transactionType === 'transfer' && "bg-blue-100 text-blue-700",
                              msg.transactionType === 'unknown' && "bg-slate-100 text-slate-600"
                            )}>
                              {msg.transactionType || 'unknown'}
                            </Badge>
                            <span className="text-[9px] text-slate-400">
                              {msg.messageDate ? new Date(msg.messageDate).toLocaleString('th-TH') : '-'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-600 truncate flex-1 mr-4">
                              {msg.text?.substring(0, 60) || 'No text'}
                            </p>
                            {msg.amount && (
                              <p className={cn(
                                "text-sm font-bold",
                                msg.transactionType === 'deposit' ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {msg.transactionType === 'deposit' ? '+' : '-'}{Number(msg.amount).toLocaleString()} THB
                              </p>
                            )}
                          </div>
                          {msg.balance && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              Balance: {Number(msg.balance).toLocaleString()} THB
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
    </DashboardLayout>
  );
}
