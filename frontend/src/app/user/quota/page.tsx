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
import { cn } from '@/lib/utils';

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
      <div className="section-gap animate-fade pb-10">
        <div className="page-header relative z-10 flex-col sm:flex-row items-start sm:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <h1 className="page-title-responsive">
              OA <span className="text-[#06C755]">Analytics</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Users & Slips • Finance • Message AI • System Health
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-2">Last updated: Just now</p>
          </div>
          <div className="flex gap-3 mt-6 sm:mt-0">
            <Button variant="outline" className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs border-white/10 bg-white/[0.03] hover:bg-white/5 text-white">
              Filter View
            </Button>
            <Link href="/user/packages" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048]"
              >
                + New Broadcast
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 rounded-lg">
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-rose-400 font-black text-[10px] uppercase tracking-widest">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRetry} className="text-rose-400 hover:bg-rose-500/10">
              RETRY
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card variant="glass" className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <span className="text-2xl">📄</span>
              </div>
              <Badge variant="warning" className="text-[9px] px-2 py-1">Action Req.</Badge>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pending Slips</p>
            <p className="text-2xl font-black text-white">12</p>
            <p className="text-[9px] font-bold text-[#06C755] mt-1">+3 today</p>
          </Card>
          <Card variant="glass" className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <span className="text-2xl">👥</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Users</p>
            <p className="text-2xl font-black text-white">1,240</p>
          </Card>
          <Card variant="glass" className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#06C755]/10 flex items-center justify-center">
                <span className="text-2xl">💬</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Messages</p>
            <p className="text-2xl font-black text-white">{(subscription?.remainingQuota || 0).toLocaleString()}</p>
          </Card>
          <Card variant="glass" className="p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Verified</p>
            <p className="text-2xl font-black text-white">{getTotalSlipsVerified().toLocaleString()}</p>
          </Card>
        </div>

        <Card className="rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative p-6 group" variant="glass">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-6">
            <div className="space-y-1">
              <h3 className="font-black text-white text-xl tracking-tight">User Growth</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Daily active users over last 30 days</p>
            </div>
          </div>
          
          <div className="h-32 bg-white/[0.02] rounded-xl p-4 flex items-end justify-between gap-2">
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div 
                  className="w-full bg-[#06C755] rounded-t-lg transition-all"
                  style={{ height: `${Math.random() * 60 + 20}%` }}
                />
              </div>
            ))}
          </div>
        </Card>
        
        <Card className="rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative p-6 mt-6" variant="glass">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-white text-xl tracking-tight">Recent Registrations</h3>
            <Button variant="ghost" size="sm" className="text-[10px] font-bold text-[#06C755] hover:text-[#05B048]">
              View All
            </Button>
          </div>

          {subscription ? (
            <div className="relative z-10 space-y-12">
              <div>
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Consumption Metric</p>
                    <p className="text-2xl font-black text-white tracking-widest">
                      {(subscription.remainingQuota || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Matrix Limit</p>
                    <p className="text-sm font-black text-slate-400">{(subscription.quota || 0).toLocaleString()} Units</p>
                  </div>
                </div>

                <div className="relative pt-2">
                  <div className="h-4 bg-white/[0.02] border border-white/5 rounded-full overflow-hidden shadow-2xl">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000 ease-out relative shadow-[0_0_20px_rgba(52,211,153,0.3)]",
                        getQuotaPercentage() > 50 ? 'bg-emerald-500' : getQuotaPercentage() > 20 ? 'bg-amber-500' : 'bg-rose-500'
                      )}
                      style={{ width: `${Math.max(getQuotaPercentage(), 2)}%` }}
                    >
                      <div className="absolute top-0 right-0 h-full w-24 bg-gradient-to-r from-transparent to-white/20" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-8">
                <div className="p-8 bg-white/[0.02] hover:bg-white/[0.04] rounded-[2.5rem] border border-white/5 transition-all duration-500 text-center group/card">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Activation Timestamp</p>
                  <p className="font-black text-white text-xl uppercase tracking-widest font-mono">
                    {subscription.startDate
                      ? new Date(subscription.startDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }).toUpperCase()
                      : '---'}
                  </p>
                </div>
                <div className="p-8 bg-white/[0.02] hover:bg-white/[0.04] rounded-[2.5rem] border border-white/5 transition-all duration-500 text-center group/card">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Planned Expiration</p>
                  <p className="font-black text-white text-xl uppercase tracking-widest font-mono">
                    {subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }).toUpperCase()
                      : 'PERPETUAL'}
                  </p>
                </div>
              </div>

              {getQuotaPercentage() < 20 && (
                <div className="p-8 bg-rose-500/5 border border-rose-500/20 rounded-[2.5rem] flex flex-col sm:flex-row items-center gap-6 animate-pulse">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 text-3xl">
                    ⚠️
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="font-black text-white uppercase tracking-tight text-lg">CRITICAL_THRESHOLD_DETECTED</p>
                    <p className="text-[10px] font-black text-rose-400/60 uppercase tracking-widest mt-1">Initialize protocol recharge to maintain neural integrity.</p>
                  </div>
                  <Link href="/user/packages" className="w-full sm:w-auto">
                    <Button variant="primary" className="h-14 px-10 rounded-2xl bg-rose-500 hover:bg-rose-400 shadow-lg shadow-rose-500/20 font-black uppercase tracking-widest text-[10px] w-full">
                      RECHARGE_NOW
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon="🧊"
              title="NO_ACTIVE_PROTOCOL"
              description="Deploy a subscription matrix to unlock neural validation capabilities."
              variant="glass"
              className="py-20"
              action={
                <Link href="/user/packages">
                  <Button variant="primary" className="h-14 px-10 rounded-2xl bg-emerald-500 hover:bg-emerald-400 font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-emerald-500/20">Initialize Matrix</Button>
                </Link>
              }
            />
          )}
        </Card>

        {accounts.length > 0 && (
          <Card variant="glass" className="rounded-[3rem] border border-white/5 shadow-2xl bg-white/[0.01] overflow-hidden p-0">
            <div className="p-8 sm:p-10">
              <h3 className="font-black text-white text-xl uppercase tracking-tight">Account Telemetry</h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Real-time resource distribution across {accounts.length} active nodes</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-white/[0.02] border-y border-white/5">
                    <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Node Identity</th>
                    <th className="px-8 py-5 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Messages</th>
                    <th className="px-8 py-5 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Slips</th>
                    <th className="px-8 py-5 text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hidden sm:table-cell">AI Neural Load</th>
                    <th className="px-8 py-5 text-right text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Protocol Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {accounts.map((account) => (
                    <tr key={account._id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-emerald-400 font-black text-lg shadow-2xl group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                            {account.accountName?.charAt(0).toUpperCase() || 'L'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-white uppercase tracking-tight truncate group-hover:text-emerald-400 transition-colors">{account.accountName}</p>
                            <p className="text-[9px] font-mono font-black text-slate-500 truncate mt-1 tracking-widest">{account.channelId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="font-black text-slate-300 text-sm tracking-widest">
                          {(account.statistics?.totalMessages || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="font-black text-emerald-400 text-lg tracking-tighter">
                          {(account.statistics?.totalSlipsVerified || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-center hidden sm:table-cell">
                        <span className="font-black text-indigo-400 text-sm tracking-widest">
                          {(account.statistics?.totalAiResponses || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <Badge variant={account.isActive ? 'success' : 'secondary'} size="sm" className="font-black uppercase tracking-widest text-[9px] px-3 py-1 rounded-lg">
                          {account.isActive ? 'OPERATIONAL' : 'HIBERNATED'}
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
