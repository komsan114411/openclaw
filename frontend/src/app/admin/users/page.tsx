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
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    fullName: '',
    role: 'user',
    forcePasswordChange: true,
  });

  const [editFormData, setEditFormData] = useState({
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      <div className="space-y-6 md:space-y-12 animate-fade max-w-[1700px] mx-auto pb-20">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-3xl lg:text-5xl font-black text-white tracking-tight leading-tight uppercase">
              จัดการ<span className="text-emerald-400">ผู้ใช้งาน</span>
            </h1>
            <p className="text-slate-400 font-bold text-xs md:text-sm lg:text-lg tracking-wide opacity-80 uppercase">
              ศูนย์ควบคุมสิทธิ์การเข้าถึงและ <span className="text-white">บัญชีผู้ใช้ระบบ</span>
            </p>
          </div>
          <Button
            variant="primary"
            className="w-full md:w-auto h-12 md:h-16 px-6 md:px-10 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs shadow-emerald-500/20 shadow-2xl animate-scale-in"
            onClick={() => setShowCreateModal(true)}
          >
            + <span className="hidden sm:inline">สร้างบัญชีผู้ใช้ใหม่</span><span className="sm:hidden">สร้างใหม่</span>
          </Button>
        </div>

        {/* Aggregated Statistics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-8">
          <StatCard title="ผู้ใช้ทั้งหมด" value={users.length} icon="👥" color="indigo" variant="glass" className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm" />
          <StatCard title="ผู้ดูแลระบบ" value={users.filter(u => u.role === 'admin' && !u.isBlocked).length} icon="🛡️" color="violet" variant="glass" className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm" />
          <StatCard title="ผู้ใช้ทั่วไป" value={users.filter(u => u.role === 'user' && !u.isBlocked).length} icon="💎" color="emerald" variant="glass" className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm" />
          <StatCard title="ถูกระงับ" value={users.filter(u => u.isBlocked).length} icon="⚠️" color="rose" variant="glass" className="rounded-xl md:rounded-[2.5rem] border-none shadow-premium-sm" />
        </div>

        {/* User Registry Table & Mobile Cards */}
        <div className="space-y-6">
          {/* Desktop Table */}
          <Card className="hidden lg:block overflow-hidden p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3.5rem]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">ชื่อผู้ใช้ / โปรไฟล์</th>
                    <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">การติดต่อ</th>
                    <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">บทบาท</th>
                    <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">สถานะระบบ</th>
                    <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
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
                        className="group hover:bg-white transition-all duration-300"
                      >
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-6">
                            <div className={cn(
                              "w-16 h-16 rounded-[2rem] flex items-center justify-center font-black text-xl shadow-inner group-hover:scale-110 transition-transform duration-500",
                              user.role === 'admin' ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"
                            )}>
                              {user.username[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 leading-none mb-1.5 group-hover:text-emerald-600 transition-colors uppercase tracking-tight text-lg">{user.username}</p>
                              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase opacity-70">{user.fullName || 'Unidentified Personnel'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <p className="font-mono text-xs font-black text-slate-500 lowercase opacity-60 mb-1">{user.email || 'no-email@system.com'}</p>
                          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">การเชื่อมต่อ: เสถียร</p>
                        </td>
                        <td className="px-10 py-8">
                          <Badge
                            variant={user.role === 'admin' ? 'indigo' : 'emerald'}
                            className="font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-xl text-[10px]"
                          >
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("w-3 h-3 rounded-full shadow-lg", user.isActive ? "bg-emerald-500 shadow-emerald-500/50 animate-pulse" : "bg-slate-300")} />
                              <span className={cn("text-[11px] font-black uppercase tracking-[0.15em]", user.isActive ? "text-emerald-600" : "text-slate-400")}>
                                {user.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                              </span>
                            </div>
                            {user.isBlocked && (
                              <div className="flex items-center gap-1.5 text-rose-500">
                                <span className="text-[9px] font-black uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-md">ถูกระงับชั่วคราว</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex gap-2.5 justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                            <IconButton
                              variant="glass"
                              size="md"
                              className={cn("rounded-2xl transition-all h-12 w-12", user.isBlocked ? "text-emerald-500" : "text-amber-500")}
                              onClick={() => handleBlockToggle(user)}
                              title={user.isBlocked ? 'ปลดบล็อค' : 'ระงับการใช้งาน'}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </IconButton>
                            <IconButton
                              variant="glass"
                              size="md"
                              className="rounded-2xl text-indigo-500 h-12 w-12"
                              onClick={() => openGrantModal(user)}
                              title="ให้สิทธิแพ็คเกจ"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </IconButton>
                            <IconButton
                              variant="glass"
                              size="md"
                              className="rounded-2xl text-blue-500 h-12 w-12"
                              onClick={() => openEditModal(user)}
                              title="แก้ไขข้อมูลโปรไฟล์"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </IconButton>
                            <IconButton
                              variant="glass"
                              size="md"
                              className="rounded-2xl text-rose-500 hover:bg-rose-500 hover:text-white h-12 w-12"
                              onClick={() => { setSelectedUser(user); setShowDeleteConfirm(true); }}
                              title="ลบข้อมูลถาวร"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
              [1, 2, 3, 4].map(i => <Card key={i} className="h-64 animate-pulse bg-white/50 rounded-[2.5rem]"><div /></Card>)
            ) : users.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-30">
                <p className="font-black uppercase tracking-widest text-sm">ไม่พบข้อมูลผู้ใช้</p>
              </div>
            ) : (
              users.map((user) => (
                <Card key={user._id} variant="glass" className="p-8 relative overflow-hidden group rounded-[3rem] border-none shadow-premium-sm">
                  <div className="flex items-center gap-4 mb-5">
                    <div className={cn(
                      "w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-xl shadow-inner",
                      user.role === 'admin' ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"
                    )}>
                      {user.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-slate-900 truncate uppercase tracking-tight text-lg">{user.username}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{user.fullName || 'No Name'}</p>
                    </div>
                    <Badge
                      variant={user.role === 'admin' ? 'indigo' : 'emerald'}
                      className="font-black uppercase tracking-widest text-[9px] px-3 py-1"
                    >
                      {user.role}
                    </Badge>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-white/50">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">สถานะ</span>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", user.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", user.isActive ? "text-emerald-600" : "text-slate-400")}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-mono text-slate-400 truncate px-2">{user.email || '—'}</p>
                  </div>

                  <div className="grid grid-cols-4 gap-3 bg-slate-50/30 p-2 rounded-[2rem] border border-white/50">
                    <IconButton variant="glass" size="sm" onClick={() => handleBlockToggle(user)} className={cn("flex-1 h-12 rounded-2xl", user.isBlocked ? "text-emerald-500" : "text-amber-500")}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg></IconButton>
                    <IconButton variant="glass" size="sm" onClick={() => openGrantModal(user)} className="flex-1 h-12 rounded-2xl text-indigo-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></IconButton>
                    <IconButton variant="glass" size="sm" onClick={() => openEditModal(user)} className="flex-1 h-12 rounded-2xl text-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></IconButton>
                    <IconButton variant="glass" size="sm" onClick={() => { setSelectedUser(user); setShowDeleteConfirm(true); }} className="flex-1 h-12 rounded-2xl text-rose-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></IconButton>
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
        title="สร้างบัญชีผู้ใช้ใหม่"
        size="md"
      >
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <Input
              label="ชื่อผู้ใช้"
              placeholder="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
            <Input
              type="password"
              label="รหัสผ่าน"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <Input
            label="อีเมล"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="node@network.com"
          />

          <Input
            label="ชื่อ-นามสกุล"
            value={formData.fullName}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            placeholder="John Doe"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-end">
            <Select
              label="สิทธิ์การใช้งาน"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="user">ผู้ใช้ทั่วไป</option>
              <option value="admin">ผู้ดูแลระบบ</option>
            </Select>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">บังคับเปลี่ยนรหัสผ่าน</span>
              <Switch
                checked={formData.forcePasswordChange}
                onChange={(checked) => setFormData({ ...formData, forcePasswordChange: checked })}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowCreateModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button
              variant="primary"
              className="flex-[2] font-black tracking-widest uppercase shadow-emerald-500/20 shadow-premium"
              onClick={handleCreateUser}
              isLoading={isProcessing}
            >
              ยืนยันการสร้าง
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !isProcessing && setShowEditModal(false)}
        title={`แก้ไขข้อมูล: ${selectedUser?.username}`}
        size="md"
      >
        <div className="space-y-6 pt-2">
          <Input
            label="อีเมล"
            value={editFormData.email}
            onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
          />
          <Input
            label="ชื่อ-นามสกุล"
            value={editFormData.fullName}
            onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-end">
            <Select
              label="แก้ไขสิทธิ์"
              value={editFormData.role}
              onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
            >
              <option value="user">ผู้ใช้ทั่วไป</option>
              <option value="admin">ผู้ดูแลระบบ</option>
            </Select>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">สถานะการใช้งาน</span>
              <Switch
                checked={editFormData.isActive}
                onChange={(checked) => setEditFormData({ ...editFormData, isActive: checked })}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowEditModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] font-black tracking-widest uppercase" onClick={handleEditUser} isLoading={isProcessing}>บันทึกการเปลี่ยนแปลง</Button>
          </div>
        </div>
      </Modal>

      {/* Subscription Grant Modal */}
      <Modal
        isOpen={showGrantModal}
        onClose={() => !isProcessing && setShowGrantModal(false)}
        title={`เพิ่มแพ็คเกจ: ${selectedUser?.username}`}
        size="md"
      >
        <div className="space-y-8 pt-2">
          <div className="p-6 bg-slate-900 text-white rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-4xl font-black italic">ASSET GRANT</div>
            <Select
              label="เลือกแพ็คเกจ"
              value={selectedPackageId}
              onChange={(e) => setSelectedPackageId(e.target.value)}
              className="bg-white/10 border-white/10 text-white"
            >
              <option value="">เลือกแพ็คเกจ</option>
              {packages.filter(p => p.isActive).map((pkg) => (
                <option key={pkg._id} value={pkg._id} className="text-slate-900">
                  {pkg.name} • {pkg.slipQuota.toLocaleString()} สลิป
                </option>
              ))}
            </Select>
            <p className="mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              คำเตือน: การดำเนินการนี้จะเป็นการเพิ่มแพ็คเกจให้กับผู้ใช้โดยตรงโดยไม่ต้องชำระเงิน
            </p>
          </div>

          <div className="flex gap-4">
            <Button variant="ghost" className="flex-1 text-slate-400 font-bold" onClick={() => setShowGrantModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button
              variant="primary"
              className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest shadow-emerald-500/20 shadow-premium"
              onClick={handleGrantPackage}
              isLoading={isProcessing}
            >
              ยืนยันการเพิ่มแพ็คเกจ
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
