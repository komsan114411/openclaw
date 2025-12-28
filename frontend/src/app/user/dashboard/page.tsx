'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi, paymentsApi } from '@/lib/api';
import { LineAccount, QuotaInfo, Payment } from '@/types';
import { Card, StatCard } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { PageLoading } from '@/components/ui/Loading';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function UserDashboard() {
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, quotaRes, paymentsRes] = await Promise.all([
          lineAccountsApi.getMyAccounts(),
          subscriptionsApi.getQuota(),
          paymentsApi.getMy(),
        ]);

        setLineAccounts(accountsRes.data.accounts || []);
        setQuota(quotaRes.data.quota || null);
        setRecentPayments(paymentsRes.data.payments?.slice(0, 3) || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const quotaPercentage = quota
    ? Math.round(((quota.totalQuota - quota.remainingQuota) / quota.totalQuota) * 100) || 0
    : 0;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <h1 className="page-title-responsive">
              LINE OA <span className="text-[#06C755]">Dashboard</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Overview & Analytics for Official Account System
            </p>
          </div>
          <div className="flex gap-3 mt-6 lg:mt-0">
            <Link href="/user/packages">
              <Button variant="primary" className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048]">
                + New Broadcast
              </Button>
            </Link>
            <Link href="/user/payments">
              <Button variant="outline" className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs border-white/10 bg-white/[0.03] hover:bg-white/5 text-white">
                Verify Slip
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <Card variant="glass" className="p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#06C755]/10 flex items-center justify-center">
                <span className="text-2xl">💬</span>
              </div>
              <Badge variant="success" className="text-[9px] px-2 py-1">+2 New</Badge>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total OAs</p>
            <p className="text-2xl font-black text-white">{lineAccounts.length}</p>
          </Card>
          <Card variant="glass" className="p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <span className="text-2xl">📄</span>
              </div>
              <Badge variant="warning" className="text-[9px] px-2 py-1">Action Req.</Badge>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pending Slips</p>
            <p className="text-2xl font-black text-white">{recentPayments.filter(p => p.status === 'pending').length}</p>
          </Card>
          <Card variant="glass" className="p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <span className="text-2xl">🤖</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">AI</p>
            <p className="text-2xl font-black text-white">98</p>
          </Card>
          <Card variant="glass" className="p-6 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <span className="text-2xl">👥</span>
              </div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Followers</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-white">12.5k</p>
              <span className="text-[10px] font-bold text-[#06C755] flex items-center gap-1">
                <span>↑</span> +5% this week
              </span>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-2">
            <Card className="h-full relative overflow-hidden group" variant="glass" padding="lg">
              <div className="absolute top-0 right-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-[#06C755]/10 rounded-full blur-[80px] md:blur-[120px] -mr-20 md:-mr-40 -mt-20 md:-mt-40 pointer-events-none" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="space-y-1">
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    Daily Active Users
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Engagement Trend (Last 7 Days)</p>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline gap-3 mb-4">
                  <p className="text-4xl font-black text-white">4,285</p>
                  <span className="text-sm font-bold text-[#06C755] flex items-center gap-1">
                    <span>↑</span> +12.5%
                  </span>
                </div>
                <div className="h-32 bg-white/[0.02] rounded-xl p-4 flex items-end justify-between gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                    <div key={day} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className={cn(
                          "w-full rounded-t-lg transition-all",
                          idx === 6 ? "bg-[#06C755] h-full" : "bg-white/10 h-3/4"
                        )}
                      />
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6 relative overflow-hidden" variant="glass">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-white tracking-tight">Subscription Growth</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last 30 Days</p>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-black text-white">1,240</p>
                  <span className="text-sm font-bold text-[#06C755]">+12% vs last mo</span>
                </div>
              </div>
              <div className="h-24 bg-white/[0.02] rounded-xl p-3 flex items-end justify-between gap-2">
                {[1, 2, 3, 4].map((week) => (
                  <div key={week} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full bg-[#06C755] rounded-t-lg h-3/4" />
                    <span className="text-[9px] font-bold text-slate-400">Week {week}</span>
                  </div>
                ))}
              </div>
            </Card>
            
            <Card className="p-6 relative overflow-hidden" variant="glass">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-white tracking-tight">Recent Verifications</h3>
                <Link href="/user/payments">
                  <Button variant="ghost" size="sm" className="text-[10px] font-bold text-[#06C755] hover:text-[#05B048]">
                    View All
                  </Button>
                </Link>
              </div>

              <div className="space-y-3">
                {recentPayments.length > 0 ? (
                  recentPayments.map((payment) => (
                    <div key={payment._id} className="p-4 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl border border-white/5 flex items-center justify-between group">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-[#06C755]/10 flex items-center justify-center">
                          <span className="text-lg">💎</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-sm">Premium Package</p>
                          <p className="text-[10px] font-bold text-slate-400">@{payment._id.slice(-8)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-white">฿{payment.amount.toLocaleString()}</p>
                          <StatusBadge status={payment.status} className="text-[9px] mt-1" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {payment.status === 'pending' && (
                          <>
                            <button className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 flex items-center justify-center text-rose-400 transition-colors">
                              <span className="text-sm">✕</span>
                            </button>
                            <button className="w-8 h-8 rounded-lg bg-[#06C755]/10 hover:bg-[#06C755]/20 flex items-center justify-center text-[#06C755] transition-colors">
                              <span className="text-sm">✓</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500 font-bold text-sm">No recent verifications</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6" variant="glass">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-white tracking-tight">AI Bot Status</h3>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-6 rounded-full bg-[#06C755] relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                  </div>
                  <span className="text-[10px] font-bold text-[#06C755]">Active</span>
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400">98% response rate</p>
            </Card>
            
            <Card className="p-6" variant="glass">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
                <div>
                  <p className="text-3xl font-black text-white">842</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Chats</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
        
        <Card className="p-6" variant="glass">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-white tracking-tight">Recent Activity</h3>
            <Link href="/user/history">
              <Button variant="ghost" size="sm" className="text-[10px] font-bold text-[#06C755] hover:text-[#05B048]">
                View All
              </Button>
            </Link>
          </div>
          <div className="space-y-3">
            {[
              { name: 'Sarah Jenkins', message: 'Is the promotion still valid for today?', time: '2m ago' },
              { name: 'Mike K.', message: 'Attached the payment slip for order #9921', time: '15m ago' },
              { name: 'David Chen', message: 'Thanks for the update!', time: '1m ago' }
            ].map((activity, idx) => (
              <div key={idx} className="p-4 bg-white/[0.02] hover:bg-white/[0.05] rounded-xl border border-white/5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#06C755]/10 flex items-center justify-center text-white font-bold">
                  {activity.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">{activity.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 truncate">{activity.message}</p>
                </div>
                <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">{activity.time}</span>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </DashboardLayout>
  );
}
