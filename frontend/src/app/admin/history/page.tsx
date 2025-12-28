'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { activityLogsApi, usersApi } from '@/lib/api';
import { ActivityLog, User } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

export default function AdminHistoryPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [logsRes, usersRes] = await Promise.all([
        activityLogsApi.getAll({ limit: 500 }),
        usersApi.getAll(),
      ]);
      setLogs(logsRes.data.logs || []);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      toast.error('Matrix history synchronization failure');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const userMap = new Map(users.map((u) => [u._id, u.username]));

  const filtered = logs.filter((l) => {
    const text = `${l.action} ${l.message || ''} ${l.entityType || ''} ${l.entityId || ''}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());

    if (selectedCategory === 'all') return matchesSearch;
    if (selectedCategory === 'system') return matchesSearch && l.actorRole === 'system';
    if (selectedCategory === 'admin') return matchesSearch && l.actorRole === 'admin';
    if (selectedCategory === 'user') return matchesSearch && l.actorRole === 'user';
    return matchesSearch;
  });

  const getActionBadge = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create') || act.includes('add')) return <Badge variant="emerald" className="px-2 py-0 border-none font-black text-[9px] uppercase tracking-wider">Create</Badge>;
    if (act.includes('update') || act.includes('edit')) return <Badge variant="indigo" className="px-2 py-0 border-none font-black text-[9px] uppercase tracking-wider">Update</Badge>;
    if (act.includes('delete') || act.includes('remove')) return <Badge variant="rose" className="px-2 py-0 border-none font-black text-[9px] uppercase tracking-wider">Delete</Badge>;
    if (act.includes('auth') || act.includes('login')) return <Badge variant="purple" className="px-2 py-0 border-none font-black text-[9px] uppercase tracking-wider">Auth</Badge>;
    return <Badge variant="slate" className="px-2 py-0 border-none font-black text-[9px] uppercase tracking-wider">Action</Badge>;
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'system': return <span className="text-emerald-500">🤖</span>;
      case 'admin': return <span className="text-amber-500">⚡</span>;
      default: return <span className="text-slate-400">👤</span>;
    }
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-6 md:pb-12">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              ประวัติ<span className="text-[#06C755]">ระบบ</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              บันทึกกิจกรรมทั้งหมดในระบบ
            </p>
          </div>
          <Button
            variant="outline"
            className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs border-emerald-500/20 bg-[#0F1A14] text-slate-400 hover:text-[#06C755] hover:bg-emerald-500/10 mt-4 lg:mt-0"
            onClick={fetchData}
            disabled={isLoading}
          >
            {isLoading ? <span className="animate-spin mr-2">⏳</span> : '↺'} รีเฟรช
          </Button>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
          <Card variant="glass" className="flex-1 p-3 sm:p-4 rounded-2xl sm:rounded-3xl flex items-center gap-3 sm:gap-4 border-none shadow-premium-sm">
            <div className="pl-2 sm:pl-4 text-lg sm:text-xl opacity-20">🔍</div>
            <input
              className="bg-transparent border-none focus:ring-0 w-full text-sm sm:text-lg font-black uppercase tracking-widest placeholder:text-slate-600 text-white"
              placeholder="Search Telemetry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card>
          <div className="flex gap-1 sm:gap-2 p-2 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] overflow-x-auto no-scrollbar">
            {['all', 'system', 'admin', 'user'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 sm:px-8 py-2.5 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap",
                  selectedCategory === cat ? "bg-emerald-500 text-slate-900 shadow-emerald-500/20 shadow-xl" : "text-slate-500 hover:text-white"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <Card className="hidden md:block overflow-hidden" variant="glass" padding="none">
          <div className="table-responsive">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Temporal Index</th>
                  <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Origin Actor</th>
                  <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Protocol Layer</th>
                  <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Operation Target</th>
                  <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Telemetry Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-32">
                      <div className="flex flex-col items-center gap-6 opacity-30">
                        <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Decrypting Ledger...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-32 text-center">
                      <div className="flex flex-col items-center gap-6 opacity-20">
                        <div className="text-7xl">📜</div>
                        <p className="text-sm font-black uppercase tracking-[0.4em]">No matching records found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((log) => (
                    <motion.tr
                      key={log._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group hover:bg-white/[0.01] transition-all duration-300"
                    >
                      <td className="px-10 py-8">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-white">{new Date(log.createdAt).toLocaleDateString('th-TH')}</span>
                          <span className="text-[10px] font-bold text-slate-600">{new Date(log.createdAt).toLocaleTimeString('th-TH')}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 flex items-center justify-center text-sm shadow-inner group-hover:scale-110 transition-transform">
                            {getRoleIcon(log.actorRole)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-white tracking-tight leading-none mb-1">
                              {log.actorRole === 'system'
                                ? 'SYSTEM_DAEMON'
                                : userMap.get(log.actorUserId || '') || log.actorUserId || 'ANONYMOUS'}
                            </p>
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-white/10 text-slate-600 uppercase font-black tracking-widest">{log.actorRole}</Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2">
                          {getActionBadge(log.action)}
                          <span className="font-mono text-[9px] font-black text-slate-700 uppercase tracking-widest">{log.action}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="p-3 bg-white/[0.02] rounded-[1.5rem] border border-white/5 group-hover:bg-white/[0.04] transition-colors">
                          <p className="text-[10px] font-black text-white uppercase tracking-tight mb-1">{log.entityType || 'GLOBAL_SCOPE'}</p>
                          <p className="font-mono text-[9px] text-slate-600 truncate max-w-[120px]">{log.entityId || '---'}</p>
                        </div>
                      </td>
                      <td className="px-10 py-8 max-w-md">
                        <p className="text-xs font-bold text-slate-400 leading-relaxed group-hover:text-emerald-400 transition-colors">
                          {log.message || <span className="italic opacity-30 text-[10px]">NO_DIAGNOSTIC_DATA_PROVIDED</span>}
                        </p>
                        {log.subjectUserId && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Subject:</span>
                            <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/10 uppercase tracking-widest">{userMap.get(log.subjectUserId) || log.subjectUserId}</span>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile Card Layout */}
        <div className="md:hidden space-y-4">
          {isLoading ? (
            [1, 2, 3].map(i => <Card key={i} className="h-32 animate-pulse" variant="glass"><div /></Card>)
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center opacity-30">
              <p className="font-black uppercase tracking-widest text-sm text-white">No records found</p>
            </div>
          ) : (
            filtered.slice(0, 50).map((log) => (
              <motion.div
                key={log._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card variant="glass" className="p-6 relative overflow-hidden group rounded-[2rem]">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 flex items-center justify-center text-sm shadow-inner group-hover:scale-110 transition-transform">
                        {getRoleIcon(log.actorRole)}
                      </div>
                      <div>
                        <p className="text-xs font-black text-white uppercase tracking-tight">
                          {log.actorRole === 'system' ? 'SYSTEM' : userMap.get(log.actorUserId || '') || 'Unknown'}
                        </p>
                        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{log.actorRole}</p>
                      </div>
                    </div>
                    {getActionBadge(log.action)}
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 line-clamp-2 mb-4 group-hover:text-emerald-400 transition-colors">
                    {log.message || log.action}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-[9px] text-slate-700 font-black uppercase tracking-widest">
                      {log.entityType || 'GLOBAL'}
                    </span>
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                      {new Date(log.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-6 opacity-40 hover:opacity-100 transition-opacity duration-700">
          <div className="p-6 bg-white/[0.02] rounded-[2.5rem] border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center text-lg">🏛️</div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Immutable Registry</p>
          </div>
          <div className="p-6 bg-white/[0.02] rounded-[2.5rem] border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center text-lg">🔐</div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Administrative Only</p>
          </div>
          <div className="p-6 bg-white/[0.02] rounded-[2.5rem] border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center text-lg">⚛️</div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Atomic Event Trailing</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
