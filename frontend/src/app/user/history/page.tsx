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
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              ประวัติการ<span className="text-[#06C755]">ใช้งาน</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              ตรวจสอบประวัติการใช้งานระบบทั้งหมดของคุณ
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Button
              variant="outline"
              size="lg"
              onClick={fetchLogs}
              className="flex-1 sm:flex-none h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all"
            >
              🔄 รีเฟรช
            </Button>
            <Button variant="primary" className="flex-1 sm:flex-none h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048] transition-all">
              🔍 กรองข้อมูล
            </Button>
          </div>
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

        {logs.length === 0 ? (
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
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">วันที่และเวลา</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">การดำเนินการ</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {logs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-xs sm:text-sm text-slate-400 font-semibold">
                          {new Date(log.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6">
                          <span className="text-[9px] sm:text-[10px] font-semibold text-[#06C755] bg-[#06C755]/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-[#06C755]/10">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-xs sm:text-sm text-slate-300 font-semibold">
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
              {logs.map((log) => (
                <Card key={log._id} variant="glass" className="p-4 sm:p-6 border border-white/5 shadow-2xl rounded-xl sm:rounded-2xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <span className="text-[9px] sm:text-[10px] font-semibold text-[#06C755] bg-[#06C755]/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-[#06C755]/10">
                      {log.action}
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono font-semibold whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-semibold">
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

