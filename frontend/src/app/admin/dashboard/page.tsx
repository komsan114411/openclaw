'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, lineAccountsApi, paymentsApi, packagesApi, thunderApi } from '@/lib/api';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Loading';

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

  const runCleanupReservations = async () => {
    if (isRunningMaintenance) return;
    setIsRunningMaintenance('reservations');
    try {
      const res = await api.post('/subscriptions/cleanup-reservations');
      toast.success(`ลบ quota reservation ค้างแล้ว ${res.data.cleanedCount || 0} รายการ`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsRunningMaintenance(null);
    }
  };

  const runExpireSubscriptions = async () => {
    if (isRunningMaintenance) return;
    setIsRunningMaintenance('expire');
    try {
      const res = await api.post('/subscriptions/expire');
      toast.success(`อัปเดตสถานะ subscription หมดอายุแล้ว ${res.data.expiredCount || 0} รายการ`);
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

  const getQuotaColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const statCards = [
    {
      title: 'ผู้ใช้ทั้งหมด',
      value: stats?.totalUsers || 0,
      subValue: `${stats?.activeUsers || 0} ใช้งาน`,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: 'bg-blue-500',
      link: '/admin/users',
    },
    {
      title: 'บัญชี LINE',
      value: stats?.totalLineAccounts || 0,
      subValue: `${(stats?.totalMessages || 0).toLocaleString()} ข้อความ`,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      color: 'bg-green-500',
      link: '/admin/line-accounts',
    },
    {
      title: 'สลิปที่ตรวจสอบ',
      value: (stats?.totalSlipsVerified || 0).toLocaleString(),
      subValue: 'ทั้งหมด',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'bg-purple-500',
      link: '/admin/payments',
    },
    {
      title: 'รอตรวจสอบ',
      value: stats?.pendingPayments || 0,
      subValue: 'รายการชำระเงิน',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: stats?.pendingPayments ? 'bg-red-500' : 'bg-yellow-500',
      link: '/admin/payments',
    },
  ];

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500">ภาพรวมระบบ LINE OA Management</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { fetchStats(); fetchThunderQuota(); }}
            leftIcon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            รีเฟรชข้อมูล
          </Button>
        </div>

        {/* 1. Key Stats Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-24 bg-gray-100 rounded-lg"></div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((card, index) => (
              <Link key={index} href={card.link}>
                <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer border-l-4" style={{borderLeftColor: card.color.replace('bg-', 'text-')}}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-500 text-sm font-medium">{card.title}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{card.subValue}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${card.color} text-white shadow-md transform rotate-3`}>
                      {card.icon}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* 2. Main Content Grid: Thunder Quota + Recent Payments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Thunder API Quota - Takes up 2 columns */}
          <div className="lg:col-span-2">
            <Card className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white overflow-hidden shadow-xl h-full relative">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 p-32 bg-purple-600 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -mr-16 -mt-16"></div>
              <div className="absolute bottom-0 left-0 p-32 bg-indigo-600 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -ml-16 -mb-16"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg backdrop-blur-md">
                      <svg className="w-6 h-6 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Thunder API Quota</h2>
                      <p className="text-indigo-200 text-xs">ระบบตรวจสอบสลิป</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10"
                    onClick={fetchThunderQuota}
                    disabled={isLoadingQuota}
                  >
                    {isLoadingQuota ? <Spinner size="sm" color="white" /> : '🔄'}
                  </Button>
                </div>

                {isLoadingQuota ? (
                  <div className="flex items-center justify-center py-12">
                    <Spinner size="lg" color="white" />
                  </div>
                ) : thunderQuota?.success && thunderQuota.data ? (
                  <div className="space-y-6">
                    {/* Usage Bar */}
                    <div className="bg-black/20 rounded-xl p-4 backdrop-blur-sm border border-white/5">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-indigo-200 text-sm">การใช้งานเดือนนี้</span>
                        <div className="text-right">
                          <span className="text-2xl font-bold text-white">{thunderQuota.data.usedQuota.toLocaleString()}</span>
                          <span className="text-indigo-300 text-sm"> / {thunderQuota.data.maxQuota.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getQuotaColor(thunderQuota.data.usagePercentage)} transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]`}
                          style={{ width: `${Math.max(Math.min(thunderQuota.data.usagePercentage, 100), 2)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-indigo-300">
                        <span>ใช้ไป {thunderQuota.data.usagePercentage.toFixed(1)}%</span>
                        <span>เหลือ {thunderQuota.data.remainingQuota.toLocaleString()} ครั้ง</span>
                      </div>
                    </div>

                    {/* Mini Stats Row */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <p className="text-indigo-300 text-xs mb-1">เครดิตคงเหลือ</p>
                        <p className="text-xl font-bold text-emerald-400">{thunderQuota.data.currentCredit.toLocaleString()}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <p className="text-indigo-300 text-xs mb-1">วันหมดอายุ</p>
                        <p className="text-lg font-bold text-white">{formatDate(thunderQuota.data.expiredAt)}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                        <p className="text-indigo-300 text-xs mb-1">สิทธิ์ใช้งาน</p>
                        <p className={`text-xl font-bold ${thunderQuota.data.daysRemaining <= 7 ? 'text-orange-400' : 'text-blue-300'}`}>
                          {thunderQuota.data.daysRemaining} วัน
                        </p>
                      </div>
                    </div>

                    {/* Warnings */}
                    {(thunderQuota.data.isExpired || thunderQuota.data.isLowQuota) && (
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <span className="text-sm text-red-200">
                          {thunderQuota.data.isExpired ? 'API Token หมดอายุแล้ว กรุณาต่ออายุ' : 'โควต้าใกล้หมดแล้ว กรุณาเติมเครดิต'}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-indigo-300 bg-white/5 rounded-xl border border-white/5">
                    <p>ไม่สามารถโหลดข้อมูลได้</p>
                    <p className="text-xs mt-2 opacity-50">{thunderQuota?.error || 'กรุณาตรวจสอบการตั้งค่า API Key'}</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Pending Payments - Takes up 1 column */}
          <div className="lg:col-span-1 flex flex-col h-full">
            <Card className="flex-1 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  รอตรวจสอบ
                </h2>
                <Link href="/admin/payments" className="text-primary-600 hover:text-primary-700 text-xs font-medium">
                  ดูทั้งหมด
                </Link>
              </div>
              
              <div className="flex-1 overflow-auto -mx-2 px-2">
                {recentPayments.length > 0 ? (
                  <div className="space-y-3">
                    {recentPayments.map((payment) => (
                      <div key={payment._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-gray-900">฿{payment.amount?.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{new Date(payment.createdAt).toLocaleDateString('th-TH')}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">รออนุมัติ</span>
                          <p className="text-[10px] text-gray-400 mt-1">{payment.paymentType === 'bank_transfer' ? 'โอนเงิน' : 'USDT'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
                    <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">ไม่มีรายการรอตรวจสอบ</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* 3. Bottom Row: Quick Actions & Maintenance */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Action Links */}
          <Link href="/admin/users" className="group">
            <Card className="h-full hover:shadow-md transition-all border-none bg-blue-50/50 hover:bg-blue-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">จัดการผู้ใช้</h3>
                  <p className="text-xs text-gray-500">จัดการ Users & Packages</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/line-accounts" className="group">
            <Card className="h-full hover:shadow-md transition-all border-none bg-green-50/50 hover:bg-green-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-100 text-green-600 rounded-lg group-hover:bg-green-200 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">LINE OA</h3>
                  <p className="text-xs text-gray-500">บัญชีที่เชื่อมต่อ</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/settings" className="group">
            <Card className="h-full hover:shadow-md transition-all border-none bg-gray-50/50 hover:bg-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gray-200 text-gray-600 rounded-lg group-hover:bg-gray-300 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">ตั้งค่าระบบ</h3>
                  <p className="text-xs text-gray-500">API & Payment</p>
                </div>
              </div>
            </Card>
          </Link>

          {/* Maintenance Card - Compact */}
          <div className="group relative">
            <Card className="h-full border-none bg-orange-50/50 hover:bg-orange-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-100 text-orange-600 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Clear Data</h3>
                    <p className="text-xs text-gray-500">ล้างข้อมูลขยะ</p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="text-orange-600 hover:bg-orange-100"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isRunningMaintenance) runCleanupSessions();
                  }}
                  disabled={!!isRunningMaintenance}
                >
                  {isRunningMaintenance === 'sessions' ? <Spinner size="sm" /> : 'Run'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
