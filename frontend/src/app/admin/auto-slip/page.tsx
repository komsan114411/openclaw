'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { autoSlipAdminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

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

const STATUS_COLORS: Record<string, string> = {
  DISABLED: 'bg-gray-500',
  INIT: 'bg-blue-500',
  LOGIN_REQUIRED: 'bg-yellow-500',
  LOGGING_IN: 'bg-indigo-500',
  AWAITING_PIN: 'bg-purple-500',
  LOGGED_IN: 'bg-cyan-500',
  KEYS_READY: 'bg-teal-500',
  ACTIVE: 'bg-emerald-500',
  ERROR_SOFT: 'bg-orange-500',
  ERROR_FATAL: 'bg-rose-500',
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
  const [selectedAccount, setSelectedAccount] = useState<AccountStatus | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [intervalInput, setIntervalInput] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

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
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
    const intervalMs = parseInt(intervalInput) * 60 * 1000; // Convert minutes to ms
    if (isNaN(intervalMs) || intervalMs < 60000 || intervalMs > 3600000) {
      toast.error('ต้องอยู่ระหว่าง 1-60 นาที');
      return;
    }
    try {
      await autoSlipAdminApi.updateCheckInterval(id, intervalMs);
      toast.success('อัปเดตช่วงเวลาตรวจสอบสำเร็จ');
      setSelectedAccount(null);
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

  const filteredAccounts = accounts.filter(
    (acc) =>
      acc.accountNumber.includes(searchQuery) ||
      acc.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.bankType.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <p className="text-slate-500 text-xs sm:text-sm">
              ตรวจสอบและจัดการบัญชีธนาคารอัตโนมัติ
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              variant="outline"
              size="lg"
              className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs border-rose-500/20 bg-[#1A0F0F] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 w-full md:w-auto"
              onClick={handleReleaseAllLocks}
            >
              ปลดล็อคทั้งหมด
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs border-emerald-500/20 bg-[#0F1A14] text-slate-400 hover:text-[#06C755] hover:bg-emerald-500/10 w-full md:w-auto"
              onClick={() => setShowSettingsModal(true)}
            >
              ตั้งค่าระบบ
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid-stats">
            <StatCard
              title="บัญชีทั้งหมด"
              value={stats.totalAccounts}
              color="indigo"
              variant="glass"
              className="rounded-[2.5rem] border border-white/5 shadow-2xl"
            />
            <StatCard
              title="กำลังทำงาน"
              value={stats.activeAccounts}
              color="emerald"
              variant="glass"
              className="rounded-[2.5rem] border border-white/5 shadow-2xl"
            />
            <StatCard
              title="มี Keys"
              value={stats.accountsWithKeys}
              color="cyan"
              variant="glass"
              className="rounded-[2.5rem] border border-white/5 shadow-2xl"
            />
            <StatCard
              title="รอ PIN"
              value={stats.accountsAwaitingPin}
              color="purple"
              variant="glass"
              className="rounded-[2.5rem] border border-white/5 shadow-2xl"
            />
            <StatCard
              title="กำลังล็อกอิน"
              value={stats.accountsLoggingIn}
              color="blue"
              variant="glass"
              className="rounded-[2.5rem] border border-white/5 shadow-2xl"
            />
            <StatCard
              title="มีข้อผิดพลาด"
              value={stats.accountsInError}
              color="rose"
              variant="glass"
              className="rounded-[2.5rem] border border-white/5 shadow-2xl"
            />
          </div>
        )}

        {/* Search & Filter */}
        <Card className="p-6 border border-white/5 shadow-2xl bg-black/40 backdrop-blur-3xl rounded-[2.5rem] sticky top-8 z-20">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="relative flex-1 w-full group">
              <div className="absolute inset-y-0 left-0 pl-8 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <Input
                placeholder="ค้นหา เลขบัญชี ชื่อบัญชี หรือ ธนาคาร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                containerClassName="!mb-0"
                className="pl-16 h-16 bg-white/[0.02] border-white/5 shadow-inner focus:bg-white/[0.05] rounded-2xl font-semibold text-sm text-white placeholder:text-slate-500"
              />
            </div>
            <div className="px-6 py-3 bg-white/[0.03] border border-white/5 rounded-2xl">
              <span className="text-xl font-bold text-emerald-400 tracking-tighter">{filteredAccounts.length}</span>
              <span className="text-xs font-medium text-slate-400 ml-3">บัญชี</span>
            </div>
          </div>
        </Card>

        {/* Account List */}
        {filteredAccounts.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="ไม่พบบัญชี"
            description={searchQuery ? `ไม่พบบัญชีที่ตรงกับ "${searchQuery}"` : "ยังไม่มีบัญชี Auto-Slip ในระบบ"}
            variant="glass"
            className="py-24"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredAccounts.map((account) => (
              <Card
                key={account.bankAccountId}
                className="group relative overflow-hidden transition-all duration-500 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/5 bg-white/[0.01] p-6 rounded-[2rem]"
                padding="none"
              >
                {/* Bank Color Accent */}
                <div
                  className="absolute top-0 left-0 w-2 h-full rounded-l-[2rem]"
                  style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                />

                {/* Header */}
                <div className="flex items-start justify-between mb-4 pl-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-black text-white">{account.bankType}</span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold text-white',
                          STATUS_COLORS[account.status] || 'bg-gray-500'
                        )}
                      >
                        {account.statusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono">{account.accountNumber}</p>
                    <p className="text-sm text-slate-300 mt-1">{account.accountName}</p>
                  </div>
                  <div className="text-right">
                    {account.balance !== undefined && (
                      <p className="text-lg font-bold text-emerald-400">
                        {account.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">THB</p>
                  </div>
                </div>

                {/* Status Indicators */}
                <div className="flex flex-wrap gap-2 mb-4 pl-4">
                  {account.hasKeys && (
                    <Badge variant="success" size="sm">มี Keys</Badge>
                  )}
                  {account.isLocked && (
                    <Badge variant="warning" size="sm">
                      ล็อค: {account.lockOperation}
                    </Badge>
                  )}
                  {account.errorCount > 0 && (
                    <Badge variant="error" size="sm">
                      Error: {account.errorCount}
                    </Badge>
                  )}
                  {account.pinCode && (
                    <Badge variant="info" size="sm" className="font-mono">
                      PIN: {account.pinCode}
                    </Badge>
                  )}
                </div>

                {/* Last Fetch */}
                {account.lastMessageFetch && (
                  <div className="text-[10px] text-slate-500 mb-4 pl-4">
                    ดึงข้อมูลล่าสุด: {new Date(account.lastMessageFetch).toLocaleString('th-TH')}
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2 pl-4">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleTriggerFetch(account.bankAccountId)}
                    disabled={processingIds.has(account.bankAccountId) || account.isLocked}
                    className="h-9 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-white/5"
                  >
                    ดึงข้อมูล
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setSelectedAccount(account);
                      setIntervalInput('5');
                    }}
                    className="h-9 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-white/5"
                  >
                    ตั้งเวลา
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleResetAccount(account.bankAccountId)}
                    disabled={processingIds.has(account.bankAccountId)}
                    className="h-9 rounded-xl text-[10px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-white/5"
                  >
                    รีเซ็ต
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Interval Settings Modal */}
      {selectedAccount && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedAccount(null);
            setIntervalInput('');
          }}
          title={`ตั้งค่าเวลาตรวจสอบ - ${selectedAccount.bankType}`}
          size="sm"
        >
          <div className="space-y-6 p-2">
            <div>
              <p className="text-sm text-slate-400 mb-2">บัญชี: {selectedAccount.accountNumber}</p>
              <p className="text-sm text-slate-400">{selectedAccount.accountName}</p>
            </div>
            <Input
              label="ช่วงเวลาตรวจสอบ (นาที)"
              type="number"
              min={1}
              max={60}
              value={intervalInput}
              onChange={(e) => setIntervalInput(e.target.value)}
              placeholder="5"
              className="h-14 rounded-2xl bg-slate-50 border-slate-200"
            />
            <p className="text-xs text-slate-500">
              ระบบจะดึงข้อมูลธุรกรรมทุกๆ {intervalInput || '5'} นาที (ต้องอยู่ระหว่าง 1-60 นาที)
            </p>
            <div className="flex gap-4 pt-4">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-2xl"
                onClick={() => {
                  setSelectedAccount(null);
                  setIntervalInput('');
                }}
              >
                ยกเลิก
              </Button>
              <Button
                className="flex-[2] h-12 rounded-2xl"
                onClick={() => handleUpdateInterval(selectedAccount.bankAccountId)}
              >
                บันทึก
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Global Settings Modal */}
      {showSettingsModal && settings && (
        <Modal
          isOpen={true}
          onClose={() => setShowSettingsModal(false)}
          title="ตั้งค่าระบบ Auto-Slip"
          size="md"
        >
          <div className="space-y-6 p-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">ช่วงเวลาตรวจสอบเริ่มต้น</p>
                <p className="text-lg font-bold text-slate-900">
                  {settings.defaultCheckInterval / 60000} นาที
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">จำนวนดึงข้อมูลพร้อมกัน</p>
                <p className="text-lg font-bold text-slate-900">
                  {settings.maxConcurrentFetches} บัญชี
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">Error สูงสุดก่อนหยุด</p>
                <p className="text-lg font-bold text-slate-900">
                  {settings.maxConsecutiveErrors} ครั้ง
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">ช่วงเวลา Broadcast Status</p>
                <p className="text-lg font-bold text-slate-900">
                  {settings.statusBroadcastInterval / 1000} วินาที
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center">
              การตั้งค่าเหล่านี้สามารถปรับได้ผ่าน Environment Variables
            </p>
            <Button
              variant="ghost"
              className="w-full h-12 rounded-2xl"
              onClick={() => setShowSettingsModal(false)}
            >
              ปิด
            </Button>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}
