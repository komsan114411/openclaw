'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { subscriptionsApi, lineAccountsApi } from '@/lib/api';
import { Subscription, LineAccount } from '@/types';
import toast from 'react-hot-toast';

export default function UserQuotaPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subRes, accountsRes] = await Promise.all([
        subscriptionsApi.getMy(),
        lineAccountsApi.getMyAccounts(),
      ]);
      setSubscription(subRes.data.subscription);
      setAccounts(accountsRes.data.accounts || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const getQuotaPercentage = () => {
    if (!subscription || !subscription.quota) return 0;
    return ((subscription.remainingQuota || 0) / subscription.quota) * 100;
  };

  const getQuotaColor = () => {
    const percentage = getQuotaPercentage();
    if (percentage > 50) return 'bg-green-500';
    if (percentage > 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTotalSlipsVerified = () => {
    return accounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0);
  };

  const getTotalMessages = () => {
    return accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">โควต้าการใช้งาน</h1>
          <p className="text-gray-500">ติดตามการใช้งานโควต้าของคุณ</p>
        </div>

        {/* Quota Overview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">โควต้าสลิป</h2>
            {subscription && (
              <span className="text-sm text-gray-500">
                แพ็คเกจ: {subscription.packageName || 'Standard'}
              </span>
            )}
          </div>

          {subscription ? (
            <>
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">คงเหลือ</span>
                  <span className="font-semibold">
                    {(subscription.remainingQuota || 0).toLocaleString()} / {(subscription.quota || 0).toLocaleString()} สลิป
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all ${getQuotaColor()}`}
                    style={{ width: `${Math.max(getQuotaPercentage(), 2)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1 text-right">
                  ใช้ไปแล้ว {((subscription.quota || 0) - (subscription.remainingQuota || 0)).toLocaleString()} สลิป
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-sm text-gray-500">วันที่เริ่มต้น</p>
                  <p className="font-medium text-gray-900">
                    {subscription.startDate
                      ? new Date(subscription.startDate).toLocaleDateString('th-TH')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">วันหมดอายุ</p>
                  <p className="font-medium text-gray-900">
                    {subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString('th-TH')
                      : '-'}
                  </p>
                </div>
              </div>

              {getQuotaPercentage() < 20 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    ⚠️ โควต้าใกล้หมด! กรุณาเติมเครดิตเพื่อใช้งานต่อ
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-gray-500 mb-4">ยังไม่มี Subscription</p>
              <a href="/user/packages" className="btn btn-primary">
                ดูแพ็คเกจ
              </a>
            </div>
          )}
        </div>

        {/* Usage Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{getTotalSlipsVerified().toLocaleString()}</p>
                <p className="text-sm text-gray-500">สลิปที่ตรวจสอบ</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{getTotalMessages().toLocaleString()}</p>
                <p className="text-sm text-gray-500">ข้อความทั้งหมด</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{accounts.length}</p>
                <p className="text-sm text-gray-500">บัญชี LINE OA</p>
              </div>
            </div>
          </div>
        </div>

        {/* Per Account Usage */}
        {accounts.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">การใช้งานรายบัญชี</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">บัญชี</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">ข้อความ</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">สลิป</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">AI ตอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accounts.map((account) => (
                    <tr key={account._id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{account.accountName}</div>
                        <div className="text-sm text-gray-500">{account.channelId}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {(account.statistics?.totalMessages || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {(account.statistics?.totalSlipsVerified || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {(account.statistics?.totalAiResponses || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
