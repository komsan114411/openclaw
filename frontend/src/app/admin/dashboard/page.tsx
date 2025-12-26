'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, lineAccountsApi, paymentsApi, packagesApi, thunderApi } from '@/lib/api';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalLineAccounts: number;
  totalMessages: number;
  totalSlipsVerified: number;
  pendingPayments: number;
  totalPackages: number;
}

interface ThunderQuota {
  success: boolean;
  data?: {
    application: string;
    usedQuota: number;
    maxQuota: number;
    remainingQuota: number;
    usagePercentage: number;
    expiredAt: string;
    daysRemaining: number;
    currentCredit: number;
    isExpired: boolean;
    isLowQuota: boolean;
  };
  error?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [isRunningMaintenance, setIsRunningMaintenance] = useState<string | null>(null);
  const [thunderQuota, setThunderQuota] = useState<ThunderQuota | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [usersRes, lineAccountsRes, paymentsRes, packagesRes] = await Promise.all([
        usersApi.getStatistics(),
        lineAccountsApi.getStatistics(),
        paymentsApi.getAll('pending'),
        packagesApi.getAll(true),
      ]);

      setStats({
        totalUsers: usersRes.data.statistics?.totalUsers || 0,
        activeUsers: usersRes.data.statistics?.activeUsers || 0,
        totalLineAccounts: lineAccountsRes.data.statistics?.totalAccounts || 0,
        totalMessages: lineAccountsRes.data.statistics?.totalMessages || 0,
        totalSlipsVerified: lineAccountsRes.data.statistics?.totalSlipsVerified || 0,
        pendingPayments: paymentsRes.data.payments?.length || 0,
        totalPackages: packagesRes.data.packages?.length || 0,
      });
      setRecentPayments(paymentsRes.data.payments?.slice(0, 5) || []);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchThunderQuota = useCallback(async () => {
    setIsLoadingQuota(true);
    try {
      const res = await thunderApi.getQuota();
      setThunderQuota(res.data);
    } catch (error: any) {
      console.error('Error fetching Thunder quota:', error);
      setThunderQuota({
        success: false,
        error: error.response?.data?.error || 'ไม่สามารถดึงข้อมูลโควต้าได้',
      });
    } finally {
      setIsLoadingQuota(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchThunderQuota();
  }, [fetchStats, fetchThunderQuota]);

  // System Maintenance Functions
  const runCleanupSessions = async () => {
    if (isRunningMaintenance) return;
    setIsRunningMaintenance('sessions');
    try {
      const res = await api.post('/auth/cleanup-sessions');
      toast.success(`ลบ session หมดอายุแล้ว ${res.data.deletedCount || 0} รายการ`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsRunningMaintenance(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 md:space-y-8 lg:space-y-10 animate-fade max-w-[1600px] mx-auto pb-6 md:pb-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-8 relative z-10">
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-3xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight uppercase">
              ศูนย์<span className="text-emerald-500">ควบคุม</span>
            </h1>
            <p className="text-slate-500 font-bold text-xs md:text-sm lg:text-lg tracking-wide opacity-80 uppercase">
              ยินดีต้อนรับกลับ, <span className="text-slate-900">ผู้ดูแลระบบ</span> 👋
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4 w-full md:w-auto">
            <Button
              variant="outline"
              size="lg"
              onClick={() => { fetchStats(); fetchThunderQuota(); }}
              className="group border-slate-200 bg-white/50 backdrop-blur-xl hover:bg-white hover:border-emerald-200 hover:text-emerald-600 rounded-xl md:rounded-2xl h-12 md:h-14 px-4 md:px-8 font-black uppercase tracking-widest text-[10px] md:text-xs shadow-sm hover:shadow-md transition-all duration-300"
              isLoading={isLoading || isLoadingQuota}
            >
              <svg className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3 text-slate-400 group-hover:text-emerald-500 group-hover:rotate-180 transition-all duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">รีเฟรชข้อมูล</span>
              <span className="sm:hidden">รีเฟรช</span>
            </Button>
            <Link href="/admin/settings" className="flex-1 sm:flex-none">
              <Button size="lg" variant="primary" className="w-full h-12 md:h-14 px-4 md:px-8 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-emerald-500/20 shadow-2xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-300">
                <span className="hidden sm:inline">ตั้งค่าระบบ</span>
                <span className="sm:hidden">ตั้งค่า</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* 1. Key Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
          <StatCard
            title="ผู้ใช้ทั้งหมด"
            value={stats?.totalUsers || 0}
            trend={{ value: stats?.activeUsers || 0, label: 'กำลังใช้งาน', isUp: true }}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
            color="emerald"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="บัญชี LINE"
            value={stats?.totalLineAccounts || 0}
            trend={{ value: stats?.totalMessages || 0, label: 'ข้อความ', isUp: true }}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            color="blue"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="สลิปที่ตรวจสอบ"
            value={(stats?.totalSlipsVerified || 0).toLocaleString()}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            color="violet"
            variant="glass"
            isLoading={isLoading}
          />
          <StatCard
            title="รอตรวจสอบ"
            value={stats?.pendingPayments || 0}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            color={stats?.pendingPayments ? "rose" : "amber"}
            variant="glass"
            isLoading={isLoading}
          />
        </div>

        {/* 2. Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6 lg:gap-8 items-stretch">

          {/* Thunder API Quota - Modern Glassmorphism */}
          <div className="xl:col-span-8">
            <Card className="h-full bg-slate-900 border-none relative overflow-hidden group">
              {/* Animated Background Gradients */}
              <div className="absolute top-0 right-0 w-[300px] md:w-[500px] h-[300px] md:h-[500px] bg-emerald-500/20 rounded-full blur-[80px] md:blur-[120px] -mr-24 md:-mr-48 -mt-24 md:-mt-48 animate-pulse duration-[10s]" />
              <div className="absolute bottom-0 left-0 w-[200px] md:w-[400px] h-[200px] md:h-[400px] bg-blue-600/20 rounded-full blur-[60px] md:blur-[100px] -ml-16 md:-ml-32 -mb-16 md:-mb-32 animate-pulse duration-[7s]" />

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-10">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-xl border border-white/10 group-hover:scale-110 transition-transform duration-500 flex-shrink-0">
                      <svg className="w-5 h-5 md:w-8 md:h-8 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg md:text-2xl font-black text-white tracking-tight uppercase">โควต้า Thunder API</h2>
                      <p className="text-slate-400 font-bold text-xs md:text-sm tracking-widest uppercase opacity-75">บริการตรวจสลิป</p>
                    </div>
                  </div>
                  <IconButton
                    variant="glass"
                    size="lg"
                    onClick={fetchThunderQuota}
                    isLoading={isLoadingQuota}
                    className="text-white border-white/10 hidden sm:flex"
                  >
                    <span className="text-xl">🔄</span>
                  </IconButton>
                </div>

                {isLoadingQuota ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 md:py-20">
                    <Spinner size="xl" color="white" />
                    <p className="mt-4 text-slate-400 font-medium animate-pulse text-sm">กำลังเชื่อมต่อเซิร์ฟเวอร์...</p>
                  </div>
                ) : thunderQuota?.success && thunderQuota.data ? (
                  <div className="space-y-6 md:space-y-10 flex-1 flex flex-col justify-between">
                    {/* Progress Visual */}
                    <div className="space-y-3 md:space-y-4">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2">
                        <div className="space-y-1">
                          <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest">การใช้งานประจำเดือน</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl md:text-5xl font-black text-white">{thunderQuota.data.usedQuota.toLocaleString()}</span>
                            <span className="text-slate-500 font-bold text-lg md:text-xl">/ {thunderQuota.data.maxQuota.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <span className={cn(
                            "text-2xl md:text-3xl font-black",
                            thunderQuota.data.usagePercentage > 90 ? "text-rose-500" :
                              thunderQuota.data.usagePercentage > 70 ? "text-amber-400" : "text-emerald-400"
                          )}>
                            {thunderQuota.data.usagePercentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div className="h-4 md:h-6 bg-white/5 rounded-xl md:rounded-2xl p-1 md:p-1.5 border border-white/5 relative shadow-inner">
                        <div
                          className={cn(
                            "h-full rounded-lg md:rounded-xl transition-all duration-1000 ease-out relative",
                            thunderQuota.data.usagePercentage > 90 ? "bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_20px_rgba(225,29,72,0.4)]" :
                              thunderQuota.data.usagePercentage > 70 ? "bg-gradient-to-r from-amber-500 to-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]" :
                                "bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                          )}
                          style={{ width: `${Math.max(thunderQuota.data.usagePercentage, 5)}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse rounded-lg md:rounded-xl" />
                        </div>
                      </div>
                    </div>

                    {/* Meta Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
                      <div className="bg-white/5 rounded-xl md:rounded-[2rem] p-4 md:p-6 border border-white/5 space-y-1 md:space-y-2">
                        <p className="text-slate-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest">เครดิตคงเหลือ</p>
                        <p className="text-2xl md:text-3xl font-black text-emerald-400">{thunderQuota.data.currentCredit.toLocaleString()}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl md:rounded-[2rem] p-4 md:p-6 border border-white/5 space-y-1 md:space-y-2">
                        <p className="text-slate-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest">วันหมดอายุ</p>
                        <p className="text-lg md:text-2xl font-black text-white">{formatDate(thunderQuota.data.expiredAt)}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl md:rounded-[2rem] p-4 md:p-6 border border-white/5 space-y-1 md:space-y-2">
                        <p className="text-slate-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest">ระยะเวลาที่เหลือ</p>
                        <p className={cn(
                          "text-2xl md:text-3xl font-black",
                          thunderQuota.data.daysRemaining <= 7 ? "text-rose-400" : "text-blue-400"
                        )}>
                          {thunderQuota.data.daysRemaining} <span className="text-base md:text-lg">วัน</span>
                        </p>
                      </div>
                    </div>

                    {/* Warnings */}
                    {(thunderQuota.data.isExpired || thunderQuota.data.isLowQuota) && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 flex items-center gap-4 animate-bounce-slow">
                        <div className="w-12 h-12 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/40">
                          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-lg font-black text-white leading-none mb-1">ต้องการความสนใจ!</p>
                          <p className="text-slate-400 text-sm font-medium">
                            {thunderQuota.data.isExpired ? 'การกำหนดค่า API หมดอายุแล้ว ระบบอาจไม่เสถียร' : 'โควต้าปัจจุบันใกล้หมด กรุณาเติมเครดิตทันที'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-white/10">
                    <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-6">
                      <span className="text-4xl">🔌</span>
                    </div>
                    <p className="text-xl font-bold text-white mb-2">เชื่อมต่อบริการไม่สำเร็จ</p>
                    <p className="text-slate-500 font-medium text-center px-10 max-w-md">
                      {thunderQuota?.error || 'ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบการตั้งค่าระบบ'}
                    </p>
                    <Button variant="ghost" className="mt-6 text-emerald-400" onClick={fetchThunderQuota}>ลองอีกครั้ง</Button>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Pending Payments Feed */}
          <div className="xl:col-span-4 h-full">
            <Card className="h-full flex flex-col p-8 border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">กิจกรรมล่าสุด</h2>
                  <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest leading-none">รอการอนุมัติ</p>
                </div>
                <Link href="/admin/payments">
                  <Button variant="ghost" size="sm" className="text-emerald-600 font-bold hover:bg-emerald-50">
                    ดูทั้งหมด
                  </Button>
                </Link>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto no-scrollbar">
                {recentPayments.length > 0 ? (
                  recentPayments.map((payment) => (
                    <div key={payment._id} className="group p-5 bg-slate-50 rounded-3xl border border-slate-100/50 hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-emerald-200 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                            {payment.paymentType === 'bank_transfer' ? '🏦' : '💎'}
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900 leading-none mb-1">฿{payment.amount?.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{payment.paymentType === 'bank_transfer' ? 'โอนธนาคาร' : 'USDT / คริปโต'}</p>
                          </div>
                        </div>
                        <StatusBadge status="pending" className="px-3" />
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-slate-200/50">
                        <p className="text-xs font-bold text-slate-500">{formatDate(payment.createdAt)}</p>
                        <Link href={`/admin/payments?id=${payment._id}`}>
                          <IconButton variant="ghost" size="sm" className="group-hover:text-emerald-600">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </IconButton>
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 opacity-40">
                    <div className="w-20 h-20 rounded-[2rem] bg-slate-100 flex items-center justify-center mb-4">
                      <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                    </div>
                    <p className="font-bold text-slate-500 uppercase tracking-widest text-xs">ไม่มีรายการรอดำเนินการ</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* 3. Bottom Row: Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <ActionTile
            title="จัดการผู้ใช้"
            desc="ผู้ใช้ & สิทธิ์"
            href="/admin/users"
            icon="👥"
            color="blue"
          />
          <ActionTile
            title="บัญชี LINE"
            desc="เชื่อมต่อบัญชี"
            href="/admin/line-accounts"
            icon="🟢"
            color="emerald"
          />
          <ActionTile
            title="ธนาคาร"
            desc="ธนาคาร & รูปภาพ"
            href="/admin/banks"
            icon="🏦"
            color="indigo"
          />
          <div className="group relative">
            <Card className="h-full border-none bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-200 transition-all duration-300 p-6 flex items-center justify-between overflow-hidden">
              <div className="absolute top-0 right-0 p-12 bg-rose-500/5 rounded-full blur-[40px] -mr-8 -mt-8" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center text-xl shadow-sm">
                  🗑️
                </div>
                <div>
                  <h3 className="font-black text-slate-900 leading-tight">ล้างระบบ</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ลบ Session หมดอายุ</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 font-bold hover:bg-rose-50 relative z-10 h-10 w-20"
                onClick={runCleanupSessions}
                isLoading={isRunningMaintenance === 'sessions'}
              >
                ดำเนินการ
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ActionTile({ title, desc, href, icon, color }: { title: string, desc: string, href: string, icon: string, color: 'blue' | 'emerald' | 'indigo' }) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 border-blue-100 hover:bg-white hover:shadow-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-white hover:shadow-emerald-100",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-white hover:shadow-indigo-100"
  };

  return (
    <Link href={href} className="group">
      <Card className={cn(
        "h-full border-none transition-all duration-300 p-6 flex items-center gap-4 hover:shadow-xl hover:-translate-y-1",
        colorClasses[color]
      )}>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.5)] bg-white")}>
          {icon}
        </div>
        <div>
          <h3 className="font-black text-slate-900 leading-tight">{title}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">{desc}</p>
        </div>
      </Card>
    </Link>
  );
}
