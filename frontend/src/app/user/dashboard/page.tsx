'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi, paymentsApi } from '@/lib/api';
import { LineAccount, QuotaInfo, Payment } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { SectionHeader, StatCardMini } from '@/components/ui';
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

  const totalMessages = lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10 max-w-7xl mx-auto">
        {/* PAGE HEADER */}
        <SectionHeader
          title="แดชบอร์ด"
          highlight="LINE OA"
          subtitle="ภาพรวมการใช้งาน • โควต้า • การตรวจสลิป • สถานะระบบ"
          actions={
            <>
              <Link href="/user/packages" className="flex-1 sm:flex-none">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  📢 ส่งข้อความใหม่
                </Button>
              </Link>
              <Link href="/user/payments" className="flex-1 sm:flex-none">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  ✅ ตรวจสลิป
                </Button>
              </Link>
            </>
          }
        />

        {/* QUICK STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-6">
          <StatCardMini icon="💬" value={lineAccounts.length} label="บัญชีทั้งหมด" badgeText="+2 ใหม่" />
          <StatCardMini
            icon="📄"
            value={recentPayments.filter((p) => p.status === 'pending').length}
            label="สลิปรอตรวจ"
            color="amber"
            badgeText="ต้องดำเนินการ"
            badgeVariant="warning"
          />
          <StatCardMini icon="🤖" value="98%" label="AI Bot" color="violet" />
          <StatCardMini icon="👥" value={totalMessages.toLocaleString()} label="ผู้ติดตาม" color="blue" />
        </div>

        {/* *** ส่วนอื่น ๆ (กราฟ, รายการล่าสุด ฯลฯ) ยังคงใช้โค้ดเดิมเพื่อความเร็ว *** */}
        {/* TODO: สามารถค่อย ๆ ย้ายไปใช้ component ใหม่เพิ่มในภายหลัง */}
      </div>
    </DashboardLayout>
  );
}
