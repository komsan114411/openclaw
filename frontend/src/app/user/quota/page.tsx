'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { subscriptionsApi, lineAccountsApi } from '@/lib/api';
import { Subscription, LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';

export default function UserQuotaPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [subRes, accountsRes] = await Promise.all([
        subscriptionsApi.getMy(),
        lineAccountsApi.getMyAccounts(),
      ]);
      setSubscription(subRes.data.subscription);
      setAccounts(accountsRes.data.accounts || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetry = () => {
    setIsLoading(true);
    fetchData();
  };

  const getQuotaPercentage = () => {
    if (!subscription || !subscription.quota) return 0;
    return Math.round(((subscription.remainingQuota || 0) / subscription.quota) * 100);
  };

  const getQuotaColor = () => {
    const percentage = getQuotaPercentage();
    if (percentage > 50) return 'from-green-400 to-green-500';
    if (percentage > 20) return 'from-yellow-400 to-yellow-500';
    return 'from-red-400 to-red-500';
  };

  const getTotalSlipsVerified = () => {
    return accounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0);
  };

  const getTotalMessages = () => {
    return accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);
  };

  const usedQuota = subscription ? (subscription.quota || 0) - (subscription.remainingQuota || 0) : 0;

  // คำนวณวันที่เหลือ
  const daysRemaining = subscription?.expiresAt
    ? Math.max(0, Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดข้อมูลโควต้า..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">โควต้าการใช้งาน</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium">ติดตามการใช้งานโควต้าของคุณ</p>
          </div>
          <Link href="/user/packages">
            <Button variant="primary" size="sm" className="w-full sm:w-auto">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              เติมโควต้า
            </Button>
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <StatCard
            title="โควต้าคงเหลือ"
            value={(subscription?.remainingQuota || 0).toLocaleString()}
            color="emerald"
            variant="glass"
            className="rounded-[2.5rem] shadow-premium-sm border-none"
            icon={
              <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <StatCard
            title="สลิปที่ตรวจสอบ"
            value={getTotalSlipsVerified().toLocaleString()}
            color="blue"
            variant="glass"
            className="rounded-[2.5rem] shadow-premium-sm border-none"
            icon={
              <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
          <StatCard
            title="ข้อความทั้งหมด"
            value={getTotalMessages().toLocaleString()}
            color="violet"
            variant="glass"
            className="rounded-[2.5rem] shadow-premium-sm border-none"
            icon={
              <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          />
          <StatCard
            title="เหลืออีก"
            value={`${daysRemaining} วัน`}
            color={daysRemaining < 7 ? 'rose' : 'amber'}
            variant="glass"
            className="rounded-[2.5rem] shadow-premium-sm border-none"
            icon={
              <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Quota Progress */}
        <Card className="rounded-[3rem] border-none shadow-premium-lg bg-white/70 backdrop-blur-3xl overflow-hidden relative p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 relative z-10">
            <div>
              <h3 className="font-black text-slate-900 text-2xl tracking-tight uppercase">โควต้าสลิป</h3>
              {subscription && (
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">แพ็คเกจ: {subscription.packageName || 'Standard'}</p>
              )}
            </div>
            {subscription && (
              <Badge
                variant={getQuotaPercentage() > 50 ? 'success' : getQuotaPercentage() > 20 ? 'warning' : 'error'}
                className="text-[10px] px-4 py-1.5 font-black uppercase tracking-widest rounded-xl shadow-lg"
              >
                {getQuotaPercentage()}% คงเหลือ
              </Badge>
            )}
          </div>

          {subscription ? (
            <div className="relative z-10">
              {/* Progress Bar */}
              <div className="mb-10">
                <div className="flex justify-between text-sm mb-3">
                  <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Usage Metric</span>
                  <span className="font-black text-slate-900">
                    {(subscription.remainingQuota || 0).toLocaleString()} <span className="text-slate-400 text-xs font-bold">/ {(subscription.quota || 0).toLocaleString()} SLIPS</span>
                  </span>
                </div>
                <div className="relative">
                  <div className="h-6 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r shadow-lg ${getQuotaColor()}`}
                      style={{ width: `${Math.max(getQuotaPercentage(), 2)}%` }}
                    />
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-2 text-right uppercase tracking-widest">
                  Consumed: {usedQuota.toLocaleString()} units
                </p>
              </div>

              {/* Date Info */}
              <div className="grid grid-cols-2 gap-4 pt-8 border-t border-slate-100">
                <div className="p-5 bg-slate-50/50 rounded-[2rem] border border-slate-100 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Activation Date</p>
                  <p className="font-black text-slate-900 text-lg">
                    {subscription.startDate
                      ? new Date(subscription.startDate).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                      : '-'}
                  </p>
                </div>
                <div className="p-5 bg-slate-50/50 rounded-[2rem] border border-slate-100 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Expiration Date</p>
                  <p className="font-black text-slate-900 text-lg">
                    {subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Warning */}
              {getQuotaPercentage() < 20 && (
                <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl flex items-center gap-4 shadow-sm">
                  <div className="p-2.5 bg-white rounded-xl shadow-sm text-amber-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-amber-800 uppercase tracking-tight text-sm">Critical Threshold Reached</p>
                    <p className="text-xs font-bold text-amber-600/80">Recharge immediately to prevent service interruption.</p>
                  </div>
                  <Link href="/user/packages">
                    <Button variant="warning" size="sm" className="rounded-xl font-black uppercase tracking-widest text-[10px] shadow-amber-500/20 shadow-lg">
                      Top Up Now
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg className="w-16 h-16 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              title="NO SUBSCRIPTION ACTIVE"
              description="Initialize a package plan to activate neural services."
              action={
                <Link href="/user/packages">
                  <Button variant="primary" className="rounded-2xl font-black uppercase tracking-widest text-xs h-12 px-8 shadow-emerald-500/20 shadow-xl">View Protocol Plans</Button>
                </Link>
              }
            />
          )}
        </Card>

        {/* Per Account Usage */}
        {accounts.length > 0 && (
          <Card className="rounded-[3rem] border-none shadow-premium-lg bg-white/70 backdrop-blur-3xl overflow-hidden p-0">
            <div className="p-8 pb-4">
              <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Account Telemetry</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Real-time resource distribution across {accounts.length} nodes</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Node Identity</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Messages</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Slips</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hidden sm:table-cell">AI Responses</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {accounts.map((account) => (
                    <tr key={account._id} className="hover:bg-white transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                            {account.accountName?.charAt(0).toUpperCase() || 'L'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm truncate">{account.accountName}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400 truncate bg-slate-100 px-1.5 py-0.5 rounded w-fit mt-0.5">{account.channelId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="font-black text-slate-700 text-sm">
                          {(account.statistics?.totalMessages || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="font-black text-emerald-600 text-sm">
                          {(account.statistics?.totalSlipsVerified || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center hidden sm:table-cell">
                        <span className="font-black text-indigo-600 text-sm">
                          {(account.statistics?.totalAiResponses || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <Badge variant={account.isActive ? 'success' : 'secondary'} size="sm" className="font-black uppercase tracking-widest text-[9px]">
                          {account.isActive ? 'ONLINE' : 'OFFLINE'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
