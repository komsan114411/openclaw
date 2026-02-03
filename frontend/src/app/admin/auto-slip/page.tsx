'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { autoSlipAdminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Settings,
  Unlock,
  Clock,
  Zap,
  Key,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Building2,
  Copy,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Smartphone,
  LogIn,
} from 'lucide-react';

interface AccountStatus {
  bankAccountId: string;
  bankType: string;
  accountNumber: string;
  accountName: string;
  status: string;
  statusLabel: string;
  balance?: number;
  hasKeys: boolean;
  isLocked: boolean;
  lockOperation?: string;
  lastMessageFetch?: string;
  errorCount: number;
  pinCode?: string;
  pinExpiresAt?: string;
  monitoringEnabled?: boolean;
  checkInterval?: number;
}

interface OrchestratorStats {
  totalAccounts: number;
  activeAccounts: number;
  accountsWithKeys: number;
  accountsInError: number;
  accountsAwaitingPin: number;
  accountsLoggingIn: number;
  lockedAccounts: number;
}

interface GlobalSettings {
  defaultCheckInterval: number;
  maxConcurrentFetches: number;
  maxConsecutiveErrors: number;
  statusBroadcastInterval: number;
}

const STATUS_CONFIG: Record<string, { color: string; icon: any; bgColor: string }> = {
  DISABLED: { color: 'text-gray-400', icon: XCircle, bgColor: 'bg-gray-500/10' },
  INIT: { color: 'text-blue-400', icon: Settings, bgColor: 'bg-blue-500/10' },
  LOGIN_REQUIRED: { color: 'text-yellow-400', icon: LogIn, bgColor: 'bg-yellow-500/10' },
  LOGGING_IN: { color: 'text-indigo-400', icon: Loader2, bgColor: 'bg-indigo-500/10' },
  AWAITING_PIN: { color: 'text-purple-400', icon: Smartphone, bgColor: 'bg-purple-500/10' },
  LOGGED_IN: { color: 'text-cyan-400', icon: CheckCircle, bgColor: 'bg-cyan-500/10' },
  KEYS_READY: { color: 'text-teal-400', icon: Key, bgColor: 'bg-teal-500/10' },
  ACTIVE: { color: 'text-emerald-400', icon: Zap, bgColor: 'bg-emerald-500/10' },
  ERROR_SOFT: { color: 'text-orange-400', icon: AlertTriangle, bgColor: 'bg-orange-500/10' },
  ERROR_FATAL: { color: 'text-rose-400', icon: XCircle, bgColor: 'bg-rose-500/10' },
};

const BANK_COLORS: Record<string, string> = {
  SCB: '#4E2A84',
  KBANK: '#138F2D',
  GSB: '#E91E8C',
  BBL: '#1E3A8A',
  KTB: '#00A9E0',
  TMB: '#004B93',
  BAY: '#FDB913',
};

