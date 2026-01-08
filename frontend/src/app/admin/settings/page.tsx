'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { systemSettingsApi, slipApi, chatbotApi, banksApi } from '@/lib/api';
import type { Bank } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, StatCard } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, TextArea, Select, Switch } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PageLoading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

type TabType = 'infrastructure' | 'communication' | 'financials';

interface SystemSettings {
  publicBaseUrl?: string;
  slipApiKeyPreview?: string;
  aiApiKeyPreview?: string;
  usdtEnabled?: boolean;
  usdtNetwork?: string;
  usdtWalletAddress?: string;
  quotaExceededMessage?: string;
  quotaExceededResponseType?: 'text' | 'flex';
  quotaWarningEnabled?: boolean;
  quotaWarningThreshold?: number;
  quotaLowWarningMessage?: string;
  botDisabledSendMessage?: boolean;
  botDisabledMessage?: string;
  slipDisabledSendMessage?: boolean;
  slipDisabledMessage?: string;
  aiDisabledSendMessage?: boolean;
  aiDisabledMessage?: string;
  duplicateRefundEnabled?: boolean;
  duplicateSlipMessage?: string;
  slipErrorMessage?: string;
  imageDownloadErrorMessage?: string;
  invalidImageMessage?: string;
  slipProcessingMessage?: string;
  showSlipProcessingMessage?: boolean;
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  contactAdminLine?: string;
  contactAdminEmail?: string;
  bankAccounts?: BankAccountInfo[];
  // Preview settings
  previewSenderName?: string;
  previewReceiverName?: string;
  previewSenderBankCode?: string;
  previewReceiverBankCode?: string;
  previewAmount?: string;
  // Rate Limiter settings
  webhookRateLimitEnabled?: boolean;
  webhookRateLimitPerAccountPerSecond?: number;
  webhookRateLimitPerAccountPerMinute?: number;
  webhookRateLimitGlobalPerSecond?: number;
  webhookRateLimitGlobalPerMinute?: number;
  webhookRateLimitMessage?: string;
}

interface BankAccountInfo {
  bankCode?: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('infrastructure');
  const [banks, setBanks] = useState<Bank[]>([]);

  // Form States
  const [slipApiKey, setSlipApiKey] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [testingSlip, setTestingSlip] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  // Bank account form
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({
    bankCode: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
  });

  // USDT settings
  const [usdtSettings, setUsdtSettings] = useState({
    usdtEnabled: true,
    usdtNetwork: 'TRC20',
    usdtWalletAddress: '',
    usdtQrImage: '',
    usdtAutoVerify: true,
    etherscanApiKey: '',
    bscscanApiKey: '',
    tronscanApiKey: '',
  });

  // Communication Settings
  const [messageSettings, setMessageSettings] = useState({
    quotaExceededMessage: '',
    quotaExceededResponseType: 'text' as 'text' | 'flex',
    quotaWarningEnabled: true,
    quotaWarningThreshold: 10,
    quotaLowWarningMessage: '',
    botDisabledSendMessage: false,
    botDisabledMessage: '',
    slipDisabledSendMessage: false,
    slipDisabledMessage: '',
    aiDisabledSendMessage: false,
    aiDisabledMessage: '',
    duplicateRefundEnabled: true,
    duplicateSlipMessage: '',
    slipErrorMessage: '',
    imageDownloadErrorMessage: '',
    invalidImageMessage: '',
    slipProcessingMessage: '',
    showSlipProcessingMessage: true,
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
  });

  // Preview Settings
  const [previewSettings, setPreviewSettings] = useState({
    previewSenderName: 'นาย ธันเดอร์ มานะ',
    previewReceiverName: 'นาย ธันเดอร์ มานะ',
    previewSenderBankCode: '004',
    previewReceiverBankCode: '014',
    previewAmount: '1,000.00',
  });

  // Rate Limiter Settings
  const [rateLimitSettings, setRateLimitSettings] = useState({
    webhookRateLimitEnabled: true,
    webhookRateLimitPerAccountPerSecond: 10,
    webhookRateLimitPerAccountPerMinute: 100,
    webhookRateLimitGlobalPerSecond: 100,
    webhookRateLimitGlobalPerMinute: 1000,
    webhookRateLimitMessage: 'Too many requests, please try again later',
  });

