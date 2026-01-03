'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { activityLogsApi } from '@/lib/api';
import { ActivityLog } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';

// Personal activity types that users should see
const PERSONAL_ACTIONS = [
  'login', 'logout', 'register',
  'password_change', 'change_password',
  'profile_update', 'update_profile',
  'line_account_create', 'line_account_update', 'line_account_delete',
  'payment_submit', 'payment_create',
  'subscription_activate', 'subscription_expire',
];

// Map action to Thai label
const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    login: 'เข้าสู่ระบบ',
    logout: 'ออกจากระบบ',
    register: 'สมัครสมาชิก',
    password_change: 'เปลี่ยนรหัสผ่าน',
    change_password: 'เปลี่ยนรหัสผ่าน',
    profile_update: 'อัปเดตโปรไฟล์',
    update_profile: 'อัปเดตโปรไฟล์',
    line_account_create: 'เพิ่มบัญชี LINE',
    line_account_update: 'แก้ไขบัญชี LINE',
    line_account_delete: 'ลบบัญชี LINE',
    payment_submit: 'ส่งสลิปชำระเงิน',
    payment_create: 'สร้างรายการชำระเงิน',
    subscription_activate: 'เปิดใช้งานแพ็คเกจ',
    subscription_expire: 'แพ็คเกจหมดอายุ',
  };
  return labels[action.toLowerCase()] || action;
};

// Get icon for action type
const getActionIcon = (action: string): string => {
  const act = action.toLowerCase();
  if (act.includes('login') || act.includes('logout') || act.includes('register')) return '🔐';
  if (act.includes('password')) return '🔑';
  if (act.includes('profile')) return '👤';
  if (act.includes('line')) return '💬';
  if (act.includes('payment')) return '💳';
  if (act.includes('subscription')) return '📦';
  return '📝';
};

export default function UserHistoryPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await activityLogsApi.getMy(200);
      // Filter to show only personal activities (exclude system-level logs)
      const personalLogs = (res.data.logs || []).filter((log: ActivityLog) => {
        const action = log.action.toLowerCase();
        return PERSONAL_ACTIONS.some(pa => action.includes(pa.toLowerCase()));
      });
      setLogs(personalLogs);
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'ไม่สามารถโหลดประวัติได้';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Filter logs by type
  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    const action = log.action.toLowerCase();
    if (filter === 'auth') return action.includes('login') || action.includes('logout') || action.includes('register') || action.includes('password');
    if (filter === 'line') return action.includes('line');
    if (filter === 'payment') return action.includes('payment') || action.includes('subscription');
    return true;
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดประวัติการใช้งาน..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto animate-fade">
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              ประวัติการ<span className="text-[#06C755]">ใช้งาน</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              กิจกรรมส่วนตัวของคุณ (เข้าสู่ระบบ, เปลี่ยนรหัสผ่าน, แก้ไขบัญชี LINE)
            </p>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={fetchLogs}
            className="h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all"
          >
            🔄 รีเฟรช
          </Button>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 p-2 bg-white/[0.02] border border-white/5 rounded-2xl overflow-x-auto">
          {[
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'auth', label: '🔐 บัญชี' },
            { key: 'line', label: '💬 LINE' },
            { key: 'payment', label: '💳 การชำระเงิน' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setFilter(cat.key)}
              className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                filter === cat.key
                  ? 'bg-[#06C755] text-white shadow-lg shadow-[#06C755]/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {error && (
          <Card className="bg-rose-500/5 border border-rose-500/20 text-rose-400 mb-4 sm:mb-6" variant="glass">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="font-semibold text-xs sm:text-sm">{error}</div>
              <Button variant="ghost" size="sm" onClick={fetchLogs} className="text-rose-400 hover:bg-rose-500/10 text-xs sm:text-sm">
                ลองใหม่
              </Button>
            </div>
          </Card>
        )}

        {filteredLogs.length === 0 ? (
          <Card variant="glass" className="mt-4 sm:mt-6">
            <EmptyState
              icon="🕒"
              title="ยังไม่มีประวัติ"
              description="เมื่อคุณใช้งานฟีเจอร์ต่าง ๆ ระบบจะบันทึกไว้ที่นี่"
              variant="glass"
            />
          </Card>
        ) : (
          <>
            {/* Desktop Table */}
            <Card className="hidden md:block p-0 overflow-hidden rounded-xl sm:rounded-2xl border border-white/5" variant="glass">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 text-left text-[10px] font-semibold text-slate-400">วันที่และเวลา</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 text-left text-[10px] font-semibold text-slate-400">กิจกรรม</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 text-left text-[10px] font-semibold text-slate-400">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 text-sm text-slate-400 font-medium">
                          {new Date(log.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getActionIcon(log.action)}</span>
                            <span className="text-sm font-semibold text-white">
                              {getActionLabel(log.action)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 text-sm text-slate-300 font-medium">
                          {log.message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 sm:space-y-4">
              {filteredLogs.map((log) => (
                <Card key={log._id} variant="glass" className="p-4 sm:p-5 border border-white/5 rounded-xl">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getActionIcon(log.action)}</span>
                      <span className="text-sm font-semibold text-white">
                        {getActionLabel(log.action)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {log.message || 'ไม่มีรายละเอียด'}
                  </p>
                </Card>
              ))}
            </div>

            {/* Summary */}
            <div className="text-center text-sm text-slate-500 mt-4">
              แสดง {filteredLogs.length} รายการ
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

