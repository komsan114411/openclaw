'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { activityLogsApi } from '@/lib/api';
import { ActivityLog } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';

export default function UserHistoryPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await activityLogsApi.getMy(200);
      setLogs(res.data.logs || []);
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดประวัติการใช้งาน..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-[1600px] mx-auto animate-fade">
        <div className="page-header">
          <div>
            <h1 className="page-title">ประวัติการใช้งาน</h1>
            <p className="page-subtitle">บันทึกการทำรายการที่เกี่ยวข้องกับบัญชีของคุณ</p>
          </div>
          <Button variant="outline" onClick={fetchLogs}>
            รีเฟรช
          </Button>
        </div>

        {error && (
          <Card className="bg-rose-50 border border-rose-200 text-rose-700">
            <div className="flex items-center justify-between gap-4">
              <div className="font-bold">{error}</div>
              <Button variant="ghost" size="sm" onClick={fetchLogs} className="text-rose-700 hover:bg-rose-100">
                ลองใหม่
              </Button>
            </div>
          </Card>
        )}

        {logs.length === 0 ? (
          <EmptyState
            icon="🕒"
            title="ยังไม่มีประวัติ"
            description="เมื่อคุณใช้งานฟีเจอร์ต่าง ๆ ระบบจะบันทึกไว้ที่นี่"
          />
        ) : (
          <Card className="p-0 overflow-hidden" variant="glass">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-white/40 border-b border-white/40">
                    <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">เวลา</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Action</th>
                    <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/40">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-white/50 transition-colors">
                      <td className="px-8 py-5 text-sm text-slate-600 font-medium">
                        {new Date(log.createdAt).toLocaleString('th-TH')}
                      </td>
                      <td className="px-8 py-5 text-xs font-mono font-bold text-slate-700 whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="px-8 py-5 text-sm text-slate-700">
                        {log.message || '-'}
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