  const fetchSettings = useCallback(async () => {
    try {
      const response = await systemSettingsApi.get();
      const data = response.data.settings || {};
      setSettings(data);
      setPublicBaseUrl(data.publicBaseUrl || '');
      setUsdtSettings({
        usdtEnabled: data.usdtEnabled ?? true,
        usdtNetwork: data.usdtNetwork || 'TRC20',
        usdtWalletAddress: data.usdtWalletAddress || '',
        usdtQrImage: data.usdtQrImage || '',
        usdtAutoVerify: data.usdtAutoVerify ?? true,
        etherscanApiKey: data.etherscanApiKey || '',
        bscscanApiKey: data.bscscanApiKey || '',
        tronscanApiKey: data.tronscanApiKey || '',
      });
      setMessageSettings({
        quotaExceededMessage: data.quotaExceededMessage || '⚠️ โควต้าการตรวจสอบสลิปของร้านค้านี้หมดแล้ว กรุณาติดต่อผู้ดูแลหรือเติมแพ็คเกจ',
        quotaExceededResponseType: data.quotaExceededResponseType || 'text',
        quotaWarningEnabled: data.quotaWarningEnabled ?? true,
        quotaWarningThreshold: data.quotaWarningThreshold || 10,
        quotaLowWarningMessage: data.quotaLowWarningMessage || '⚠️ โควต้าเหลือน้อยกว่า {threshold} สลิป กรุณาเติมแพ็คเกจ',
        botDisabledSendMessage: data.botDisabledSendMessage ?? false,
        botDisabledMessage: data.botDisabledMessage || '🔴 ระบบบอทปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
        slipDisabledSendMessage: data.slipDisabledSendMessage ?? false,
        slipDisabledMessage: data.slipDisabledMessage || '🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว กรุณาติดต่อผู้ดูแล',
        aiDisabledSendMessage: data.aiDisabledSendMessage ?? false,
        aiDisabledMessage: data.aiDisabledMessage || '🔴 ระบบ AI ตอบกลับปิดให้บริการชั่วคราว',
        duplicateRefundEnabled: data.duplicateRefundEnabled ?? true,
        duplicateSlipMessage: data.duplicateSlipMessage || '⚠️ สลิปนี้เคยถูกใช้แล้ว กรุณาใช้สลิปใหม่',
        slipErrorMessage: data.slipErrorMessage || '❌ เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาลองใหม่อีกครั้ง',
        imageDownloadErrorMessage: data.imageDownloadErrorMessage || '❌ ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่อีกครั้ง',
        invalidImageMessage: data.invalidImageMessage || '❌ รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน',
        slipProcessingMessage: data.slipProcessingMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
        showSlipProcessingMessage: data.showSlipProcessingMessage ?? true,
        maxRetryAttempts: data.maxRetryAttempts || 3,
        retryDelayMs: data.retryDelayMs || 1000,
      });
      setPreviewSettings({
        previewSenderName: data.previewSenderName || 'นาย ธันเดอร์ มานะ',
        previewReceiverName: data.previewReceiverName || 'นาย ธันเดอร์ มานะ',
        previewSenderBankCode: data.previewSenderBankCode || '004',
        previewReceiverBankCode: data.previewReceiverBankCode || '014',
        previewAmount: data.previewAmount || '1,000.00',
      });
      setRateLimitSettings({
        webhookRateLimitEnabled: data.webhookRateLimitEnabled ?? true,
        webhookRateLimitPerAccountPerSecond: data.webhookRateLimitPerAccountPerSecond ?? 10,
        webhookRateLimitPerAccountPerMinute: data.webhookRateLimitPerAccountPerMinute ?? 100,
        webhookRateLimitGlobalPerSecond: data.webhookRateLimitGlobalPerSecond ?? 100,
        webhookRateLimitGlobalPerMinute: data.webhookRateLimitGlobalPerMinute ?? 1000,
        webhookRateLimitMessage: data.webhookRateLimitMessage || 'Too many requests, please try again later',
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchBanks = useCallback(async () => {
    try {
      const res = await banksApi.getAll();
      setBanks(res.data.banks || []);
    } catch {
      // Non-blocking
      setBanks([]);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchBanks();
  }, [fetchSettings, fetchBanks]);

  const handleUpdate = async (section: string, payload: Record<string, unknown>) => {
    setIsSaving(section);
    try {
      const response = await systemSettingsApi.updateSystemSettings(payload);
      if (response.data.success) {
        toast.success('บันทึกการตั้งค่าสำเร็จ');
        await fetchSettings();
      } else {
        toast.error(response.data.message || 'บันทึกไม่สำเร็จ');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsSaving(null);
    }
  };

  const handleTestConnection = async (network: 'TRC20' | 'ERC20' | 'BEP20', apiKey: string) => {
    try {
      const toastId = toast.loading('กำลังตรวจสอบการเชื่อมต่อ...');

      const response = await systemSettingsApi.testUsdtApi(network, apiKey);

      toast.dismiss(toastId);

      if (response.data.valid) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (error: any) {
      toast.dismiss();
      toast.error(error.response?.data?.message || 'การเชื่อมต่อล้มเหลว');
    }
  };

  const handleTestSlipApi = async () => {
    setTestingSlip(true);
    try {
      const response = await slipApi.testConnection(slipApiKey || 'use-saved');
      if (response.data.success) {
        toast.success(`เชื่อมต่อสำเร็จ! โควต้าคงเหลือ: ${response.data.remainingQuota?.toLocaleString() || 'N/A'}`);
      } else {
        toast.error(response.data.message || 'เชื่อมต่อกับ Thunder API ไม่สำเร็จ');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการทดสอบ');
    } finally {
      setTestingSlip(false);
    }
  };

  const handleTestAiApi = async () => {
    setTestingAi(true);
    try {
      const response = await chatbotApi.testConnection(aiApiKey || 'use-saved');
      if (response.data.success) {
        toast.success('เชื่อมต่อกับ OpenAI สำเร็จ!');
      } else {
        toast.error(response.data.message || 'เชื่อมต่อกับ AI API ไม่สำเร็จ');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาดในการทดสอบ');
    } finally {
      setTestingAi(false);
    }
  };

  const handleAddBankAccount = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.accountName) {
      toast.error('กรุณากรอกข้อมูลบัญชีให้ครบถ้วน');
      return;
    }

    setIsSaving('bank_add');
    try {
      const response = await systemSettingsApi.addBankAccount(bankForm);
      if (response.data.success) {
        toast.success('เพิ่มบัญชีธนาคารสำเร็จ');
        setShowBankModal(false);
        setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' });
        fetchSettings();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSaving(null);
    }
  };

  const handleRemoveBankAccount = async (index: number) => {
    try {
      const response = await systemSettingsApi.removeBankAccount(index);
      if (response.data.success) {
        toast.success('ลบบัญชีธนาคารแล้ว');
        fetchSettings();
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการลบ');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading />
      </DashboardLayout>
    );
  }

  const tabs = [
    { id: 'infrastructure', name: 'โครงสร้างหลัก', icon: '⚡' },
    { id: 'communication', name: 'การสื่อสาร', icon: '💬' },
    { id: 'financials', name: 'การเงิน', icon: '💳' },
  ] as const;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-8 md:pb-12">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              ตั้งค่า<span className="text-[#06C755]">ระบบ</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              จัดการการตั้งค่าหลักของระบบ
            </p>
          </div>
          <Badge variant="emerald" className="px-4 py-1.5 font-semibold text-xs rounded-full mt-4 lg:mt-0">
            ปรอดักชัน
          </Badge>
        </div>

        {/* Tab Switcher - Mobile Scroll */}
        <div className="overflow-x-auto no-scrollbar pb-2">
          <div className="flex p-1.5 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={cn(
                  "relative px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black transition-all duration-500 flex items-center gap-2 sm:gap-3 whitespace-nowrap",
                  activeTab === tab.id ? "text-slate-900" : "text-slate-500 hover:text-white"
                )}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabSlot"
                    className="absolute inset-0 bg-emerald-400 rounded-xl sm:rounded-2xl shadow-emerald-400/20 shadow-xl"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{tab.icon}</span>
                <span className="relative z-10 uppercase tracking-widest">{tab.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:gap-10">
          <AnimatePresence mode="wait">
            {activeTab === 'infrastructure' && (
              <motion.div
                key="infrastructure"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 md:space-y-8"
              >
                {/* Webhook Configuration */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">🌐</div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">URL ระบบ</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">ตั้งค่า URL หลักของระบบ</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-10">
                    <div className="lg:col-span-3">
                      <Input
                        label="Public Base URL"
                        placeholder="https://api.yourdomain.com"
                        value={publicBaseUrl}
                        onChange={(e) => setPublicBaseUrl(e.target.value)}
                        className="font-black text-emerald-400 h-14 rounded-2xl bg-white/[0.03] border-white/10"
                        hint="URL สำหรับ Webhook"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        fullWidth
                        size="lg"
                        className="rounded-2xl h-14 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/10 shadow-xl"
                        onClick={() => handleUpdate('base_url', { publicBaseUrl })}
                        isLoading={isSaving === 'base_url'}
                      >
                        บันทึก URL
                      </Button>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
                  {/* Thunder API */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-xl shadow-inner">⚡</div>
                        <div>
                          <h2 className="text-lg font-black text-white uppercase tracking-tight">Thunder API</h2>
                          <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">ตรวจสอบสลิป</p>
                        </div>
                      </div>
                      <Badge variant={settings?.slipApiKeyPreview ? "emerald" : "outline"} size="sm" className="font-black uppercase tracking-widest text-[9px]">
                        {settings?.slipApiKeyPreview ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <Input
                        type="password"
                        label="API Key ใหม่"
                        placeholder="••••••••••••••••"
                        value={slipApiKey}
                        onChange={(e) => setSlipApiKey(e.target.value)}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                      />
                      <div className="flex gap-4">
                        <Button
                          variant="primary"
                          className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] shadow-emerald-500/10"
                          onClick={() => handleUpdate('slip_api', { slipApiKey })}
                          isLoading={isSaving === 'slip_api'}
                        >
                          บันทึก
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] border border-white/5 hover:bg-white/5 text-slate-400 hover:text-white"
                          onClick={handleTestSlipApi}
                          isLoading={testingSlip}
                        >
                          ทดสอบ
                        </Button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium text-center italic">
                        เข้าสู่หน้าตั้งค่าได้ที่ <a href="https://thunder.in.th" target="_blank" className="text-indigo-500 font-black hover:underline">thunder.in.th</a>
                      </p>
                    </div>
                  </Card>

                  {/* OpenAI API */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-xl shadow-inner">🤖</div>
                        <div>
                          <h2 className="text-lg font-black text-white uppercase tracking-tight">AI ตอบกลับ</h2>
                          <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">ระบบ AI ตอบกลับ</p>
                        </div>
                      </div>
                      <Badge variant={settings?.aiApiKeyPreview ? "emerald" : "outline"} size="sm" className="font-black uppercase tracking-widest text-[9px]">
                        {settings?.aiApiKeyPreview ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <Input
                          type="password"
                          label="OpenAI API Key"
                          placeholder="sk-••••••••••••••••"
                          value={aiApiKey}
                          onChange={(e) => setAiApiKey(e.target.value)}
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                        />
                      </div>
                      <div className="flex gap-4">
                        <Button
                          variant="primary"
                          className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] shadow-emerald-500/10"
                          onClick={() => handleUpdate('ai_api', { aiApiKey })}
                          isLoading={isSaving === 'ai_api'}
                        >
                          บันทึก
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] border border-white/5 hover:bg-white/5 text-slate-400 hover:text-white"
                          onClick={handleTestAiApi}
                          isLoading={testingAi}
                        >
                          ทดสอบ
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Slip Preview Sample Data Settings */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">🧾</div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">ตัวอย่างสลิป</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">ตั้งค่าข้อมูลตัวอย่างสำหรับแสดงผลสลิป</p>
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="mb-8 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-start gap-3">
                      <span className="text-blue-400 text-lg">💡</span>
                      <div>
                        <p className="text-sm font-semibold text-blue-400">คำแนะนำ</p>
                        <p className="text-xs text-slate-400 mt-1">ข้อมูลนี้จะแสดงในหน้าตัวอย่างสลิปของผู้ใช้งาน ช่วยให้เห็นภาพรวมของเทมเพลตก่อนเลือกใช้</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    {/* Sender Info */}
                    <div className="space-y-4">
                      <p className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em]">ข้อมูลผู้โอน</p>
                      <Input
                        label="ชื่อผู้โอน"
                        placeholder="นาย ธันเดอร์ มานะ"
                        value={previewSettings.previewSenderName}
                        onChange={(e) => setPreviewSettings({ ...previewSettings, previewSenderName: e.target.value })}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                        error={!previewSettings.previewSenderName ? 'กรุณากรอกชื่อผู้โอน' : undefined}
                      />
                      <Select
                        label="ธนาคารผู้โอน"
                        value={previewSettings.previewSenderBankCode}
                        onChange={(e) => setPreviewSettings({ ...previewSettings, previewSenderBankCode: e.target.value })}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black text-xs"
                        error={!previewSettings.previewSenderBankCode ? 'กรุณาเลือกธนาคาร' : undefined}
                      >
                        <option value="">เลือกธนาคาร</option>
                        {banks.length === 0 ? (
                          <option value="" disabled>กำลังโหลดข้อมูลธนาคาร...</option>
                        ) : (
                          banks.map((b) => (
                            <option key={b._id} value={b.code}>
                              {b.shortName ? `${b.shortName} • ` : ''}{b.nameTh || b.name}
                            </option>
                          ))
                        )}
                      </Select>
                      {/* Sender Bank Preview */}
                      {previewSettings.previewSenderBankCode && banks.length > 0 && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          {(() => {
                            const bank = banks.find(b => b.code === previewSettings.previewSenderBankCode);
                            const logo = bank?.logoBase64 || bank?.logoUrl;
                            return (
                              <>
                                {logo ? (
                                  <img src={logo} alt={bank?.name || 'Bank'} className="w-8 h-8 object-contain rounded-lg bg-white p-1" />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs">🏦</div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-emerald-400 truncate">{bank?.nameTh || bank?.name || 'ไม่พบธนาคาร'}</p>
                                  <p className="text-[10px] text-slate-400">รหัส: {previewSettings.previewSenderBankCode}</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Receiver Info */}
                    <div className="space-y-4">
                      <p className="text-xs font-black text-blue-400 uppercase tracking-[0.2em]">ข้อมูลผู้รับ</p>
                      <Input
                        label="ชื่อผู้รับ"
                        placeholder="นาย ธันเดอร์ มานะ"
                        value={previewSettings.previewReceiverName}
                        onChange={(e) => setPreviewSettings({ ...previewSettings, previewReceiverName: e.target.value })}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                        error={!previewSettings.previewReceiverName ? 'กรุณากรอกชื่อผู้รับ' : undefined}
                      />
                      <Select
                        label="ธนาคารผู้รับ"
                        value={previewSettings.previewReceiverBankCode}
                        onChange={(e) => setPreviewSettings({ ...previewSettings, previewReceiverBankCode: e.target.value })}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black text-xs"
                        error={!previewSettings.previewReceiverBankCode ? 'กรุณาเลือกธนาคาร' : undefined}
                      >
                        <option value="">เลือกธนาคาร</option>
                        {banks.length === 0 ? (
                          <option value="" disabled>กำลังโหลดข้อมูลธนาคาร...</option>
                        ) : (
                          banks.map((b) => (
                            <option key={b._id} value={b.code}>
                              {b.shortName ? `${b.shortName} • ` : ''}{b.nameTh || b.name}
                            </option>
                          ))
                        )}
                      </Select>
                      {/* Receiver Bank Preview */}
                      {previewSettings.previewReceiverBankCode && banks.length > 0 && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          {(() => {
                            const bank = banks.find(b => b.code === previewSettings.previewReceiverBankCode);
                            const logo = bank?.logoBase64 || bank?.logoUrl;
                            return (
                              <>
                                {logo ? (
                                  <img src={logo} alt={bank?.name || 'Bank'} className="w-8 h-8 object-contain rounded-lg bg-white p-1" />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xs">🏦</div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-blue-400 truncate">{bank?.nameTh || bank?.name || 'ไม่พบธนาคาร'}</p>
                                  <p className="text-[10px] text-slate-400">รหัส: {previewSettings.previewReceiverBankCode}</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="lg:col-span-2 space-y-4">
                      <Input
                        label="จำนวนเงินตัวอย่าง"
                        placeholder="1,000.00"
                        value={previewSettings.previewAmount}
                        onChange={(e) => {
                          // Allow only numbers, commas, and dots
                          const value = e.target.value.replace(/[^0-9,.]/g, '');
                          setPreviewSettings({ ...previewSettings, previewAmount: value });
                        }}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                        hint="รูปแบบ: 1,000.00 (ตัวเลขเท่านั้น)"
                        error={!previewSettings.previewAmount ? 'กรุณากรอกจำนวนเงิน' : undefined}
                      />
                    </div>

                    {/* Validation Summary */}
                    {(!previewSettings.previewSenderName || !previewSettings.previewReceiverName ||
                      !previewSettings.previewSenderBankCode || !previewSettings.previewReceiverBankCode ||
                      !previewSettings.previewAmount) && (
                        <div className="lg:col-span-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-start gap-3">
                            <span className="text-amber-400 text-lg">⚠️</span>
                            <div>
                              <p className="text-sm font-semibold text-amber-400">กรุณากรอกข้อมูลให้ครบถ้วน</p>
                              <ul className="text-xs text-slate-400 mt-1 space-y-0.5">
                                {!previewSettings.previewSenderName && <li>• ชื่อผู้โอน</li>}
                                {!previewSettings.previewSenderBankCode && <li>• ธนาคารผู้โอน</li>}
                                {!previewSettings.previewReceiverName && <li>• ชื่อผู้รับ</li>}
                                {!previewSettings.previewReceiverBankCode && <li>• ธนาคารผู้รับ</li>}
                                {!previewSettings.previewAmount && <li>• จำนวนเงิน</li>}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                    <div className="lg:col-span-2 pt-6 border-t border-white/5">
                      <Button
                        fullWidth
                        size="lg"
                        className="rounded-2xl h-14 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/10 shadow-xl"
                        onClick={() => {
                          // Validate before saving
                          if (!previewSettings.previewSenderName || !previewSettings.previewReceiverName ||
                            !previewSettings.previewSenderBankCode || !previewSettings.previewReceiverBankCode ||
                            !previewSettings.previewAmount) {
                            toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
                            return;
                          }
                          handleUpdate('preview', previewSettings);
                        }}
                        isLoading={isSaving === 'preview'}
                        disabled={!previewSettings.previewSenderName || !previewSettings.previewReceiverName ||
                          !previewSettings.previewSenderBankCode || !previewSettings.previewReceiverBankCode ||
                          !previewSettings.previewAmount}
                      >
                        บันทึกการตั้งค่าตัวอย่าง
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Webhook Rate Limiter Settings */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-rose-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">🛡️</div>
                    <div className="flex-1">
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Rate Limiter</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">ป้องกัน DDoS Attack สำหรับ Webhook</p>
                    </div>
                    <Switch
                      checked={rateLimitSettings.webhookRateLimitEnabled}
                      onChange={() => setRateLimitSettings({ ...rateLimitSettings, webhookRateLimitEnabled: !rateLimitSettings.webhookRateLimitEnabled })}
                    />
                  </div>

                  {rateLimitSettings.webhookRateLimitEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-8"
                    >
                      {/* Info Box */}
                      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                        <div className="flex items-start gap-3">
                          <span className="text-rose-400 text-lg">⚠️</span>
                          <div>
                            <p className="text-sm font-semibold text-rose-400">การป้องกัน DDoS</p>
                            <p className="text-xs text-slate-400 mt-1">จำกัดจำนวน request ที่เข้ามาทาง Webhook เพื่อป้องกันการโจมตีแบบ DDoS</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                        {/* Per Account Limits */}
                        <div className="space-y-4 p-6 bg-white/[0.02] rounded-3xl border border-white/5">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em]">ต่อ LINE Account</p>
                          <Input
                            type="number"
                            label="จำนวน/วินาที"
                            value={rateLimitSettings.webhookRateLimitPerAccountPerSecond}
                            onChange={(e) => setRateLimitSettings({ ...rateLimitSettings, webhookRateLimitPerAccountPerSecond: parseInt(e.target.value) || 10 })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                            hint="จำนวน request สูงสุดต่อวินาที"
                          />
                          <Input
                            type="number"
                            label="จำนวน/นาที"
                            value={rateLimitSettings.webhookRateLimitPerAccountPerMinute}
                            onChange={(e) => setRateLimitSettings({ ...rateLimitSettings, webhookRateLimitPerAccountPerMinute: parseInt(e.target.value) || 100 })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                            hint="จำนวน request สูงสุดต่อนาที"
                          />
                        </div>

                        {/* Global Limits */}
                        <div className="space-y-4 p-6 bg-white/[0.02] rounded-3xl border border-white/5">
                          <p className="text-xs font-black text-blue-400 uppercase tracking-[0.2em]">ทั้งระบบ (Global)</p>
                          <Input
                            type="number"
                            label="จำนวน/วินาที"
                            value={rateLimitSettings.webhookRateLimitGlobalPerSecond}
                            onChange={(e) => setRateLimitSettings({ ...rateLimitSettings, webhookRateLimitGlobalPerSecond: parseInt(e.target.value) || 100 })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                            hint="จำนวน request สูงสุดต่อวินาที (ทุก account รวมกัน)"
                          />
                          <Input
                            type="number"
                            label="จำนวน/นาที"
                            value={rateLimitSettings.webhookRateLimitGlobalPerMinute}
                            onChange={(e) => setRateLimitSettings({ ...rateLimitSettings, webhookRateLimitGlobalPerMinute: parseInt(e.target.value) || 1000 })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                            hint="จำนวน request สูงสุดต่อนาที (ทุก account รวมกัน)"
                          />
                        </div>

                        {/* Rate Limit Message */}
                        <div className="lg:col-span-2 space-y-4">
                          <Input
                            label="ข้อความเมื่อถูกบล็อก (HTTP 429)"
                            value={rateLimitSettings.webhookRateLimitMessage}
                            onChange={(e) => setRateLimitSettings({ ...rateLimitSettings, webhookRateLimitMessage: e.target.value })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                            hint="ข้อความที่ส่งกลับเมื่อ request เกินกำหนด"
                          />
                        </div>
                      </div>

                      {/* Current Settings Summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-white/5">
                        <div className="text-center p-4 bg-emerald-500/10 rounded-2xl">
                          <p className="text-2xl font-black text-emerald-400">{rateLimitSettings.webhookRateLimitPerAccountPerSecond}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">req/s per account</p>
                        </div>
                        <div className="text-center p-4 bg-emerald-500/10 rounded-2xl">
                          <p className="text-2xl font-black text-emerald-400">{rateLimitSettings.webhookRateLimitPerAccountPerMinute}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">req/m per account</p>
                        </div>
                        <div className="text-center p-4 bg-blue-500/10 rounded-2xl">
                          <p className="text-2xl font-black text-blue-400">{rateLimitSettings.webhookRateLimitGlobalPerSecond}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">req/s global</p>
                        </div>
                        <div className="text-center p-4 bg-blue-500/10 rounded-2xl">
                          <p className="text-2xl font-black text-blue-400">{rateLimitSettings.webhookRateLimitGlobalPerMinute}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">req/m global</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="pt-6 border-t border-white/5 mt-8">
                    <Button
                      fullWidth
                      size="lg"
                      className="rounded-2xl h-14 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/10 shadow-xl"
                      onClick={() => handleUpdate('rate_limit', rateLimitSettings)}
                      isLoading={isSaving === 'rate_limit'}
                    >
                      บันทึกการตั้งค่า Rate Limiter
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'communication' && (
              <motion.div
                key="communication"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Communication Policy Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <StatCard title="จำนวนลองซ้ำ" value={messageSettings.maxRetryAttempts} icon="🔄" color="blue" variant="glass" />
                  <StatCard title="ระยะห่างลอง" value={`${messageSettings.retryDelayMs}ms`} icon="⏱️" color="indigo" variant="glass" />
                  <StatCard title="เกณฑ์แจ้งเตือน" value={messageSettings.quotaWarningThreshold} icon="🔔" color="amber" variant="glass" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Quota & เชื่อมต่อแล้ว Messages */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] space-y-8">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mb-2">การจัดการโควต้า</h3>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">ข้อความเมื่อโควต้าหมดหรือเหลือน้อย</p>
                    </div>

                    <div className="space-y-6">
                      <TextArea
                        label="ข้อความเมื่อโควต้าหมด"
                        value={messageSettings.quotaExceededMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, quotaExceededMessage: e.target.value })}
                        rows={2}
                        className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                      />
                      <Select
                        label="รูปแบบการตอบกลับ"
                        value={messageSettings.quotaExceededResponseType}
                        onChange={(e) => setMessageSettings({ ...messageSettings, quotaExceededResponseType: e.target.value as 'text' | 'flex' })}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black text-xs"
                      >
                        <option value="text">ข้อความธรรมดา</option>
                        <option value="flex">Flex Message</option>
                      </Select>

                      <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white uppercase tracking-tight text-xs">แจ้งเตือนโควต้าเหลือน้อย</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">เปิดใช้การแจ้งเตือนล่วงหน้า</p>
                        </div>
                        <Switch
                          checked={messageSettings.quotaWarningEnabled}
                          onChange={() => setMessageSettings({ ...messageSettings, quotaWarningEnabled: !messageSettings.quotaWarningEnabled })}
                        />
                      </div>

                      {messageSettings.quotaWarningEnabled && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-6 pt-2"
                        >
                          <Input
                            type="number"
                            label="เกณฑ์แจ้งเตือน (จำนวนสลิป)"
                            value={messageSettings.quotaWarningThreshold}
                            onChange={(e) => setMessageSettings({ ...messageSettings, quotaWarningThreshold: parseInt(e.target.value) || 10 })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                          />
                          <TextArea
                            label="ข้อความแจ้งเตือน"
                            value={messageSettings.quotaLowWarningMessage}
                            onChange={(e) => setMessageSettings({ ...messageSettings, quotaLowWarningMessage: e.target.value })}
                            hint="ใช้ {threshold} หรือ {remaining} เป็นตัวแปร"
                            className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                          />
                        </motion.div>
                      )}
                    </div>
                  </Card>

                  {/* Slip Verification Logic */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] space-y-8">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mb-2">การตอบกลับสลิป</h3>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">ข้อความตอบกลับในสถานการณ์ต่างๆ</p>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white uppercase tracking-tight text-xs">แสดงข้อความกำลังตรวจสอบ</p>
                          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">&quot;กำลังตรวจสอบสลิป...&quot;</p>
                        </div>
                        <Switch
                          checked={messageSettings.showSlipProcessingMessage}
                          onChange={() => setMessageSettings({ ...messageSettings, showSlipProcessingMessage: !messageSettings.showSlipProcessingMessage })}
                        />
                      </div>

                      <Input
                        label="ข้อความกำลังตรวจสอบ"
                        value={messageSettings.slipProcessingMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, slipProcessingMessage: e.target.value })}
                        disabled={!messageSettings.showSlipProcessingMessage}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                      />

                      <div className="grid grid-cols-1 gap-6 pt-6 border-t border-white/5">
                        <TextArea
                          label="สลิปซ้ำ"
                          value={messageSettings.duplicateSlipMessage}
                          onChange={(e) => setMessageSettings({ ...messageSettings, duplicateSlipMessage: e.target.value })}
                          rows={2}
                          className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                        />
                        <div className="flex items-center justify-between px-2">
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">คืนโควต้าเมื่อสลิปซ้ำ?</p>
                          <Switch
                            checked={messageSettings.duplicateRefundEnabled}
                            onChange={() => setMessageSettings({ ...messageSettings, duplicateRefundEnabled: !messageSettings.duplicateRefundEnabled })}
                          />
                        </div>
                      </div>

                      <TextArea
                        label="ข้อผิดพลาดตรวจสอบสลิป"
                        value={messageSettings.slipErrorMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, slipErrorMessage: e.target.value })}
                        rows={2}
                        className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                      />
                    </div>
                  </Card>

                  {/* เชื่อมต่อแล้ว Status (Switches) */}
                  <Card className="lg:col-span-2 p-10 bg-slate-900 border border-white/5 shadow-2xl rounded-[3rem]">
                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-14 h-14 bg-emerald-400/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner">⚡</div>
                      <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">การลองใหม่อัตโนมัติ</h2>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">ตั้งค่าการลองใหม่เมื่อเกิดข้อผิดพลาด</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                      <div className="md:col-span-2 space-y-8">
                        <div className="p-6 bg-white/5 rounded-3xl space-y-4">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em]">ตั้งค่าการลองใหม่</p>
                          <div className="grid grid-cols-2 gap-6">
                            <Input
                              type="number"
                              label="จำนวนครั้งสูงสุด"
                              value={messageSettings.maxRetryAttempts}
                              onChange={(e) => setMessageSettings({ ...messageSettings, maxRetryAttempts: parseInt(e.target.value) || 3 })}
                              className="bg-white/5 border-white/10 text-white"
                            />
                            <Input
                              type="number"
                              label="หน่วงเวลา (ms)"
                              value={messageSettings.retryDelayMs}
                              onChange={(e) => setMessageSettings({ ...messageSettings, retryDelayMs: parseInt(e.target.value) || 1000 })}
                              className="bg-white/5 border-white/10 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2 flex flex-col justify-between pt-2">
                        <div className="space-y-4">
                          <p className="text-xs font-black text-rose-400 uppercase tracking-[0.2em]">การแจ้งเตือนอัตโนมัติ</p>
                          <div className="space-y-3">
                            {/* Bot Disabled */}
                            <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold">บอทปิดให้บริการ</span>
                                <Switch
                                  checked={messageSettings.botDisabledSendMessage}
                                  onChange={() => setMessageSettings({ ...messageSettings, botDisabledSendMessage: !messageSettings.botDisabledSendMessage })}
                                />
                              </div>
                              {messageSettings.botDisabledSendMessage && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                  <input
                                    className="w-full bg-black/40 border-none rounded-xl px-4 py-2 text-xs font-medium text-emerald-400 placeholder:text-slate-600 outline-none"
                                    value={messageSettings.botDisabledMessage}
                                    onChange={(e) => setMessageSettings({ ...messageSettings, botDisabledMessage: e.target.value })}
                                  />
                                </motion.div>
                              )}
                            </div>
                            {/* Slip Disabled */}
                            <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold">ตรวจสอบสลิปปิดให้บริการ</span>
                                <Switch
                                  checked={messageSettings.slipDisabledSendMessage}
                                  onChange={() => setMessageSettings({ ...messageSettings, slipDisabledSendMessage: !messageSettings.slipDisabledSendMessage })}
                                />
                              </div>
                              {messageSettings.slipDisabledSendMessage && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                  <input
                                    className="w-full bg-black/40 border-none rounded-xl px-4 py-2 text-xs font-medium text-emerald-400 placeholder:text-slate-600 outline-none"
                                    value={messageSettings.slipDisabledMessage}
                                    onChange={(e) => setMessageSettings({ ...messageSettings, slipDisabledMessage: e.target.value })}
                                  />
                                </motion.div>
                              )}
                            </div>
                            {/* AI Disabled */}
                            <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold">AI ตอบกลับปิดให้บริการ</span>
                                <Switch
                                  checked={messageSettings.aiDisabledSendMessage}
                                  onChange={() => setMessageSettings({ ...messageSettings, aiDisabledSendMessage: !messageSettings.aiDisabledSendMessage })}
                                />
                              </div>
                              {messageSettings.aiDisabledSendMessage && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                  <input
                                    className="w-full bg-black/40 border-none rounded-xl px-4 py-2 text-xs font-medium text-emerald-400 placeholder:text-slate-600 outline-none"
                                    value={messageSettings.aiDisabledMessage}
                                    onChange={(e) => setMessageSettings({ ...messageSettings, aiDisabledMessage: e.target.value })}
                                  />
                                </motion.div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 pt-10 border-t border-white/5 flex justify-end">
                      <Button
                        variant="primary"
                        size="lg"
                        className="px-10 h-16 rounded-2xl shadow-emerald-500/20 font-black tracking-widest uppercase text-[11px]"
                        onClick={() => handleUpdate('messages', messageSettings)}
                        isLoading={isSaving === 'messages'}
                      >
                        บันทึกการตั้งค่า
                      </Button>
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {activeTab === 'financials' && (
              <motion.div
                key="financials"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-10"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  {/* Bank Gateways */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] flex flex-col h-full">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl">🏦</div>
                        <div>
                          <h2 className="text-2xl font-black uppercase tracking-tight text-white">บัญชีธนาคาร</h2>
                          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">บัญชีสำหรับรับชำระเงิน</p>
                        </div>
                      </div>
                      <IconButton
                        variant="primary"
                        size="lg"
                        className="rounded-2xl shadow-emerald-400/20 shadow-xl"
                        onClick={() => setShowBankModal(true)}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                      </IconButton>
                    </div>

                    <div className="flex-1 space-y-4">
                      {settings?.bankAccounts?.length ? (
                        settings.bankAccounts.map((account: BankAccountInfo, index: number) => (
                          (() => {
                            const bankCode = (account.bankCode || '').toString().toUpperCase();
                            const bank = bankCode ? banks.find(b => b.code === bankCode) : undefined;
                            const logo = bank?.logoBase64 || bank?.logoUrl || null;
                            const title = bank?.nameTh || bank?.name || account.bankName;
                            const subtitle = bank?.shortName || bankCode || '';
                            return (
                              <div key={index} className="group p-6 bg-white/[0.02] hover:bg-white/[0.04] rounded-[2rem] border border-white/5 transition-all flex items-center justify-between">
                                <div className="flex items-center gap-5">
                                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden border border-white/10 shadow-sm">
                                    {logo ? (
                                      <img src={logo as string} alt={subtitle || title} className="w-8 h-8 object-contain" />
                                    ) : (
                                      <span className="text-black font-black text-xs uppercase">
                                        {(subtitle || title).slice(0, 2)}
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-black text-white leading-none mb-1 uppercase tracking-tight">
                                      {title}{subtitle ? <span className="text-slate-500 font-bold"> • {subtitle}</span> : null}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">{account.accountNumber} • {account.accountName}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleRemoveBankAccount(index)}
                                  className="p-2 text-rose-500/50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            );
                          })()
                        ))
                      ) : (
                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem]">
                          <p className="text-slate-700 font-black uppercase tracking-widest text-[10px]">ยังไม่มีบัญชีธนาคาร</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Digital Asset Gateways (USDT) */}
                  <Card className="p-10 bg-slate-900 border border-white/5 shadow-2xl rounded-[3rem]">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-emerald-400/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner shadow-emerald-400/5">💎</div>
                        <div>
                          <h2 className="text-2xl font-black text-white uppercase tracking-tight">USDT</h2>
                          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">กระเป๋าเงินคริปโต</p>
                        </div>
                      </div>
                      <Switch
                        checked={usdtSettings.usdtEnabled}
                        onChange={() => setUsdtSettings({ ...usdtSettings, usdtEnabled: !usdtSettings.usdtEnabled })}
                      />
                    </div>

                    <div className="space-y-8">
                      <Select
                        label="เครือข่าย"
                        value={usdtSettings.usdtNetwork}
                        onChange={(e) => setUsdtSettings({ ...usdtSettings, usdtNetwork: e.target.value })}
                        className="bg-white/5 border-white/10 text-white"
                      >
                        <option value="TRC20">TRC20 (Tron)</option>
                        <option value="ERC20">ERC20 (Ethereum)</option>
                        <option value="BEP20">BEP20 (BSC)</option>
                      </Select>

                      <Input
                        label="ที่อยู่กระเป๋า"
                        variant="glass"
                        value={usdtSettings.usdtWalletAddress}
                        onChange={(e) => setUsdtSettings({ ...usdtSettings, usdtWalletAddress: e.target.value })}
                        className="bg-white/5 border-white/10 text-white font-mono"
                        placeholder="T..."
                      />

                      {/* QR Code Upload */}
                      <div className="space-y-3">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-400">รูป QR Code กระเป๋า</label>
                        <div className="flex items-start gap-6">
                          {/* QR Preview */}
                          <div className="w-32 h-32 bg-white/5 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0">
                            {usdtSettings.usdtQrImage ? (
                              <img src={usdtSettings.usdtQrImage} alt="USDT QR" className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-3xl opacity-30">🖼️</span>
                            )}
                          </div>
                          {/* Upload Button */}
                          <div className="flex-1 space-y-3">
                            <input
                              type="file"
                              accept="image/*"
                              id="usdt-qr-upload"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 2 * 1024 * 1024) {
                                    toast.error('ไฟล์ต้องมีขนาดไม่เกิน 2MB');
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const base64 = event.target?.result as string;
                                    setUsdtSettings({ ...usdtSettings, usdtQrImage: base64 });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <label
                              htmlFor="usdt-qr-upload"
                              className="block text-center cursor-pointer px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-colors"
                            >
                              📷 อัปโหลดรูป QR
                            </label>
                            {usdtSettings.usdtQrImage && (
                              <button
                                onClick={() => setUsdtSettings({ ...usdtSettings, usdtQrImage: '' })}
                                className="w-full text-center px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors"
                              >
                                ลบรูป
                              </button>
                            )}
                            <p className="text-[10px] text-slate-500">รองรับ PNG, JPEG ขนาดไม่เกิน 2MB</p>
                          </div>
                        </div>
                      </div>

                      {/* Auto Verify Toggle */}
                      <div className="flex items-center justify-between py-4 px-5 bg-white/5 rounded-2xl">
                        <div>
                          <p className="text-sm font-bold text-white">ตรวจสอบอัตโนมัติ</p>
                          <p className="text-[10px] text-slate-500">ตรวจสอบ TxHash บน Blockchain อัตโนมัติ</p>
                        </div>
                        <Switch
                          checked={usdtSettings.usdtAutoVerify}
                          onChange={() => setUsdtSettings({ ...usdtSettings, usdtAutoVerify: !usdtSettings.usdtAutoVerify })}
                        />
                      </div>

                      {/* Network-specific API Keys */}


                      {usdtSettings.usdtNetwork === 'ERC20' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">🔑</span>
                            <label className="text-xs font-black uppercase tracking-widest text-amber-400">
                              Etherscan API Key (จำเป็นสำหรับ ERC20)
                            </label>
                          </div>
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <Input
                                variant="glass"
                                type={usdtSettings.etherscanApiKey?.includes('...') ? 'text' : 'password'}
                                value={usdtSettings.etherscanApiKey}
                                onChange={(e) => setUsdtSettings({ ...usdtSettings, etherscanApiKey: e.target.value })}
                                className="bg-white/5 border-white/10 text-white font-mono"
                                placeholder="ใส่ Etherscan API Key..."
                              />
                            </div>
                            <Button
                              variant="ghost"
                              className="px-4 border border-white/10 hover:bg-white/5"
                              onClick={() => handleTestConnection('ERC20', usdtSettings.etherscanApiKey)}
                              disabled={!usdtSettings.etherscanApiKey}
                            >
                              ทดสอบ
                            </Button>
                          </div>
                          {!usdtSettings.etherscanApiKey ? (
                            <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 px-3 py-2 rounded-lg">
                              <span>⚠️</span>
                              <span className="text-xs">ยังไม่ได้ตั้งค่า API Key - สมัครฟรีที่ etherscan.io/apis</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-2 rounded-lg">
                              <span className="text-xs">API Key ถูกเข้ารหัสแล้ว: {usdtSettings.etherscanApiKey.includes('...') ? usdtSettings.etherscanApiKey : '****************'}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {usdtSettings.usdtNetwork === 'BEP20' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">🔑</span>
                            <label className="text-xs font-black uppercase tracking-widest text-amber-400">
                              BSCScan API Key (จำเป็นสำหรับ BEP20)
                            </label>
                          </div>
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <Input
                                variant="glass"
                                type={usdtSettings.bscscanApiKey?.includes('...') ? 'text' : 'password'}
                                value={usdtSettings.bscscanApiKey}
                                onChange={(e) => setUsdtSettings({ ...usdtSettings, bscscanApiKey: e.target.value })}
                                className="bg-white/5 border-white/10 text-white font-mono"
                                placeholder="ใส่ BSCScan API Key..."
                              />
                            </div>
                            <Button
                              variant="ghost"
                              className="px-4 border border-white/10 hover:bg-white/5"
                              onClick={() => handleTestConnection('BEP20', usdtSettings.bscscanApiKey)}
                              disabled={!usdtSettings.bscscanApiKey}
                            >
                              ทดสอบ
                            </Button>
                          </div>
                          {!usdtSettings.bscscanApiKey ? (
                            <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 px-3 py-2 rounded-lg">
                              <span>⚠️</span>
                              <span className="text-xs">ยังไม่ได้ตั้งค่า API Key - สมัครฟรีที่ bscscan.com/apis</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-2 rounded-lg">
                              <span className="text-xs">API Key ถูกเข้ารหัสแล้ว: {usdtSettings.bscscanApiKey.includes('...') ? usdtSettings.bscscanApiKey : '****************'}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {usdtSettings.usdtNetwork === 'TRC20' && (
                        <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg">
                          <span>✅</span>
                          <span className="text-xs">TRC20 ไม่ต้องใช้ API Key - พร้อมใช้งาน</span>
                        </div>
                      )}

                      <div className="pt-10 border-t border-white/5">
                        <Button
                          fullWidth
                          variant="primary"
                          size="lg"
                          className="h-16 rounded-2xl font-black tracking-widest uppercase"
                          onClick={() => handleUpdate('usdt', usdtSettings)}
                          isLoading={isSaving === 'usdt'}
                        >
                          บันทึกการตั้งค่า USDT
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* System Contacts */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] border border-white/5">
                  <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-10 text-center">
                    <span className="px-4">ช่องทางติดต่อ</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-1 text-center md:text-left">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">LINE แอดมิน</p>
                      <p className="text-3xl font-black text-emerald-400">@{settings?.contactAdminLine || 'ไม่ระบุ'}</p>
                    </div>
                    <div className="space-y-1 text-center md:text-right">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">อีเมลติดต่อ</p>
                      <p className="text-xl sm:text-2xl font-black text-white font-mono uppercase tracking-tight">{settings?.contactAdminEmail || 'ไม่ระบุ'}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Modal
        isOpen={showBankModal}
        onClose={() => !isSaving && setShowBankModal(false)}
        title="เพิ่มบัญชีธนาคาร"
        size="md"
      >
        <div className="space-y-8 p-1">
          <div className="space-y-6">
            <Select
              label="เลือกธนาคาร"
              value={bankForm.bankCode || ''}
              onChange={(e) => {
                const code = e.target.value;
                const bank = banks.find(b => b.code === code);
                setBankForm({
                  ...bankForm,
                  bankCode: code,
                  bankName: bank?.nameTh || bank?.name || bankForm.bankName,
                });
              }}
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold text-sm"
            >
              <option value="">เลือกธนาคาร</option>
              {banks.map((b) => (
                <option key={b._id} value={b.code}>
                  {b.shortName ? `${b.shortName} • ` : ''}{b.nameTh || b.name}
                </option>
              ))}
            </Select>

            <Input
              label="เลขบัญชี"
              placeholder="xxx-x-xxxxx-x"
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-mono text-sm placeholder:text-slate-400"
            />

            <Input
              label="ชื่อบัญชี"
              placeholder="ชื่อเจ้าของบัญชี"
              value={bankForm.accountName}
              onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 font-semibold text-sm placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-4 pt-6 border-t border-white/5">
            <Button variant="ghost" className="flex-1 h-14 font-semibold text-sm text-slate-400 hover:text-slate-600" onClick={() => setShowBankModal(false)} disabled={isSaving !== null}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              className="flex-[2] h-14 font-semibold text-sm shadow-emerald-500/20 shadow-xl"
              onClick={handleAddBankAccount}
              isLoading={isSaving === 'bank_add'}
            >
              เพิ่มบัญชี
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
