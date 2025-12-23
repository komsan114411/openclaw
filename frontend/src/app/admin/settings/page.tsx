'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { systemSettingsApi, slipApi, chatbotApi } from '@/lib/api';
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

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
        setBankForm({ bankName: '', accountNumber: '', accountName: '' });
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
      <div className="space-y-12 animate-fade max-w-[1400px] mx-auto pb-12">

        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">System Infrastructure</h1>
            <p className="text-slate-500 font-medium text-lg">Manage mission-critical APIs, communication protocols, and financial gateways.</p>
          </div>
          <Badge variant="emerald" className="px-4 py-2 font-black text-sm uppercase tracking-widest shadow-emerald-100 shadow-lg">
            Production Environment
          </Badge>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-slate-100/50 backdrop-blur-md rounded-[2rem] w-fit border border-slate-200/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={cn(
                "relative px-8 py-3.5 rounded-3xl text-sm font-black transition-all duration-500 flex items-center gap-3",
                activeTab === tab.id
                  ? "text-slate-900"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabSlot"
                  className="absolute inset-0 bg-white rounded-3xl shadow-premium-sm"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{tab.icon}</span>
              <span className="relative z-10 uppercase tracking-widest">{tab.name}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-10">
          <AnimatePresence mode="wait">
            {activeTab === 'infrastructure' && (
              <motion.div
                key="infrastructure"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Webhook Configuration */}
                <Card className="p-10 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem]">
                  <div className="flex items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner">🌐</div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">External Interface</h2>
                      <p className="text-slate-400 font-medium text-sm">Configure the public access points for webhook integrations.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
                    <div className="md:col-span-3">
                      <Input
                        label="Public Base URL"
                        placeholder="https://api.yourdomain.com"
                        value={publicBaseUrl}
                        onChange={(e) => setPublicBaseUrl(e.target.value)}
                        className="font-mono text-emerald-600 font-bold"
                        hint="ใช้สำหรับสร้าง Webhook URL เพื่อรับข้อมูลจาก LINE API"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        fullWidth
                        size="lg"
                        className="rounded-2xl h-14 font-black uppercase tracking-widest"
                        onClick={() => handleUpdate('base_url', { publicBaseUrl })}
                        isLoading={isSaving === 'base_url'}
                      >
                        Update Endpoint
                      </Button>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Thunder API */}
                  <Card className="p-8 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem]">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-xl shadow-inner">⚡</div>
                        <div>
                          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-tighter">Thunder Verification</h2>
                          <p className="text-slate-400 font-medium text-xs">Slip verification engine</p>
                        </div>
                      </div>
                      <Badge variant={settings?.slipApiKeyPreview ? "emerald" : "rose"} size="sm" className="font-black uppercase tracking-widest">
                        {settings?.slipApiKeyPreview ? "Configured" : "Inactive"}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <Input
                        type="password"
                        label="New API Access Key"
                        placeholder="••••••••••••••••"
                        value={slipApiKey}
                        onChange={(e) => setSlipApiKey(e.target.value)}
                      />
                      <div className="flex gap-4">
                        <Button
                          variant="primary"
                          className="flex-1 rounded-2xl h-12 font-bold"
                          onClick={() => handleUpdate('slip_api', { slipApiKey })}
                          isLoading={isSaving === 'slip_api'}
                        >
                          Commit Key
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 rounded-2xl h-12 font-bold"
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
                  <Card className="p-8 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem]">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-xl shadow-inner">🤖</div>
                        <div>
                          <h2 className="text-lg font-extrabold text-slate-900 uppercase tracking-tighter">Cognitive Services</h2>
                          <p className="text-slate-400 font-medium text-xs">OpenAI Large Language Models</p>
                        </div>
                      </div>
                      <Badge variant={settings?.aiApiKeyPreview ? "emerald" : "rose"} size="sm" className="font-black uppercase tracking-widest">
                        {settings?.aiApiKeyPreview ? "Connected" : "Not Linked"}
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
                        />
                      </div>
                      <div className="flex gap-4">
                        <Button
                          variant="primary"
                          className="flex-1 rounded-2xl h-12 font-bold"
                          onClick={() => handleUpdate('ai_api', { aiApiKey })}
                          isLoading={isSaving === 'ai_api'}
                        >
                          Synchronize
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 rounded-2xl h-12 font-bold"
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
                  <StatCard title="Retry Delay" value={`${messageSettings.retryDelayMs}ms`} icon="⏱️" color="slate" variant="glass" />
                  <StatCard title="Quota Alert" value={messageSettings.quotaWarningThreshold} icon="🔔" color="amber" variant="glass" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Quota & Operational Messages */}
                  <Card className="p-8 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem] space-y-8">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Resource Thresholds</h3>
                      <p className="text-slate-400 text-sm font-medium">Messages sent when resources or quotas are impacted.</p>
                    </div>

                    <div className="space-y-6">
                      <TextArea
                        label="Quota Depleted Message"
                        value={messageSettings.quotaExceededMessage}
                        onChange={(e) => setMessageSettings({ ...messageSettings, quotaExceededMessage: e.target.value })}
                        rows={2}
                      />
                      <Select
                        label="Depletion Response Protocol"
                        value={messageSettings.quotaExceededResponseType}
                        onChange={(e) => setMessageSettings({ ...messageSettings, quotaExceededResponseType: e.target.value as any })}
                      >
                        <option value="text">Standard Plaintext</option>
                        <option value="flex">Rich Flex Interface</option>
                      </Select>

                      <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">Critical Resource Alert</p>
                          <p className="text-xs text-slate-400">Trigger warnings before exhaustion.</p>
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
                          />
                          <TextArea
                            label="Warning Template"
                            value={messageSettings.quotaLowWarningMessage}
                            onChange={(e) => setMessageSettings({ ...messageSettings, quotaLowWarningMessage: e.target.value })}
                            hint="Use {threshold} or {remaining} as variables."
                          />
                        </motion.div>
                      )}
                    </div>
                  </Card>

                  {/* Slip Verification Logic */}
                  <Card className="p-8 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem] space-y-8">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">Audit Responses</h3>
                      <p className="text-slate-400 text-sm font-medium">Real-time feedback during transaction auditing.</p>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-emerald-50/30 rounded-3xl border border-emerald-100/50 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">Initialization Feedback</p>
                          <p className="text-xs text-slate-400 italic">&quot;กำลังตรวจสอบสลิป...&quot;</p>
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
                      />

                      <div className="grid grid-cols-1 gap-6 pt-4 border-t border-slate-100/50">
                        <TextArea
                          label="Redundancy Detected (Duplicate Slip)"
                          value={messageSettings.duplicateSlipMessage}
                          onChange={(e) => setMessageSettings({ ...messageSettings, duplicateSlipMessage: e.target.value })}
                          rows={2}
                        />
                        <div className="flex items-center justify-between px-2">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Refund internal quota on redundancy?</p>
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
                      />
                    </div>
                  </Card>

                  {/* Operational Status (Switches) */}
                  <Card className="lg:col-span-2 p-10 bg-slate-900 text-white border-none shadow-2xl rounded-[3rem]">
                    <div className="flex items-center gap-6 mb-10">
                      <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">⚡</div>
                      <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight">Protocol Resilience</h2>
                        <p className="text-slate-400 font-medium text-sm">Fine-tune system retry logic and safety margins.</p>
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

                    <div className="mt-12 pt-8 border-t border-white/5 flex justify-end">
                      <Button
                        variant="primary"
                        size="lg"
                        className="px-10 h-16 rounded-2xl shadow-emerald-500/10 font-black tracking-widest uppercase"
                        onClick={() => handleUpdate('messages', messageSettings)}
                        isLoading={isSaving === 'messages'}
                      >
                        Store Deployment Config
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
                  <Card className="p-10 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem] flex flex-col h-full">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-2xl">🏦</div>
                        <div>
                          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Settlement Banks</h2>
                          <p className="text-slate-400 font-medium text-sm">Traditional fiat entry points.</p>
                        </div>
                      </div>
                      <IconButton
                        variant="primary"
                        size="lg"
                        className="rounded-2xl shadow-emerald-200 shadow-lg"
                        onClick={() => setShowBankModal(true)}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                      </IconButton>
                    </div>

                    <div className="flex-1 space-y-4">
                      {settings?.bankAccounts?.length > 0 ? (
                        settings.bankAccounts.map((account: any, index: number) => (
                          <div key={index} className="group p-6 bg-slate-50/50 hover:bg-white rounded-[2rem] border border-slate-100 transition-all flex items-center justify-between">
                            <div className="flex items-center gap-5">
                              <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-500 font-black text-xs uppercase">
                                {account.bankName.slice(0, 2)}
                              </div>
                              <div>
                                <p className="font-black text-slate-900 leading-none mb-1 uppercase tracking-tight">{account.bankName}</p>
                                <p className="text-xs text-slate-400 font-bold tracking-widest">{account.accountNumber} • {account.accountName}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveBankAccount(index)}
                              className="p-2 text-rose-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[2.5rem]">
                          <p className="text-slate-300 font-black uppercase tracking-widest">No Bank Gateways Configured</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Digital Asset Gateways (USDT) */}
                  <Card className="p-10 bg-slate-900 text-white border-none shadow-2xl rounded-[3rem]">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-emerald-400/20 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-emerald-400/10">💎</div>
                        <div>
                          <h2 className="text-2xl font-black uppercase tracking-tight">USDT Liquidity</h2>
                          <p className="text-slate-400 font-medium text-sm">Crypto settlement infrastructure.</p>
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
                <Card className="p-8 bg-slate-50 border-none rounded-[2.5rem]">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Internal Support Metadata</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">ADMIN LINE ACCESS</p>
                      <p className="text-2xl font-black text-indigo-500">@{settings?.contactAdminLine || 'Not Defined'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">PRIMARY CONTACT CHANNEL</p>
                      <p className="text-2xl font-black text-slate-500 font-mono italic">{settings?.contactAdminEmail || 'Not Defined'}</p>
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
        title="Deploy New Bank Gateway"
        size="md"
      >
        <div className="space-y-8 p-1">
          <div className="space-y-6">
            <Select
              label="Institution Name"
              value={bankForm.bankName}
              onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
            >
              <option value="">เลือกธนาคาร</option>
              <option value="กสิกรไทย">ธนาคารกสิกรไทย</option>
              <option value="กรุงเทพ">ธนาคารกรุงเทพ</option>
              <option value="กรุงไทย">ธนาคารกรุงไทย</option>
              <option value="ไทยพาณิชย์">ธนาคารไทยพาณิชย์</option>
              <option value="กรุงศรี">ธนาคารกรุงศรีอยุธยา</option>
              <option value="ทหารไทยธนชาต">ธนาคารทหารไทยธนชาต</option>
              <option value="ออมสิน">ธนาคารออมสิน</option>
              <option value="ธ.ก.ส.">ธนาคาร ธ.ก.ส.</option>
            </Select>

            <Input
              label="Account Serial"
              placeholder="xxx-x-xxxxx-x"
              value={bankForm.accountNumber}
              onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
            />

            <Input
              label="Legal Holder Name"
              placeholder="ชื่อ-นามสกุล"
              value={bankForm.accountName}
              onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
            />
          </div>

          <div className="flex gap-4 pt-6 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 h-14 font-bold text-slate-400" onClick={() => setShowBankModal(false)} disabled={isSaving !== null}>
              Abort
            </Button>
            <Button
              variant="primary"
              className="flex-[2] h-14 font-black shadow-emerald-500/20 shadow-premium"
              onClick={handleAddBankAccount}
              isLoading={isSaving === 'bank_add'}
            >
              Provision Gateway
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
