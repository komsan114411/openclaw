'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, packagesApi, subscriptionsApi } from '@/lib/api';
import { User, Package } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select, Switch } from '@/components/ui/Input';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface GrowthData {
  date: string;
  count: number;
  total: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [growthData, setGrowthData] = useState<GrowthData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGrowth, setIsLoadingGrowth] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState<{
    username: string;
    password: string;
    email: string;
    fullName: string;
    role: 'admin' | 'user';
    forcePasswordChange: boolean;
  }>({
    username: '',
    password: '',
    email: '',
    fullName: '',
    role: 'user',
    forcePasswordChange: true,
  });

  const [editFormData, setEditFormData] = useState<{
    email: string;
    fullName: string;
    role: 'admin' | 'user';
    isActive: boolean;
  }>({
    email: '',
    fullName: '',
    role: 'user',
    isActive: true,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersRes, packagesRes] = await Promise.all([
        usersApi.getAll(),
        packagesApi.getAll(true),
      ]);
      setUsers(usersRes.data.users || []);
      setPackages(packagesRes.data.packages || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchGrowthData = useCallback(async () => {
    setIsLoadingGrowth(true);
    try {
      const res = await usersApi.getGrowth(30);
      setGrowthData(res.data.growth || []);
    } catch (error) {
      console.error('Error fetching growth data:', error);
    } finally {
      setIsLoadingGrowth(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchGrowthData();
  }, [fetchData, fetchGrowthData]);

  const handleCreateUser = async () => {
    if (!formData.username || !formData.password) {
      toast.error('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await usersApi.create(formData);
      if (response.data.success) {
        toast.success('สร้างบัญชีผู้ใช้สำเร็จ');
        setShowCreateModal(false);
        setFormData({
          username: '',
          password: '',
          email: '',
          fullName: '',
          role: 'user',
          forcePasswordChange: true,
        });
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการสร้างผู้ใช้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    setIsProcessing(true);
    try {
      const response = await usersApi.update(selectedUser._id, editFormData);
      if (response.data.success) {
        toast.success('อัปเดตข้อมูลสำเร็จ');
        setShowEditModal(false);
        setSelectedUser(null);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถอัปเดตข้อมูลได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setIsProcessing(true);
    try {
      const response = await usersApi.delete(selectedUser._id);
      if (response.data.success) {
        toast.success('ลบผู้ใช้สำเร็จ');
        setShowDeleteConfirm(false);
        setSelectedUser(null);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถลบผู้ใช้ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBlockToggle = async (user: User) => {
    try {
      if (user.isBlocked) {
        const res = await usersApi.unblock(user._id);
        if (res.data.success) toast.success('ปลดบล็อคสำเร็จ');
      } else {
        const res = await usersApi.block(user._id, 'ระงับโดยผู้ดูแล');
        if (res.data.success) toast.success('บล็อคผู้ใช้สำเร็จ');
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'การดำเนินการล้มเหลว');
    }
  };

  const handleGrantPackage = async () => {
    if (!selectedUser || !selectedPackageId) {
      toast.error('กรุณาเลือกแพ็คเกจ');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await subscriptionsApi.grant(selectedUser._id, selectedPackageId);
      if (response.data.success) {
        toast.success('ให้สิทธิแพ็คเกจสำเร็จ');
        setShowGrantModal(false);
        setSelectedUser(null);
        setSelectedPackageId('');
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditFormData({
      email: user.email || '',
      fullName: user.fullName || '',
      role: user.role,
      isActive: user.isActive,
    });
    setShowEditModal(true);
  };

  const openGrantModal = (user: User) => {
    setSelectedUser(user);
    setSelectedPackageId('');
    setShowGrantModal(true);
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-20">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              จัดการ<span className="text-[#06C755]">ผู้ใช้งาน</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              ศูนย์ควบคุมบัญชีผู้ใช้ทั้งหมดในระบบ
            </p>
          </div>
          <Button
            variant="primary"
            className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 mt-4 lg:mt-0"
            onClick={() => setShowCreateModal(true)}
          >
            + สร้างผู้ใช้ใหม่
          </Button>
        </div>

        <div className="grid-stats">
          <StatCard title="ผู้ใช้ทั้งหมด" value={users.length} icon="👥" color="indigo" variant="glass" />
          <StatCard title="ผู้ดูแลระบบ" value={users.filter(u => u.role === 'admin' && !u.isBlocked).length} icon="🛡️" color="violet" variant="glass" />
          <StatCard title="ผู้ใช้ทั่วไป" value={users.filter(u => u.role === 'user' && !u.isBlocked).length} icon="💎" color="emerald" variant="glass" />
          <StatCard title="ถูกระงับ" value={users.filter(u => u.isBlocked).length} icon="⚠️" color="rose" variant="glass" />
        </div>

        {/* User Growth Chart */}
        <Card variant="glass" className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white">การเติบโตผู้ใช้</h3>
              <p className="text-xs text-slate-400 mt-1">ข้อมูลย้อนหลัง 30 วัน</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchGrowthData}
              isLoading={isLoadingGrowth}
              className="text-slate-400 hover:text-white"
            >
              🔄 รีเฟรช
            </Button>
          </div>

          {isLoadingGrowth ? (
            <div className="h-[300px] flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : growthData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06C755" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06C755" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getDate()}/${date.getMonth() + 1}`;
                    }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    labelFormatter={(label) => {
                      const date = new Date(label);
                      return date.toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      });
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#06C755"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                    name="total"
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8B5CF6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                    name="count"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-500">
              <p className="text-sm">ไม่มีข้อมูลการเติบโต</p>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#06C755]" />
              <span className="text-xs text-slate-400">ผู้ใช้ทั้งหมด</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-violet-500" />
              <span className="text-xs text-slate-400">ผู้ใช้ใหม่/วัน</span>
            </div>
          </div>
        </Card>

        {/* User Registry Table & Mobile Cards */}
        <div className="space-y-6">
          {/* Desktop Table */}
          <Card className="hidden lg:block overflow-hidden" variant="glass" padding="none">
            <div className="table-responsive">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-semibold text-slate-400">ผู้ใช้งาน</th>
                    <th className="px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-semibold text-slate-400">อีเมล</th>
                    <th className="px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-semibold text-slate-400">ระดับสิทธิ์</th>
                    <th className="px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-semibold text-slate-400">สถานะ</th>
                    <th className="px-6 sm:px-8 py-5 sm:py-6 text-[9px] sm:text-[10px] font-semibold text-slate-400 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-10 py-32">
                        <PageLoading transparent message="กำลังเชื่อมต่อฐานข้อมูล..." />
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-10 py-32 text-center">
                        <div className="flex flex-col items-center gap-6 opacity-30">
                          <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-4xl">👤</div>
                          <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-sm">ไม่พบข้อมูลผู้ใช้</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <motion.tr
                        key={user._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-white/[0.01] transition-all duration-300"
                      >
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-6">
                            <div className={cn(
                              "w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner group-hover:scale-110 group-hover:text-emerald-400 transition-all duration-500 bg-slate-900 border border-white/5",
                              user.role === 'admin' ? "text-violet-400" : "text-emerald-400"
                            )}>
                              {user.username[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-white leading-none mb-1.5 group-hover:text-emerald-400 transition-colors uppercase tracking-tight text-lg">{user.username}</p>
                              <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase opacity-70">{user.fullName || 'ไม่ระบุชื่อ'}</p>
                            </div>
                          </div>
                        </td>
                        <p className="font-mono text-xs font-black text-slate-500 lowercase mb-1">{user.email || 'no-email@system.com'}</p>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">การเชื่อมต่อระบบ: สมบูรณ์</p>
                        <td className="px-10 py-8">
                          <Badge
                            variant={user.role === 'admin' ? 'purple' : 'emerald'}
                            className="font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-xl text-[9px] shadow-lg"
                          >
                            {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'}
                          </Badge>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-2 h-2 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]", user.isActive ? "bg-emerald-500 animate-pulse" : "bg-white/10")} />
                              <span className={cn("text-[10px] font-black uppercase tracking-[0.15em]", user.isActive ? "text-emerald-400" : "text-white/20")}>
                                {user.isActive ? 'ออนไลน์' : 'ออฟไลน์'}
                              </span>
                            </div>
                            {user.isBlocked && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-md border border-rose-500/10">ถูกระงับ</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex gap-2.5 justify-end lg:opacity-0 group-hover:opacity-100 transition-all duration-300 lg:translate-x-4 group-hover:translate-x-0">
                            <IconButton
                              variant="ghost"
                              size="md"
                              className={cn("rounded-xl transition-all h-10 w-10 bg-white/5 border border-white/5", user.isBlocked ? "text-emerald-400" : "text-amber-400")}
                              onClick={() => handleBlockToggle(user)}
                              title={user.isBlocked ? 'ปลดบล็อค' : 'ระงับการใช้งาน'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </IconButton>
                            <IconButton
                              variant="ghost"
                              size="md"
                              className="rounded-xl text-violet-400 bg-white/5 border border-white/5 h-10 w-10"
                              onClick={() => openGrantModal(user)}
                              title="ให้สิทธิแพ็คเกจ"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </IconButton>
                            <IconButton
                              variant="ghost"
                              size="md"
                              className="rounded-xl text-blue-400 bg-white/5 border border-white/5 h-10 w-10"
                              onClick={() => openEditModal(user)}
                              title="แก้ไขข้อมูลโปรไฟล์"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </IconButton>
                            <IconButton
                              variant="ghost"
                              size="md"
                              className="rounded-xl text-rose-400 bg-white/5 border border-white/5 hover:bg-rose-500 hover:text-white h-10 w-10"
                              onClick={() => { setSelectedUser(user); setShowDeleteConfirm(true); }}
                              title="ลบข้อมูลถาวร"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </IconButton>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Card Layout (Visible on lg and below) */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full py-20">
                <PageLoading transparent />
              </div>
            ) : users.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center opacity-30 py-20">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl mb-4">👥</div>
                <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white">ไม่พบผู้ใช้</p>
              </div>
            ) : (
              users.map((user) => (
                <Card key={user._id} variant="glass" className="p-8 relative overflow-hidden group rounded-[2.5rem]">
                  <div className="flex items-center gap-4 mb-6">
                    <div className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner bg-slate-900 border border-white/5",
                      user.role === 'admin' ? "text-violet-400" : "text-emerald-400"
                    )}>
                      {user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-white truncate uppercase tracking-tight text-lg leading-none mb-1">{user.username}</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate leading-none">{user.fullName || 'ไม่ระบุชื่อ'}</p>
                    </div>
                    <Badge
                      variant={user.role === 'admin' ? 'purple' : 'emerald'}
                      className="font-black uppercase tracking-widest text-[8px] px-3 py-1 shadow-lg"
                    >
                      {user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้ทั่วไป'}
                    </Badge>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">สถานะการเชื่อมต่อ</span>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full", user.isActive ? "bg-emerald-500" : "bg-white/10")} />
                        <span className={cn("text-[10px] font-black uppercase tracking-widest leading-none", user.isActive ? "text-emerald-400" : "text-slate-600")}>
                          {user.isActive ? 'ออนไลน์' : 'ออฟไลน์'}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-slate-600 truncate px-2 text-center">{user.email || '—'}</p>
                  </div>

                  <div className="grid grid-cols-4 gap-2 bg-white/[0.02] p-2 rounded-2xl border border-white/5">
                    <IconButton variant="ghost" size="sm" onClick={() => handleBlockToggle(user)} className={cn("flex-1 h-12 rounded-xl transition-colors", user.isBlocked ? "text-emerald-400 bg-white/5" : "text-amber-400 bg-white/5")}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg></IconButton>
                    <IconButton variant="ghost" size="sm" onClick={() => openGrantModal(user)} className="flex-1 h-12 rounded-xl text-violet-400 bg-white/5 hover:bg-violet-500 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></IconButton>
                    <IconButton variant="ghost" size="sm" onClick={() => openEditModal(user)} className="flex-1 h-12 rounded-xl text-blue-400 bg-white/5 hover:bg-blue-500 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></IconButton>
                    <IconButton variant="ghost" size="sm" onClick={() => { setSelectedUser(user); setShowDeleteConfirm(true); }} className="flex-1 h-12 rounded-xl text-rose-400 bg-white/5 hover:bg-rose-500 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></IconButton>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Provision User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => !isProcessing && setShowCreateModal(false)}
        title="สร้างผู้ใช้ใหม่"
        subtitle="เพิ่มผู้ใช้ใหม่เข้าสู่ระบบ"
        size="md"
      >
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <Input
              label="ชื่อผู้ใช้"
              placeholder="เช่น john_doe"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
            />
            <Input
              type="password"
              label="รหัสผ่าน"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
            />
          </div>

          <Input
            label="อีเมล"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="user@example.com"
            className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
          />

          <Input
            label="ชื่อ-นามสกุล"
            value={formData.fullName}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            placeholder="ทดสอบ ใจดี"
            className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-end">
            <Select
              label="สิทธิ์ผู้ใช้"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
              className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
            >
              <option value="user" className="bg-slate-900">ผู้ใช้ทั่วไป</option>
              <option value="admin" className="bg-slate-900">ผู้ดูแลระบบ</option>
            </Select>
            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">บังคับเปลี่ยนรหัสผ่าน</span>
              <Switch
                checked={formData.forcePasswordChange}
                onChange={(checked) => setFormData({ ...formData, forcePasswordChange: checked })}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-8">
            <Button variant="ghost" className="flex-1 font-semibold text-sm h-12 rounded-xl" onClick={() => setShowCreateModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button
              variant="primary"
              className="flex-[2] font-semibold text-sm shadow-emerald-500/20 shadow-premium h-12 rounded-xl"
              onClick={handleCreateUser}
              isLoading={isProcessing}
            >
              สร้างผู้ใช้
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !isProcessing && setShowEditModal(false)}
        title={`แก้ไขผู้ใช้: ${selectedUser?.username}`}
        subtitle="แก้ไขข้อมูลโปรไฟล์และสิทธิ์การเข้าถึง"
        size="md"
      >
        <div className="space-y-6 pt-2">
          <Input
            label="อีเมล"
            value={editFormData.email}
            onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
            className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
          />
          <Input
            label="ชื่อ-นามสกุล"
            value={editFormData.fullName}
            onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
            className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-end">
            <Select
              label="สิทธิ์ผู้ใช้"
              value={editFormData.role}
              onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as 'admin' | 'user' })}
              className="bg-white/[0.03] border-white/10 text-white h-12 rounded-xl"
            >
              <option value="user" className="bg-slate-900">ผู้ใช้ทั่วไป</option>
              <option value="admin" className="bg-slate-900">ผู้ดูแลระบบ</option>
            </Select>
            <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">สถานะการใช้งาน</span>
              <Switch
                checked={editFormData.isActive}
                onChange={(checked) => setEditFormData({ ...editFormData, isActive: checked })}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-8">
            <Button variant="ghost" className="flex-1 font-semibold text-sm h-12 rounded-xl" onClick={() => setShowEditModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] font-semibold text-sm h-12 rounded-xl" onClick={handleEditUser} isLoading={isProcessing}>บันทึกการแก้ไข</Button>
          </div>
        </div>
      </Modal>

      {/* Subscription Grant Modal */}
      <Modal
        isOpen={showGrantModal}
        onClose={() => !isProcessing && setShowGrantModal(false)}
        title="ให้สิทธิ์แพ็คเกจ"
        subtitle={`เพิ่มโควต้าให้กับผู้ใช้: ${selectedUser?.username}`}
        size="md"
      >
        <div className="space-y-10 pt-2 pb-2">
          <div className="p-8 sm:p-10 bg-slate-950 rounded-[2.5rem] border border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/[0.05] blur-[80px] rounded-full group-hover:bg-emerald-500/[0.05] transition-colors duration-1000" />

            <div className="relative z-10 space-y-8">
              <Select
                label="เลือกแพ็คเกจ"
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
                className="bg-white/5 border-white/10 text-white h-14 rounded-2xl text-sm font-semibold"
              >
                <option value="" className="bg-slate-900">เลือกแพ็คเกจ</option>
                {packages.filter(p => p.isActive).map((pkg) => (
                  <option key={pkg._id} value={pkg._id} className="bg-slate-900">
                    {pkg.name} | {pkg.slipQuota.toLocaleString()} สลิป
                  </option>
                ))}
              </Select>

              <div className="p-5 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                <p className="text-xs font-medium text-amber-500 leading-relaxed text-center">
                  คำเตือน: การดำเนินการนี้จะเพิ่มโควต้าให้ผู้ใช้ทันทีโดยไม่ผ่านระบบชำระเงิน
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-semibold text-sm text-slate-400" onClick={() => setShowGrantModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button
              variant="primary"
              className="flex-[2] h-14 rounded-2xl font-semibold text-sm shadow-emerald-500/20 shadow-xl"
              onClick={handleGrantPackage}
              isLoading={isProcessing}
            >
              ให้สิทธิ์แพ็คเกจ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Security Deletion Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteUser}
        title="ยืนยันการลบผู้ใช้"
        message={`คำเตือน: คุณกำลังจะลบผู้ใช้ "${selectedUser?.username}" อย่างถาวร ข้อมูลทั้งหมดที่เกี่ยวข้องจะถูกลบและไม่สามารถกู้คืนได้`}
        confirmText="ลบผู้ใช้"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
