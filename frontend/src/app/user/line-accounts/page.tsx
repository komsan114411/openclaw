'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, systemSettingsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardHeader, EmptyState } from '@/components/ui/Card';
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
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <h1 className="page-title-responsive">
              Neural <span className="text-emerald-400">Connectivity</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Orchestrate LINE Official Accounts & Autonomous Protocols
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            size="lg"
            variant="primary"
            leftIcon={<Plus className="w-5 h-5 sm:w-6 sm:h-6" />}
            className="w-full sm:w-auto h-11 sm:h-16 px-6 sm:px-10 rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-xs shadow-emerald-500/20 shadow-2xl transition-all mt-6 lg:mt-0"
          >
            Deploy New Node
          </Button>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
              {accounts.map((account, index) => (
                <motion.div
                  key={account._id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="h-full"
                >
                  <Card variant="glass" className="h-full flex flex-col group relative overflow-hidden p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                    {/* Background Decor */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-700" />

                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-slate-950 border border-white/5 p-0.5 shadow-2xl flex-shrink-0 group-hover:scale-105 transition-all">
                          <div className="w-full h-full bg-slate-900 rounded-[14px] md:rounded-[22px] flex items-center justify-center relative overflow-hidden">
                            <i className="fab fa-line text-3xl md:text-4xl text-[#06C755]" />
                            <div className="absolute inset-0 bg-emerald-500/5 animate-pulse-slow" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-lg md:text-xl text-white group-hover:text-emerald-400 transition-colors truncate tracking-tight uppercase">
                            {account.accountName}
                          </h3>
                          <div className="flex items-center gap-2 mt-2">
                            <div className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all", account.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/10 shadow-lg' : 'bg-white/5 text-slate-600 border-white/5')}>
                              {account.isActive ? 'Operational' : 'Hibernated'}
                            </div>
                            <span className="text-[9px] font-mono font-black text-slate-500 bg-white/[0.03] px-2.5 py-1 rounded-lg border border-white/5 truncate max-w-[80px] sm:max-w-none uppercase tracking-tighter">
                              {account.channelId}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <IconButton
                          onClick={() => handleEdit(account)}
                          size="md"
                          className="rounded-xl border border-white/5 text-slate-500 hover:text-white hover:bg-white/5"
                        >
                          <Edit className="w-4 h-4 md:w-5 md:h-5" />
                        </IconButton>
                        <IconButton
                          onClick={() => confirmDelete(account._id)}
                          size="md"
                          className="rounded-xl border border-white/5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                        </IconButton>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8 relative z-10">
                      <div className="p-3 md:p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center group-hover:bg-white/[0.05] transition-colors">
                        <span className="text-xl md:text-2xl font-black text-white tracking-tighter">{(account.statistics?.totalMessages || 0).toLocaleString()}</span>
                        <span className="text-[8px] md:text-[9px] text-slate-600 font-black uppercase tracking-widest mt-1">Traffic</span>
                      </div>
                      <div className="p-3 md:p-4 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10 flex flex-col items-center justify-center text-center group-hover:bg-emerald-500/[0.08] transition-colors">
                        <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tighter">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</span>
                        <span className="text-[8px] md:text-[9px] text-emerald-500/40 font-black uppercase tracking-widest mt-1">Verified</span>
                      </div>
                      <div className="p-3 md:p-4 rounded-2xl bg-indigo-500/[0.03] border border-indigo-500/10 flex flex-col items-center justify-center text-center group-hover:bg-indigo-500/[0.08] transition-colors">
                        <span className="text-xl md:text-2xl font-black text-indigo-400 tracking-tighter">{(account.statistics?.totalAiResponses || 0).toLocaleString()}</span>
                        <span className="text-[8px] md:text-[9px] text-indigo-500/40 font-black uppercase tracking-widest mt-1">Neural</span>
                      </div>
                    </div>

                    <div className="mb-10 relative z-10">
                      <div className="bg-slate-950/40 rounded-[2rem] p-6 border border-white/5 backdrop-blur-xl group-hover:border-white/10 transition-all duration-500 group/webhook shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 group-hover/webhook:text-white transition-colors">
                            <Activity className="w-3.5 h-3.5" /> Security Protocol
                          </span>
                          <button
                            onClick={() => copyWebhookUrl(account)}
                            className="text-[9px] font-black text-emerald-400 hover:text-white uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500 transition-all px-4 py-2 rounded-xl border border-emerald-500/10"
                          >
                            Copy Matrix
                          </button>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 break-all bg-black/40 px-5 py-4 rounded-xl border border-white/5 group-hover/webhook:text-emerald-400/90 transition-colors">
                          {getWebhookUrl(account)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-10 relative z-10">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-white/5">
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center text-lg transition-all ${account.settings?.enableBot ? 'bg-emerald-500/20 text-emerald-400 shadow-emerald-500/20 shadow-lg' : 'bg-slate-950 text-slate-700 border border-white/5'}`}>
                            <Bot className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white leading-none mb-1 uppercase tracking-tight">Auto-Reply</p>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">Response Engine</p>
                          </div>
                        </div>
                        <Switch
                          checked={account.settings?.enableBot || false}
                          onChange={() => handleUpdateSettings(account._id, { enableBot: !account.settings?.enableBot })}
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-white/5">
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center text-lg transition-all ${account.settings?.enableAi ? 'bg-violet-500/20 text-violet-400 shadow-violet-500/20 shadow-lg' : 'bg-slate-950 text-slate-700 border border-white/5'}`}>
                            <MessageSquare className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white leading-none mb-1 uppercase tracking-tight">Neural AI</p>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">Cognitive Logic</p>
                          </div>
                        </div>
                        <Switch
                          checked={account.settings?.enableAi || false}
                          onChange={() => handleUpdateSettings(account._id, { enableAi: !account.settings?.enableAi })}
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-white/5">
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center text-lg transition-all ${account.settings?.enableSlipVerification ? 'bg-amber-500/20 text-amber-400 shadow-amber-500/20 shadow-lg' : 'bg-slate-950 text-slate-700 border border-white/5'}`}>
                            <FileCheck className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white leading-none mb-1 uppercase tracking-tight">Slip Auditor</p>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">Audit Protocol</p>
                          </div>
                        </div>
                        <Switch
                          checked={account.settings?.enableSlipVerification || false}
                          onChange={() => handleUpdateSettings(account._id, { enableSlipVerification: !account.settings?.enableSlipVerification })}
                        />
                      </div>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-4 relative z-10 pt-6 border-t border-white/5">
                      <Button
                        variant="primary"
                        className="h-11 sm:h-14 rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] bg-white/[0.02] border border-white/5 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all shadow-none group/btn"
                        onClick={() => window.open(`/user/chat?accountId=${account._id}`, '_self')}
                      >
                        <MessageSquare className="w-4 h-4 mr-2 group-hover/btn:scale-110 transition-transform" /> Command Hub
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11 sm:h-14 rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] bg-white/[0.02] border border-white/5 hover:bg-white/[0.1] text-slate-500 hover:text-white transition-all group/btn"
                        onClick={() => openSettingsModal(account)}
                      >
                        <Settings className="w-4 h-4 mr-2 group-hover/btn:rotate-90 transition-transform duration-700" /> Options
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
