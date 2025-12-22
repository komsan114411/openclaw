'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi, paymentsApi } from '@/lib/api';
import { LineAccount, QuotaInfo, Payment } from '@/types';

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

  const getQuotaColor = () => {
    if (quotaPercentage >= 90) return 'bg-red-500';
    if (quotaPercentage >= 70) return 'bg-yellow-500';
    return 'bg-primary-600';
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case 'verified':
        return 'อนุมัติแล้ว';
      case 'pending':
        return 'รอตรวจสอบ';
      case 'rejected':
        return 'ปฏิเสธ';
      default:
        return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">ยินดีต้อนรับสู่ระบบจัดการ LINE OA</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-500 text-sm">บัญชี LINE</p>
                <p className="text-2xl font-bold text-gray-900">{lineAccounts.length}</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100 text-green-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-500 text-sm">โควต้าคงเหลือ</p>
                <p className="text-2xl font-bold text-gray-900">{quota?.remainingQuota?.toLocaleString() || 0}</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <p className="text-gray-500 text-sm">สลิปที่ตรวจสอบ</p>
                <p className="text-2xl font-bold text-gray-900">
                  {lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quota Card - Enhanced */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">โควต้าของคุณ</h2>
            <Link href="/user/quota" className="text-primary-600 text-sm hover:underline">
              ดูรายละเอียด
            </Link>
          </div>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ) : quota && quota.totalQuota > 0 ? (
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              {/* Circular Progress */}
              <div className="relative w-32 h-32 mx-auto md:mx-0">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    className="text-gray-200"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                    r="56"
                    cx="64"
                    cy="64"
                  />
                  <circle
                    className={quotaPercentage >= 90 ? 'text-red-500' : quotaPercentage >= 70 ? 'text-yellow-500' : 'text-primary-500'}
                    strokeWidth="10"
                    strokeDasharray={`${quotaPercentage * 3.52} 352`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="56"
                    cx="64"
                    cy="64"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{100 - quotaPercentage}%</span>
                  <span className="text-xs text-gray-500">คงเหลือ</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex-1 space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">โควต้าทั้งหมด</span>
                  <span className="font-bold text-gray-900">{quota.totalQuota?.toLocaleString()} สลิป</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-green-700">คงเหลือ</span>
                  <span className="font-bold text-green-700">{quota.remainingQuota?.toLocaleString()} สลิป</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="text-blue-700">ใช้ไปแล้ว</span>
                  <span className="font-bold text-blue-700">{quota.usedQuota?.toLocaleString()} สลิป</span>
                </div>
                {quota.reservedQuota > 0 && (
                  <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                    <span className="text-yellow-700">กำลังประมวลผล</span>
                    <span className="font-bold text-yellow-700">{quota.reservedQuota?.toLocaleString()} สลิป</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-2">ยังไม่มีแพ็คเกจ</h3>
              <p className="text-gray-500 mb-4 text-sm">เลือกซื้อแพ็คเกจเพื่อเริ่มใช้งานตรวจสอบสลิป</p>
              <Link href="/user/packages" className="btn btn-primary">
                ซื้อแพ็คเกจ
              </Link>
            </div>
          )}

          {/* Warning Alerts */}
          {quota && quota.remainingQuota <= 10 && quota.remainingQuota > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
              <svg className="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="font-medium text-yellow-800">โควต้าใกล้หมด!</p>
                <p className="text-sm text-yellow-700">เหลือเพียง {quota.remainingQuota} สลิป</p>
              </div>
              <Link href="/user/packages" className="btn btn-primary text-sm">
                เติมโควต้า
              </Link>
            </div>
          )}
          {quota && quota.remainingQuota === 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="font-medium text-red-800">โควต้าหมดแล้ว!</p>
                <p className="text-sm text-red-700">กรุณาเติมโควต้าเพื่อใช้งานต่อ</p>
              </div>
              <Link href="/user/packages" className="btn btn-primary text-sm">
                ซื้อแพ็คเกจ
              </Link>
            </div>
          )}
        </div>

        {/* LINE Accounts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">บัญชี LINE ของฉัน</h2>
            <Link href="/user/line-accounts" className="text-primary-600 text-sm hover:underline">
              จัดการบัญชี
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : lineAccounts.length > 0 ? (
            <div className="space-y-4">
              {lineAccounts.slice(0, 3).map((account) => (
                <div key={account._id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{account.accountName}</h3>
                    <p className="text-sm text-gray-500">
                      {(account.statistics?.totalMessages || 0).toLocaleString()} ข้อความ · {(account.statistics?.totalSlipsVerified || 0).toLocaleString()} สลิป
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.settings?.enableBot && (
                      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">บอท</span>
                    )}
                    {account.settings?.enableSlipVerification && (
                      <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">สลิป</span>
                    )}
                    <span className={`px-2 py-1 text-xs rounded-full ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {account.isActive ? 'ใช้งาน' : 'ปิด'}
                    </span>
                  </div>
                </div>
              ))}
              {lineAccounts.length > 3 && (
                <Link href="/user/line-accounts" className="block text-center text-primary-600 text-sm hover:underline">
                  ดูบัญชีทั้งหมด ({lineAccounts.length} บัญชี)
                </Link>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 mt-2">ยังไม่มีบัญชี LINE</p>
              <Link href="/user/line-accounts" className="btn btn-primary mt-4">
                เพิ่มบัญชี LINE
              </Link>
            </div>
          )}
        </div>

        {/* Recent Payments */}
        {recentPayments.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">การชำระเงินล่าสุด</h2>
              <Link href="/user/payments" className="text-primary-600 text-sm hover:underline">
                ดูทั้งหมด
              </Link>
            </div>
            <div className="space-y-3">
              {recentPayments.map((payment) => (
                <div key={payment._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">฿{payment.amount?.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(payment.createdAt).toLocaleDateString('th-TH')}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${getPaymentStatusBadge(payment.status)}`}>
                    {getPaymentStatusText(payment.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/user/packages" className="card hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary-100 text-primary-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">ซื้อแพ็คเกจ</h3>
                <p className="text-sm text-gray-500">เติมโควต้าเพื่อใช้งานต่อ</p>
              </div>
            </div>
          </Link>
          <Link href="/user/line-accounts" className="card hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100 text-green-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">เพิ่มบัญชี LINE</h3>
                <p className="text-sm text-gray-500">เชื่อมต่อบัญชี LINE OA ใหม่</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
