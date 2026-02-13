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
import {
  FileText,
  Brain,
  CheckCircle,
  MessageSquare,
  Clock,
  Gem,
  Search,
  Package,
} from 'lucide-react';

interface AiQuotaInfo {
  hasQuota: boolean;
  remainingQuota: number;
  totalQuota: number;
  usedQuota: number;
  reservedQuota: number;
  activeSubscriptions: number;
}

export default function UserQuotaPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [aiQuota, setAiQuota] = useState<AiQuotaInfo | null>(null);
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [subRes, aiQuotaRes, accountsRes] = await Promise.all([
        subscriptionsApi.getMy(),
        subscriptionsApi.getAiQuota().catch(() => ({ data: { aiQuota: null } })),
        lineAccountsApi.getMyAccounts(),
      ]);
      setSubscription(subRes.data.subscription);
      setAiQuota(aiQuotaRes.data.aiQuota || null);
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

  const getAiQuotaPercentage = () => {
    if (!aiQuota || !aiQuota.totalQuota) return 0;
    return Math.round((aiQuota.remainingQuota / aiQuota.totalQuota) * 100);
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
  const isExpired = subscription?.expiresAt ? new Date(subscription.expiresAt).getTime() < Date.now() : false;
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
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              โควต้าการ<span className="text-[#06C755]">ใช้งาน</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              ตรวจสอบและจัดการโควต้าของคุณ
            </p>
            <p className="text-[10px] font-semibold text-slate-500 mt-2">อัปเดตล่าสุด: เมื่อสักครู่</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Link href="/user/packages" className="flex-1 sm:flex-none">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048] transition-all gap-2"
              >
                <Gem className="w-4 h-4" /> ซื้อแพ็คเกจ
              </Button>
            </Link>
            <Button variant="outline" className="flex-1 sm:flex-none h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all gap-2">
              <Search className="w-4 h-4" /> กรองข้อมูล
            </Button>
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
              <span className="text-rose-400 font-semibold text-xs sm:text-sm">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRetry} className="text-rose-400 hover:bg-rose-500/10 text-xs sm:text-sm">
              ลองใหม่
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6">
          <Card variant="glass" className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/5 hover:border-[#06C755]/20 transition-all">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-[#06C755]" />
              </div>
              {getQuotaPercentage() < 20 && subscription && (
                <Badge variant="error" className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1">ใกล้หมด</Badge>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">โควต้าสลิป</p>
            <p className="text-xl sm:text-2xl font-black text-white">{(subscription?.remainingQuota || 0).toLocaleString()}</p>
          </Card>

          <Card variant="glass" className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/5 hover:border-violet-500/20 transition-all">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400" />
              </div>
              {aiQuota && aiQuota.totalQuota > 0 && getAiQuotaPercentage() < 20 && (
                <Badge variant="error" className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1">ใกล้หมด</Badge>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">โควต้า AI</p>
            <p className="text-xl sm:text-2xl font-black text-white">{(aiQuota?.remainingQuota || 0).toLocaleString()}</p>
          </Card>

          <Card variant="glass" className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/5 hover:border-amber-500/20 transition-all">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">สลิปที่ตรวจสอบ</p>
            <p className="text-xl sm:text-2xl font-black text-white">{getTotalSlipsVerified().toLocaleString()}</p>
          </Card>

          <Card variant="glass" className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">ข้อความทั้งหมด</p>
            <p className="text-xl sm:text-2xl font-black text-white">{getTotalMessages().toLocaleString()}</p>
          </Card>

          <Card variant="glass" className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-white/5 hover:border-indigo-500/20 transition-all">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">วันคงเหลือ</p>
            <p className={cn("text-xl sm:text-2xl font-black", isExpired ? "text-rose-500" : "text-white")}>{isExpired ? "หมดอายุแล้ว" : daysRemaining + " วัน"}</p>
          </Card>
        </div>

        <Card className="rounded-xl sm:rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative p-4 sm:p-6 group" variant="glass">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 mb-4 sm:mb-6">
            <div className="space-y-1">
              <h3 className="font-black text-white text-lg sm:text-xl tracking-tight">การเติบโตผู้ใช้</h3>
              <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">ผู้ใช้งานรายวันในช่วง 30 วันที่ผ่านมา</p>
            </div>
          </div>
          
          <div className="h-24 sm:h-32 bg-white/[0.02] rounded-lg sm:rounded-xl p-2 sm:p-4 flex items-end justify-between gap-1 sm:gap-2 overflow-x-auto">
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className="flex-1 min-w-[8px] sm:min-w-0 flex flex-col items-center gap-1">
                <div 
                  className="w-full bg-[#06C755] rounded-t transition-all"
                  style={{ height: `${Math.random() * 60 + 20}%` }}
                />
              </div>
            ))}
          </div>
        </Card>

          {subscription ? (
            <Card className="rounded-xl sm:rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative p-4 sm:p-6 mt-4 sm:mt-6" variant="glass">
              <div className="relative z-10 space-y-6 sm:space-y-8">
                {/* Slip Quota Section */}
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-0 mb-4">
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> โควต้าสลิปคงเหลือ</p>
                      <p className="text-xl sm:text-2xl font-black text-white">
                        {(subscription.remainingQuota || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">โควต้าสลิปทั้งหมด</p>
                      <p className="text-sm sm:text-base font-black text-slate-300">{(subscription.quota || 0).toLocaleString()} หน่วย</p>
                    </div>
                  </div>

                  <div className="relative pt-2">
                    <div className="h-3 sm:h-4 bg-white/[0.02] border border-white/5 rounded-full overflow-hidden shadow-lg">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-1000 ease-out relative",
                          getQuotaPercentage() > 50 ? 'bg-[#06C755] shadow-[0_0_20px_rgba(6,199,85,0.3)]' : getQuotaPercentage() > 20 ? 'bg-amber-500' : 'bg-rose-500'
                        )}
                        style={{ width: `${Math.max(getQuotaPercentage(), 2)}%` }}
                      >
                        <div className="absolute top-0 right-0 h-full w-16 sm:w-24 bg-gradient-to-r from-transparent to-white/20" />
                      </div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-slate-500">0%</span>
                      <span className={cn("text-[9px] font-bold", getQuotaPercentage() > 50 ? 'text-[#06C755]' : getQuotaPercentage() > 20 ? 'text-amber-500' : 'text-rose-500')}>
                        {getQuotaPercentage()}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Quota Section */}
                {aiQuota && aiQuota.totalQuota > 0 && (
                  <div className="pt-4 border-t border-white/5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-0 mb-4">
                      <div>
                        <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1 flex items-center gap-1"><Brain className="w-3 h-3" /> โควต้า AI คงเหลือ</p>
                        <p className="text-xl sm:text-2xl font-black text-white">
                          {(aiQuota.remainingQuota || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">โควต้า AI ทั้งหมด</p>
                        <p className="text-sm sm:text-base font-black text-slate-300">{(aiQuota.totalQuota || 0).toLocaleString()} หน่วย</p>
                      </div>
                    </div>

                    <div className="relative pt-2">
                      <div className="h-3 sm:h-4 bg-white/[0.02] border border-white/5 rounded-full overflow-hidden shadow-lg">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-1000 ease-out relative",
                            getAiQuotaPercentage() > 50 ? 'bg-violet-500 shadow-[0_0_20px_rgba(139,92,246,0.3)]' : getAiQuotaPercentage() > 20 ? 'bg-amber-500' : 'bg-rose-500'
                          )}
                          style={{ width: `${Math.max(getAiQuotaPercentage(), 2)}%` }}
                        >
                          <div className="absolute top-0 right-0 h-full w-16 sm:w-24 bg-gradient-to-r from-transparent to-white/20" />
                        </div>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px] text-slate-500">0%</span>
                        <span className={cn("text-[9px] font-bold", getAiQuotaPercentage() > 50 ? 'text-violet-400' : getAiQuotaPercentage() > 20 ? 'text-amber-500' : 'text-rose-500')}>
                          {getAiQuotaPercentage()}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                  <div className="p-4 sm:p-6 lg:p-8 bg-white/[0.02] hover:bg-white/[0.04] rounded-xl sm:rounded-2xl border border-white/5 transition-all duration-500 text-center">
                    <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-2 sm:mb-3">วันที่เริ่มใช้งาน</p>
                    <p className="font-black text-white text-base sm:text-lg lg:text-xl">
                      {subscription.startDate
                        ? new Date(subscription.startDate).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                        : '---'}
                    </p>
                  </div>
                  <div className="p-4 sm:p-6 lg:p-8 bg-white/[0.02] hover:bg-white/[0.04] rounded-xl sm:rounded-2xl border border-white/5 transition-all duration-500 text-center">
                    <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-2 sm:mb-3">วันหมดอายุ</p>
                    <p className="font-black text-white text-base sm:text-lg lg:text-xl">
                      {subscription.expiresAt
                        ? new Date(subscription.expiresAt).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                        : 'ไม่มีกำหนด'}
                    </p>
                  </div>
                </div>

                {/* Low Quota Warnings */}
                {(getQuotaPercentage() < 20 || (aiQuota && aiQuota.totalQuota > 0 && getAiQuotaPercentage() < 20)) && (
                  <div className="space-y-3">
                    {getQuotaPercentage() < 20 && (
                      <div className="p-4 sm:p-6 bg-rose-500/5 border border-rose-500/20 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-rose-400" />
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                          <p className="font-black text-white text-sm sm:text-base mb-1">โควต้าสลิปใกล้หมด</p>
                          <p className="text-xs font-semibold text-rose-400/80">เหลือ {subscription.remainingQuota?.toLocaleString()} ครั้ง ({getQuotaPercentage()}%)</p>
                        </div>
                        <Link href="/user/packages" className="w-full sm:w-auto">
                          <Button variant="primary" className="w-full sm:w-auto h-10 sm:h-12 px-5 sm:px-8 rounded-xl bg-rose-500 hover:bg-rose-400 shadow-lg shadow-rose-500/20 font-semibold text-xs sm:text-sm transition-all gap-2">
                            <Gem className="w-4 h-4" /> เติมโควต้า
                          </Button>
                        </Link>
                      </div>
                    )}

                    {aiQuota && aiQuota.totalQuota > 0 && getAiQuotaPercentage() < 20 && (
                      <div className="p-4 sm:p-6 bg-violet-500/5 border border-violet-500/20 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-6 h-6 sm:w-7 sm:h-7 text-violet-400" />
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                          <p className="font-black text-white text-sm sm:text-base mb-1">โควต้า AI ใกล้หมด</p>
                          <p className="text-xs font-semibold text-violet-400/80">เหลือ {aiQuota.remainingQuota?.toLocaleString()} ครั้ง ({getAiQuotaPercentage()}%)</p>
                        </div>
                        <Link href="/user/packages" className="w-full sm:w-auto">
                          <Button variant="primary" className="w-full sm:w-auto h-10 sm:h-12 px-5 sm:px-8 rounded-xl bg-violet-500 hover:bg-violet-400 shadow-lg shadow-violet-500/20 font-semibold text-xs sm:text-sm transition-all gap-2">
                            <Gem className="w-4 h-4" /> เติมโควต้า
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="rounded-xl sm:rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative p-4 sm:p-6 mt-4 sm:mt-6" variant="glass">
              <EmptyState
                icon={<Package className="w-12 h-12 text-slate-400" />}
                title="ยังไม่มีแพ็คเกจ"
                description="กรุณาซื้อแพ็คเกจเพื่อเริ่มใช้งานระบบตรวจสอบสลิปอัตโนมัติ"
                variant="glass"
                className="py-12 sm:py-20"
                action={
                  <Link href="/user/packages">
                    <Button variant="primary" className="h-12 sm:h-14 px-6 sm:px-10 rounded-xl sm:rounded-2xl bg-[#06C755] hover:bg-[#05B048] font-semibold text-xs sm:text-sm shadow-2xl shadow-[#06C755]/20 transition-all gap-2">
                      <Gem className="w-4 h-4" /> ซื้อแพ็คเกจ
                    </Button>
                  </Link>
                }
              />
            </Card>
          )}

        {accounts.length > 0 && (
          <Card variant="glass" className="rounded-xl sm:rounded-2xl border border-white/5 shadow-2xl bg-white/[0.01] overflow-hidden mt-4 sm:mt-6">
            <div className="p-4 sm:p-6 lg:p-8">
              <h3 className="font-black text-white text-lg sm:text-xl tracking-tight mb-2">สถิติตามบัญชี</h3>
              <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">การกระจายทรัพยากรแบบเรียลไทม์ใน {accounts.length} บัญชีที่ใช้งาน</p>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-white/[0.02] border-y border-white/5">
                    <th className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 lg:py-5 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400 whitespace-nowrap">ชื่อบัญชี</th>
                    <th className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 lg:py-5 text-center text-[9px] sm:text-[10px] font-semibold text-slate-400 whitespace-nowrap">ข้อความ</th>
                    <th className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 lg:py-5 text-center text-[9px] sm:text-[10px] font-semibold text-slate-400 whitespace-nowrap">สลิป</th>
                    <th className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 lg:py-5 text-center text-[9px] sm:text-[10px] font-semibold text-slate-400 hidden md:table-cell whitespace-nowrap">AI</th>
                    <th className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 lg:py-5 text-right text-[9px] sm:text-[10px] font-semibold text-slate-400 whitespace-nowrap">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {accounts.map((account) => (
                    <tr key={account._id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 lg:py-6">
                        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-5">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg sm:rounded-xl md:rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-[#06C755] font-black text-sm sm:text-base md:text-lg shadow-lg group-hover:scale-110 group-hover:bg-[#06C755] group-hover:text-white transition-all duration-500 flex-shrink-0">
                            {account.accountName?.charAt(0).toUpperCase() || 'L'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-white text-xs sm:text-sm md:text-base truncate group-hover:text-[#06C755] transition-colors">{account.accountName}</p>
                            <p className="text-[8px] sm:text-[9px] font-mono font-semibold text-slate-500 truncate mt-0.5 sm:mt-1">{account.channelId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-center">
                        <span className="font-black text-slate-300 text-xs sm:text-sm">
                          {(account.statistics?.totalMessages || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-center">
                        <span className="font-black text-[#06C755] text-sm sm:text-base lg:text-lg">
                          {(account.statistics?.totalSlipsVerified || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-center hidden md:table-cell">
                        <span className="font-black text-indigo-400 text-xs sm:text-sm">
                          {(account.statistics?.totalAiResponses || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-right">
                        <Badge variant={account.isActive ? 'success' : 'secondary'} size="sm" className="font-semibold text-[8px] sm:text-[9px] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg whitespace-nowrap">
                          {account.isActive ? 'เปิด' : 'ปิด'}
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
