'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, lineAccountsApi, paymentsApi, packagesApi, thunderApi } from '@/lib/api';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, StatCard } from '@/components/ui/Card';
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

  const getDaysRemainingColor = (days: number) => {
    if (days <= 7) return 'text-red-600';
    if (days <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  const statCards = [
    {
      title: 'ผู้ใช้ทั้งหมด',
      value: stats?.totalUsers || 0,
      subValue: `${stats?.activeUsers || 0} ใช้งาน`,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: stats?.pendingPayments ? 'bg-red-500' : 'bg-yellow-500',
      link: '/admin/payments',
    },
  ];

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">ภาพรวมระบบ LINE OA Management</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => { fetchStats(); fetchThunderQuota(); }}
            leftIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          >
            รีเฟรช
          </Button>
        </div>

        {/* Thunder API Quota Card */}
        <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold">Thunder API Quota</h2>
                <p className="text-white/80 text-sm">ระบบตรวจสอบสลิปโอนเงิน</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={fetchThunderQuota}
              disabled={isLoadingQuota}
            >
              {isLoadingQuota ? <Spinner size="sm" /> : 'รีเฟรช'}
            </Button>
          </div>

          {isLoadingQuota ? (
            <div className="mt-6 flex items-center justify-center py-8">
              <Spinner size="lg" color="white" />
            </div>
          ) : thunderQuota?.success && thunderQuota.data ? (
            <div className="mt-6 space-y-6">
              {/* Quota Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/80">การใช้งานโควต้า</span>
                  <span className="text-sm font-medium">
                    {thunderQuota.data.usedQuota.toLocaleString()} / {thunderQuota.data.maxQuota.toLocaleString()} ครั้ง
                  </span>
                </div>
                <div className="h-4 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getQuotaColor(thunderQuota.data.usagePercentage)} transition-all duration-500`}
                    style={{ width: `${Math.min(thunderQuota.data.usagePercentage, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-white/80">
                    ใช้ไปแล้ว {thunderQuota.data.usagePercentage.toFixed(1)}%
                  </span>
                  <span className="text-sm font-medium">
                    เหลือ {thunderQuota.data.remainingQuota.toLocaleString()} ครั้ง
                  </span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-xs mb-1">แอปพลิเคชัน</p>
                  <p className="font-semibold truncate">{thunderQuota.data.application}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-xs mb-1">เครดิตคงเหลือ</p>
                  <p className="font-semibold">{thunderQuota.data.currentCredit.toLocaleString()}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-xs mb-1">วันหมดอายุ</p>
                  <p className="font-semibold text-sm">{formatDate(thunderQuota.data.expiredAt)}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-white/60 text-xs mb-1">เหลืออีก</p>
                  <p className={`font-bold text-lg ${thunderQuota.data.daysRemaining <= 7 ? 'text-red-300' : thunderQuota.data.daysRemaining <= 30 ? 'text-yellow-300' : 'text-green-300'}`}>
                    {thunderQuota.data.daysRemaining} วัน
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {(thunderQuota.data.isExpired || thunderQuota.data.isLowQuota || thunderQuota.data.daysRemaining <= 7) && (
                <div className="space-y-2">
                  {thunderQuota.data.isExpired && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/30 rounded-lg">
                      <svg className="w-5 h-5 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-sm font-medium">API Token หมดอายุแล้ว กรุณาต่ออายุ</span>
                    </div>
                  )}
                  {thunderQuota.data.isLowQuota && !thunderQuota.data.isExpired && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-500/30 rounded-lg">
                      <svg className="w-5 h-5 text-yellow-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-sm font-medium">โควต้าเหลือน้อยกว่า 10% กรุณาซื้อเพิ่ม</span>
                    </div>
                  )}
                  {thunderQuota.data.daysRemaining <= 7 && !thunderQuota.data.isExpired && (
                    <div className="flex items-center gap-2 p-3 bg-orange-500/30 rounded-lg">
                      <svg className="w-5 h-5 text-orange-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium">API จะหมดอายุในอีก {thunderQuota.data.daysRemaining} วัน</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-6 p-4 bg-red-500/30 rounded-xl">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">ไม่สามารถดึงข้อมูลโควต้าได้</p>
                  <p className="text-sm text-white/80">{thunderQuota?.error || 'กรุณาตั้งค่า THUNDER_API_TOKEN ใน environment variables'}</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-20 bg-gray-200 rounded"></div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((card, index) => (
              <Link key={index} href={card.link}>
                <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${card.color} text-white`}>
                      {card.icon}
                    </div>
                    <div>
                      <p className="text-gray-500 text-sm">{card.title}</p>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                      <p className="text-xs text-gray-400">{card.subValue}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Pending Payments Alert */}
        {stats?.pendingPayments && stats.pendingPayments > 0 && (
          <Card className="bg-red-50 border-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-red-800">มีรายการชำระเงินรอตรวจสอบ</p>
                  <p className="text-sm text-red-600">{stats.pendingPayments} รายการรอการอนุมัติ</p>
                </div>
              </div>
              <Link href="/admin/payments">
                <Button variant="primary" size="sm">ตรวจสอบเลย</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/admin/users">
            <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                  จัดการผู้ใช้งาน
                </h3>
              </div>
              <p className="text-gray-500 text-sm">เพิ่ม แก้ไข ลบผู้ใช้งาน และให้แพ็คเกจ</p>
            </Card>
          </Link>
          
          <Link href="/admin/payments">
            <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-100 text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                  ตรวจสอบการชำระเงิน
                </h3>
              </div>
              <p className="text-gray-500 text-sm">
                {stats?.pendingPayments ? `มี ${stats.pendingPayments} รายการรอตรวจสอบ` : 'ไม่มีรายการรอตรวจสอบ'}
              </p>
            </Card>
          </Link>
          
          <Link href="/admin/packages">
            <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                  จัดการแพ็คเกจ
                </h3>
              </div>
              <p className="text-gray-500 text-sm">สร้างและจัดการแพ็คเกจ ({stats?.totalPackages || 0} แพ็คเกจ)</p>
            </Card>
          </Link>
          
          <Link href="/admin/line-accounts">
            <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                  บัญชี LINE OA
                </h3>
              </div>
              <p className="text-gray-500 text-sm">ดูบัญชี LINE ทั้งหมดในระบบ</p>
            </Card>
          </Link>
          
          <Link href="/admin/settings">
            <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                  ตั้งค่าระบบ
                </h3>
              </div>
              <p className="text-gray-500 text-sm">ตั้งค่า API, บัญชีธนาคาร, USDT</p>
            </Card>
          </Link>

          <Link href="/admin/history">
            <Card className="hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
                  ประวัติระบบ
                </h3>
              </div>
              <p className="text-gray-500 text-sm">ดูประวัติกิจกรรมทั้งหมดในระบบ</p>
            </Card>
          </Link>
        </div>

        {/* Recent Pending Payments */}
        {recentPayments.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">รายการชำระเงินล่าสุด</h2>
              <Link href="/admin/payments" className="text-primary-600 hover:text-primary-800 text-sm">
                ดูทั้งหมด →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวน</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ประเภท</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentPayments.map((payment) => (
                    <tr key={payment._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(payment.createdAt).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        ฿{payment.amount?.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {payment.paymentType === 'bank_transfer' ? 'โอนเงิน' : 'USDT'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="warning">รอตรวจสอบ</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* System Maintenance */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">การบำรุงรักษาระบบ</h2>
              <p className="text-sm text-gray-500">เครื่องมือสำหรับดูแลรักษาระบบ</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <h3 className="font-medium text-gray-900 mb-2">ล้าง Session หมดอายุ</h3>
              <p className="text-sm text-gray-500 mb-3">ลบ session ที่หมดอายุแล้วออกจากระบบ</p>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={runCleanupSessions}
                isLoading={isRunningMaintenance === 'sessions'}
                loadingText="กำลังทำงาน..."
              >
                เริ่มล้าง
              </Button>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl">
              <h3 className="font-medium text-gray-900 mb-2">ล้าง Quota ค้าง</h3>
              <p className="text-sm text-gray-500 mb-3">ลบ quota reservation ที่ค้างอยู่</p>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={runCleanupReservations}
                isLoading={isRunningMaintenance === 'reservations'}
                loadingText="กำลังทำงาน..."
              >
                เริ่มล้าง
              </Button>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl">
              <h3 className="font-medium text-gray-900 mb-2">อัปเดต Subscription</h3>
              <p className="text-sm text-gray-500 mb-3">อัปเดตสถานะ subscription ที่หมดอายุ</p>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={runExpireSubscriptions}
                isLoading={isRunningMaintenance === 'expire'}
                loadingText="กำลังทำงาน..."
              >
                เริ่มอัปเดต
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
