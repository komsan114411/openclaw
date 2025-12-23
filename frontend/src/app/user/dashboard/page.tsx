'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi, paymentsApi } from '@/lib/api';
import { LineAccount, QuotaInfo, Payment } from '@/types';
import { Card, StatCard } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
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
      <div className="space-y-8 max-w-[1600px] mx-auto pb-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">แดชบอร์ด</h1>
            <p className="text-slate-500 font-medium text-lg">ยินดีต้อนรับสู่ระบบจัดการ LINE OA</p>
          </div>
          <Link href="/user/packages">
            <Button size="lg" variant="primary" className="shadow-emerald-500/20 shadow-lg">
              <span className="mr-2">💎</span> ซื้อแพ็คเกจ / เติมเงิน
            </Button>
          </Link>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="บัญชี LINE"
            value={lineAccounts.length}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            color="emerald"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="โควต้าคงเหลือ"
            value={quota?.remainingQuota?.toLocaleString() || 0}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            color={quota && quota.remainingQuota < 100 ? "rose" : "blue"}
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="สลิปที่ตรวจสอบแล้ว"
            value={lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0).toLocaleString()}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            color="violet"
            variant="glass"
            isLoading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Quota Section */}
          <div className="lg:col-span-2">
            <Card className="h-full bg-white border-slate-100 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />

              <div className="p-6 md:p-8 flex flex-col h-full relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span className="text-2xl">📊</span> สถานะโควต้า
                  </h2>
                  <Link href="/user/quota">
                    <Button variant="ghost" size="sm" className="text-slate-500 hover:text-emerald-600">
                      ดูรายละเอียด →
                    </Button>
                  </Link>
                </div>

                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin" />
                  </div>
                ) : quota ? (
                  <div className="flex flex-col md:flex-row gap-10 items-center md:items-start flex-1">
                    {/* Animated Circle */}
                    <div className="relative w-48 h-48 flex-shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="96" cy="96" r="88"
                          fill="transparent"
                          stroke="currentColor"
                          strokeWidth="12"
                          className="text-slate-100"
                        />
                        <motion.circle
                          initial={{ strokeDashoffset: 553 }}
                          animate={{ strokeDashoffset: 553 - (quotaPercentage / 100 * 553) }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          cx="96" cy="96" r="88"
                          fill="transparent"
                          stroke="currentColor"
                          strokeWidth="12"
                          strokeDasharray="553"
                          strokeLinecap="round"
                          className={cn(
                            quotaPercentage >= 90 ? "text-rose-500" :
                              quotaPercentage >= 70 ? "text-amber-500" : "text-emerald-500"
                          )}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-extrabold text-slate-900">{100 - quotaPercentage}%</span>
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">คงเหลือ</span>
                      </div>
                    </div>

                    {/* Stats List */}
                    <div className="flex-1 w-full space-y-4 pt-2">
                      <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">โควต้าทั้งหมด</span>
                          <span className="text-lg font-bold text-slate-900">{quota.totalQuota.toLocaleString()}</span>
                        </div>
                        <div className="h-8 w-1 bg-slate-200 rounded-full" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50">
                          <span className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest">คงเหลือ</span>
                          <p className="text-emerald-600 font-bold text-xl">{quota.remainingQuota.toLocaleString()}</p>
                        </div>
                        <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100/50">
                          <span className="text-[10px] font-bold text-blue-600/70 uppercase tracking-widest">ใช้ไปแล้ว</span>
                          <p className="text-blue-600 font-bold text-xl">{quota.usedQuota.toLocaleString()}</p>
                        </div>
                      </div>

                      {(quota.remainingQuota <= 10 && quota.remainingQuota > 0) && (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-3 text-amber-700 text-sm font-medium">
                          ⚠️ <span>โควต้าใกล้หมด! เหลืออีกเพียง {quota.remainingQuota} รายการ</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                    <span className="text-4xl mb-4">📦</span>
                    <h3 className="text-lg font-bold text-slate-900">ยังไม่มีแพ็คเกจ</h3>
                    <p className="text-slate-500 mb-6 max-w-xs mx-auto">เริ่มต้นใช้งานระบบตรวจสอบสลิปอัตโนมัติ ด้วยการเลือกแพ็คเกจที่เหมาะสมกับคุณ</p>
                    <Link href="/user/packages">
                      <Button variant="primary">เลือกแพ็คเกจ</Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Quick Actions & Accounts */}
          <div className="space-y-6">
            <Card className="p-6 bg-slate-900 text-white relative overflow-hidden border-none shadow-xl shadow-slate-900/10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none" />
              <h3 className="text-lg font-bold mb-6 relative z-10 flex items-center gap-2">
                <span className="w-1 h-6 bg-emerald-500 rounded-full" /> บัญชีของคุณ
              </h3>

              <div className="space-y-3 relative z-10">
                {isLoading ? (
                  <div className="bg-white/5 h-16 rounded-xl animate-pulse" />
                ) : lineAccounts.length > 0 ? (
                  <>
                    {lineAccounts.slice(0, 3).map(account => (
                      <div key={account._id} className="p-3 bg-white/5 hover:bg-white/10 transition-colors rounded-xl border border-white/5 flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {account.accountName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{account.accountName}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{account.isActive ? 'Active' : 'Inactive'}</p>
                        </div>
                        <Link href={`/user/line-accounts?edit=${account._id}`}>
                          <IconButton variant="ghost" size="sm" className="text-slate-400 hover:text-white">✏️</IconButton>
                        </Link>
                      </div>
                    ))}
                    <Link href="/user/line-accounts">
                      <Button variant="ghost" fullWidth className="mt-2 text-emerald-400 hover:text-emerald-300">
                        ดูทั้งหมด ({lineAccounts.length})
                      </Button>
                    </Link>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-slate-400 text-sm mb-4">ยังไม่ได้เชื่อมต่อบัญชี</p>
                    <Link href="/user/line-accounts">
                      <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10 w-full">
                        + เพิ่มบัญชี
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Link href="/user/packages" className="group">
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-emerald-500/10 hover:border-emerald-100 transition-all text-center h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">💎</div>
                  <span className="font-bold text-slate-700">เติมเครดิต</span>
                </div>
              </Link>
              <Link href="/user/line-accounts" className="group">
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-500/10 hover:border-blue-100 transition-all text-center h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">💬</div>
                  <span className="font-bold text-slate-700">ตั้งค่าบอท</span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Payments Section */}
        {recentPayments.length > 0 && (
          <div className="pt-4 animate-fade-up">
            <h3 className="font-bold text-slate-700 mb-4 px-1">ประวัติการชำระเงินล่าสุด</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentPayments.map((payment) => (
                <div key={payment._id} className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center justify-between hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-lg">
                      {payment.paymentType === 'bank_transfer' ? '🏦' : '🪙'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">฿{payment.amount.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">{formatDate(payment.createdAt)}</p>
                    </div>
                  </div>
                  <StatusBadge status={payment.status} />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
