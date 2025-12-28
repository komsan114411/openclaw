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
        <div className="page-header relative z-10 flex-col sm:flex-row items-start sm:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <h1 className="page-title-responsive">
              LINE OA <span className="text-[#06C755]">Dashboard</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Overview & Analytics for Official Account System
            </p>
          </div>
          <div className="flex gap-3 mt-6 sm:mt-0">
            <Button
              variant="outline"
              size="lg"
              onClick={fetchLogs}
              className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs border-white/10 bg-white/[0.03] hover:bg-white/5 text-white"
            >
              Filter View
            </Button>
            <Button variant="primary" className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048]">
              + New Broadcast
            </Button>
          </div>
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
            <Card className="hidden md:block p-0 overflow-hidden rounded-[2.5rem] border border-white/5" variant="glass">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Timestamp</th>
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Protocol Action</th>
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Ledger Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {logs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-8 py-6 text-sm text-slate-400 font-bold font-mono">
                          {new Date(log.createdAt).toLocaleString('th-TH')}
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl uppercase tracking-widest border border-emerald-500/10 shadow-emerald-500/5 shadow-lg">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-sm text-slate-500 font-black tracking-tight uppercase">
                          {log.message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {logs.map((log) => (
                <Card key={log._id} variant="glass" className="p-8 border border-white/5 shadow-2xl rounded-[2rem]">
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl uppercase tracking-widest border border-emerald-500/10">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono font-black uppercase whitespace-nowrap pt-1">
                      {new Date(log.createdAt).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-black uppercase tracking-tight">
                    {log.message || 'NO_DETAILS_RECORDED'}
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

