'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, usersApi, systemSettingsApi } from '@/lib/api';
import { LineAccount, User } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { Input, Select, Textarea, Switch } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  Bot,
  FileCheck,
  MessageSquare,
  Activity,
  CreditCard,
  Search,
  Plus,
  Settings,
  Edit,
  Trash2,
  Copy,
  User as UserIcon,
  Shield,
  Smartphone,
  ExternalLink,
  Power,
  Eye,
  MoreVertical
} from 'lucide-react';

interface ExtendedLineAccount extends LineAccount {
  owner?: {
    username: string;
    email?: string;
  };
}

export default function AdminLineAccountsPage() {
  const [accounts, setAccounts] = useState<ExtendedLineAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<ExtendedLineAccount | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('');

  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
    ownerId: '',
  });

  const [settingsData, setSettingsData] = useState({
    enableBot: false,
    enableAi: false,
    enableSlipVerification: false,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    slipImmediateMessage: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    customQuotaExceededMessage: '',
    customBotDisabledMessage: '',
    customSlipDisabledMessage: '',
    customAiDisabledMessage: '',
    customDuplicateSlipMessage: '',
    customSlipErrorMessage: '',
    customSlipSuccessMessage: '',
    sendMessageWhenBotDisabled: 'default' as string,
    sendMessageWhenSlipDisabled: 'default' as string,
    sendMessageWhenAiDisabled: 'default' as string,
  });

  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchPublicBaseUrl = async () => {
    try {
      const res = await systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} }));
      setPublicBaseUrl(res.data.publicBaseUrl || '');
    } catch {
      setPublicBaseUrl('');
    }
  };

  const getWebhookUrl = (channelId: string) => {
    const base = publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '') || '';
    const normalized = base.replace(/\/+$/, '');
    return `${normalized}/api/webhook/line/${channelId}`;
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsRes, usersRes] = await Promise.all([
        lineAccountsApi.getAll(),
        usersApi.getAll(),
      ]);

      const usersMap = new Map(usersRes.data.users?.map((u: User) => [u._id, u]) || []);
      const accountsWithOwner = (accountsRes.data.accounts || []).map((acc: LineAccount) => ({
        ...acc,
        owner: usersMap.get(acc.ownerId) ? {
          username: (usersMap.get(acc.ownerId) as User).username,
          email: (usersMap.get(acc.ownerId) as User).email,
        } : undefined,
      }));

      setAccounts(accountsWithOwner);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPublicBaseUrl();
  }, [fetchData]);

  const handleAddAccount = async () => {
    if (!formData.accountName || !formData.channelId || !formData.channelSecret || !formData.accessToken) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }

    setIsProcessing(true);
    try {
      await lineAccountsApi.create({
        ...formData,
        ownerId: formData.ownerId || undefined,
      });
      toast.success('เพิ่มบัญชีสำเร็จ');
      setShowAddModal(false);
      setFormData({ accountName: '', channelId: '', channelSecret: '', accessToken: '', description: '', ownerId: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถเพิ่มบัญชีได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      await lineAccountsApi.update(selectedAccount._id, formData);
      toast.success('อัปเดตบัญชีสำเร็จ');
      setShowEditModal(false);
      fetchData();
    } catch (error: any) {
      toast.error('ไม่สามารถบันทึกได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (account: ExtendedLineAccount) => {
    setSelectedAccount(account);
    setFormData({
      accountName: account.accountName,
      channelId: account.channelId,
      channelSecret: account.channelSecret,
      accessToken: account.accessToken,
      description: account.description || '',
      ownerId: account.ownerId || '',
    });
    setShowEditModal(true);
  };

  const openSettingsModal = (account: ExtendedLineAccount) => {
    setSelectedAccount(account);
    const s = account.settings || {};
    const boolToString = (val: boolean | null | undefined): string => {
      if (val === null || val === undefined) return 'default';
      return val ? 'true' : 'false';
    };
    setSettingsData({
      enableBot: s.enableBot ?? false,
      enableAi: s.enableAi ?? false,
      enableSlipVerification: s.enableSlipVerification ?? false,
      aiSystemPrompt: s.aiSystemPrompt || '',
      aiTemperature: s.aiTemperature ?? 0.7,
      aiFallbackMessage: s.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
      slipImmediateMessage: s.slipImmediateMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
      customQuotaExceededMessage: (s as any).customQuotaExceededMessage || '',
      customBotDisabledMessage: (s as any).customBotDisabledMessage || '',
      customSlipDisabledMessage: (s as any).customSlipDisabledMessage || '',
      customAiDisabledMessage: (s as any).customAiDisabledMessage || '',
      customDuplicateSlipMessage: (s as any).customDuplicateSlipMessage || '',
      customSlipErrorMessage: (s as any).customSlipErrorMessage || '',
      customSlipSuccessMessage: (s as any).customSlipSuccessMessage || '',
      sendMessageWhenBotDisabled: boolToString((s as any).sendMessageWhenBotDisabled),
      sendMessageWhenSlipDisabled: boolToString((s as any).sendMessageWhenSlipDisabled),
      sendMessageWhenAiDisabled: boolToString((s as any).sendMessageWhenAiDisabled),
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      const stringToBool = (val: string): boolean | null => {
        if (val === 'default') return null;
        return val === 'true';
      };
      const dataToSave = {
        ...settingsData,
        sendMessageWhenBotDisabled: stringToBool(settingsData.sendMessageWhenBotDisabled),
        sendMessageWhenSlipDisabled: stringToBool(settingsData.sendMessageWhenSlipDisabled),
        sendMessageWhenAiDisabled: stringToBool(settingsData.sendMessageWhenAiDisabled),
      };
      await lineAccountsApi.updateSettings(selectedAccount._id, dataToSave);
      toast.success('บันทึกการตั้งค่าสำเร็จ');
      setShowSettingsModal(false);
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      await lineAccountsApi.delete(selectedAccount._id);
      toast.success('ลบบัญชีสำเร็จ');
      setShowDeleteConfirm(false);
      setShowDetailModal(false);
      fetchData();
    } catch (error: any) {
      toast.error('ไม่สามารถลบได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleActive = async (account: ExtendedLineAccount) => {
    if (account.isActive && !showDisableConfirm) {
      setSelectedAccount(account);
      setShowDisableConfirm(true);
      return;
    }

    try {
      await lineAccountsApi.update(account._id, { isActive: !account.isActive });
      toast.success(account.isActive ? 'ปิดบัญชีแล้ว' : 'เปิดบัญชีแล้ว');
      setShowDisableConfirm(false);
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const copyWebhookUrl = (channelId: string) => {
    const webhookUrl = getWebhookUrl(channelId);
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('คัดลอก Webhook URL แล้ว');
  };

  const filteredAccounts = accounts.filter(acc =>
    acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.channelId.includes(searchTerm) ||
    acc.owner?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMessages = accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);
  const totalSlips = accounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0);

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 md:space-y-12 animate-fade max-w-[1700px] mx-auto pb-20">

        {/* Superior Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">จัดการบัญชี LINE OA</h1>
              <Badge variant="emerald" className="px-2 py-0.5 font-bold text-[10px] hidden md:inline-flex">ผู้ดูแลระบบ</Badge>
            </div>
            <p className="text-sm md:text-base text-slate-500">จัดการบัญชี LINE Official Account, ตั้งค่าบอท และ Webhook</p>
          </div>
          <Button
            variant="primary"
            className="w-full md:w-auto rounded-2xl font-black uppercase tracking-widest shadow-emerald-500/10 shadow-xl"
            onClick={() => { setFormData({ accountName: '', channelId: '', channelSecret: '', accessToken: '', description: '', ownerId: '' }); setShowAddModal(true); }}
            leftIcon={<Plus className="w-5 h-5" />}
          >
            เพิ่มบัญชีใหม่
          </Button>
        </div>

        {/* Global Network Analytics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <StatCard title="บัญชีทั้งหมด" value={accounts.length} icon={<Smartphone className="w-6 h-6" />} color="indigo" variant="glass" />
          <StatCard title="ใช้งานอยู่" value={accounts.filter(a => a.isActive).length} icon={<Activity className="w-6 h-6" />} color="emerald" variant="glass" />
          <StatCard title="ข้อความ" value={totalMessages.toLocaleString()} icon={<MessageSquare className="w-6 h-6" />} color="violet" variant="glass" />
          <StatCard title="สลิปที่ตรวจ" value={totalSlips.toLocaleString()} icon={<FileCheck className="w-6 h-6" />} color="amber" variant="glass" />
        </div>

        {/* Search & Filter Interface */}
        <Card className="p-2 md:p-4 bg-white/40 backdrop-blur-xl border-none shadow-premium-sm rounded-2xl md:rounded-3xl">
          <Input
            placeholder="ค้นหาบัญชี..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-5 h-5" />}
            className="bg-transparent border-none shadow-none text-base md:text-lg font-medium placeholder:text-slate-300"
          />
        </Card>

        {/* Desktop Table View */}
        <Card className="hidden md:block overflow-hidden p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3.5rem]">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-8 py-6 text-xs font-bold text-slate-500">บัญชี</th>
                  <th className="px-8 py-6 text-xs font-bold text-slate-500">เจ้าของ</th>
                  <th className="px-8 py-6 text-xs font-bold text-slate-500">สถิติ</th>
                  <th className="px-8 py-6 text-xs font-bold text-slate-500">ฟีเจอร์</th>
                  <th className="px-8 py-6 text-xs font-bold text-slate-500">สถานะ</th>
                  <th className="px-8 py-6 text-xs font-bold text-slate-500 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-10 py-32">
                      <PageLoading transparent message="กำลังโหลดข้อมูล..." />
                    </td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-10 py-32 text-center">
                      <div className="flex flex-col items-center gap-6 opacity-30">
                        <div className="text-7xl">🕳️</div>
                        <p className="text-sm font-bold">ไม่พบบัญชี</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => (
                    <motion.tr
                      key={account._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group hover:bg-slate-50/80 transition-all duration-300"
                    >
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center text-white shadow-2xl group-hover:scale-110 transition-transform duration-500">
                            <Smartphone className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="font-black text-slate-900 group-hover:text-emerald-600 transition-colors uppercase tracking-tight text-lg mb-0.5">{account.accountName}</p>
                            <p className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg w-fit">ID: {account.channelId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <p className="font-bold text-slate-700 text-sm mb-1">{account.owner?.username || 'ระบบ'}</p>
                        <p className="text-xs text-slate-400">{account.owner?.email || '-'}</p>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{(account.statistics?.totalMessages || 0).toLocaleString()}</span>
                            <span className="text-xs text-slate-400">ข้อความ</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</span>
                            <span className="text-xs text-slate-400">สลิป</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-wrap gap-2 max-w-[150px]">
                          {account.settings?.enableBot && <Badge variant="emerald" className="rounded-lg text-[9px] px-1.5 py-0 font-bold">บอท</Badge>}
                          {account.settings?.enableSlipVerification && <Badge variant="indigo" className="rounded-lg text-[9px] px-1.5 py-0 font-bold">สลิป</Badge>}
                          {account.settings?.enableAi && <Badge variant="purple" className="rounded-lg text-[9px] px-1.5 py-0 font-bold">AI</Badge>}
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-3 h-3 rounded-full shadow-lg", account.isActive ? "bg-emerald-500 shadow-emerald-500/50" : "bg-slate-300")} />
                          <span className={cn("text-[11px] font-black uppercase tracking-[0.15em]", account.isActive ? "text-emerald-600" : "text-slate-400")}>
                            {account.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </span>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <IconButton variant="glass" size="sm" className="rounded-xl" onClick={() => { setSelectedAccount(account); setShowDetailModal(true); }} title="View Details"><Eye className="w-4 h-4" /></IconButton>
                          <IconButton variant="glass" size="sm" className="rounded-xl text-emerald-500" onClick={() => openSettingsModal(account)} title="Settings"><Settings className="w-4 h-4" /></IconButton>
                          <IconButton variant="glass" size="sm" className="rounded-xl text-blue-500" onClick={() => openEditModal(account)} title="Edit"><Edit className="w-4 h-4" /></IconButton>
                          <IconButton variant="glass" size="sm" className={cn("rounded-xl", account.isActive ? "text-amber-500" : "text-emerald-500")} onClick={() => handleToggleActive(account)} title={account.isActive ? 'Disable' : 'Enable'}><Power className="w-4 h-4" /></IconButton>
                          <IconButton variant="glass" size="sm" className="rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white" onClick={() => { setSelectedAccount(account); setShowDeleteConfirm(true); }} title="Delete"><Trash2 className="w-4 h-4" /></IconButton>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile Card View */}
        <div className="md:hidden grid grid-cols-1 gap-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Card key={i} className="h-40 animate-pulse bg-white/50"><div /></Card>)}
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center gap-6 opacity-30 py-12">
              <div className="text-5xl">🕳️</div>
              <p className="text-sm font-bold">ไม่พบบัญชี</p>
            </div>
          ) : (
            filteredAccounts.map((account) => (
              <Card key={account._id} variant="glass" className="flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{account.accountName}</h3>
                      <p className="text-xs font-mono text-slate-500">ID: {account.channelId}</p>
                    </div>
                  </div>
                  <div className={cn("w-2 h-2 rounded-full", account.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <p className="text-slate-400 mb-1">เจ้าของ</p>
                    <p className="font-bold text-slate-700 truncate">{account.owner?.username || 'ระบบ'}</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <p className="text-slate-400 mb-1">ข้อความ</p>
                    <p className="font-bold text-slate-700">{(account.statistics?.totalMessages || 0).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {account.settings?.enableBot && <Badge variant="emerald" className="text-[10px]">บอท</Badge>}
                  {account.settings?.enableSlipVerification && <Badge variant="indigo" className="text-[10px]">สลิป</Badge>}
                  {account.settings?.enableAi && <Badge variant="purple" className="text-[10px]">AI</Badge>}
                </div>

                <div className="flex gap-2 border-t border-slate-100 pt-3 mt-1">
                  <Button size="xs" variant="ghost" className="flex-1" onClick={() => openSettingsModal(account)}><Settings className="w-4 h-4" /></Button>
                  <Button size="xs" variant="ghost" className="flex-1" onClick={() => openEditModal(account)}><Edit className="w-4 h-4" /></Button>
                  <Button size="xs" variant="ghost" className="flex-1 text-rose-500" onClick={() => { setSelectedAccount(account); setShowDeleteConfirm(true); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </Card>
            ))
          )}
        </div>

      </div>

      {/* Provision Node Modal */}
      <Modal isOpen={showAddModal} onClose={() => !isProcessing && setShowAddModal(false)} title="เพิ่มบัญชี LINE OA" size="lg">
        <div className="space-y-6 pt-2">
          <div className="p-5 bg-slate-900 text-white rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-3xl font-bold">LINE</div>
            <p className="text-sm font-bold mb-4 text-emerald-400 flex items-center gap-2"><Smartphone className="w-4 h-4" /> ข้อมูลช่องทาง LINE</p>
            <div className="space-y-4">
              <Input variant="glass" label="ชื่อบัญชี" placeholder="เช่น บัญชีหลัก" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} className="bg-white/5 border-white/10 text-white" />
              <div className="grid grid-cols-2 gap-4">
                <Input variant="glass" label="Channel ID" placeholder="1234567890" value={formData.channelId} onChange={(e) => setFormData({ ...formData, channelId: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                <Input variant="glass" type="password" label="Channel Secret" placeholder="••••••••" value={formData.channelSecret} onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })} className="bg-white/5 border-white/10 text-white" />
              </div>
              <Input variant="glass" type="password" label="Access Token" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Select label="เจ้าของบัญชี" value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}>
              <option value="">ผู้ดูแลระบบ</option>
              {users.filter(u => u.role === 'user').map((user) => (
                <option key={user._id} value={user._id}>{user.username} ({user.email})</option>
              ))}
            </Select>
            <Input label="คำอธิบาย" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-100">
            <Button variant="ghost" className="flex-1" onClick={() => setShowAddModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] font-bold h-12 rounded-xl" onClick={handleAddAccount} isLoading={isProcessing}>เพิ่มบัญชี</Button>
          </div>
        </div>
      </Modal>

      {/* Identity Overhaul Modal */}
      <Modal isOpen={showEditModal} onClose={() => !isProcessing && setShowEditModal(false)} title={`แก้ไขบัญชี: ${selectedAccount?.accountName}`} size="lg">
        <div className="space-y-6 pt-2">
          <Input label="ชื่อบัญชี" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input label="Channel Secret" type="password" placeholder="เว้นว่างหากไม่ต้องการเปลี่ยน" value={formData.channelSecret} onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })} />
            <Input label="Access Token" type="password" placeholder="เว้นว่างหากไม่ต้องการเปลี่ยน" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} />
          </div>
          <Select label="เจ้าของบัญชี" value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}>
            <option value="">ผู้ดูแลระบบ</option>
            {users.filter(u => u.role === 'user').map((user) => (
              <option key={user._id} value={user._id}>{user.username} ({user.email})</option>
            ))}
          </Select>
          <Textarea label="คำอธิบาย" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />

          <div className="flex gap-4 pt-8 border-t border-slate-100">
            <Button variant="ghost" className="flex-1" onClick={() => setShowEditModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] font-bold h-12 rounded-xl" onClick={handleEditAccount} isLoading={isProcessing}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* Logic Config Modal */}
      <Modal isOpen={showSettingsModal} onClose={() => !isProcessing && setShowSettingsModal(false)} title={`ตั้งค่า: ${selectedAccount?.accountName}`} size="xl">
        <div className="space-y-10 pt-2 max-h-[70vh] overflow-y-auto px-4 custom-scrollbar">

          {/* feature switches */}
          <div className="grid grid-cols-3 gap-6">
            <Card className="p-6 bg-emerald-50/50 border-emerald-100/50 rounded-3xl flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-2xl"><Bot className="w-6 h-6 text-emerald-600" /></div>
              <div className="space-y-1">
                <p className="font-bold text-xs">บอท</p>
                <Switch checked={settingsData.enableBot} onChange={(checked) => setSettingsData({ ...settingsData, enableBot: checked })} />
              </div>
            </Card>
            <Card className="p-6 bg-indigo-50/50 border-indigo-100/50 rounded-3xl flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl"><FileCheck className="w-6 h-6 text-indigo-600" /></div>
              <div className="space-y-1">
                <p className="font-bold text-xs">ตรวจสลิป</p>
                <Switch checked={settingsData.enableSlipVerification} onChange={(checked) => setSettingsData({ ...settingsData, enableSlipVerification: checked })} />
              </div>
            </Card>
            <Card className="p-6 bg-purple-50/50 border-purple-100/50 rounded-3xl flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-2xl"><MessageSquare className="w-6 h-6 text-purple-600" /></div>
              <div className="space-y-1">
                <p className="font-bold text-xs">AI</p>
                <Switch checked={settingsData.enableAi} onChange={(checked) => setSettingsData({ ...settingsData, enableAi: checked })} />
              </div>
            </Card>
          </div>

          {/* AI Neuro Parameters */}
          <AnimatePresence>
            {settingsData.enableAi && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 p-8 bg-slate-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 text-5xl font-bold">AI</div>
                <h3 className="text-lg font-bold mb-4 text-purple-400 flex items-center gap-2"><MessageSquare className="w-5 h-5" /> การตั้งค่า AI</h3>
                <Textarea variant="glass" label="System Prompt" value={settingsData.aiSystemPrompt} onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })} placeholder="กำหนดบุคลิกภาพของ AI..." rows={5} className="bg-white/5 border-white/10 text-white" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input variant="glass" type="number" step="0.1" min="0" max="1" label="Temperature" value={settingsData.aiTemperature} onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })} className="bg-white/5 border-white/10 text-white" />
                  <Input variant="glass" label="ข้อความเมื่อเกิดข้อผิดพลาด" value={settingsData.aiFallbackMessage} onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Protocol Message Overrides */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-500 px-4">ข้อความที่กำหนดเอง (ว่าง = ใช้ค่าระบบ)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="ข้อความกำลังตรวจสลิป" value={settingsData.slipImmediateMessage} onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })} />
              <Input label="ข้อความโควต้าหมด" value={settingsData.customQuotaExceededMessage} onChange={(e) => setSettingsData({ ...settingsData, customQuotaExceededMessage: e.target.value })} />
              <Input label="ข้อความบอทปิด" value={settingsData.customBotDisabledMessage} onChange={(e) => setSettingsData({ ...settingsData, customBotDisabledMessage: e.target.value })} />
              <Input label="ข้อความสลิปซ้ำ" value={settingsData.customDuplicateSlipMessage} onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-4 pt-10 border-t border-slate-100">
            <Button variant="ghost" className="flex-1" onClick={() => setShowSettingsModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] font-bold h-12 rounded-xl" onClick={handleSaveSettings} isLoading={isProcessing}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* Node Analysis Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`รายละเอียดบัญชี: ${selectedAccount?.accountName}`} size="xl">
        {selectedAccount && (
          <div className="space-y-10 pt-2 max-h-[70vh] overflow-y-auto px-4 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <p className="text-xs font-bold text-slate-500 px-1">ข้อมูลบัญชี</p>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                  <div><p className="text-xs text-slate-400 mb-1">Channel ID</p><p className="font-mono text-sm font-bold text-slate-900 break-all">{selectedAccount.channelId}</p></div>
                  <div><p className="text-xs text-slate-400 mb-1">Channel Secret</p><p className="font-mono text-sm text-slate-400">••••••••••••</p></div>
                  <div><p className="text-xs text-slate-400 mb-1">คำอธิบาย</p><p className="text-sm text-slate-600">{selectedAccount.description || '-'}</p></div>
                </div>
              </div>
              <div className="space-y-6">
                <p className="text-xs font-bold text-slate-500 px-1">Webhook URL</p>
                <div className="p-6 h-full bg-slate-900 text-white rounded-2xl shadow-lg flex flex-col justify-between">
                  <p className="text-xs font-mono text-emerald-400 mb-4 leading-relaxed break-all opacity-80">{getWebhookUrl(selectedAccount.channelId)}</p>
                  <Button variant="primary" className="bg-white text-slate-900 h-10 px-4 text-xs font-bold rounded-xl hover:bg-emerald-400" onClick={() => copyWebhookUrl(selectedAccount.channelId)}>
                    คัดลอก URL
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="p-4 md:p-6 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
                <p className="text-xs text-slate-400 mb-2">ข้อความ</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{(selectedAccount.statistics?.totalMessages || 0).toLocaleString()}</p>
              </div>
              <div className="p-4 md:p-6 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
                <p className="text-xs text-slate-400 mb-2">สลิปที่ตรวจ</p>
                <p className="text-2xl md:text-3xl font-bold text-emerald-600">{(selectedAccount.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
              </div>
              <div className="p-4 md:p-6 bg-white border border-slate-100 rounded-2xl text-center shadow-sm">
                <p className="text-xs text-slate-400 mb-2">ข้อผิดพลาด</p>
                <p className="text-2xl md:text-3xl font-bold text-rose-500">{(selectedAccount.statistics?.totalSlipErrors || 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex gap-4 pt-8 border-t border-slate-100">
              <Button variant="ghost" className="flex-1" onClick={() => setShowDetailModal(false)}>ปิด</Button>
              <Button variant="secondary" className="flex-1 font-bold" onClick={() => openEditModal(selectedAccount)}>แก้ไข</Button>
              <Button variant="danger" className="flex-1 font-bold" onClick={() => setShowDeleteConfirm(true)}>ลบ</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} title="ยืนยันการลบ" message="คุณแน่ใจหรือว่าต้องการลบบัญชีนี้? การกระทำนี้ไม่สามารถย้อนกลับได้" confirmText="ลบบัญชี" type="danger" isLoading={isProcessing} />
      <ConfirmModal isOpen={showDisableConfirm} onClose={() => setShowDisableConfirm(false)} onConfirm={() => selectedAccount && handleToggleActive(selectedAccount)} title="ยืนยันการปิด" message="คุณแน่ใจหรือว่าต้องการปิดการใช้งานบัญชีนี้? Webhook จะหยุดรับข้อความจาก LINE" confirmText="ปิดบัญชี" type="warning" isLoading={isProcessing} />

    </DashboardLayout>
  );
}
