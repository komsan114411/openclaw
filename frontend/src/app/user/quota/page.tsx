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
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">โควต้าการใช้งาน</h1>
            <p className="page-subtitle">ติดตามการใช้งานโควต้าของคุณ</p>
          </div>
          <Link href="/user/packages">
            <Button variant="primary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              เติมโควต้า
            </Button>
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid-stats">
          <StatCard
            title="โควต้าคงเหลือ"
            value={(subscription?.remainingQuota || 0).toLocaleString()}
            color="emerald"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <StatCard
            title="สลิปที่ตรวจสอบ"
            value={getTotalSlipsVerified().toLocaleString()}
            color="blue"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
          <StatCard
            title="ข้อความทั้งหมด"
            value={getTotalMessages().toLocaleString()}
            color="violet"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          />
          <StatCard
            title="เหลืออีก"
            value={`${daysRemaining} วัน`}
            color={daysRemaining < 7 ? 'rose' : 'amber'}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Quota Progress */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">โควต้าสลิป</h3>
              {subscription && (
                <p className="text-sm text-gray-500">แพ็คเกจ: {subscription.packageName || 'Standard'}</p>
              )}
            </div>
            {subscription && (
              <Badge
                variant={getQuotaPercentage() > 50 ? 'success' : getQuotaPercentage() > 20 ? 'warning' : 'error'}
                size="lg"
              >
                {getQuotaPercentage()}% คงเหลือ
              </Badge>
            )}
          </div>

          {subscription ? (
            <>
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">คงเหลือ</span>
                  <span className="font-semibold text-gray-900">
                    {(subscription.remainingQuota || 0).toLocaleString()} / {(subscription.quota || 0).toLocaleString()} สลิป
                  </span>
                </div>
                <div className="relative">
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${getQuotaColor()}`}
                      style={{ width: `${Math.max(getQuotaPercentage(), 2)}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-right">
                  ใช้ไปแล้ว {usedQuota.toLocaleString()} สลิป
                </p>
              </div>

              {/* Date Info */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">วันที่เริ่มต้น</p>
                  <p className="font-semibold text-gray-900">
                    {subscription.startDate
                      ? new Date(subscription.startDate).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                      : '-'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">วันหมดอายุ</p>
                  <p className="font-semibold text-gray-900">
                    {subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Warning */}
              {getQuotaPercentage() < 20 && (
                <div className="mt-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl flex items-center gap-4">
                  <div className="p-2 bg-yellow-100 rounded-lg flex-shrink-0">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-800">โควต้าใกล้หมด!</p>
                    <p className="text-sm text-yellow-600">เติมโควต้าเพื่อใช้งานต่อเนื่อง</p>
                  </div>
                  <Link href="/user/packages">
                    <Button variant="warning" size="sm">
                      เติมโควต้า
                    </Button>
                  </Link>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              title="ยังไม่มี Subscription"
              description="เลือกแพ็คเกจเพื่อเริ่มต้นใช้งาน"
              action={
                <Link href="/user/packages">
                  <Button variant="primary">ดูแพ็คเกจ</Button>
                </Link>
              }
            />
          )}
        </Card>

        {/* Per Account Usage */}
        {accounts.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">การใช้งานรายบัญชี</h3>
                <p className="text-sm text-gray-500">{accounts.length} บัญชี LINE OA</p>
              </div>
            </div>

            <div className="overflow-x-auto -mx-6">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      บัญชี
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      ข้อความ
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      สลิป
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      AI ตอบ
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      สถานะ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accounts.map((account) => (
                    <tr key={account._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-bold">
                            {account.accountName?.charAt(0).toUpperCase() || 'L'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{account.accountName}</p>
                            <p className="text-sm text-gray-500 font-mono">{account.channelId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-semibold text-gray-900">
                          {(account.statistics?.totalMessages || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-semibold text-gray-900">
                          {(account.statistics?.totalSlipsVerified || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-semibold text-gray-900">
                          {(account.statistics?.totalAiResponses || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={account.isActive ? 'success' : 'secondary'} size="sm">
                          {account.isActive ? 'ใช้งาน' : 'ปิด'}
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
