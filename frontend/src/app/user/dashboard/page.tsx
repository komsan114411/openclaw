'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi } from '@/lib/api';
import { LineAccount, QuotaInfo } from '@/types';

export default function UserDashboard() {
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, quotaRes] = await Promise.all([
          lineAccountsApi.getAll(),
          subscriptionsApi.getQuota(),
        ]);

        setLineAccounts(accountsRes.data.accounts || []);
        setQuota(quotaRes.data.quota || null);
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">ยินดีต้อนรับสู่ระบบจัดการ LINE OA</p>
        </div>

        {/* Quota Card */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">โควต้าของคุณ</h2>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ) : quota ? (
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>ใช้ไป {quota.usedQuota} จาก {quota.totalQuota} สลิป</span>
                <span>เหลือ {quota.remainingQuota} สลิป</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-primary-600 h-4 rounded-full transition-all"
                  style={{ width: `${quotaPercentage}%` }}
                ></div>
              </div>
              {!quota.hasQuota && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-yellow-800 text-sm">
                  โควต้าหมดแล้ว{' '}
                  <a href="/user/packages" className="font-medium underline">
                    ซื้อแพ็คเกจเพิ่ม
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 mb-4">คุณยังไม่มีแพ็คเกจ</p>
              <a href="/user/packages" className="btn btn-primary">
                ซื้อแพ็คเกจ
              </a>
            </div>
          )}
        </div>

        {/* LINE Accounts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">บัญชี LINE ของฉัน</h2>
            <a href="/user/line-accounts" className="text-primary-600 text-sm hover:underline">
              ดูทั้งหมด
            </a>
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
                      {account.statistics?.totalMessages || 0} ข้อความ · {account.statistics?.totalSlipsVerified || 0} สลิป
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {account.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 mt-2">ยังไม่มีบัญชี LINE</p>
              <a href="/user/line-accounts" className="btn btn-primary mt-4">
                เพิ่มบัญชี LINE
              </a>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
