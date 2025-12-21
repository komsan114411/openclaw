'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, lineAccountsApi, paymentsApi } from '@/lib/api';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalLineAccounts: number;
  totalMessages: number;
  pendingPayments: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [usersRes, lineAccountsRes, paymentsRes] = await Promise.all([
          usersApi.getStatistics(),
          lineAccountsApi.getStatistics(),
          paymentsApi.getAll('pending'),
        ]);

        setStats({
          totalUsers: usersRes.data.statistics?.totalUsers || 0,
          activeUsers: usersRes.data.statistics?.activeUsers || 0,
          totalLineAccounts: lineAccountsRes.data.statistics?.totalAccounts || 0,
          totalMessages: lineAccountsRes.data.statistics?.totalMessages || 0,
          pendingPayments: paymentsRes.data.payments?.length || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'ผู้ใช้ทั้งหมด',
      value: stats?.totalUsers || 0,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: 'bg-blue-500',
    },
    {
      title: 'บัญชี LINE',
      value: stats?.totalLineAccounts || 0,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      color: 'bg-green-500',
    },
    {
      title: 'ข้อความทั้งหมด',
      value: stats?.totalMessages?.toLocaleString() || 0,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-purple-500',
    },
    {
      title: 'รอตรวจสอบ',
      value: stats?.pendingPayments || 0,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-yellow-500',
    },
  ];

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">ภาพรวมระบบ LINE OA Management</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCards.map((card, index) => (
              <div key={index} className="card">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${card.color} text-white`}>
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a href="/admin/users" className="card hover:shadow-md transition-shadow group">
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
              จัดการผู้ใช้งาน
            </h3>
            <p className="text-gray-500 text-sm mt-1">เพิ่ม/แก้ไข/ลบผู้ใช้งาน</p>
          </a>
          <a href="/admin/payments" className="card hover:shadow-md transition-shadow group">
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
              ตรวจสอบการชำระเงิน
            </h3>
            <p className="text-gray-500 text-sm mt-1">
              {stats?.pendingPayments ? `มี ${stats.pendingPayments} รายการรอตรวจสอบ` : 'ไม่มีรายการรอตรวจสอบ'}
            </p>
          </a>
          <a href="/admin/settings" className="card hover:shadow-md transition-shadow group">
            <h3 className="font-semibold text-gray-900 group-hover:text-primary-600">
              ตั้งค่าระบบ
            </h3>
            <p className="text-gray-500 text-sm mt-1">ตั้งค่า API, บัญชีธนาคาร</p>
          </a>
        </div>
      </div>
    </DashboardLayout>
  );
}
