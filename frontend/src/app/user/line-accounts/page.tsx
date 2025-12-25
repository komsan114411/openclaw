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
      <div className="space-y-8 max-w-[1600px] mx-auto pb-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 tracking-tight">
              จัดการบัญชี LINE OA
            </h1>
            <p className="text-slate-500 mt-1 font-medium">
              เชื่อมต่อและจัดการบัญชี LINE Official Account พร้อมระบบตอบกลับอัตโนมัติ
            </p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            leftIcon={<Plus className="w-5 h-5" />}
            className="shadow-lg shadow-emerald-500/20"
          >
            เพิ่มบัญชีใหม่
          </Button>
        </div>

        {/* Content */}
        <div className="grid gap-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-80 animate-pulse bg-white/50"><div /></Card>
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="w-12 h-12" />}
              title="ยังไม่มีบัญชี LINE OA"
              description="เริ่มต้นใช้งานโดยการเพิ่มบัญชี LINE OA ของคุณเพื่อใช้งานฟีเจอร์ต่างๆ"
              action={
                <Button
                  onClick={() => setShowModal(true)}
                  variant="primary"
                >
                  เพิ่มบัญชีแรกของคุณ
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {accounts.map((account, index) => (
                <motion.div
                  key={account._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card variant="glass" className="h-full flex flex-col group hover:border-emerald-500/30 transition-all duration-300">
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-[2px] shadow-lg shadow-emerald-500/20">
                          <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center relative overflow-hidden">
                            <i className="fab fa-line text-3xl text-[#00B900]" /> {/* Fallback if no icon */}
                            <Smartphone className="w-7 h-7 text-emerald-600 relative z-10" />
                            <div className="absolute inset-0 bg-emerald-50/50" />
                          </div>
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-900 group-hover:text-emerald-700 transition-colors">
                            {account.accountName}
                          </h3>
                          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mt-1 bg-slate-100/50 px-2 py-0.5 rounded-lg w-fit">
                            <span>ID: {account.channelId}</span>
                            <div className={`w-2 h-2 rounded-full ${account.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <IconButton
                          onClick={() => handleEdit(account)}
                          size="sm"
                          className="text-slate-400 hover:text-blue-500 hover:bg-blue-50"
                        >
                          <Edit className="w-4 h-4" />
                        </IconButton>
                        <IconButton
                          onClick={() => confirmDelete(account._id)}
                          size="sm"
                          className="text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-bold text-emerald-700">{account.statistics?.totalMessages || 0}</span>
                        <span className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-wide mt-1">ข้อความ</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-blue-50/50 border border-blue-100 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-bold text-blue-700">{account.statistics?.totalSlipsVerified || 0}</span>
                        <span className="text-[10px] text-blue-600/70 font-bold uppercase tracking-wide mt-1">สลิป</span>
                      </div>
                      <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-100 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-bold text-amber-700">{account.statistics?.totalAiResponses || 0}</span>
                        <span className="text-[10px] text-amber-600/70 font-bold uppercase tracking-wide mt-1">AI ตอบ</span>
                      </div>
                    </div>

                    {/* Webhook Section */}
                    <div className="mb-6 p-4 rounded-xl bg-slate-50/80 border border-slate-100 backdrop-blur-sm group-hover:bg-white/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="w-3 h-3" /> Webhook URL
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => copyWebhookUrl(account)}
                          className="h-6 text-[10px]"
                          leftIcon={<Copy className="w-3 h-3" />}
                        >
                          คัดลอก
                        </Button>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 break-all bg-white px-3 py-2 rounded-lg border border-slate-200/50 shadow-sm">
                        {getWebhookUrl(account)}
                      </div>
                    </div>

                    {/* Quick Toggles */}
                    <div className="space-y-3 mb-6 bg-white/40 p-4 rounded-2xl border border-white/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${account.settings?.enableBot ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Bot className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-700">บอทตอบกลับ</p>
                            <p className="text-[10px] text-slate-400">ตอบข้อความอัตโนมัติ</p>
                          </div>
                        </div>
                        <Switch
                          checked={account.settings?.enableBot || false}
                          onChange={() => handleUpdateSettings(account._id, { enableBot: !account.settings?.enableBot })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${account.settings?.enableAi ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400'}`}>
                            <MessageSquare className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-700">AI Genius</p>
                            <p className="text-[10px] text-slate-400">ใช้ AI ตอบคำถามลูกค้า</p>
                          </div>
                        </div>
                        <Switch
                          checked={account.settings?.enableAi || false}
                          onChange={() => handleUpdateSettings(account._id, { enableAi: !account.settings?.enableAi })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${account.settings?.enableSlipVerification ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                            <FileCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-700">ตรวจสลิป</p>
                            <p className="text-[10px] text-slate-400">ยืนยันยอดเงินอัตโนมัติ</p>
                          </div>
                        </div>
                        <Switch
                          checked={account.settings?.enableSlipVerification || false}
                          onChange={() => handleUpdateSettings(account._id, { enableSlipVerification: !account.settings?.enableSlipVerification })}
                        />
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-center"
                        onClick={() => window.open(`/user/chat?accountId=${account._id}`, '_self')}
                        leftIcon={<MessageSquare className="w-4 h-4" />}
                      >
                        แชท
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center"
                        onClick={() => openSettingsModal(account)}
                        leftIcon={<Settings className="w-4 h-4" />}
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editAccount ? 'แก้ไขบัญชี LINE OA' : 'เพิ่มบัญชีใหม่'}
        subtitle="กรอกข้อมูลการเชื่อมต่อ LINE Messaging API"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="ชื่อบัญชี (Display Name)"
            placeholder="เช่น ร้านค้าหลัก, แอดมิน 1"
            value={formData.accountName}
            onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
            required
            leftIcon={<Bot className="w-5 h-5" />}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Channel ID"
              placeholder="1234567890"
              value={formData.channelId}
              onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
              required
              className="font-mono"
            />
            <Input
              label="Channel Secret"
              placeholder="xxxxxxxxxxxxxxxx"
              value={formData.channelSecret}
              onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })}
              required
              type="password"
              className="font-mono"
            />
          </div>

          <Textarea
            label="Channel Access Token (Long-lived)"
            placeholder="eyJh....."
            value={formData.accessToken}
            onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
            required
            className="font-mono text-xs min-h-[100px]"
          />

          <Input
            label="คำอธิบายเพิ่มเติม (Optional)"
            placeholder="เช่น สำหรับตอบลูกค้า VIP"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => setShowModal(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="primary" fullWidth>
              {editAccount ? 'บันทึกการแก้ไข' : 'เชื่อมต่อบัญชี'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Advanced Settings Modal */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title={`ตั้งค่า: ${selectedAccount?.accountName}`}
        subtitle="ปรับแต่งการทำงานของบอทและข้อความอัตโนมัติ"
        size="lg"
      >
        <div className="space-y-8">
          {/* AI Settings Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-500" />
              ตั้งค่า AI & Chatbot
            </h3>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-bold text-slate-700">System Prompt</label>
                  <p className="text-xs text-slate-400">คำสั่งเริ่มต้นเพื่อกำหนดบุคลิกของ AI</p>
                </div>
              </div>
              <Textarea
                value={settingsData.aiSystemPrompt}
                onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })}
                placeholder="เช่น คุณเป็นแอดมินเพจขายเสื้อผ้า ตอบคำถามสุภาพ เป็นกันเอง..."
                className="bg-white"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">ความสร้างสรรค์ (Temperature: {settingsData.aiTemperature})</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settingsData.aiTemperature}
                    onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>แม่นยำ</span>
                    <span>สร้างสรรค์</span>
                  </div>
                </div>
                <Input
                  label="ข้อความเมื่อ AI ตอบไม่ได้"
                  value={settingsData.aiFallbackMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Slip Verification Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-500" />
              ตั้งค่าตรวจสอบสลิป
            </h3>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
              {/* Processing Message Option */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-slate-700">ส่งข้อความ &quot;กำลังประมวลผล&quot;</span>
                    <p className="text-xs text-slate-400 mt-1">
                      {settingsData.sendProcessingMessage 
                        ? '✅ ส่งข้อความก่อน แล้วค่อยส่งผลการตรวจสอบ' 
                        : '⚡ ตรวจสอบแล้วส่งผลทีเดียว (ไม่ส่งข้อความ "กำลังประมวลผล")'}
                    </p>
                  </div>
                  <Switch
                    checked={settingsData.sendProcessingMessage}
                    onChange={(checked) => setSettingsData({ ...settingsData, sendProcessingMessage: checked })}
                  />
                </div>
              </div>
              
              <Input
                label="ข้อความรอตรวจสอบ (ตอบทันทีเมื่อได้รับรูป)"
                value={settingsData.slipImmediateMessage}
                onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })}
                disabled={!settingsData.sendProcessingMessage}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="เมื่อตรวจสอบสำเร็จ"
                  placeholder="✅ ตรวจสอบสลิปสำเร็จ (ว่าง = ค่าระบบ)"
                  value={settingsData.customSlipSuccessMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customSlipSuccessMessage: e.target.value })}
                />
                <Input
                  label="เมื่อสลิปซ้ำ"
                  placeholder="⚠️ สลิปนี้ถูกใช้แล้ว (ว่าง = ค่าระบบ)"
                  value={settingsData.customDuplicateSlipMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })}
                />
                <Input
                  label="เมื่อเกิดข้อผิดพลาด"
                  placeholder="❌ ไม่สามารถตรวจสอบได้ (ว่าง = ค่าระบบ)"
                  value={settingsData.customSlipErrorMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customSlipErrorMessage: e.target.value })}
                />
                <Input
                  label="เมื่อโควต้าหมด"
                  placeholder="⚠️ ระบบตรวจสอบปิดชั่วคราว (ว่าง = ค่าระบบ)"
                  value={settingsData.customQuotaExceededMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customQuotaExceededMessage: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Feature Toggle Messages */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-500" />
              ข้อความแจ้งเตือนเมื่อปิดระบบ
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="p-3 bg-white border border-slate-200 rounded-xl relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-700">แจ้งเมื่อปิดบอท</span>
                  <Select
                    value={settingsData.sendMessageWhenBotDisabled}
                    onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenBotDisabled: e.target.value })}
                    className="w-32 h-8 text-xs py-0"
                  >
                    <option value="default">ค่าเริ่มต้น</option>
                    <option value="true">แจ้งเตือน</option>
                    <option value="false">ไม่แจ้ง</option>
                  </Select>
                </div>
                <Input
                  placeholder="ข้อความแจ้งเตือนเมื่อบอทปิดใช้งาน"
                  value={settingsData.customBotDisabledMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customBotDisabledMessage: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-700">แจ้งเมื่อปิดระบบสลิป</span>
                  <Select
                    value={settingsData.sendMessageWhenSlipDisabled}
                    onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenSlipDisabled: e.target.value })}
                    className="w-32 h-8 text-xs py-0"
                  >
                    <option value="default">ค่าเริ่มต้น</option>
                    <option value="true">แจ้งเตือน</option>
                    <option value="false">ไม่แจ้ง</option>
                  </Select>
                </div>
                <Input
                  placeholder="ข้อความแจ้งเตือนเมื่อระบบตรวจสลิปปิดใช้งาน"
                  value={settingsData.customSlipDisabledMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customSlipDisabledMessage: e.target.value })}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-3 sticky bottom-0 bg-white z-10">
            <Button variant="ghost" fullWidth onClick={() => setShowSettingsModal(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" fullWidth onClick={handleSaveSettings}>
              บันทึกการตั้งค่า
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
