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

        <div className="page-header relative z-10">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">ยินดีต้อนรับ,</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              ศูนย์<span className="text-[#06C755]">ควบคุม</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              ภาพรวมบัญชีและทรัพยากรของคุณ
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/user/packages">
              <Button variant="primary" className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20">
                💎 ซื้อแพ็คเกจ
              </Button>
            </Link>
            <Link href="/user/payments">
              <Button variant="outline" className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs border-emerald-500/20 bg-[#0F1A14] hover:bg-emerald-500/10 text-slate-400 hover:text-[#06C755]">
                ✅ ตรวจสลิป
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            title="ผู้ติดตามทั้งหมด"
            value={lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}
            trend={{ value: '+5%', label: 'สัปดาห์นี้', isUp: true }}
            color="emerald"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="ข้อความ"
            value={quota?.remainingQuota?.toLocaleString() || 0}
            trend={{ value: '/' + (quota?.totalQuota || 0), label: '', isUp: true }}
            color="blue"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="แชทที่ใช้งาน"
            value={lineAccounts.length}
            color="amber"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="สลิปที่ตรวจสอบ"
            value={lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0).toLocaleString()}
            color="violet"
            variant="glass"
            isLoading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
          <div className="lg:col-span-2">
            <Card className="h-full relative overflow-hidden group" variant="glass" padding="none">
              <div className="absolute top-0 right-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-emerald-500/10 rounded-full blur-[80px] md:blur-[120px] -mr-20 md:-mr-40 -mt-20 md:-mt-40 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-[200px] md:w-[300px] h-[200px] md:h-[300px] bg-indigo-500/5 rounded-full blur-[60px] md:blur-[100px] -ml-10 md:-ml-20 -mb-10 md:-mb-20 pointer-events-none" />

              <div className="p-5 md:p-8 lg:p-12 flex flex-col h-full relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-12">
                  <div className="space-y-1">
                    <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none">
                      Resource <span className="text-emerald-400">Matrix</span>
                    </h2>
                    <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1 opacity-50">Real-time Quota Telemetry</p>
                  </div>
                  <Link href="/user/quota">
                    <Button variant="ghost" size="sm" className="font-black text-[9px] md:text-[10px] uppercase tracking-widest text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl">
                      ดูรายละเอียด <span className="ml-2 group-hover:translate-x-1 transition-transform inline-block">→</span>
                    </Button>
                  </Link>
                </div>

                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center py-10 md:py-20">
                    <PageLoading transparent message="กำลังตรวจสอบเครดิตของคุณ..." />
                  </div>
                ) : quota ? (
                  <div className="flex flex-col lg:flex-row gap-6 md:gap-12 items-center lg:items-center flex-1">
                    {/* Animated Circle */}
                    <div className="relative w-36 h-36 md:w-56 md:h-56 flex-shrink-0 group">
                      <div className="absolute inset-0 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors duration-700" />
                      <svg className="w-full h-full transform -rotate-90 relative z-10">
                        <circle
                          cx="50%" cy="50%" r="40%"
                          fill="transparent"
                          stroke="rgba(255, 255, 255, 0.05)"
                          strokeWidth="12"
                        />
                        <motion.circle
                          initial={{ strokeDashoffset: 251 }}
                          animate={{ strokeDashoffset: 251 - (quotaPercentage / 100 * 251) }}
                          transition={{ duration: 2, ease: "circOut" }}
                          cx="50%" cy="50%" r="40%"
                          fill="transparent"
                          stroke="currentColor"
                          strokeWidth="12"
                          strokeDasharray="251"
                          strokeLinecap="round"
                          className={cn(
                            "transition-colors duration-1000",
                            quotaPercentage >= 90 ? "text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]" :
                              quotaPercentage >= 70 ? "text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]" : "text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                          )}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                        <motion.span
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-3xl md:text-5xl font-black text-white"
                        >
                          {100 - quotaPercentage}%
                        </motion.span>
                        <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">คงเหลือ</span>
                      </div>
                    </div>

                    {/* Stats List */}
                    <div className="flex-1 w-full space-y-3 md:space-y-6">
                      <div className="bg-white/[0.02] backdrop-blur-sm rounded-2xl md:rounded-3xl p-4 md:p-6 border border-white/[0.05] flex justify-between items-center group/item hover:bg-white/[0.05] transition-all">
                        <div className="flex flex-col">
                          <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 md:mb-2 opacity-50">โควต้าทั้งหมด</span>
                          <span className="text-xl md:text-3xl font-black text-white tracking-tighter">{quota.totalQuota.toLocaleString()}</span>
                        </div>
                        <div className="w-10 h-10 md:w-14 md:h-14 bg-white/[0.05] rounded-xl md:rounded-2xl flex items-center justify-center border border-white/5 shadow-sm group-hover/item:scale-110 transition-transform">
                          <span className="text-xl md:text-2xl">📦</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 md:gap-6">
                        <div className="bg-emerald-500/[0.03] backdrop-blur-sm rounded-2xl md:rounded-3xl p-4 md:p-6 border border-emerald-500/10 group overflow-hidden relative hover:bg-emerald-500/[0.06] transition-all">
                          <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-emerald-500/10 rounded-full -mr-8 md:-mr-10 -mt-8 md:-mt-10 blur-xl group-hover:bg-emerald-500/20 transition-colors" />
                          <span className="text-[9px] md:text-[10px] font-black text-emerald-400/50 uppercase tracking-[0.2em] mb-1 md:mb-2 block">Available</span>
                          <p className="text-emerald-400 font-black text-lg md:text-3xl tracking-tighter relative z-10 leading-none">{quota.remainingQuota.toLocaleString()}</p>
                        </div>
                        <div className="bg-violet-500/[0.03] backdrop-blur-sm rounded-2xl md:rounded-3xl p-4 md:p-6 border border-violet-500/10 group overflow-hidden relative hover:bg-violet-500/[0.06] transition-all">
                          <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-violet-500/10 rounded-full -mr-8 md:-mr-10 -mt-8 md:-mt-10 blur-xl group-hover:bg-violet-500/20 transition-colors" />
                          <span className="text-[9px] md:text-[10px] font-black text-violet-400/50 uppercase tracking-[0.2em] mb-1 md:mb-2 block">Processed</span>
                          <p className="text-violet-400 font-black text-lg md:text-3xl tracking-tighter relative z-10 leading-none">{quota.usedQuota.toLocaleString()}</p>
                        </div>
                      </div>

                      {(quota.remainingQuota <= 50 && quota.remainingQuota > 0) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-rose-500/10 backdrop-blur-sm rounded-2xl border border-rose-500/20 flex items-center gap-4 text-rose-400 shadow-sm"
                        >
                          <span className="text-2xl animate-bounce">⚠️</span>
                          <div className="flex flex-col">
                            <span className="font-black text-[10px] uppercase tracking-widest leading-none mb-1">เครดิตต่ำ</span>
                            <span className="font-bold text-xs text-white opacity-80">เหลือเพียง {quota.remainingQuota} เครดิต กรุณาเติมเงิน</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200 shadow-inner">
                    <div className="w-24 h-24 bg-white rounded-[2rem] flex items-center justify-center text-5xl shadow-sm mb-8 animate-pulse">🎁</div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">ยังไม่มีแพ็คเกจ</h3>
                    <p className="text-slate-500 mb-10 max-w-sm mx-auto font-bold text-sm opacity-70">เริ่มต้นใช้งานระบบ AI ตรวจสอบสลิปอัตโนมัติ เพื่อประหยัดเวลาและเพิ่มความแม่นยำให้กับธุรกิจของคุณ</p>
                    <Link href="/user/packages">
                      <Button variant="primary" size="lg" className="h-16 px-10 rounded-2xl font-black uppercase tracking-widest text-xs">เริ่มต้นเลือกแพ็คเกจเลย</Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Quick Actions & Accounts */}
          <div className="space-y-6 md:space-y-8">
            <Card className="p-6 sm:p-8 relative overflow-hidden group" variant="glass" padding="none">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/20 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-[60px] -ml-10 -mb-10 pointer-events-none" />

              <div className="flex items-center justify-between mb-8 relative z-10">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight flex items-center gap-3 text-white">
                  <span className="w-1.5 h-6 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.5)]" /> Account Nodes
                </h3>
                <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border-white/5 font-black text-[8px] sm:text-[9px] px-3 py-1 uppercase tracking-[0.2em] rounded-lg">LIVE</Badge>
              </div>

              <div className="space-y-4 relative z-10">
                {isLoading ? (
                  Array(3).fill(0).map((_, i) => <div key={i} className="bg-white/5 h-16 rounded-2xl animate-pulse" />)
                ) : lineAccounts.length > 0 ? (
                  <>
                    <div className="space-y-2.5 sm:space-y-3">
                      {lineAccounts.slice(0, 3).map(account => (
                        <div key={account._id} className="p-3.5 sm:p-4 bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 rounded-2xl border border-white/[0.05] flex items-center gap-4 group/item">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-lg transform group-hover/item:rotate-12 transition-transform">
                            {account.accountName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-xs sm:text-sm truncate uppercase tracking-tight text-white/90">{account.accountName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px]", account.isActive ? "bg-emerald-500 shadow-emerald-500/50" : "bg-slate-500")} />
                              <p className="text-[8px] sm:text-[9px] text-slate-500 font-black uppercase tracking-widest">{account.isActive ? 'Active' : 'Offline'}</p>
                            </div>
                          </div>
                          <Link href={`/user/line-accounts?edit=${account._id}`}>
                            <IconButton variant="ghost" size="sm" className="text-slate-500 hover:text-white hover:bg-white/10 rounded-xl">✏️</IconButton>
                          </Link>
                        </div>
                      ))}
                    </div>
                    <Link href="/user/line-accounts" className="block mt-4 sm:mt-6">
                      <Button variant="ghost" fullWidth className="h-11 sm:h-14 rounded-2xl text-emerald-400 hover:text-emerald-300 font-black uppercase tracking-[0.2em] text-[10px] bg-white/[0.03] border border-white/5 hover:border-emerald-500/20 transition-all">
                        จัดการทั้งหมด ({lineAccounts.length})
                      </Button>
                    </Link>
                  </>
                ) : (
                  <div className="text-center py-10 bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
                    <p className="text-slate-500 font-bold text-xs mb-6 px-4">ยังไม่มีการเชื่อมต่อบัญชี</p>
                    <Link href="/user/line-accounts">
                      <Button variant="outline" size="md" className="border-white/10 text-white hover:bg-white/5 h-11 px-8 rounded-xl font-black uppercase tracking-widest text-[9px]">
                        + เพิ่มบัญชีใหม่
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Link href="/user/packages" className="group">
                <div className="bg-white/[0.02] backdrop-blur-3xl p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/[0.05] hover:bg-white/[0.05] hover:border-emerald-500/20 transition-all duration-500 text-center h-full flex flex-col items-center justify-center gap-4 group">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 shadow-lg shadow-emerald-500/5">💎</div>
                  <span className="font-black text-white uppercase tracking-widest text-[9px] sm:text-[11px] opacity-60">เติมเครดิต</span>
                </div>
              </Link>
              <Link href="/user/line-accounts" className="group">
                <div className="bg-white/[0.02] backdrop-blur-3xl p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white/[0.05] hover:bg-white/[0.05] hover:border-violet-500/20 transition-all duration-500 text-center h-full flex flex-col items-center justify-center gap-4 group">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-violet-500/10 text-violet-400 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 shadow-lg shadow-violet-500/5">🤖</div>
                  <span className="font-black text-white uppercase tracking-widest text-[9px] sm:text-[11px] opacity-60">ตั้งค่าบอท</span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Payments Section */}
        {recentPayments.length > 0 && (
          <div className="pt-8 space-y-6 animate-fade-up">
            <div className="flex items-center justify-between px-2">
              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tighter">Settlement Ledger</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] opacity-50">Recent Transaction Protocols</p>
              </div>
              <Link href="/user/payments">
                <Button variant="ghost" size="sm" className="font-black text-[10px] uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10">VIEW_ALL_LOGS</Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {recentPayments.map((payment) => (
                <div key={payment._id} className="p-5 sm:p-6 bg-white/[0.02] backdrop-blur-3xl rounded-3xl border border-white/[0.05] flex items-center justify-between hover:border-emerald-500/20 hover:bg-white/[0.05] transition-all duration-500 group">
                  <div className="flex items-center gap-4 sm:gap-5">
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center text-xl sm:text-2xl shadow-inner group-hover:scale-110 transition-transform">
                      {payment.paymentType === 'bank_transfer' ? '🏦' : '🪙'}
                    </div>
                    <div>
                      <p className="font-black text-white text-lg sm:text-xl tracking-tight leading-none mb-1">฿{payment.amount.toLocaleString()}</p>
                      <p className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest opacity-60">{formatDate(payment.createdAt)}</p>
                    </div>
                  </div>
                  <StatusBadge status={payment.status} className="font-black uppercase tracking-widest text-[8px] sm:text-[9px] px-3 py-1.5 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
