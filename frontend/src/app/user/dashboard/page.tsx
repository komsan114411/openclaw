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
      <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto pb-6 md:pb-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-8 relative z-10">
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-3xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase">
              ระบบ<span className="text-emerald-500">แดชบอร์ด</span>
            </h1>
            <p className="text-slate-500 font-bold text-xs md:text-sm lg:text-lg tracking-wide opacity-80 uppercase">
              ภาพรวมการใช้งานและ <span className="text-slate-900">โควต้าปัจจุบันของคุณ</span>
            </p>
          </div>
          <Link href="/user/packages" className="w-full md:w-auto">
            <Button size="lg" variant="primary" className="w-full h-12 md:h-16 px-6 md:px-10 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-emerald-500/20 shadow-2xl animate-scale-in">
              <span className="mr-2 md:mr-3 text-lg md:text-xl">💎</span>
              <span className="hidden sm:inline">ซื้อแพ็คเกจ / เติมเงิน</span>
              <span className="sm:hidden">ซื้อแพ็คเกจ</span>
            </Button>
          </Link>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
          <StatCard
            title="บัญชีที่เชื่อมต่อ"
            value={lineAccounts.length}
            icon="💬"
            color="emerald"
            variant="glass"
            isLoading={isLoading}
            className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm"
          />
          <StatCard
            title="เครดิตคงเหลือ"
            value={quota?.remainingQuota?.toLocaleString() || 0}
            icon="⚡"
            color={quota && quota.remainingQuota < 50 ? "rose" : "emerald"}
            variant="glass"
            isLoading={isLoading}
            className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm"
          />
          <StatCard
            title="ยืนยันสำเร็จแล้ว"
            value={lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0).toLocaleString()}
            icon="✅"
            color="indigo"
            variant="glass"
            isLoading={isLoading}
            className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm col-span-2 xl:col-span-1"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
          {/* Main Quota Section */}
          <div className="lg:col-span-2">
            <Card className="h-full bg-white/70 backdrop-blur-3xl border-none shadow-premium-lg overflow-hidden relative rounded-2xl md:rounded-[3.5rem]" padding="none">
              <div className="absolute top-0 right-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-emerald-500/10 rounded-full blur-[80px] md:blur-[120px] -mr-20 md:-mr-40 -mt-20 md:-mt-40 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-[200px] md:w-[300px] h-[200px] md:h-[300px] bg-indigo-500/5 rounded-full blur-[60px] md:blur-[100px] -ml-10 md:-ml-20 -mb-10 md:-mb-20 pointer-events-none" />

              <div className="p-5 md:p-8 lg:p-12 flex flex-col h-full relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-12">
                  <div className="space-y-1">
                    <h2 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight">
                      สถานะ<span className="text-emerald-500">โควต้า</span>
                    </h2>
                    <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ข้อมูลการประมวลผลสลิป</p>
                  </div>
                  <Link href="/user/quota">
                    <Button variant="ghost" size="sm" className="font-black text-[9px] md:text-[10px] uppercase tracking-widest text-slate-500 hover:text-emerald-600 rounded-xl">
                      ดูรายละเอียด <span className="ml-2">→</span>
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
                      <div className="absolute inset-0 bg-white/50 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors duration-700" />
                      <svg className="w-full h-full transform -rotate-90 relative z-10">
                        <circle
                          cx="50%" cy="50%" r="40%"
                          fill="transparent"
                          stroke="rgba(241, 245, 249, 1)"
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
                            "transition-colors duration-1000 shadow-2xl",
                            quotaPercentage >= 90 ? "text-rose-500" :
                              quotaPercentage >= 70 ? "text-amber-500" : "text-emerald-500"
                          )}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                        <motion.span
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-3xl md:text-5xl font-black text-slate-900 text-shadow-sm"
                        >
                          {100 - quotaPercentage}%
                        </motion.span>
                        <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">คงเหลือ</span>
                      </div>
                    </div>

                    {/* Stats List */}
                    <div className="flex-1 w-full space-y-3 md:space-y-6">
                      <div className="bg-slate-50/80 backdrop-blur-sm rounded-xl md:rounded-[2rem] p-4 md:p-6 border border-white flex justify-between items-center shadow-inner">
                        <div className="flex flex-col">
                          <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 md:mb-2">เครดิตโควต้าทั้งหมด</span>
                          <span className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter">{quota.totalQuota.toLocaleString()}</span>
                        </div>
                        <div className="w-10 h-10 md:w-14 md:h-14 bg-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm">
                          <span className="text-xl md:text-2xl">📦</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 md:gap-6">
                        <div className="bg-emerald-50/80 backdrop-blur-sm rounded-xl md:rounded-[2rem] p-4 md:p-6 border border-white shadow-inner group overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-emerald-500/5 rounded-full -mr-8 md:-mr-10 -mt-8 md:-mt-10 blur-xl group-hover:bg-emerald-500/10 transition-colors" />
                          <span className="text-[9px] md:text-[10px] font-black text-emerald-600/70 uppercase tracking-[0.2em] mb-1 md:mb-2 block">คงเหลือ</span>
                          <p className="text-emerald-600 font-black text-xl md:text-3xl tracking-tighter relative z-10">{quota.remainingQuota.toLocaleString()}</p>
                        </div>
                        <div className="bg-indigo-50/80 backdrop-blur-sm rounded-xl md:rounded-[2rem] p-4 md:p-6 border border-white shadow-inner group overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-indigo-500/5 rounded-full -mr-8 md:-mr-10 -mt-8 md:-mt-10 blur-xl group-hover:bg-indigo-500/10 transition-colors" />
                          <span className="text-[9px] md:text-[10px] font-black text-indigo-600/70 uppercase tracking-[0.2em] mb-1 md:mb-2 block">ใช้งานแล้ว</span>
                          <p className="text-indigo-600 font-black text-xl md:text-3xl tracking-tighter relative z-10">{quota.usedQuota.toLocaleString()}</p>
                        </div>
                      </div>

                      {(quota.remainingQuota <= 50 && quota.remainingQuota > 0) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-5 bg-rose-50/80 backdrop-blur-sm rounded-2xl border border-rose-100/50 flex items-center gap-4 text-rose-700 shadow-sm"
                        >
                          <span className="text-2xl animate-bounce">⚠️</span>
                          <div className="flex flex-col">
                            <span className="font-black text-[10px] uppercase tracking-widest leading-none mb-1">แจ้งเตือนเครดิตต่ำ</span>
                            <span className="font-bold text-sm text-slate-700">เหลือเพียง {quota.remainingQuota} เครดิต</span>
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
          <div className="space-y-6">
            <Card className="p-8 bg-slate-900 text-white relative overflow-hidden border-none shadow-premium-lg rounded-[3.5rem]" padding="none">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/20 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-[60px] -ml-10 -mb-10 pointer-events-none" />

              <div className="flex items-center justify-between mb-8 relative z-10 px-2">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                  <span className="w-1.5 h-8 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]" /> บัญชีของคุณ
                </h3>
                <Badge variant="emerald" className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[9px] px-3 py-1 uppercase tracking-[0.2em] rounded-lg">ACTIVE</Badge>
              </div>

              <div className="space-y-4 relative z-10">
                {isLoading ? (
                  Array(3).fill(0).map((_, i) => <div key={i} className="bg-white/5 h-16 rounded-2xl animate-pulse mx-2" />)
                ) : lineAccounts.length > 0 ? (
                  <>
                    <div className="space-y-3 mx-2">
                      {lineAccounts.slice(0, 3).map(account => (
                        <div key={account._id} className="p-4 bg-white/5 hover:bg-white/10 transition-all duration-300 rounded-2xl border border-white/5 flex items-center gap-4 group">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-black text-xl shadow-lg transform group-hover:rotate-12 transition-transform">
                            {account.accountName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm truncate uppercase tracking-tight text-white/90">{account.accountName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px]", account.isActive ? "bg-emerald-500 shadow-emerald-500/50" : "bg-slate-500")} />
                              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{account.isActive ? 'เปิดสัญญาณ' : 'ปิดสัญญาณ'}</p>
                            </div>
                          </div>
                          <Link href={`/user/line-accounts?edit=${account._id}`}>
                            <IconButton variant="ghost" size="sm" className="text-white/30 hover:text-white hover:bg-white/10 rounded-xl">✏️</IconButton>
                          </Link>
                        </div>
                      ))}
                    </div>
                    <Link href="/user/line-accounts" className="block mt-4 px-2">
                      <Button variant="ghost" fullWidth className="h-14 rounded-2xl text-emerald-400 hover:text-emerald-300 font-black uppercase tracking-[0.2em] text-[10px] bg-white/5 border border-white/5">
                        จัดการทั้งหมด ({lineAccounts.length})
                      </Button>
                    </Link>
                  </>
                ) : (
                  <div className="text-center py-10 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10 mx-2">
                    <p className="text-slate-400 font-bold text-xs mb-6 px-4">ยังไม่มีการเชื่อมต่อบัญชีเข้าสู่ระบบ</p>
                    <Link href="/user/line-accounts">
                      <Button variant="outline" size="md" className="border-white/20 text-white hover:bg-white shadow-none h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px]">
                        + เพิ่มบัญชีใหม่
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Link href="/user/packages" className="group">
                <div className="bg-white/60 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white shadow-premium-sm hover:shadow-premium-lg hover:border-emerald-200 transition-all duration-500 text-center h-full flex flex-col items-center justify-center gap-4 group">
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-[1.5rem] flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 shadow-inner">💎</div>
                  <span className="font-black text-slate-900 uppercase tracking-widest text-[11px]">เติมเครดิต</span>
                </div>
              </Link>
              <Link href="/user/line-accounts" className="group">
                <div className="bg-white/60 backdrop-blur-3xl p-6 rounded-[2.5rem] border border-white shadow-premium-sm hover:shadow-premium-lg hover:border-indigo-200 transition-all duration-500 text-center h-full flex flex-col items-center justify-center gap-4 group">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-[1.5rem] flex items-center justify-center text-3xl group-hover:scale-110 group-hover:-rotate-12 transition-all duration-500 shadow-inner">🤖</div>
                  <span className="font-black text-slate-900 uppercase tracking-widest text-[11px]">ตั้งค่าบอท</span>
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
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">ธุรกรรมล่าสุด</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">รายการชำระเงินที่เพิ่งทำรายการ</p>
              </div>
              <Link href="/user/payments">
                <Button variant="ghost" size="sm" className="font-black text-[10px] uppercase tracking-widest text-slate-500">ดูทั้งหมด</Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentPayments.map((payment) => (
                <div key={payment._id} className="p-6 bg-white/60 backdrop-blur-3xl rounded-[2.5rem] border border-white flex items-center justify-between hover:border-emerald-200 hover:shadow-premium-sm transition-all duration-500 group">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                      {payment.paymentType === 'bank_transfer' ? '🏦' : '🪙'}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-xl tracking-tight">฿{payment.amount.toLocaleString()}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{formatDate(payment.createdAt)}</p>
                    </div>
                  </div>
                  <StatusBadge status={payment.status} className="font-black uppercase tracking-widest text-[9px] px-3 py-1.5 rounded-xl shadow-sm" />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
