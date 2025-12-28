'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, systemSettingsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Textarea, Select, Switch } from '@/components/ui/Input';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  FileCheck,
  Bot,
  Settings,
  Plus,
  Trash2,
  Edit,
  Copy,
  ExternalLink,
  Smartphone,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Activity
} from 'lucide-react';

export default function UserLineAccountsPage() {
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  const [editAccount, setEditAccount] = useState<LineAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<LineAccount | null>(null);

  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
  });

  const [settingsData, setSettingsData] = useState({
    enableBot: false,
    enableAi: false,
    enableSlipVerification: false,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    slipImmediateMessage: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    // Custom messages per account
    customQuotaExceededMessage: '',
    customBotDisabledMessage: '',
    customSlipDisabledMessage: '',
    customAiDisabledMessage: '',
    customDuplicateSlipMessage: '',
    customSlipErrorMessage: '',
    customSlipSuccessMessage: '',
    // ตัวเลือกการส่งข้อความ
    sendMessageWhenBotDisabled: 'default' as string,
    sendMessageWhenSlipDisabled: 'default' as string,
    sendMessageWhenAiDisabled: 'default' as string,
    sendProcessingMessage: true, // ส่งข้อความ "กำลังประมวลผล" หรือไม่
  });

  useEffect(() => {
    fetchAccounts();
    fetchPublicBaseUrl();
  }, []);

  const fetchPublicBaseUrl = async () => {
    try {
      const res = await systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} }));
      setPublicBaseUrl(res.data.publicBaseUrl || '');
    } catch {
      setPublicBaseUrl('');
    }
  };

  const getWebhookUrl = (account: LineAccount) => {
    const base =
      publicBaseUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      '';
    const normalized = base.replace(/\/+$/, '');
    // ใช้ webhookSlug ถ้ามี หรือ fallback ไป channelId
    const slug = account.webhookSlug || account.channelId;
    return `${normalized}/api/webhook/line/${slug}`;
  };

  const fetchAccounts = async () => {
    try {
      const response = await lineAccountsApi.getMyAccounts();
      setAccounts(response.data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      channelId: '',
      channelSecret: '',
      accessToken: '',
      description: '',
    });
    setEditAccount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editAccount) {
        await lineAccountsApi.update(editAccount._id, formData);
        toast.success('อัปเดตบัญชีสำเร็จ');
      } else {
        await lineAccountsApi.create(formData);
        toast.success('เพิ่มบัญชีสำเร็จ');
      }
      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (account: LineAccount) => {
    setEditAccount(account);
    setFormData({
      accountName: account.accountName,
      channelId: account.channelId,
      channelSecret: account.channelSecret,
      accessToken: account.accessToken,
      description: account.description || '',
    });
    setShowModal(true);
  };

  const confirmDelete = (id: string) => {
    setAccountToDelete(id);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;
    try {
      await lineAccountsApi.delete(accountToDelete);
      toast.success('ลบบัญชีสำเร็จ');
      fetchAccounts();
    } catch (error) {
      toast.error('ไม่สามารถลบบัญชีได้');
    } finally {
      setShowDeleteModal(false);
      setAccountToDelete(null);
    }
  };

  const handleUpdateSettings = async (id: string, settings: Partial<LineAccount['settings']>) => {
    try {
      await lineAccountsApi.updateSettings(id, settings);
      toast.success('อัปเดตสถานะสำเร็จ');
      fetchAccounts();
    } catch (error) {
      toast.error('ไม่สามารถอัปเดตได้');
      // Revert state optimization would go here if needed
    }
  };

  const openSettingsModal = (account: LineAccount) => {
    setSelectedAccount(account);
    const s = account.settings || {};
    // Convert boolean/null to string for frontend select
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
      sendProcessingMessage: (s as any).sendProcessingMessage ?? true,
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedAccount) return;
    try {
      // Convert string values back to boolean/null for backend
      const stringToBool = (val: string): boolean | null => {
        if (val === 'default') return null;
        return val === 'true';
      };
      const dataToSave = {
        ...settingsData,
        sendMessageWhenBotDisabled: stringToBool(settingsData.sendMessageWhenBotDisabled),
        sendMessageWhenSlipDisabled: stringToBool(settingsData.sendMessageWhenSlipDisabled),
        sendMessageWhenAiDisabled: stringToBool(settingsData.sendMessageWhenAiDisabled),
        sendProcessingMessage: settingsData.sendProcessingMessage,
      };
      await lineAccountsApi.updateSettings(selectedAccount._id, dataToSave);
      toast.success('บันทึกการตั้งค่าสำเร็จ');
      setShowSettingsModal(false);
      fetchAccounts();
    } catch (error) {
      toast.error('ไม่สามารถบันทึกได้');
    }
  };

  const copyWebhookUrl = (account: LineAccount) => {
    const webhookUrl = getWebhookUrl(account);
    if (!webhookUrl) {
      toast.error('ไม่พบข้อมูล Webhook URL');
      return;
    }
    navigator.clipboard.writeText(webhookUrl);
    toast.success('คัดลอก Webhook URL แล้ว');
  };

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10">
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              บัญชี <span className="text-[#06C755]">LINE ของฉัน</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              จัดการบัญชีทางการ LINE Official Account ของคุณ
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              size="lg"
              variant="primary"
              leftIcon={<Plus className="w-4 h-4 sm:w-5 sm:h-5" />}
              className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048] transition-all"
            >
              เพิ่มบัญชีใหม่
            </Button>
            <Link href="/user/payments" className="flex-1 sm:flex-none">
              <Button
                variant="outline"
                className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all"
              >
                ตรวจสลิป
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="mb-4 sm:mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="ค้นหาผู้ใช้, สลิป, หรือแชท..."
              className="w-full h-11 sm:h-12 px-4 sm:px-6 pl-10 sm:pl-12 bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#06C755]/50 transition-all"
            />
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 absolute left-3 sm:left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <Card variant="glass" className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">ผู้ติดตามทั้งหมด</p>
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                  <p className="text-xl sm:text-2xl font-black text-white">{accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}</p>
                  <span className="text-xs sm:text-sm font-bold text-[#06C755] flex items-center gap-1">
                    <span>↑</span> +5% สัปดาห์นี้
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center flex-shrink-0 ml-2">
                <span className="text-xl sm:text-2xl">👥</span>
              </div>
            </div>
          </Card>
          <Card variant="glass" className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">ข้อความ</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <p className="text-xl sm:text-2xl font-black text-white">{accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}</p>
                  <span className="text-xs sm:text-sm font-semibold text-slate-400">/ {accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0) + 1000}</span>
                </div>
                <div className="h-1.5 sm:h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#06C755] rounded-full" style={{ width: '90%' }}></div>
                </div>
                <p className="text-[8px] sm:text-[9px] font-semibold text-slate-500 mt-1">ต่ออายุใน 5 วัน</p>
              </div>
              <Badge variant="info" className="text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1 ml-2 flex-shrink-0">PRO</Badge>
            </div>
          </Card>
        </div>
        

        <div className="grid gap-6 md:gap-10">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-72 md:h-96 animate-pulse" variant="glass"><div /></Card>
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={<div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-4xl shadow-inner">💬</div>}
              title="ยังไม่มีบัญชี LINE OA"
              description="เริ่มต้นใช้งานโดยการเชื่อมต่อบัญชี LINE OA ของคุณเพื่อเปิดใช้งานระบบตอบกลับอัตโนมัติ"
              action={
                <Button
                  onClick={() => setShowModal(true)}
                  variant="primary"
                  size="lg"
                  className="h-14 px-8 rounded-2xl shadow-emerald-500/20 shadow-xl"
                >
                  เชื่อมต่อบัญชีแรก
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
              {accounts.map((account, index) => (
                <motion.div
                  key={account._id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="h-full"
                >
                  <Card variant="glass" className="h-full flex flex-col group relative overflow-hidden p-4 sm:p-6 rounded-xl sm:rounded-2xl hover:border-[#06C755]/20 transition-all">
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-[#06C755]/10 border border-[#06C755]/20 flex items-center justify-center flex-shrink-0">
                          <i className="fab fa-line text-xl sm:text-2xl text-[#06C755]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-black text-base sm:text-lg text-white truncate tracking-tight">
                            {account.accountName}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <div className={cn("px-2 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-semibold", account.isActive ? 'bg-[#06C755]/10 text-[#06C755]' : 'bg-white/5 text-slate-500')}>
                              {account.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
                        <IconButton
                          onClick={() => handleEdit(account)}
                          size="sm"
                          className="rounded-lg border border-white/5 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                        >
                          <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </IconButton>
                        <IconButton
                          onClick={() => confirmDelete(account._id)}
                          size="sm"
                          className="rounded-lg border border-white/5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </IconButton>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
                      <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center">
                        <span className="text-lg sm:text-xl font-black text-white">{(account.statistics?.totalMessages || 0).toLocaleString()}</span>
                        <span className="text-[8px] sm:text-[9px] text-slate-400 font-semibold mt-1">ข้อความ</span>
                      </div>
                      <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-[#06C755]/10 border border-[#06C755]/20 flex flex-col items-center justify-center text-center">
                        <span className="text-lg sm:text-xl font-black text-[#06C755]">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</span>
                        <span className="text-[8px] sm:text-[9px] text-[#06C755]/70 font-semibold mt-1">สลิป</span>
                      </div>
                      <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col items-center justify-center text-center">
                        <span className="text-lg sm:text-xl font-black text-indigo-400">{(account.statistics?.totalAiResponses || 0).toLocaleString()}</span>
                        <span className="text-[8px] sm:text-[9px] text-indigo-400/70 font-semibold mt-1">AI</span>
                      </div>
                    </div>

                    <div className="mb-4 sm:mb-6">
                      <div className="bg-white/[0.02] rounded-lg sm:rounded-xl p-3 sm:p-4 border border-white/5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-2 sm:mb-3">
                          <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Webhook URL
                          </span>
                          <button
                            onClick={() => copyWebhookUrl(account)}
                            className="text-[8px] sm:text-[9px] font-semibold text-[#06C755] hover:text-[#05B048] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#06C755]/10 hover:bg-[#06C755]/20 transition-all w-full sm:w-auto text-center"
                          >
                            คัดลอก
                          </button>
                        </div>
                        <div className="font-mono text-[9px] sm:text-[10px] text-slate-400 break-all bg-black/40 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-white/5 overflow-x-auto">
                          {getWebhookUrl(account)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                      <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <Bot className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${account.settings?.enableBot ? 'text-[#06C755]' : 'text-slate-500'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-semibold text-white truncate">สถานะ AI Bot</p>
                            <p className="text-[8px] sm:text-[9px] font-semibold text-slate-400">อัตราการตอบกลับ 98%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <div className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full relative transition-all ${account.settings?.enableBot ? 'bg-[#06C755]' : 'bg-white/10'}`}>
                            <div className={`absolute right-0.5 sm:right-1 top-0.5 sm:top-1 w-3.5 sm:w-4 h-3.5 sm:h-4 bg-white rounded-full transition-all ${account.settings?.enableBot ? '' : 'translate-x-[-1.25rem] sm:translate-x-[-1.5rem]'}`}></div>
                          </div>
                          <span className={`text-[8px] sm:text-[10px] font-semibold hidden sm:inline ${account.settings?.enableBot ? 'text-[#06C755]' : 'text-slate-500'}`}>
                            {account.settings?.enableBot ? 'เปิด' : 'ปิด'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-white/5">
                      <Button
                        variant="primary"
                        className="h-9 sm:h-10 rounded-lg sm:rounded-xl font-semibold text-xs bg-[#06C755] hover:bg-[#05B048] transition-all"
                        onClick={() => window.open(`/user/chat?accountId=${account._id}`, '_self')}
                      >
                        แชท
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 sm:h-10 rounded-lg sm:rounded-xl font-semibold text-xs border-white/5 bg-white/[0.02] hover:bg-white/5 text-white transition-all"
                        onClick={() => openSettingsModal(account)}
                      >
                        ตั้งค่า
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editAccount ? 'IDENTITY MODIFICATION: NODE' : 'INITIAL DEPLOYMENT: NODE'}
        subtitle="Authorize the neural bridge via LINE Messaging API credentials"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Node Identity (Display Name)"
            placeholder="PRIMARY_VECTA_01"
            value={formData.accountName}
            onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
            required
            leftIcon={<Bot className="w-5 h-5 text-emerald-400" />}
            className="bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Channel Access ID"
              placeholder="1234567890"
              value={formData.channelId}
              onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
              required
              className="font-mono bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
            />
            <Input
              label="Secret Matrix"
              placeholder="••••••••••••••••"
              value={formData.channelSecret}
              onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })}
              required
              type="password"
              className="font-mono bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
            />
          </div>

          <Textarea
            label="Long-Term Access Token"
            placeholder="eyJh....."
            value={formData.accessToken}
            onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
            required
            className="font-mono text-[10px] min-h-[140px] bg-white/[0.03] border-white/10 text-white rounded-[2rem] p-6"
          />

          <Input
            label="Operational Meta (Description)"
            placeholder="VIP_PROTOCOL_LOGISTICS"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
          />

          <div className="pt-6 flex gap-4">
            <Button type="button" variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] border border-white/5 text-slate-500 hover:text-white" onClick={() => setShowModal(false)}>
              Abort
            </Button>
            <Button type="submit" variant="primary" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-emerald-500/20">
              {editAccount ? 'Update Matrix' : 'Deploy Node'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title={`PROTOCOL CONFIG: ${selectedAccount?.accountName}`}
        subtitle="Fine-tune autonomous logic and response parameters"
        size="lg"
      >
        <div className="space-y-12 pb-6">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/10">
                <MessageSquare className="w-5 h-5" />
              </div>
              Neural Architecture
            </h3>

            <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 space-y-8 shadow-inner">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cognitive Meta-Prompt</label>
                <Textarea
                  value={settingsData.aiSystemPrompt}
                  onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })}
                  placeholder="Define behavior, tone, and operational boundaries..."
                  className="bg-slate-950/50 border-white/10 text-white min-h-[140px] rounded-[1.5rem] text-sm p-6"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-5">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logic Variance (Temp)</label>
                    <span className="text-[10px] font-mono font-black text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/20">{settingsData.aiTemperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settingsData.aiTemperature}
                    onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between text-[8px] font-black text-slate-600 uppercase tracking-widest">
                    <span>Precise Logic</span>
                    <span>Neural Drift</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Circuit Breaker Message</label>
                  <Input
                    value={settingsData.aiFallbackMessage}
                    onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })}
                    className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-white font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/10">
                <FileCheck className="w-5 h-5" />
              </div>
              Audit Telemetry
            </h3>
            <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 space-y-8 shadow-inner">
              <div className="p-5 bg-emerald-500/[0.02] rounded-[1.5rem] border border-emerald-400/10 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-black text-white uppercase tracking-tight">Audit Initialization Pulse</p>
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Send feedback during telemetry verification</p>
                </div>
                <Switch
                  checked={settingsData.sendProcessingMessage}
                  onChange={(checked) => setSettingsData({ ...settingsData, sendProcessingMessage: checked })}
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Audit Initialization String</label>
                <Input
                  value={settingsData.slipImmediateMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })}
                  disabled={!settingsData.sendProcessingMessage}
                  className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Verification Success</label>
                  <Input
                    placeholder="✅ DEPLOYMENT_SUCCESS"
                    value={settingsData.customSlipSuccessMessage}
                    onChange={(e) => setSettingsData({ ...settingsData, customSlipSuccessMessage: e.target.value })}
                    className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-xs font-bold"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Redundancy Alert</label>
                  <Input
                    placeholder="⚠️ REDUNDANCY_DETECTED"
                    value={settingsData.customDuplicateSlipMessage}
                    onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })}
                    className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 flex gap-4 sticky bottom-0 bg-slate-950/80 backdrop-blur-xl px-1 py-4 border-t border-white/5 mt-auto">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-500 hover:text-white" onClick={() => setShowSettingsModal(false)}>
              Discard
            </Button>
            <Button variant="primary" className="flex-[1.5] h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-emerald-500/20" onClick={handleSaveSettings}>
              Commit Matrix Config
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="ลบบัญชี LINE OA"
        message="คุณแน่ใจหรือไม่ที่จะลบบัญชีนี้? การกระทำนี้ไม่สามารถเรียกคืนได้ และข้อมูลการตั้งค่าทั้งหมดจะหายไป"
        confirmText="ยืนยันลบ"
        cancelText="ยกเลิก"
        type="danger"
      />
    </DashboardLayout>
  );
}

