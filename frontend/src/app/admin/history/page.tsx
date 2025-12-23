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
      <div className="space-y-12 animate-fade max-w-[1500px] mx-auto pb-12">

        {/* Audit Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter leading-none">System Audit Registry</h1>
              <Badge variant="emerald" className="px-2 py-0.5 font-black text-[10px] uppercase tracking-widest">Live Trace</Badge>
            </div>
            <p className="text-slate-500 font-medium text-lg">Immutable chronological ledger of all organizational operations and signal events.</p>
          </div>
          <Button variant="outline" className="rounded-2xl border-slate-200 hover:bg-slate-50 font-black uppercase tracking-widest text-[11px] h-12 px-6" onClick={fetchData} disabled={isLoading}>
            {isLoading ? <span className="animate-spin mr-2">⏳</span> : '↺'} Refresh Ledger
          </Button>
        </div>

        {/* Filters & Insight */}
        <div className="flex flex-col xl:flex-row gap-6">
          <Card className="flex-1 p-4 bg-white/40 backdrop-blur-xl border-none shadow-premium-sm rounded-3xl flex items-center gap-4">
            <div className="pl-4 text-xl opacity-20">🔍</div>
            <input
              className="bg-transparent border-none focus:ring-0 w-full text-lg font-medium placeholder:text-slate-300 text-slate-900"
              placeholder="Query transaction signature, entity ID, or specific event detail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card>
          <div className="flex gap-2 p-2 bg-slate-100/50 backdrop-blur-md rounded-3xl">
            {['all', 'system', 'admin', 'user'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                  selectedCategory === cat ? "bg-slate-900 text-white shadow-xl" : "text-slate-400 hover:bg-white hover:text-slate-600"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Audit Table */}
        <Card className="overflow-hidden p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3.5rem]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Timestamp</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Subject Actor</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Operation Type</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Target Entity</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Diagnostic Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
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
                      className="group hover:bg-slate-50/80 transition-all duration-300"
                    >
                      <td className="px-10 py-8">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-900">{new Date(log.createdAt).toLocaleDateString('th-TH')}</span>
                          <span className="text-[10px] font-bold text-slate-400">{new Date(log.createdAt).toLocaleTimeString('th-TH')}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-sm shadow-inner group-hover:scale-110 transition-transform">
                            {getRoleIcon(log.actorRole)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 tracking-tight leading-none mb-1">
                              {log.actorRole === 'system'
                                ? 'SYSTEM_DAEMON'
                                : userMap.get(log.actorUserId || '') || log.actorUserId || 'ANONYMOUS'}
                            </p>
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-slate-200 text-slate-400 uppercase font-black tracking-widest">{log.actorRole}</Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2">
                          {getActionBadge(log.action)}
                          <span className="font-mono text-[10px] font-bold text-slate-500 opacity-60 uppercase">{log.action}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-white transition-colors border border-transparent group-hover:border-slate-100">
                          <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight mb-1">{log.entityType || 'GLOBAL_SCOPE'}</p>
                          <p className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]">{log.entityId || '---'}</p>
                        </div>
                      </td>
                      <td className="px-10 py-8 max-w-md">
                        <p className="text-xs font-medium text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                          {log.message || <span className="italic opacity-30 text-[10px]">NO_DIAGNOSTIC_DATA_PROVIDED</span>}
                        </p>
                        {log.subjectUserId && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Subject:</span>
                            <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg">{userMap.get(log.subjectUserId) || log.subjectUserId}</span>
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

        {/* Info Legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-60 grayscale hover:grayscale-0 transition-all duration-700">
          <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-2xl shadow-premium-sm flex items-center justify-center">🏛️</div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Immutable Governance Registry</p>
          </div>
          <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-2xl shadow-premium-sm flex items-center justify-center">🔐</div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Authorized Personnel Only</p>
          </div>
          <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-2xl shadow-premium-sm flex items-center justify-center">⚛️</div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Atomic Event Trailing</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
