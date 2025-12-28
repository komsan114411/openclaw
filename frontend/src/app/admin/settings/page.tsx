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

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
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

  const handleUpdate = async (section: string, payload: any) => {
    setIsSaving(section);
    try {
      const response = await systemSettingsApi.update(payload);
      if (response.data.success) {
        toast.success('บันทึกการตั้งค่าสำเร็จ');
        await fetchSettings();
      } else {
        toast.error(response.data.message || 'บันทึกไม่สำเร็จ');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsSaving(null);
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
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการทดสอบ');
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
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการทดสอบ');
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
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
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
    { id: 'infrastructure', name: 'Core Infrastructure', icon: '⚡' },
    { id: 'communication', name: 'Communication Strategy', icon: '💬' },
    { id: 'financials', name: 'Financial Infrastructure', icon: '💳' },
  ] as const;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-8 md:pb-12">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <h1 className="page-title-responsive">
              System <span className="text-emerald-400">Settings</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Manage core infrastructure and operational protocols
            </p>
          </div>
          <Badge variant="emerald" className="px-4 py-1.5 font-black text-[10px] uppercase tracking-widest mt-4 lg:mt-0">
            Production Node
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
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">External Interface</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">Public access points for core webhooks</p>
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
                        hint="Automated webhook endpoint derivation master."
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
                        Commit URL
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
                          <h2 className="text-lg font-black text-white uppercase tracking-tight">Thunder Verification</h2>
                          <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">Slip Audit Engine</p>
                        </div>
                      </div>
                      <Badge variant={settings?.slipApiKeyPreview ? "emerald" : "outline"} size="sm" className="font-black uppercase tracking-widest text-[9px]">
                        {settings?.slipApiKeyPreview ? "Operational" : "Offline"}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <Input
                        type="password"
                        label="New API Access Key"
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
                          Commit Key
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] border border-white/5 hover:bg-white/5 text-slate-400 hover:text-white"
                          onClick={handleTestSlipApi}
                          isLoading={testingSlip}
                        >
                          Diagnostic Test
                        </Button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium text-center italic">
                        Access dashboard at <a href="https://thunder.in.th" target="_blank" className="text-indigo-500 font-black hover:underline">thunder.in.th</a>
                      </p>
                    </div>
                  </Card>

                  {/* OpenAI API */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-xl shadow-inner">🤖</div>
                        <div>
                          <h2 className="text-lg font-black text-white uppercase tracking-tight">Cognitive Services</h2>
                          <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">OpenAI Integration</p>
                        </div>
                      </div>
                      <Badge variant={settings?.aiApiKeyPreview ? "emerald" : "outline"} size="sm" className="font-black uppercase tracking-widest text-[9px]">
                        {settings?.aiApiKeyPreview ? "Linked" : "Disconnected"}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <Input
                          type="password"
                          label="OpenAI Private Key"
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
                          Synchronize
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] border border-white/5 hover:bg-white/5 text-slate-400 hover:text-white"
                          onClick={handleTestAiApi}
                          isLoading={testingAi}
                        >
                          Verify Logic
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
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
                  <StatCard title="Auto-Retries" value={messageSettings.maxRetryAttempts} icon="🔄" color="blue" variant="glass" />
                  <StatCard title="Retry Delay" value={`${messageSettings.retryDelayMs}ms`} icon="⏱️" color="indigo" variant="glass" />
                  <StatCard title="Threshold Alert" value={messageSettings.quotaWarningThreshold} icon="🔔" color="amber" variant="glass" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Quota & Operational Messages */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] space-y-8">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mb-2">Resource Thresholds</h3>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Messages triggered by resource exhaustion</p>
                    </div>

                    <div className="space-y-6">
                      <TextArea
                        label="Quota Depleted Message"
                        value={messageSettings.quotaExceededMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, quotaExceededMessage: e.target.value })}
                        rows={2}
                        className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                      />
                      <Select
                        label="Depletion Response Protocol"
                        value={messageSettings.quotaExceededResponseType}
                        onChange={(e) => setMessageSettings({ ...messageSettings, quotaExceededResponseType: e.target.value as any })}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black text-xs"
                      >
                        <option value="text">Standard Plaintext</option>
                        <option value="flex">Rich Flex Interface</option>
                      </Select>

                      <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white uppercase tracking-tight text-xs">Critical Resource Alert</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Enforce preemptive warnings</p>
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
                            label="Warning Threshold (Transaction Unit)"
                            value={messageSettings.quotaWarningThreshold}
                            onChange={(e) => setMessageSettings({ ...messageSettings, quotaWarningThreshold: parseInt(e.target.value) || 10 })}
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                          />
                          <TextArea
                            label="Warning Template"
                            value={messageSettings.quotaLowWarningMessage}
                            onChange={(e) => setMessageSettings({ ...messageSettings, quotaLowWarningMessage: e.target.value })}
                            hint="Use {threshold} or {remaining} as variables."
                            className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                          />
                        </motion.div>
                      )}
                    </div>
                  </Card>

                  {/* Slip Verification Logic */}
                  <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] space-y-8">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mb-2">Audit Responses</h3>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Real-time telemetry feedback</p>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white uppercase tracking-tight text-xs">Initialization Feedback</p>
                          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">&quot;กำลังตรวจสอบสลิป...&quot;</p>
                        </div>
                        <Switch
                          checked={messageSettings.showSlipProcessingMessage}
                          onChange={() => setMessageSettings({ ...messageSettings, showSlipProcessingMessage: !messageSettings.showSlipProcessingMessage })}
                        />
                      </div>

                      <Input
                        label="Audit In-Progress"
                        value={messageSettings.slipProcessingMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, slipProcessingMessage: e.target.value })}
                        disabled={!messageSettings.showSlipProcessingMessage}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                      />

                      <div className="grid grid-cols-1 gap-6 pt-6 border-t border-white/5">
                        <TextArea
                          label="Redundancy Detected (Duplicate Slip)"
                          value={messageSettings.duplicateSlipMessage}
                          onChange={(e) => setMessageSettings({ ...messageSettings, duplicateSlipMessage: e.target.value })}
                          rows={2}
                          className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                        />
                        <div className="flex items-center justify-between px-2">
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Refund internal quota on redundancy?</p>
                          <Switch
                            checked={messageSettings.duplicateRefundEnabled}
                            onChange={() => setMessageSettings({ ...messageSettings, duplicateRefundEnabled: !messageSettings.duplicateRefundEnabled })}
                          />
                        </div>
                      </div>

                      <TextArea
                        label="General Audit Failure"
                        value={messageSettings.slipErrorMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, slipErrorMessage: e.target.value })}
                        rows={2}
                        className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-xs p-5"
                      />
                    </div>
                  </Card>

                  {/* Operational Status (Switches) */}
                  <Card className="lg:col-span-2 p-10 bg-slate-900 border border-white/5 shadow-2xl rounded-[3rem]">
                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-14 h-14 bg-emerald-400/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner">⚡</div>
                      <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Protocol Resilience</h2>
                        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Retry logic and operational safety margins</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                      <div className="md:col-span-2 space-y-8">
                        <div className="p-6 bg-white/5 rounded-3xl space-y-4">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em]">Retry Architecture</p>
                          <div className="grid grid-cols-2 gap-6">
                            <Input
                              type="number"
                              label="Max Attempts"
                              value={messageSettings.maxRetryAttempts}
                              onChange={(e) => setMessageSettings({ ...messageSettings, maxRetryAttempts: parseInt(e.target.value) || 3 })}
                              className="bg-white/5 border-white/10 text-white"
                            />
                            <Input
                              type="number"
                              label="Delay (ms)"
                              value={messageSettings.retryDelayMs}
                              onChange={(e) => setMessageSettings({ ...messageSettings, retryDelayMs: parseInt(e.target.value) || 1000 })}
                              className="bg-white/5 border-white/10 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2 flex flex-col justify-between pt-2">
                        <div className="space-y-4">
                          <p className="text-xs font-black text-rose-400 uppercase tracking-[0.2em]">Automatic Notification Policies</p>
                          <div className="space-y-3">
                            {[
                              { label: "Bot Outage Notification", key: "botDisabledSendMessage", msg: "botDisabledMessage" },
                              { label: "Verification Outage Alert", key: "slipDisabledSendMessage", msg: "slipDisabledMessage" },
                              { label: "AI Services Interruption", key: "aiDisabledSendMessage", msg: "aiDisabledMessage" }
                            ].map((item) => (
                              <div key={item.key} className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-colors">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold">{item.label}</span>
                                  <Switch
                                    checked={(messageSettings as any)[item.key]}
                                    onChange={() => setMessageSettings({ ...messageSettings, [item.key]: !(messageSettings as any)[item.key] })}
                                  />
                                </div>
                                {(messageSettings as any)[item.key] && (
                                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <input
                                      className="w-full bg-black/40 border-none rounded-xl px-4 py-2 text-xs font-medium text-emerald-400 placeholder:text-slate-600 outline-none"
                                      value={(messageSettings as any)[item.msg]}
                                      onChange={(e) => setMessageSettings({ ...messageSettings, [item.msg]: e.target.value })}
                                    />
                                  </motion.div>
                                )}
                              </div>
                            ))}
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
                        Commit Deployment Config
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
                          <h2 className="text-2xl font-black uppercase tracking-tight text-white">Fiat Gateways</h2>
                          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Traditional settlement endpoints</p>
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
                      {settings?.bankAccounts?.length > 0 ? (
                        settings.bankAccounts.map((account: any, index: number) => (
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
                          <p className="text-slate-700 font-black uppercase tracking-widest text-[10px]">No Fiat Gateways Active</p>
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
                          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Digital Assets</h2>
                          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Cryptographic settlement nodes</p>
                        </div>
                      </div>
                      <Switch
                        checked={usdtSettings.usdtEnabled}
                        onChange={() => setUsdtSettings({ ...usdtSettings, usdtEnabled: !usdtSettings.usdtEnabled })}
                      />
                    </div>

                    <div className="space-y-8">
                      <Select
                        label="Blockchain Protocol"
                        value={usdtSettings.usdtNetwork}
                        onChange={(e) => setUsdtSettings({ ...usdtSettings, usdtNetwork: e.target.value })}
                        className="bg-white/5 border-white/10 text-white"
                      >
                        <option value="TRC20">TRC20 (Tron)</option>
                        <option value="ERC20">ERC20 (Ethereum)</option>
                        <option value="BEP20">BEP20 (BSC)</option>
                      </Select>

                      <Input
                        label="Public Wallet Key"
                        variant="glass"
                        value={usdtSettings.usdtWalletAddress}
                        onChange={(e) => setUsdtSettings({ ...usdtSettings, usdtWalletAddress: e.target.value })}
                        className="bg-white/5 border-white/10 text-white font-mono"
                        placeholder="T..."
                      />

                      <div className="pt-10 border-t border-white/5">
                        <Button
                          fullWidth
                          variant="primary"
                          size="lg"
                          className="h-16 rounded-2xl font-black tracking-widest uppercase"
                          onClick={() => handleUpdate('usdt', usdtSettings)}
                          isLoading={isSaving === 'usdt'}
                        >
                          Configure Crypto Node
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* System Contacts */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem] border border-white/5">
                  <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-10 text-center">
                    <span className="px-4">Internal Support Metadata</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-1 text-center md:text-left">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">ADMIN LINE COORDINATES</p>
                      <p className="text-3xl font-black text-emerald-400">@{settings?.contactAdminLine || 'UNDEFINED'}</p>
                    </div>
                    <div className="space-y-1 text-center md:text-right">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">PRIMARY CONTACT CHANNEL</p>
                      <p className="text-xl sm:text-2xl font-black text-white font-mono uppercase tracking-tight">{settings?.contactAdminEmail || 'NO_VECTOR_FOUND'}</p>
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
        title="PROTOCOL DEPLOYMENT: BANK GATEWAY"
        size="md"
      >
        <div className="space-y-8 p-1">
          <div className="space-y-6">
            <Select
              label="Institution Identity"
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
              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black text-xs"
            >
              <option value="">SELECT CLEARING INSTITUTION</option>
              {banks.map((b) => (
                <option key={b._id} value={b.code}>
                  {b.shortName ? `${b.shortName} • ` : ''}{b.nameTh || b.name}
                </option>
              ))}
            </Select>

            <Input
              label="Account Serial Matrix"
              placeholder="xxx-x-xxxxx-x"
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-mono"
            />

            <Input
              label="Legal Asset Holder"
              placeholder="IDENTITY_STRING"
              value={bankForm.accountName}
              onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black"
            />
          </div>

          <div className="flex gap-4 pt-6 border-t border-white/5">
            <Button variant="ghost" className="flex-1 h-14 font-black uppercase tracking-widest text-[10px] text-slate-500 hover:text-white" onClick={() => setShowBankModal(false)} disabled={isSaving !== null}>
              Abort
            </Button>
            <Button
              variant="primary"
              className="flex-[2] h-14 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/20 shadow-xl"
              onClick={handleAddBankAccount}
              isLoading={isSaving === 'bank_add'}
            >
              Authorize Node
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
