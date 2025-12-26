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
      <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto animate-fade">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">ประวัติการใช้งาน</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium">บันทึกการทำรายการที่เกี่ยวข้องกับบัญชีของคุณ</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="w-full sm:w-auto">
            รีเฟรช
          </Button>
        </div>

        {error && (
          <Card className="bg-rose-50 border border-rose-200 text-rose-700">
            <div className="flex items-center justify-between gap-4">
              <div className="font-bold text-sm">{error}</div>
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
            variant="glass"
          />
        ) : (
          <>
            {/* Desktop Table */}
            <Card className="hidden md:block p-0 overflow-hidden rounded-[2.5rem]" variant="glass">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">เวลา</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Action</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/60 transition-colors group">
                        <td className="px-8 py-5 text-sm text-slate-600 font-bold font-mono">
                          {new Date(log.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-1 rounded-lg uppercase tracking-wide border border-slate-200">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-sm text-slate-600 font-medium">
                          {log.message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {logs.map((log) => (
                <Card key={log._id} variant="glass" className="p-5 border-none shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-wider border border-emerald-100">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    {log.message || 'ไม่มีรายละเอียด'}
                  </p>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

