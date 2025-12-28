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
      <div className="section-gap animate-fade pb-10 max-w-7xl mx-auto">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-[#06C755]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              แดชบอร์ด <span className="text-[#06C755]">LINE OA</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              ภาพรวมการใช้งาน • โควต้า • การตรวจสลิป • สถานะระบบ
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Link href="/user/packages" className="flex-1 sm:flex-none">
              <Button variant="primary" className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048] transition-all">
                📢 ส่งข้อความใหม่
              </Button>
            </Link>
            <Link href="/user/payments" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all">
                ✅ ตรวจสลิป
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
          <Card variant="glass" className="p-4 sm:p-6 rounded-2xl border border-white/5 hover:border-[#06C755]/20 transition-all hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-black/20">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center">
                <span className="text-xl sm:text-2xl">💬</span>
              </div>
              <Badge variant="success" className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1">+2 ใหม่</Badge>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">บัญชีทั้งหมด</p>
            <p className="text-xl sm:text-2xl font-black text-white">{lineAccounts.length}</p>
          </Card>
          <Card variant="glass" className="p-4 sm:p-6 rounded-2xl border border-white/5 hover:border-amber-500/20 transition-all hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-black/20">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-amber-500/10 flex items-center justify-center">
                <span className="text-xl sm:text-2xl">📄</span>
              </div>
              <Badge variant="warning" className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1">ต้องดำเนินการ</Badge>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">สลิปรอตรวจ</p>
            <p className="text-xl sm:text-2xl font-black text-white">{recentPayments.filter(p => p.status === 'pending').length}</p>
          </Card>
          <Card variant="glass" className="p-4 sm:p-6 rounded-2xl border border-white/5 hover:border-violet-500/20 transition-all hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-black/20">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-violet-500/10 flex items-center justify-center">
                <span className="text-xl sm:text-2xl">🤖</span>
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">AI Bot</p>
            <p className="text-xl sm:text-2xl font-black text-white">98%</p>
          </Card>
          <Card variant="glass" className="p-4 sm:p-6 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-black/20">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/10 flex items-center justify-center">
                <span className="text-xl sm:text-2xl">👥</span>
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">ผู้ติดตาม</p>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <p className="text-xl sm:text-2xl font-black text-white">{lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}</p>
              <span className="text-[9px] sm:text-[10px] font-bold text-[#06C755] flex items-center gap-1">
                <span>↑</span> +5% สัปดาห์นี้
              </span>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mt-4 sm:mt-6">
          <div className="lg:col-span-2">
            <Card className="h-full relative overflow-hidden group" variant="glass" padding="md">
              <div className="absolute top-0 right-0 w-[200px] sm:w-[300px] md:w-[500px] h-[200px] sm:h-[300px] md:h-[500px] bg-[#06C755]/10 rounded-full blur-[60px] sm:blur-[80px] md:blur-[120px] -mr-10 sm:-mr-20 md:-mr-40 -mt-10 sm:-mt-20 md:-mt-40 pointer-events-none" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 relative z-10">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight">
                    ผู้ใช้งานรายวัน
                  </h2>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">แนวโน้มการมีส่วนร่วม (7 วันล่าสุด)</p>
                </div>
              </div>
              
              <div className="mb-4 sm:mb-6 relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <p className="text-3xl sm:text-4xl font-black text-white">{lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}</p>
                  <span className="text-xs sm:text-sm font-bold text-[#06C755] flex items-center gap-1">
                    <span>↑</span> +12.5%
                  </span>
                </div>
                <div className="h-24 sm:h-32 bg-white/[0.02] rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-end justify-between gap-1 sm:gap-2 overflow-x-auto">
                  {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((day, idx) => (
                    <div key={day} className="flex-1 min-w-[30px] sm:min-w-0 flex flex-col items-center gap-1 sm:gap-2">
                      <div 
                        className={cn(
                          "w-full rounded-t transition-all",
                          idx === 6 ? "bg-[#06C755] h-full" : "bg-white/10 h-3/4"
                        )}
                      />
                      <span className="text-[8px] sm:text-[9px] font-semibold text-slate-400">{day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <Card className="p-4 sm:p-6 relative overflow-hidden" variant="glass">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">การเติบโตสมาชิก</h3>
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">30 วันล่าสุด</p>
              </div>
              <div className="mb-3 sm:mb-4">
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3">
                  <p className="text-2xl sm:text-3xl font-black text-white">{lineAccounts.length * 310}</p>
                  <span className="text-xs sm:text-sm font-bold text-[#06C755]">+12% เทียบเดือนที่แล้ว</span>
                </div>
              </div>
              <div className="h-20 sm:h-24 bg-white/[0.02] rounded-lg sm:rounded-xl p-2 sm:p-3 flex items-end justify-between gap-1 sm:gap-2">
                {[1, 2, 3, 4].map((week) => (
                  <div key={week} className="flex-1 flex flex-col items-center gap-1 sm:gap-2">
                    <div className="w-full bg-[#06C755] rounded-t h-3/4" />
                    <span className="text-[8px] sm:text-[9px] font-semibold text-slate-400">สัปดาห์ {week}</span>
                  </div>
                ))}
              </div>
            </Card>
            
            <Card className="p-4 sm:p-6 relative overflow-hidden" variant="glass">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">การตรวจสอบล่าสุด</h3>
                <Link href="/user/payments">
                  <Button variant="ghost" size="sm" className="text-[9px] sm:text-[10px] font-semibold text-[#06C755] hover:text-[#05B048]">
                    ดูทั้งหมด
                  </Button>
                </Link>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {recentPayments.length > 0 ? (
                  recentPayments.map((payment) => (
                    <div key={payment._id} className="p-3 sm:p-4 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg sm:rounded-xl border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 group transition-all">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 w-full sm:w-auto">
                        <div className="w-10 h-10 rounded-lg bg-[#06C755]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-base sm:text-lg">💎</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-xs sm:text-sm truncate">แพ็คเกจพรีเมียม</p>
                          <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 truncate">@{payment._id.slice(-8)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                        <div className="text-left sm:text-right">
                          <p className="font-black text-white text-sm sm:text-base">฿{payment.amount.toLocaleString()}</p>
                          <StatusBadge status={payment.status} className="text-[8px] sm:text-[9px] mt-1" />
                        </div>
                        {payment.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 flex items-center justify-center text-rose-400 transition-colors">
                              <span className="text-sm">✕</span>
                            </button>
                            <button className="w-8 h-8 rounded-lg bg-[#06C755]/10 hover:bg-[#06C755]/20 flex items-center justify-center text-[#06C755] transition-colors">
                              <span className="text-sm">✓</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 sm:py-8">
                    <p className="text-slate-500 font-semibold text-xs sm:text-sm">ยังไม่มีการตรวจสอบล่าสุด</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4 sm:p-6 mt-4 sm:mt-6" variant="glass">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">สถานะ AI Bot</h3>
                <div className="flex items-center gap-2">
                  <div className="w-10 sm:w-12 h-5 sm:h-6 rounded-full bg-[#06C755] relative">
                    <div className="absolute right-0.5 sm:right-1 top-0.5 sm:top-1 w-3.5 sm:w-4 h-3.5 sm:h-4 bg-white rounded-full"></div>
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-[#06C755]">เปิดใช้งาน</span>
                </div>
              </div>
              <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">อัตราการตอบกลับ 98%</p>
            </Card>
            
            <Card className="p-4 sm:p-6" variant="glass">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl sm:text-2xl">💬</span>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-white">{lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}</p>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">แชทที่ใช้งาน</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
        
        <Card className="p-4 sm:p-6" variant="glass">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">กิจกรรมล่าสุด</h3>
            <Link href="/user/history">
              <Button variant="ghost" size="sm" className="text-[9px] sm:text-[10px] font-semibold text-[#06C755] hover:text-[#05B048]">
                ดูทั้งหมด
              </Button>
            </Link>
          </div>
          <div className="space-y-2 sm:space-y-3">
            {[
              { name: 'สมชาย ล.', message: 'โปรโมชั่นวันนี้ยังใช้ได้อยู่ไหม?', time: '2 นาทีที่แล้ว' },
              { name: 'มike K.', message: 'แนบสลิปการชำระเงินสำหรับคำสั่งซื้อ #9921', time: '15 นาทีที่แล้ว' },
              { name: 'David Chen', message: 'ขอบคุณสำหรับการอัปเดต!', time: '1 นาทีที่แล้ว' }
            ].map((activity, idx) => (
              <div key={idx} className="p-3 sm:p-4 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg sm:rounded-xl border border-white/5 flex items-center gap-3 sm:gap-4 transition-all">
                <div className="w-10 h-10 rounded-lg bg-[#06C755]/10 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {activity.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-xs sm:text-sm truncate">{activity.name}</p>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 truncate">{activity.message}</p>
                </div>
                <span className="text-[8px] sm:text-[9px] font-semibold text-slate-500 whitespace-nowrap flex-shrink-0">{activity.time}</span>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </DashboardLayout>
  );
}