export default function AutoSlipAdminPage() {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [stats, setStats] = useState<OrchestratorStats | null>(null);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAccount, setSelectedAccount] = useState<AccountStatus | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [intervalInput, setIntervalInput] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, statsRes, settingsRes] = await Promise.all([
        autoSlipAdminApi.getOrchestratorStatus(),
        autoSlipAdminApi.getOrchestratorStats(),
        autoSlipAdminApi.getGlobalSettings(),
      ]);

      if (statusRes.data.accounts) {
        setAccounts(statusRes.data.accounts);
      }
      if (statsRes.data) {
        setStats(statsRes.data);
      }
      if (settingsRes.data) {
        setSettings(settingsRes.data);
      }
    } catch (err: any) {
      // Silent error on refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchData, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  const handleResetAccount = async (id: string) => {
    if (processingIds.has(id)) return;
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await autoSlipAdminApi.resetAccount(id);
      toast.success('รีเซ็ตบัญชีสำเร็จ');
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถรีเซ็ตบัญชีได้');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggleMonitoring = async (account: AccountStatus, enable: boolean) => {
    if (processingIds.has(account.bankAccountId)) return;
    setProcessingIds((prev) => new Set(prev).add(account.bankAccountId));
    try {
      if (enable) {
        await autoSlipAdminApi.enableMonitoring(account.bankAccountId);
        toast.success('เปิดการตรวจสอบสำเร็จ');
      } else {
        await autoSlipAdminApi.disableMonitoring(account.bankAccountId);
        toast.success('ปิดการตรวจสอบสำเร็จ');
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(account.bankAccountId);
        return next;
      });
    }
  };

  const handleTriggerFetch = async (id: string) => {
    if (processingIds.has(id)) return;
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      const res = await autoSlipAdminApi.triggerFetch(id);
      if (res.data.success) {
        toast.success(`ดึงข้อมูลสำเร็จ: ${res.data.newMessages || 0} ข้อความใหม่`);
      } else {
        toast.error(res.data.error || 'ไม่สามารถดึงข้อมูลได้');
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถดึงข้อมูลได้');
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleUpdateInterval = async (id: string) => {
    const intervalMs = parseInt(intervalInput) * 60 * 1000;
    if (isNaN(intervalMs) || intervalMs < 60000 || intervalMs > 3600000) {
      toast.error('ต้องอยู่ระหว่าง 1-60 นาที');
      return;
    }
    try {
      await autoSlipAdminApi.updateCheckInterval(id, intervalMs);
      toast.success('อัปเดตช่วงเวลาตรวจสอบสำเร็จ');
      setShowAccountModal(false);
      setIntervalInput('');
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถอัปเดตได้');
    }
  };

  const handleReleaseAllLocks = async () => {
    try {
      const res = await autoSlipAdminApi.releaseAllLocks();
      toast.success(`ปลดล็อคสำเร็จ: ${res.data.released || 0} รายการ`);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถปลดล็อคได้');
    }
  };

  const copyPIN = (pin: string) => {
    navigator.clipboard.writeText(pin);
    toast.success('คัดลอก PIN แล้ว');
  };

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.accountNumber.includes(searchQuery) ||
      acc.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.bankType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && acc.status === 'ACTIVE') ||
      (statusFilter === 'awaiting_pin' && acc.status === 'AWAITING_PIN') ||
      (statusFilter === 'error' && ['ERROR_SOFT', 'ERROR_FATAL'].includes(acc.status)) ||
      (statusFilter === 'needs_login' && ['INIT', 'LOGIN_REQUIRED'].includes(acc.status)) ||
      (statusFilter === 'locked' && acc.isLocked);

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-10">
        {/* Header */}
        <div className="page-header relative z-10 flex-col md:flex-row items-start md:items-center">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">ระบบอัตโนมัติ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              จัดการ<span className="text-[#06C755]">Auto-Slip</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">ตรวจสอบและจัดการบัญชีธนาคารอัตโนมัติทั้งหมด</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                'h-10 px-4 rounded-xl font-semibold text-xs border',
                autoRefresh ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-white/10 text-slate-400'
              )}
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', autoRefresh && 'animate-spin')} />
              {autoRefresh ? 'อัตโนมัติ' : 'หยุดรีเฟรช'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-4 rounded-xl font-semibold text-xs border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
              onClick={handleReleaseAllLocks}
            >
              <Unlock className="w-4 h-4 mr-2" />
              ปลดล็อคทั้งหมด
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-4 rounded-xl font-semibold text-xs border-white/10 text-slate-400 hover:text-white"
              onClick={() => setShowSettingsModal(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              ตั้งค่า
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard title="บัญชีทั้งหมด" value={stats.totalAccounts} color="indigo" variant="glass" className="rounded-2xl" />
            <StatCard title="กำลังทำงาน" value={stats.activeAccounts} color="emerald" variant="glass" className="rounded-2xl" />
            <StatCard title="รอ PIN" value={stats.accountsAwaitingPin} color="violet" variant="glass" className="rounded-2xl" />
            <StatCard title="กำลังล็อกอิน" value={stats.accountsLoggingIn} color="blue" variant="glass" className="rounded-2xl" />
            <StatCard title="มีข้อผิดพลาด" value={stats.accountsInError} color="rose" variant="glass" className="rounded-2xl" />
            <StatCard title="ถูกล็อค" value={stats.lockedAccounts} color="amber" variant="glass" className="rounded-2xl" />
          </div>
        )}

        {/* Filters */}
        <Card className="p-4 border border-white/5 bg-black/40 backdrop-blur-3xl rounded-2xl">
          <div className="flex flex-col lg:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
              <Input
                placeholder="ค้นหา เลขบัญชี ชื่อบัญชี หรือ ธนาคาร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                containerClassName="!mb-0"
                className="h-12 bg-white/[0.02] border-white/5 rounded-xl font-medium text-sm text-white placeholder:text-slate-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'active', label: 'กำลังทำงาน' },
                { value: 'awaiting_pin', label: 'รอ PIN' },
                { value: 'needs_login', label: 'ต้องล็อกอิน' },
                { value: 'error', label: 'มีปัญหา' },
                { value: 'locked', label: 'ถูกล็อค' },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-semibold transition-all',
                    statusFilter === filter.value
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-white border border-white/5'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Account List */}
        {filteredAccounts.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="ไม่พบบัญชี"
            description={searchQuery ? `ไม่พบบัญชีที่ตรงกับ "${searchQuery}"` : 'ยังไม่มีบัญชี Auto-Slip ในระบบ'}
            variant="glass"
            className="py-16"
          />
        ) : (
          <div className="space-y-4">
            {filteredAccounts.map((account) => {
              const statusConfig = STATUS_CONFIG[account.status] || STATUS_CONFIG.INIT;
              const StatusIcon = statusConfig.icon;
              const isProcessing = processingIds.has(account.bankAccountId);

              return (
                <Card
                  key={account.bankAccountId}
                  className="relative overflow-hidden transition-all duration-300 hover:shadow-lg border border-white/5 bg-white/[0.01] rounded-2xl"
                  padding="none"
                >
                  {/* Bank Color Accent */}
                  <div
                    className="absolute top-0 left-0 w-1.5 h-full"
                    style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                  />

                  <div className="p-5 pl-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Account Info */}
                      <div className="flex items-center gap-4 flex-1">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                          style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                        >
                          {account.bankType.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">{account.bankType}</span>
                            <span className="text-xs text-slate-400 font-mono">{account.accountNumber}</span>
                            <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold', statusConfig.bgColor, statusConfig.color)}>
                              <StatusIcon className={cn('w-3.5 h-3.5', account.status === 'LOGGING_IN' && 'animate-spin')} />
                              {account.statusLabel}
                            </div>
                          </div>
                          <p className="text-sm text-slate-400 truncate mt-1">{account.accountName}</p>
                        </div>
                      </div>

                      {/* Status Indicators */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {account.balance !== undefined && (
                          <div className="px-3 py-1.5 bg-emerald-500/10 rounded-lg">
                            <span className="text-sm font-bold text-emerald-400">
                              ฿{account.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {account.hasKeys && (
                          <Badge variant="success" size="sm">
                            <Key className="w-3 h-3 mr-1" />
                            Keys
                          </Badge>
                        )}
                        {account.isLocked && (
                          <Badge variant="warning" size="sm">
                            🔒 {account.lockOperation}
                          </Badge>
                        )}
                        {account.errorCount > 0 && (
                          <Badge variant="error" size="sm">
                            Error: {account.errorCount}
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {account.pinCode && (
                          <button
                            onClick={() => copyPIN(account.pinCode!)}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400 hover:bg-purple-500/20 transition-colors"
                          >
                            <span className="font-mono font-bold">{account.pinCode}</span>
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTriggerFetch(account.bankAccountId)}
                          disabled={isProcessing || account.isLocked || !account.hasKeys}
                          className="h-9 px-3 rounded-xl text-xs text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-white/5"
                        >
                          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedAccount(account);
                            setIntervalInput(String((account.checkInterval || 300000) / 60000));
                            setShowAccountModal(true);
                          }}
                          className="h-9 px-3 rounded-xl text-xs text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 border border-white/5"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetAccount(account.bankAccountId)}
                          disabled={isProcessing}
                          className="h-9 px-3 rounded-xl text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/5"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Additional Info Row */}
                    {account.lastMessageFetch && (
                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          อัปเดตล่าสุด: {new Date(account.lastMessageFetch).toLocaleString('th-TH')}
                        </span>
                        {account.checkInterval && (
                          <span className="flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" />
                            ทุก {account.checkInterval / 60000} นาที
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Account Settings Modal */}
      {selectedAccount && showAccountModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowAccountModal(false);
            setSelectedAccount(null);
          }}
          title="ตั้งค่าบัญชี"
          size="md"
        >
          <div className="p-4 space-y-6">
            {/* Account Info */}
            <div className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-2xl border border-white/5">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: BANK_COLORS[selectedAccount.bankType] || '#666' }}
              >
                {selectedAccount.bankType.slice(0, 2)}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{selectedAccount.bankType}</h3>
                <p className="text-sm text-slate-400 font-mono">{selectedAccount.accountNumber}</p>
                <p className="text-sm text-slate-500">{selectedAccount.accountName}</p>
              </div>
            </div>

            {/* Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 mb-1">สถานะ</p>
                <p className="text-sm font-semibold text-white">{selectedAccount.statusLabel}</p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 mb-1">ยอดคงเหลือ</p>
                <p className="text-sm font-semibold text-emerald-400">
                  {selectedAccount.balance !== undefined
                    ? `฿${selectedAccount.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                    : '-'}
                </p>
              </div>
            </div>

            {/* Check Interval */}
            <div>
              <label className="block text-sm font-semibold text-white mb-2">ช่วงเวลาตรวจสอบ (นาที)</label>
              <div className="flex gap-3">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  placeholder="5"
                  className="h-12 rounded-xl flex-1"
                  containerClassName="!mb-0 flex-1"
                />
                <Button
                  className="h-12 px-6 rounded-xl"
                  onClick={() => handleUpdateInterval(selectedAccount.bankAccountId)}
                >
                  บันทึก
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2">ระบบจะดึงข้อมูลทุก {intervalInput || '5'} นาที (1-60 นาที)</p>
            </div>

            {/* Monitoring Toggle */}
            <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
              <div>
                <p className="text-sm font-semibold text-white">การตรวจสอบอัตโนมัติ</p>
                <p className="text-xs text-slate-500">เปิด/ปิดการดึงข้อมูลอัตโนมัติ</p>
              </div>
              <Button
                variant={selectedAccount.monitoringEnabled ? 'primary' : 'outline'}
                size="sm"
                onClick={() => handleToggleMonitoring(selectedAccount, !selectedAccount.monitoringEnabled)}
                className="h-10 px-4 rounded-xl"
              >
                {selectedAccount.monitoringEnabled ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    หยุด
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    เริ่ม
                  </>
                )}
              </Button>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 rounded-xl border-white/10 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30"
                onClick={() => {
                  handleTriggerFetch(selectedAccount.bankAccountId);
                }}
                disabled={processingIds.has(selectedAccount.bankAccountId) || !selectedAccount.hasKeys}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                ดึงข้อมูลทันที
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
                onClick={() => {
                  handleResetAccount(selectedAccount.bankAccountId);
                  setShowAccountModal(false);
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                รีเซ็ตบัญชี
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Global Settings Modal */}
      {showSettingsModal && settings && (
        <Modal isOpen={true} onClose={() => setShowSettingsModal(false)} title="ตั้งค่าระบบ Auto-Slip" size="md">
          <div className="p-4 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 mb-1">ช่วงเวลาตรวจสอบเริ่มต้น</p>
                <p className="text-xl font-bold text-white">{settings.defaultCheckInterval / 60000} นาที</p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 mb-1">ดึงข้อมูลพร้อมกันสูงสุด</p>
                <p className="text-xl font-bold text-white">{settings.maxConcurrentFetches} บัญชี</p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 mb-1">Error สูงสุดก่อนหยุด</p>
                <p className="text-xl font-bold text-white">{settings.maxConsecutiveErrors} ครั้ง</p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                <p className="text-xs text-slate-500 mb-1">Broadcast Status ทุก</p>
                <p className="text-xl font-bold text-white">{settings.statusBroadcastInterval / 1000} วินาที</p>
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <p className="text-sm text-amber-400">
                การตั้งค่าเหล่านี้สามารถปรับได้ผ่าน Environment Variables ในไฟล์ .env
              </p>
            </div>

            <Button variant="ghost" className="w-full h-12 rounded-xl" onClick={() => setShowSettingsModal(false)}>
              ปิด
            </Button>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}
