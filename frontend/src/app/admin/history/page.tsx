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
import { Search, RotateCcw, LayoutGrid, Settings, Users, CreditCard, Box, ShieldAlert, Cpu, UserCircle, Calendar, Hash, MessageSquare, AlertCircle } from 'lucide-react';
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
      toast.error('ไม่สามารถโหลดประวัติได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const userMap = new Map(users.map((u) => [u._id, u.username]));

  // Category definitions for admin view
  const getCategoryForLog = (log: ActivityLog): string => {
    const action = log.action.toLowerCase();
    const entityType = (log.entityType || '').toLowerCase();

    // System Config: settings, config, system operations
    if (action.includes('setting') || action.includes('config') || entityType.includes('setting') || entityType.includes('config')) {
      return 'system_config';
    }
    // User Management: user CRUD, role changes
    if (action.includes('user') || entityType.includes('user') || action.includes('role') || action.includes('block')) {
      return 'user_management';
    }
    // Payment Approval: payment, subscription, package
    if (action.includes('payment') || action.includes('subscription') || action.includes('package') || entityType.includes('payment')) {
      return 'payment_approval';
    }
    // Authentication: login, logout, register
    if (action.includes('login') || action.includes('logout') || action.includes('register') || action.includes('auth')) {
      return 'auth';
    }
    // LINE Account: LINE operations
    if (action.includes('line') || entityType.includes('line')) {
      return 'line_account';
    }
    return 'other';
  };

  const filtered = logs.filter((l) => {
    const text = `${l.action} ${l.message || ''} ${l.entityType || ''} ${l.entityId || ''}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());

    if (selectedCategory === 'all') return matchesSearch;

    // Role-based filters
    if (selectedCategory === 'system') return matchesSearch && l.actorRole === 'system';
    if (selectedCategory === 'admin') return matchesSearch && l.actorRole === 'admin';
    if (selectedCategory === 'user') return matchesSearch && l.actorRole === 'user';

    // Category-based filters
    const logCategory = getCategoryForLog(l);
    if (selectedCategory === 'system_config') return matchesSearch && logCategory === 'system_config';
    if (selectedCategory === 'user_management') return matchesSearch && logCategory === 'user_management';
    if (selectedCategory === 'payment_approval') return matchesSearch && logCategory === 'payment_approval';

    return matchesSearch;
  });

  const getActionBadge = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create') || act.includes('add')) return <Badge variant="emerald" className="px-2 py-0.5 border-none font-black text-[10px] uppercase tracking-wider">สร้าง</Badge>;
    if (act.includes('update') || act.includes('edit')) return <Badge variant="indigo" className="px-2 py-0.5 border-none font-black text-[10px] uppercase tracking-wider">แก้ไข</Badge>;
    if (act.includes('delete') || act.includes('remove')) return <Badge variant="rose" className="px-2 py-0.5 border-none font-black text-[10px] uppercase tracking-wider">ลบ</Badge>;
    if (act.includes('auth') || act.includes('login')) return <Badge variant="purple" className="px-2 py-0.5 border-none font-black text-[10px] uppercase tracking-wider">ยืนยันตัวตน</Badge>;
    return <Badge variant="slate" className="px-2 py-0.5 border-none font-black text-[10px] uppercase tracking-wider">จัดการ</Badge>;
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'system': return <Cpu className="w-4 h-4 text-emerald-500" />;
      case 'admin': return <ShieldAlert className="w-4 h-4 text-amber-500" />;
      default: return <UserCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-6 md:pb-12">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-400 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              ประวัติ<span className="text-[#06C755]">ระบบ</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              บันทึกกิจกรรมทั้งหมดในระบบ
            </p>
          </div>
          <Button
            variant="outline"
            className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs border-emerald-500/20 bg-[#0F1A14] text-slate-400 hover:text-[#06C755] hover:bg-emerald-500/10 mt-4 lg:mt-0"
            onClick={fetchData}
            disabled={isLoading}
          >
            {isLoading ? <div className="animate-spin mr-2 h-4 w-4 border-2 border-slate-400 border-t-transparent rounded-full" /> : <RotateCcw className="w-4 h-4 mr-2" />} รีเฟรช
          </Button>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
          <Card variant="glass" className="flex-1 p-3 sm:p-4 rounded-2xl sm:rounded-3xl flex items-center gap-3 sm:gap-4 border-none shadow-premium-sm">
            <div className="pl-2 sm:pl-4 opacity-30"><Search className="w-5 h-5 text-white" /></div>
            <input
              className="bg-transparent border-none focus:ring-0 w-full text-sm sm:text-lg font-semibold placeholder:text-slate-500 text-white"
              placeholder="ค้นหาประวัติ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card>
          <div className="flex gap-1 sm:gap-2 p-2 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl overflow-x-auto no-scrollbar">
            {[
              { key: 'all', label: 'ทั้งหมด', icon: <LayoutGrid className="w-4 h-4" /> },
              { key: 'system_config', label: 'ตั้งค่าระบบ', icon: <Settings className="w-4 h-4" /> },
              { key: 'user_management', label: 'จัดการผู้ใช้', icon: <Users className="w-4 h-4" /> },
              { key: 'payment_approval', label: 'การชำระเงิน', icon: <CreditCard className="w-4 h-4" /> },
              { key: 'system', label: 'ระบบ', icon: <Cpu className="w-4 h-4" /> },
              { key: 'admin', label: 'แอดมิน', icon: <ShieldAlert className="w-4 h-4" /> },
              { key: 'user', label: 'ผู้ใช้', icon: <UserCircle className="w-4 h-4" /> },
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={cn(
                  "px-3 sm:px-5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2",
                  selectedCategory === cat.key ? "bg-[#06C755] text-white shadow-lg shadow-[#06C755]/20" : "text-slate-500 hover:text-white hover:bg-white/5"
                )}
              >
                <span>{cat.icon}</span>
                <span className="hidden sm:inline">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Card className="hidden md:block overflow-hidden" variant="glass" padding="none">
          <div className="table-responsive">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-[10px] font-black uppercase tracking-widest text-slate-300">วันที่และเวลา</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-[10px] font-black uppercase tracking-widest text-slate-300">ผู้ดำเนินการ</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-[10px] font-black uppercase tracking-widest text-slate-300">ประเภท</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-[10px] font-black uppercase tracking-widest text-slate-300">เป้าหมาย</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-[10px] font-black uppercase tracking-widest text-slate-300">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-32">
                      <div className="flex flex-col items-center gap-6 opacity-30">
                        <div className="w-12 h-12 border-4 border-[#06C755] border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-semibold text-slate-400">กำลังโหลดข้อมูล...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-32 text-center">
                      <div className="flex flex-col items-center gap-6 opacity-40">
                        <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-slate-500">
                          <LayoutGrid className="w-10 h-10" />
                        </div>
                        <p className="text-sm font-semibold text-slate-400">ไม่พบรายการที่ตรงกัน</p>
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
                          <span className="text-xs font-bold text-white flex items-center gap-2">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {new Date(log.createdAt).toLocaleDateString('th-TH')}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 ml-5">{new Date(log.createdAt).toLocaleTimeString('th-TH')}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                            {getRoleIcon(log.actorRole)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white tracking-tight leading-none mb-1">
                              {log.actorRole === 'system'
                                ? 'ระบบอัตโนมัติ'
                                : userMap.get(log.actorUserId || '') || log.actorUserId || 'ผู้เยี่ยมชม'}
                            </p>
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-white/10 text-slate-500 uppercase font-black tracking-widest">{log.actorRole}</Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2 items-start">
                          {getActionBadge(log.action)}
                          <span className="font-mono text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.action}</span>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-xl border border-white/5 group-hover:bg-white/[0.04] transition-colors">
                          <Box className="w-3 h-3 text-slate-500" />
                          <div className="flex flex-col">
                            <p className="text-[10px] font-black text-white uppercase tracking-tight">{log.entityType || 'GLOBAL'}</p>
                            <p className="font-mono text-[9px] text-slate-400 truncate max-w-[100px]">{log.entityId || '---'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8 max-w-md">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-3 h-3 text-slate-500 mt-0.5" />
                          <div>
                            <p className="text-xs font-medium text-slate-300 leading-relaxed group-hover:text-emerald-400 transition-colors">
                              {log.message || <span className="italic opacity-30 text-[10px]">ไม่มีข้อมูลเพิ่มเติม</span>}
                            </p>
                            {log.subjectUserId && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Subject:</span>
                                <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/10 uppercase tracking-widest">{userMap.get(log.subjectUserId) || log.subjectUserId}</span>
                              </div>
                            )}
                          </div>
                        </div>
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
            <div className="py-20 text-center opacity-40">
              <p className="text-sm font-semibold text-slate-400">ไม่พบรายการที่ตรงกัน</p>
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
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 flex items-center justify-center hover:scale-110 transition-transform">
                        {getRoleIcon(log.actorRole)}
                      </div>
                      <div>
                        <p className="text-xs font-black text-white uppercase tracking-tight">
                          {log.actorRole === 'system' ? 'SYSTEM' : userMap.get(log.actorUserId || '') || 'Unknown'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{log.actorRole}</p>
                      </div>
                    </div>
                    {getActionBadge(log.action)}
                  </div>
                  <p className="text-xs font-bold text-slate-300 line-clamp-2 mb-4 group-hover:text-emerald-400 transition-colors">
                    {log.message || log.action}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1">
                      <Box className="w-3 h-3" />
                      {log.entityType || 'GLOBAL'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {new Date(log.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
