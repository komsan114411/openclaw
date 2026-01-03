'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi, paymentsApi, activityLogsApi } from '@/lib/api';
import { LineAccount, QuotaInfo, Payment } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { SectionHeader, StatCardMini } from '@/components/ui';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

interface ActivityLog {
  _id: string;
  action: string;
  message: string;
  createdAt: string;
  entityType?: string;
}

interface Subscription {
  _id: string;
  packageName: string;
  quota: number;
  remainingQuota: number;
  expiresAt: string;
  status: string;
}

export default function UserDashboard() {
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, quotaRes, paymentsRes, logsRes, subRes] = await Promise.all([
          lineAccountsApi.getMyAccounts(),
          subscriptionsApi.getQuota(),
          paymentsApi.getMy(),
          activityLogsApi.getMy(5).catch(() => ({ data: { logs: [] } })),
          subscriptionsApi.getMy().catch(() => ({ data: { subscription: null } })),
        ]);

        setLineAccounts(accountsRes.data.accounts || []);
        setQuota(quotaRes.data.quota || null);
        setRecentPayments(paymentsRes.data.payments?.slice(0, 5) || []);
        setActivityLogs(logsRes.data.logs || []);
        setSubscription(subRes.data.subscription || null);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalMessages = lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);
  const pendingPayments = recentPayments.filter((p) => p.status === 'pending').length;

  // Calculate quota percentage
  const quotaPercentage = subscription
    ? Math.round(((subscription.remainingQuota ?? 0) / (subscription.quota ?? 1)) * 100)
    : 0;

  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('th-TH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get action icon
  const getActionIcon = (action: string) => {
    if (action.includes('login')) return '🔑';
    if (action.includes('payment')) return '💳';
    if (action.includes('slip')) return '📄';
    if (action.includes('package')) return '📦';
    if (action.includes('account')) return '👤';
    return '📋';
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดข้อมูล..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* PAGE HEADER */}
        <SectionHeader
          title="แดชบอร์ด"
          highlight="LINE OA"
          subtitle="ภาพรวมการใช้งาน • โควต้า • การตรวจสลิป • สถานะระบบ"
          actions={
            <>
              <Link href="/user/line-accounts" className="flex-1 sm:flex-none">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  ➕ เพิ่มบัญชี LINE
                </Button>
              </Link>
              <Link href="/user/packages" className="flex-1 sm:flex-none">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  📦 ซื้อแพ็คเกจ
                </Button>
              </Link>
            </>
          }
        />

        {/* QUICK STATS - Real Data Only */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mt-6">
          <StatCardMini
            icon="💬"
            value={lineAccounts.length}
            label="บัญชี LINE"
            badgeText={lineAccounts.length > 0 ? 'ใช้งานอยู่' : undefined}
            badgeVariant="success"
          />
          <StatCardMini
            icon="📄"
            value={pendingPayments}
            label="สลิปรอตรวจ"
            color={pendingPayments > 0 ? 'amber' : undefined}
            badgeText={pendingPayments > 0 ? 'รอดำเนินการ' : undefined}
            badgeVariant="warning"
          />
          <StatCardMini
            icon="📊"
            value={subscription?.remainingQuota?.toLocaleString() || '0'}
            label="โควต้าคงเหลือ"
            color="emerald"
          />
          <StatCardMini
            icon="👥"
            value={totalMessages > 0 ? totalMessages.toLocaleString() : '0'}
            label="ข้อความทั้งหมด"
            color="blue"
          />
        </div>

        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-6">

          {/* LEFT COLUMN - Subscription & Quota */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">

            {/* Current Subscription Card */}
            {subscription ? (
              <Card className="bg-slate-950 border border-[#06C755]/20 shadow-2xl overflow-hidden relative" variant="glass">
                <div className="absolute top-0 right-0 w-48 sm:w-80 h-48 sm:h-80 bg-[#06C755]/5 rounded-full blur-[60px] sm:blur-[100px] -mr-24 sm:-mr-40 -mt-24 sm:-mt-40" />

                <div className="p-4 sm:p-6 lg:p-8 relative z-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-400 mb-1">แพ็คเกจปัจจุบัน</p>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                        {subscription.packageName || 'แพ็คเกจมาตรฐาน'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#06C755] animate-pulse" />
                      <span className="text-xs font-semibold text-[#06C755]">ใช้งานอยู่</span>
                    </div>
                  </div>

                  {/* Quota Progress */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-xs font-semibold text-slate-400">โควต้าคงเหลือ</span>
                        <p className="text-3xl sm:text-4xl font-black text-white">
                          {subscription.remainingQuota?.toLocaleString() || 0}
                          <span className="text-lg sm:text-xl text-slate-500 font-semibold ml-2">
                            / {subscription.quota?.toLocaleString() || 0}
                          </span>
                        </p>
                      </div>
                      <span className={cn(
                        "text-sm font-black",
                        quotaPercentage > 50 ? 'text-[#06C755]' : quotaPercentage > 20 ? 'text-amber-500' : 'text-rose-500'
                      )}>
                        {quotaPercentage}%
                      </span>
                    </div>

                    <div className="h-3 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          quotaPercentage > 50 ? 'bg-[#06C755]' : quotaPercentage > 20 ? 'bg-amber-500' : 'bg-rose-500'
                        )}
                        style={{ width: `${quotaPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Expiry & Actions */}
                  <div className="mt-6 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400">หมดอายุ</span>
                        <p className="text-sm font-bold text-white">
                          {subscription.expiresAt ? formatDate(subscription.expiresAt) : 'ไม่มีกำหนด'}
                        </p>
                      </div>
                      {quotaPercentage < 20 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span className="text-[10px] font-semibold text-rose-400">โควต้าใกล้หมด</span>
                        </div>
                      )}
                    </div>
                    <Link href="/user/packages">
                      <Button variant="primary" size="sm" className="bg-[#06C755] hover:bg-[#05B048]">
                        เติมโควต้า
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ) : (
              /* No Subscription - Prompt to Buy */
              <Card className="bg-slate-950 border border-white/10 overflow-hidden" variant="glass">
                <div className="p-6 sm:p-8 text-center">
                  <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📦</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">ยังไม่มีแพ็คเกจ</h3>
                  <p className="text-sm text-slate-400 mb-6">เลือกแพ็คเกจที่เหมาะกับการใช้งานของคุณ</p>
                  <Link href="/user/packages">
                    <Button variant="primary" className="bg-[#06C755] hover:bg-[#05B048]">
                      ดูแพ็คเกจทั้งหมด
                    </Button>
                  </Link>
                </div>
              </Card>
            )}

            {/* LINE Accounts List */}
            <Card className="bg-slate-950 border border-white/5" variant="glass">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">บัญชี LINE OA</h3>
                  <Link href="/user/line-accounts">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                      ดูทั้งหมด →
                    </Button>
                  </Link>
                </div>

                {lineAccounts.length > 0 ? (
                  <div className="space-y-3">
                    {lineAccounts.slice(0, 3).map((account) => (
                      <div
                        key={account._id}
                        className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="w-10 h-10 bg-[#06C755]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">💬</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{account.accountName}</p>
                          <p className="text-xs text-slate-400">
                            {account.statistics?.totalMessages?.toLocaleString() || 0} ข้อความ
                          </p>
                        </div>
                        <Badge variant={account.isActive ? 'success' : 'secondary'} size="sm">
                          {account.isActive ? 'ใช้งาน' : 'ปิด'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <span className="text-2xl">💬</span>
                    </div>
                    <p className="text-sm text-slate-400 mb-4">ยังไม่มีบัญชี LINE OA</p>
                    <Link href="/user/line-accounts/new">
                      <Button variant="outline" size="sm">
                        เพิ่มบัญชีแรก
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN - Activity & Payments */}
          <div className="space-y-4 sm:space-y-6">

            {/* Recent Payments */}
            <Card className="bg-slate-950 border border-white/5" variant="glass">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">การชำระเงินล่าสุด</h3>
                  <Link href="/user/payments">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                      ดูทั้งหมด →
                    </Button>
                  </Link>
                </div>

                {recentPayments.length > 0 ? (
                  <div className="space-y-3">
                    {recentPayments.slice(0, 4).map((payment) => (
                      <div
                        key={payment._id}
                        className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5"
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                          payment.status === 'verified' ? 'bg-emerald-500/10' :
                          payment.status === 'pending' ? 'bg-amber-500/10' : 'bg-rose-500/10'
                        )}>
                          <span className="text-sm">
                            {payment.status === 'verified' ? '✅' : payment.status === 'pending' ? '⏳' : '❌'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            ฿{payment.amount?.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {formatDateTime(payment.createdAt)}
                          </p>
                        </div>
                        <Badge
                          variant={payment.status === 'verified' ? 'success' : payment.status === 'pending' ? 'warning' : 'error'}
                          size="sm"
                        >
                          {payment.status === 'verified' ? 'อนุมัติ' : payment.status === 'pending' ? 'รอตรวจ' : 'ปฏิเสธ'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-400">ยังไม่มีรายการชำระเงิน</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Recent Activity */}
            <Card className="bg-slate-950 border border-white/5" variant="glass">
              <div className="p-4 sm:p-6">
                <h3 className="text-lg font-bold text-white mb-4">กิจกรรมล่าสุด</h3>

                {activityLogs.length > 0 ? (
                  <div className="space-y-3">
                    {activityLogs.map((log) => (
                      <div
                        key={log._id}
                        className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5"
                      >
                        <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-sm">{getActionIcon(log.action)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white line-clamp-2">{log.message}</p>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {formatDateTime(log.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <span className="text-xl">📋</span>
                    </div>
                    <p className="text-sm text-slate-400">ยังไม่มีกิจกรรม</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-gradient-to-br from-[#06C755]/10 to-slate-950 border border-[#06C755]/20" variant="glass">
              <div className="p-4 sm:p-6">
                <h3 className="text-lg font-bold text-white mb-4">ทางลัด</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/user/packages" className="block">
                    <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 hover:bg-white/[0.06] transition-colors text-center">
                      <span className="text-2xl block mb-2">📦</span>
                      <span className="text-xs font-semibold text-slate-300">ซื้อแพ็คเกจ</span>
                    </div>
                  </Link>
                  <Link href="/user/line-accounts" className="block">
                    <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 hover:bg-white/[0.06] transition-colors text-center">
                      <span className="text-2xl block mb-2">💬</span>
                      <span className="text-xs font-semibold text-slate-300">จัดการบัญชี</span>
                    </div>
                  </Link>
                  <Link href="/user/payments" className="block">
                    <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 hover:bg-white/[0.06] transition-colors text-center">
                      <span className="text-2xl block mb-2">💳</span>
                      <span className="text-xs font-semibold text-slate-300">ประวัติชำระ</span>
                    </div>
                  </Link>
                  <Link href="/user/settings" className="block">
                    <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5 hover:bg-white/[0.06] transition-colors text-center">
                      <span className="text-2xl block mb-2">⚙️</span>
                      <span className="text-xs font-semibold text-slate-300">ตั้งค่า</span>
                    </div>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
