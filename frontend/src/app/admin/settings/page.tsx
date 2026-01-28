'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { systemSettingsApi, slipApi, chatbotApi, banksApi, rateLimitApi } from '@/lib/api';
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

type TabType = 'infrastructure' | 'financials' | 'access' | 'branding';

interface SystemSettings {
  publicBaseUrl?: string;
  slipApiKey?: string;
  aiApiKey?: string;
  usdtEnabled?: boolean;
  usdtNetwork?: string;
  usdtWalletAddress?: string;
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
  // System Control settings
  globalSlipVerificationEnabled?: boolean;
  slipDisabledSendMessage?: boolean;
  botDisabledSendMessage?: boolean;
  aiDisabledSendMessage?: boolean;
  aiQuotaExhaustedSendMessage?: boolean;
  showSlipProcessingMessage?: boolean;
  quotaWarningEnabled?: boolean;
  quotaWarningThreshold?: number;
  duplicateRefundEnabled?: boolean;
  // Slip Branding settings
  slipBrandName?: string;
  slipVerificationText?: string;
  slipFooterMessage?: string;
  slipShowPromptPayLogo?: boolean;
  slipBrandLogoUrl?: string;
  slipBrandLogoBase64?: string;
  slipBrandButtonText?: string;
  slipBrandButtonUrl?: string;
  slipSuccessColor?: string;
  slipDuplicateColor?: string;
  slipErrorColor?: string;
  slipAmountColor?: string;
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
    usdtDisabledMessage: '',
    usdtAutoVerify: true,
    etherscanApiKey: '',
    bscscanApiKey: '',
    tronscanApiKey: '',
  });


  // Preview Settings
  const [previewSettings, setPreviewSettings] = useState({
    previewSenderName: 'นาย ดูสลิป ยินดี',
    previewReceiverName: 'นาย ดูสลิป ยินดี',
    previewSenderBankCode: '004',
    previewReceiverBankCode: '014',
    previewAmount: '1,000.00',
  });

  // Access Control Settings
  const [accessControlSettings, setAccessControlSettings] = useState({
    allowRegistration: true,
    registrationDisabledMessage: 'ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
    allowLogin: true,
    loginDisabledMessage: 'ระบบปิดให้บริการเข้าสู่ระบบชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
  });

  // System Control Settings (ควบคุมการทำงานของระบบ)
  const [systemControlSettings, setSystemControlSettings] = useState({
    globalSlipVerificationEnabled: true,
    slipDisabledSendMessage: true,
    botDisabledSendMessage: false,
    aiDisabledSendMessage: false,
    aiQuotaExhaustedSendMessage: true,
    showSlipProcessingMessage: true,
    quotaWarningEnabled: true,
    quotaWarningThreshold: 10,
    duplicateRefundEnabled: true,
  });

  // Global AI Settings
  const [globalAiSettings, setGlobalAiSettings] = useState({
    globalAiEnabled: true,
    allowedAiModels: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'] as string[],
    defaultAiModel: 'gpt-4o-mini',
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

  // Slip Branding Settings
  const [slipBrandingSettings, setSlipBrandingSettings] = useState({
    slipBrandName: '',
    slipVerificationText: '',
    slipFooterMessage: '',
    slipShowPromptPayLogo: false,
    slipBrandLogoUrl: '',
    slipBrandLogoBase64: '',
    slipBrandButtonText: '',
    slipBrandButtonUrl: '',
    slipSuccessColor: '#22C55E',
    slipDuplicateColor: '#F59E0B',
    slipErrorColor: '#EF4444',
    slipAmountColor: '#1E3A5F',
  });

  // Floating Contact Button Settings
  const [floatingContactSettings, setFloatingContactSettings] = useState({
    floatingContactEnabled: false,
    floatingContactUrl: '',
    floatingContactIconUrl: '',
    floatingContactIconBase64: '',
    floatingContactSize: 56,
    floatingContactBottom: 24,
    floatingContactRight: 24,
    floatingContactTooltip: 'ติดต่อแอดมิน',
    floatingContactBgColor: '#25D366',
    floatingContactShowOnMobile: true,
  });

  // Slip Provider Settings
  const [slipProviderSettings, setSlipProviderSettings] = useState({
    slipApiProvider: 'thunder',
    slipApiProviderSecondary: '',
    slipApiFallbackEnabled: false,
    slipProviderFailoverOrder: ['thunder'] as string[],
    hasThunderApiKey: false,
    hasSlipMateApiKey: false,
    slipApiQuotaWarning: true,
    globalSlipVerificationEnabled: true,
  });
  const [slipApiKeyThunder, setSlipApiKeyThunder] = useState('');
  const [slipApiKeySlipMate, setSlipApiKeySlipMate] = useState('');
  const [testingThunder, setTestingThunder] = useState(false);
  const [testingSlipMate, setTestingSlipMate] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{
    thunder?: { success: boolean; message: string; remainingQuota?: number; expiresAt?: string };
    slipmate?: { success: boolean; message: string; remainingQuota?: number; expiresAt?: string };
  }>({});
  const [loadingProviderStatus, setLoadingProviderStatus] = useState(false);

  // Rate Limit Testing State
  const [rateLimitTestRunning, setRateLimitTestRunning] = useState(false);
  const [rateLimitTestResult, setRateLimitTestResult] = useState<any>(null);
  const [rateLimitStats, setRateLimitStats] = useState<any>(null);
  const [rateLimitLogs, setRateLimitLogs] = useState<any[]>([]);
  const [selectedTestPreset, setSelectedTestPreset] = useState<'light' | 'medium' | 'heavy' | 'ddos_simulation'>('light');
  const [showRateLimitLogs, setShowRateLimitLogs] = useState(false);
  const [rateLimitTestMode, setRateLimitTestMode] = useState<'simulation' | 'real_webhook'>('real_webhook');
  const [lineAccountsForTest, setLineAccountsForTest] = useState<{ id: string; name: string; webhookSlug: string }[]>([]);
  const [selectedAccountForTest, setSelectedAccountForTest] = useState<string>('random');

  const fetchSettings = useCallback(async () => {
    try {
      const response = await systemSettingsApi.get();
      const data = response.data.settings || {};
      setSettings(data);
      setPublicBaseUrl(data.publicBaseUrl || '');
      // Don't load masked API keys back into form fields - they are for NEW keys only
      // Status is shown via slipApiKeyPreview and aiApiKeyPreview in settings object
      setUsdtSettings({
        usdtEnabled: data.usdtEnabled ?? true,
        usdtNetwork: data.usdtNetwork || 'TRC20',
        usdtWalletAddress: data.usdtWalletAddress || '',
        usdtQrImage: data.usdtQrImage || '',
        usdtDisabledMessage: data.usdtDisabledMessage || '',
        usdtAutoVerify: data.usdtAutoVerify ?? true,
        etherscanApiKey: data.etherscanApiKey || '',
        bscscanApiKey: data.bscscanApiKey || '',
        tronscanApiKey: data.tronscanApiKey || '',
      });
      setPreviewSettings({
        previewSenderName: data.previewSenderName || 'นาย ดูสลิป ยินดี',
        previewReceiverName: data.previewReceiverName || 'นาย ดูสลิป ยินดี',
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
      setAccessControlSettings({
        allowRegistration: data.allowRegistration ?? true,
        registrationDisabledMessage: data.registrationDisabledMessage || 'ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
        allowLogin: data.allowLogin ?? true,
        loginDisabledMessage: data.loginDisabledMessage || 'ระบบปิดให้บริการเข้าสู่ระบบชั่วคราว กรุณาติดต่อผู้ดูแลระบบ',
      });
      setSystemControlSettings({
        globalSlipVerificationEnabled: data.globalSlipVerificationEnabled ?? true,
        slipDisabledSendMessage: data.slipDisabledSendMessage ?? true,
        botDisabledSendMessage: data.botDisabledSendMessage ?? false,
        aiDisabledSendMessage: data.aiDisabledSendMessage ?? false,
        aiQuotaExhaustedSendMessage: data.aiQuotaExhaustedSendMessage ?? true,
        showSlipProcessingMessage: data.showSlipProcessingMessage ?? true,
        quotaWarningEnabled: data.quotaWarningEnabled ?? true,
        quotaWarningThreshold: data.quotaWarningThreshold ?? 10,
        duplicateRefundEnabled: data.duplicateRefundEnabled ?? true,
      });
      setSlipBrandingSettings({
        // Use nullish coalescing - empty string is valid (means no text)
        slipBrandName: data.slipBrandName ?? '',
        slipVerificationText: data.slipVerificationText ?? '',
        slipFooterMessage: data.slipFooterMessage ?? '',
        slipShowPromptPayLogo: data.slipShowPromptPayLogo ?? false,
        slipBrandLogoUrl: data.slipBrandLogoUrl || '',
        slipBrandLogoBase64: data.slipBrandLogoBase64 || '',
        slipBrandButtonText: data.slipBrandButtonText || '',
        slipBrandButtonUrl: data.slipBrandButtonUrl || '',
        slipSuccessColor: data.slipSuccessColor || '#22C55E',
        slipDuplicateColor: data.slipDuplicateColor || '#F59E0B',
        slipErrorColor: data.slipErrorColor || '#EF4444',
        slipAmountColor: data.slipAmountColor || '#1E3A5F',
      });
      setFloatingContactSettings({
        floatingContactEnabled: data.floatingContactEnabled ?? false,
        floatingContactUrl: data.floatingContactUrl || '',
        floatingContactIconUrl: data.floatingContactIconUrl || '',
        floatingContactIconBase64: data.floatingContactIconBase64 || '',
        floatingContactSize: data.floatingContactSize || 56,
        floatingContactBottom: data.floatingContactBottom || 24,
        floatingContactRight: data.floatingContactRight || 24,
        floatingContactTooltip: data.floatingContactTooltip || 'ติดต่อแอดมิน',
        floatingContactBgColor: data.floatingContactBgColor || '#25D366',
        floatingContactShowOnMobile: data.floatingContactShowOnMobile ?? true,
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

  // Fetch Slip Provider Settings
  const fetchSlipProviderSettings = useCallback(async () => {
    try {
      const response = await systemSettingsApi.getSlipProviderSettings();
      const data = response.data.slipProviderSettings || {};
      setSlipProviderSettings({
        slipApiProvider: data.slipApiProvider || 'thunder',
        slipApiProviderSecondary: data.slipApiProviderSecondary || '',
        slipApiFallbackEnabled: data.slipApiFallbackEnabled ?? false,
        slipProviderFailoverOrder: data.slipProviderFailoverOrder || ['thunder'],
        hasThunderApiKey: data.hasThunderApiKey ?? false,
        hasSlipMateApiKey: data.hasSlipMateApiKey ?? false,
        slipApiQuotaWarning: data.slipApiQuotaWarning ?? true,
        globalSlipVerificationEnabled: data.globalSlipVerificationEnabled ?? true,
      });
    } catch (error) {
      console.error('Error fetching slip provider settings:', error);
    }
  }, []);

  // Fetch Slip Provider Status
  const fetchSlipProviderStatus = useCallback(async () => {
    setLoadingProviderStatus(true);
    try {
      const response = await systemSettingsApi.getSlipProviderStatus();
      const providers = response.data.providers || [];
      const statusMap: typeof providerStatus = {};
      providers.forEach((p: any) => {
        statusMap[p.provider as 'thunder' | 'slipmate'] = {
          success: p.success,
          message: p.message,
          remainingQuota: p.remainingQuota,
          expiresAt: p.expiresAt,
        };
      });
      setProviderStatus(statusMap);
    } catch (error) {
      console.error('Error fetching provider status:', error);
    } finally {
      setLoadingProviderStatus(false);
    }
  }, []);

  // Test specific slip provider
  const handleTestSlipProvider = async (provider: 'thunder' | 'slipmate') => {
    const setTesting = provider === 'thunder' ? setTestingThunder : setTestingSlipMate;
    setTesting(true);
    try {
      const response = await systemSettingsApi.testSlipProvider(provider);
      const result = response.data;
      setProviderStatus(prev => ({
        ...prev,
        [provider]: {
          success: result.success,
          message: result.message,
          remainingQuota: result.remainingQuota,
          expiresAt: result.expiresAt,
        },
      }));
      if (result.success) {
        toast.success(`${provider === 'thunder' ? 'Thunder' : 'SlipMate'}: ${result.message} (เหลือ ${result.remainingQuota} quota)`);
      } else {
        toast.error(`${provider === 'thunder' ? 'Thunder' : 'SlipMate'}: ${result.message}`);
      }
    } catch (error) {
      toast.error(`ไม่สามารถทดสอบ ${provider} ได้`);
    } finally {
      setTesting(false);
    }
  };

  // Save slip provider settings
  const handleSaveSlipProviderSettings = async (updates: Partial<typeof slipProviderSettings & { slipApiKeyThunder?: string; slipApiKeySlipMate?: string }>) => {
    setIsSaving('slip_provider');
    try {
      await systemSettingsApi.updateSlipProviderSettings(updates);
      toast.success('บันทึกการตั้งค่า Slip Provider สำเร็จ');
      fetchSlipProviderSettings();
    } catch (error) {
      toast.error('ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setIsSaving(null);
    }
  };

  // Fetch Rate Limit Stats and LINE Accounts
  const fetchRateLimitStats = useCallback(async () => {
    try {
      const [statsRes, logsRes, accountsRes] = await Promise.all([
        rateLimitApi.getStats(60),
        rateLimitApi.getLogs({ limit: 20 }),
        rateLimitApi.getAccounts(),
      ]);
      setRateLimitStats(statsRes.data);
      setRateLimitLogs(logsRes.data.logs || []);
      setLineAccountsForTest(accountsRes.data.accounts || []);
    } catch (error) {
      console.error('Error fetching rate limit stats:', error);
    }
  }, []);

  // Run Rate Limit Test
  const handleRunRateLimitTest = async () => {
    setRateLimitTestRunning(true);
    setRateLimitTestResult(null);

    const modeText = rateLimitTestMode === 'real_webhook' ? 'Webhook จริง' : 'จำลอง';
    const accountId = selectedAccountForTest === 'random' ? undefined : selectedAccountForTest;
    const selectedAccount = lineAccountsForTest.find(a => a.id === accountId);
    const accountText = selectedAccount ? selectedAccount.name : 'สุ่ม';

    const toastId = toast.loading(
      rateLimitTestMode === 'real_webhook'
        ? `กำลังยิง ${selectedTestPreset} ไปที่ ${accountText}...`
        : `กำลังทดสอบ ${selectedTestPreset} (จำลอง)...`
    );

    try {
      const response = await rateLimitApi.runQuickTest(
        selectedTestPreset,
        rateLimitTestMode,
        accountId
      );
      setRateLimitTestResult(response.data);
      toast.dismiss(toastId);

      if (response.data.success) {
        const { requestsBlocked, requestsSent, blockRate, targetAccount, requestsError } = response.data;
        const targetName = targetAccount?.name || 'N/A';

        if (requestsBlocked > 0) {
          toast.success(
            rateLimitTestMode === 'real_webhook'
              ? `✅ ระบบบล็อกได้! ${requestsBlocked}/${requestsSent} requests ถูกบล็อก (${blockRate.toFixed(1)}%) - ${targetName}`
              : `✅ ระบบบล็อกได้! ${requestsBlocked}/${requestsSent} requests (${blockRate.toFixed(1)}%)`
          );
        } else if (requestsError > 0) {
          toast(`⚠️ มี ${requestsError} requests error - ตรวจสอบ webhook URL`, { icon: '⚠️' });
        } else {
          toast.success(`ทดสอบสำเร็จ! ไม่มี request ถูกบล็อก (ยังไม่เกิน limit)`);
        }
      } else {
        toast.error(response.data.message || 'การทดสอบล้มเหลว');
      }

      // Refresh stats after test
      await fetchRateLimitStats();
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการทดสอบ');
    } finally {
      setRateLimitTestRunning(false);
    }
  };

  // Clear test logs
  const handleClearTestLogs = async () => {
    try {
      await rateLimitApi.clearTestLogs();
      toast.success('ลบ logs การทดสอบสำเร็จ');
      await fetchRateLimitStats();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการลบ logs');
    }
  };

  const fetchAiSettings = useCallback(async () => {
    try {
      const res = await systemSettingsApi.getAiSettings();
      setGlobalAiSettings({
        globalAiEnabled: res.data.globalAiEnabled ?? true,
        allowedAiModels: res.data.allowedAiModels || ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
        defaultAiModel: res.data.aiSettings?.aiModel || 'gpt-4o-mini',
      });
    } catch (error) {
      console.error('Error fetching AI settings:', error);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchBanks();
    fetchRateLimitStats();
    fetchAiSettings();
    fetchSlipProviderSettings();
    fetchSlipProviderStatus();
  }, [fetchSettings, fetchBanks, fetchRateLimitStats, fetchAiSettings, fetchSlipProviderSettings, fetchSlipProviderStatus]);

  const handleUpdate = async (section: string, payload: Record<string, unknown>) => {
    setIsSaving(section);
    try {
      let response;
      if (section === 'access') {
        // Use dedicated access control endpoint
        response = await systemSettingsApi.updateAccessControl(payload as {
          allowRegistration?: boolean;
          registrationDisabledMessage?: string;
          allowLogin?: boolean;
          loginDisabledMessage?: string;
        });
      } else if (section === 'ai_settings') {
        // Use dedicated AI settings endpoint
        response = await systemSettingsApi.updateAiSettings(payload as {
          globalAiEnabled?: boolean;
          allowedAiModels?: string[];
        });
      } else {
        response = await systemSettingsApi.updateSystemSettings(payload);
      }
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
        toast.error(response.data.message || 'เชื่อมต่อกับ Verify API ไม่สำเร็จ');
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
    { id: 'financials', name: 'การเงิน', icon: '💳' },
    { id: 'access', name: 'การเข้าถึง', icon: '🔐' },
    { id: 'branding', name: 'รูปแบบสลิป', icon: '🎨' },
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
                {/* System Control - ควบคุมการทำงานของระบบ */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">⚙️</div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">ควบคุมระบบ</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">เปิด/ปิด ฟีเจอร์หลักของระบบ</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Global Slip Verification - Main Toggle */}
                    <div className={cn(
                      "p-6 rounded-2xl border transition-all",
                      systemControlSettings.globalSlipVerificationEnabled
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-rose-500/10 border-rose-500/30"
                    )}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">{systemControlSettings.globalSlipVerificationEnabled ? '✅' : '🔴'}</span>
                          <div>
                            <p className="font-bold text-white">ระบบตรวจสอบสลิป</p>
                            <p className="text-xs text-slate-400">เปิด/ปิดระบบตรวจสอบสลิปทั้งระบบ</p>
                          </div>
                        </div>
                        <Switch
                          checked={systemControlSettings.globalSlipVerificationEnabled}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            globalSlipVerificationEnabled: checked
                          })}
                        />
                      </div>
                      {!systemControlSettings.globalSlipVerificationEnabled && (
                        <div className="mt-4 p-3 bg-rose-500/20 rounded-xl">
                          <p className="text-xs text-rose-300">⚠️ ระบบตรวจสอบสลิปถูกปิด - ผู้ใช้ส่งสลิปมาจะไม่ได้รับการตรวจสอบ</p>
                        </div>
                      )}
                    </div>

                    {/* Send Message When Disabled */}
                    <div className="p-6 bg-white/[0.02] rounded-2xl border border-white/5 space-y-4">
                      <p className="text-sm font-bold text-white mb-4">ส่งข้อความแจ้งเมื่อปิดระบบ</p>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-slate-400">เมื่อปิดตรวจสอบสลิป</span>
                        <Switch
                          checked={systemControlSettings.slipDisabledSendMessage}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            slipDisabledSendMessage: checked
                          })}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-slate-400">เมื่อปิดบอท</span>
                        <Switch
                          checked={systemControlSettings.botDisabledSendMessage}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            botDisabledSendMessage: checked
                          })}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-slate-400">เมื่อปิด AI ตอบกลับ</span>
                        <Switch
                          checked={systemControlSettings.aiDisabledSendMessage}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            aiDisabledSendMessage: checked
                          })}
                        />
                      </div>
                    </div>

                    {/* Processing & Quota Settings */}
                    <div className="p-6 bg-white/[0.02] rounded-2xl border border-white/5 space-y-4">
                      <p className="text-sm font-bold text-white mb-4">การแสดงผล</p>

                      <div className="flex items-center justify-between py-2">
                        <div>
                          <span className="text-xs text-slate-400">แสดงข้อความ &quot;กำลังตรวจสอบ...&quot;</span>
                        </div>
                        <Switch
                          checked={systemControlSettings.showSlipProcessingMessage}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            showSlipProcessingMessage: checked
                          })}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-slate-400">คืนโควต้าเมื่อสลิปซ้ำ</span>
                        <Switch
                          checked={systemControlSettings.duplicateRefundEnabled}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            duplicateRefundEnabled: checked
                          })}
                        />
                      </div>
                    </div>

                    {/* Quota Warning */}
                    <div className="p-6 bg-white/[0.02] rounded-2xl border border-white/5 space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-white">แจ้งเตือนโควต้าใกล้หมด</p>
                        <Switch
                          checked={systemControlSettings.quotaWarningEnabled}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            quotaWarningEnabled: checked
                          })}
                        />
                      </div>

                      {systemControlSettings.quotaWarningEnabled && (
                        <div className="pt-2">
                          <label className="text-xs text-slate-400 block mb-2">เกณฑ์แจ้งเตือน (จำนวนสลิปที่เหลือ)</label>
                          <Input
                            type="number"
                            value={systemControlSettings.quotaWarningThreshold}
                            onChange={(e) => setSystemControlSettings({
                              ...systemControlSettings,
                              quotaWarningThreshold: parseInt(e.target.value) || 10
                            })}
                            className="h-12 rounded-xl bg-white/[0.03] border-white/10 text-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5">
                    <Button
                      fullWidth
                      size="lg"
                      className="rounded-2xl h-14 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/10 shadow-xl"
                      onClick={() => handleUpdate('system_control', systemControlSettings)}
                      isLoading={isSaving === 'system_control'}
                    >
                      บันทึกการตั้งค่าควบคุมระบบ
                    </Button>
                  </div>
                </Card>

                {/* Global AI Settings */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-violet-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">🤖</div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">ระบบ AI Chatbot</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">ควบคุมการทำงานของ AI ทั้งระบบ</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Global AI Toggle */}
                    <div className="flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-violet-500/10 to-violet-500/5 border border-violet-500/20">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all",
                          globalAiSettings.globalAiEnabled
                            ? "bg-violet-500 shadow-violet-500/30 shadow-lg"
                            : "bg-slate-700"
                        )}>
                          {globalAiSettings.globalAiEnabled ? '✓' : '✕'}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">เปิดใช้งาน AI ทั้งระบบ</p>
                          <p className="text-slate-500 text-xs">เมื่อปิด บอท AI จะไม่ตอบกลับผู้ใช้ทุกบัญชี</p>
                        </div>
                      </div>
                      <Switch
                        checked={globalAiSettings.globalAiEnabled}
                        onChange={(checked) => setGlobalAiSettings({
                          ...globalAiSettings,
                          globalAiEnabled: checked
                        })}
                      />
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-400">สถานะ AI:</span>
                      <Badge
                        variant={globalAiSettings.globalAiEnabled ? "emerald" : "outline"}
                        size="sm"
                        className="font-black uppercase tracking-widest text-[9px]"
                      >
                        {globalAiSettings.globalAiEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </Badge>
                    </div>

                    {/* Allowed Models */}
                    <div>
                      <label className="block text-sm font-bold text-slate-400 mb-3 uppercase tracking-widest">
                        AI Models ที่อนุญาต
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'].map((model) => (
                          <button
                            key={model}
                            type="button"
                            onClick={() => {
                              const currentModels = globalAiSettings.allowedAiModels;
                              if (currentModels.includes(model)) {
                                // Remove model (but keep at least one)
                                if (currentModels.length > 1) {
                                  setGlobalAiSettings({
                                    ...globalAiSettings,
                                    allowedAiModels: currentModels.filter(m => m !== model)
                                  });
                                }
                              } else {
                                // Add model
                                setGlobalAiSettings({
                                  ...globalAiSettings,
                                  allowedAiModels: [...currentModels, model]
                                });
                              }
                            }}
                            className={cn(
                              "p-3 rounded-xl text-xs font-bold transition-all border",
                              globalAiSettings.allowedAiModels.includes(model)
                                ? "bg-violet-500/20 border-violet-500 text-violet-300"
                                : "bg-white/5 border-white/10 text-slate-400 hover:border-white/30"
                            )}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        คลิกเพื่อเปิด/ปิดการใช้งาน Model (ต้องเลือกอย่างน้อย 1 Model)
                      </p>
                    </div>

                    {/* AI Message Settings */}
                    <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/5">
                      <p className="text-sm font-bold text-white mb-4">การแจ้งเตือน</p>

                      <div className="flex items-center justify-between py-3 border-b border-white/5">
                        <div>
                          <p className="text-xs text-slate-300">ส่งข้อความเมื่อปิด AI</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">แจ้งผู้ใช้ว่า AI ไม่พร้อมใช้งาน</p>
                        </div>
                        <Switch
                          checked={systemControlSettings.aiDisabledSendMessage}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            aiDisabledSendMessage: checked
                          })}
                        />
                      </div>

                      <div className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-xs text-slate-300">ส่งข้อความเมื่อ AI quota หมด</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">แจ้งผู้ใช้เมื่อโควต้า AI หมด</p>
                        </div>
                        <Switch
                          checked={systemControlSettings.aiQuotaExhaustedSendMessage}
                          onChange={(checked) => setSystemControlSettings({
                            ...systemControlSettings,
                            aiQuotaExhaustedSendMessage: checked
                          })}
                        />
                      </div>
                    </div>

                    {/* Warning when AI is disabled */}
                    {!globalAiSettings.globalAiEnabled && (
                      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-start gap-3">
                          <span className="text-amber-400 text-lg">⚠️</span>
                          <div>
                            <p className="text-sm font-bold text-amber-300">AI ถูกปิดใช้งานทั้งระบบ</p>
                            <p className="text-xs text-amber-200/70 mt-1">
                              บอท AI จะไม่ตอบกลับผู้ใช้ในทุกบัญชี LINE แม้ว่าผู้ใช้จะเปิดใช้งาน AI ในการตั้งค่าบัญชีก็ตาม
                            </p>
                            {systemControlSettings.aiDisabledSendMessage && (
                              <p className="text-xs text-amber-200/70 mt-1">
                                📢 ระบบจะส่งข้อความแจ้งผู้ใช้เมื่อ AI ถูกปิด
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5">
                    <Button
                      fullWidth
                      size="lg"
                      className="rounded-2xl h-14 font-black uppercase tracking-widest text-[11px] shadow-violet-500/10 shadow-xl"
                      onClick={() => {
                        // Save both AI settings and the message setting
                        handleUpdate('ai_settings', {
                          globalAiEnabled: globalAiSettings.globalAiEnabled,
                          allowedAiModels: globalAiSettings.allowedAiModels,
                          aiDisabledSendMessage: systemControlSettings.aiDisabledSendMessage,
                          aiQuotaExhaustedSendMessage: systemControlSettings.aiQuotaExhaustedSendMessage,
                        });
                      }}
                      isLoading={isSaving === 'ai_settings'}
                    >
                      บันทึกการตั้งค่า AI
                    </Button>
                  </div>
                </Card>

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

                {/* Slip Provider Management - Multi-Provider */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">⚡</div>
                    <div className="flex-1">
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">Slip API Provider</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">จัดการ API สำหรับตรวจสอบสลิป</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">Auto-Failover</span>
                      <Switch
                        checked={slipProviderSettings.slipApiFallbackEnabled}
                        onChange={(checked) => {
                          setSlipProviderSettings(prev => ({ ...prev, slipApiFallbackEnabled: checked }));
                          handleSaveSlipProviderSettings({ slipApiFallbackEnabled: checked });
                        }}
                      />
                    </div>
                  </div>

                  {/* Info Box */}
                  <div className="mb-8 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                    <div className="flex items-start gap-3">
                      <span className="text-indigo-400 text-lg">💡</span>
                      <div>
                        <p className="text-sm font-semibold text-indigo-400">Multi-Provider System</p>
                        <p className="text-xs text-slate-400 mt-1">
                          ระบบจะใช้ Provider หลักก่อน หาก quota หมดหรือเกิดข้อผิดพลาด จะสลับไปใช้ Provider สำรองโดยอัตโนมัติ (ผู้ใช้ไม่รู้สึกถึงการสลับ)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Provider Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Provider หลัก</label>
                      <Select
                        value={slipProviderSettings.slipApiProvider}
                        onChange={(e) => {
                          const newPrimary = e.target.value;
                          setSlipProviderSettings(prev => ({
                            ...prev,
                            slipApiProvider: newPrimary,
                            slipProviderFailoverOrder: [newPrimary, ...(prev.slipProviderFailoverOrder.filter(p => p !== newPrimary))],
                          }));
                        }}
                        options={[
                          { value: 'thunder', label: '⚡ Thunder API (thunder.in.th)' },
                          { value: 'slipmate', label: '🎯 SlipMate API (slipmate.ai)' },
                        ]}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Provider สำรอง</label>
                      <Select
                        value={slipProviderSettings.slipApiProviderSecondary || 'none'}
                        onChange={(e) => {
                          const newSecondary = e.target.value === 'none' ? '' : e.target.value;
                          setSlipProviderSettings(prev => ({
                            ...prev,
                            slipApiProviderSecondary: newSecondary,
                          }));
                        }}
                        options={[
                          { value: 'none', label: '— ไม่ใช้ Provider สำรอง —' },
                          { value: 'thunder', label: '⚡ Thunder API' },
                          { value: 'slipmate', label: '🎯 SlipMate API' },
                        ].filter(opt => opt.value === 'none' || opt.value !== slipProviderSettings.slipApiProvider)}
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10"
                        disabled={!slipProviderSettings.slipApiFallbackEnabled}
                      />
                    </div>
                  </div>

                  <Button
                    fullWidth
                    size="lg"
                    className="rounded-2xl h-14 font-black uppercase tracking-widest text-[11px] mb-10"
                    onClick={() => handleSaveSlipProviderSettings({
                      slipApiProvider: slipProviderSettings.slipApiProvider,
                      slipApiProviderSecondary: slipProviderSettings.slipApiProviderSecondary,
                      slipProviderFailoverOrder: slipProviderSettings.slipApiFallbackEnabled && slipProviderSettings.slipApiProviderSecondary
                        ? [slipProviderSettings.slipApiProvider, slipProviderSettings.slipApiProviderSecondary]
                        : [slipProviderSettings.slipApiProvider],
                    })}
                    isLoading={isSaving === 'slip_provider'}
                  >
                    บันทึกการตั้งค่า Provider
                  </Button>

                  {/* Provider Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Thunder Provider */}
                    <div className={cn(
                      "p-6 rounded-2xl border transition-all",
                      slipProviderSettings.slipApiProvider === 'thunder'
                        ? "bg-purple-500/10 border-purple-500/30"
                        : "bg-white/[0.02] border-white/10"
                    )}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">⚡</span>
                          <div>
                            <h3 className="font-black text-white">Thunder API</h3>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">thunder.in.th</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {slipProviderSettings.slipApiProvider === 'thunder' && (
                            <Badge variant="purple" size="sm" className="text-[8px]">PRIMARY</Badge>
                          )}
                          {slipProviderSettings.slipApiProviderSecondary === 'thunder' && (
                            <Badge variant="outline" size="sm" className="text-[8px]">BACKUP</Badge>
                          )}
                          <Badge
                            variant={slipProviderSettings.hasThunderApiKey ? "emerald" : "outline"}
                            size="sm"
                            className="text-[8px]"
                          >
                            {slipProviderSettings.hasThunderApiKey ? "เชื่อมต่อแล้ว" : "ยังไม่ตั้งค่า"}
                          </Badge>
                        </div>
                      </div>

                      {/* Quota Status */}
                      {providerStatus.thunder && (
                        <div className={cn(
                          "mb-4 p-3 rounded-xl text-xs",
                          providerStatus.thunder.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        )}>
                          {providerStatus.thunder.success ? (
                            <>
                              <div className="font-bold">✓ {providerStatus.thunder.message}</div>
                              {providerStatus.thunder.remainingQuota !== undefined && (
                                <div className="mt-1">เหลือ {providerStatus.thunder.remainingQuota.toLocaleString()} quota</div>
                              )}
                              {providerStatus.thunder.expiresAt && (
                                <div className="text-slate-400">หมดอายุ: {new Date(providerStatus.thunder.expiresAt).toLocaleDateString('th-TH')}</div>
                              )}
                            </>
                          ) : (
                            <div>✗ {providerStatus.thunder.message}</div>
                          )}
                        </div>
                      )}

                      <Input
                        type="password"
                        label="API Key"
                        placeholder="ใส่ Thunder API Key..."
                        value={slipApiKeyThunder}
                        onChange={(e) => setSlipApiKeyThunder(e.target.value)}
                        className="h-12 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono mb-4"
                      />

                      <div className="flex gap-3">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1 rounded-xl font-black text-[9px]"
                          onClick={() => handleSaveSlipProviderSettings({ slipApiKeyThunder: slipApiKeyThunder })}
                          isLoading={isSaving === 'slip_provider'}
                          disabled={!slipApiKeyThunder}
                        >
                          บันทึก
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-xl font-black text-[9px] border border-white/10"
                          onClick={() => handleTestSlipProvider('thunder')}
                          isLoading={testingThunder}
                        >
                          ทดสอบ
                        </Button>
                      </div>
                    </div>

                    {/* SlipMate Provider */}
                    <div className={cn(
                      "p-6 rounded-2xl border transition-all",
                      slipProviderSettings.slipApiProvider === 'slipmate'
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-white/[0.02] border-white/10"
                    )}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🎯</span>
                          <div>
                            <h3 className="font-black text-white">SlipMate API</h3>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">slipmate.ai</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {slipProviderSettings.slipApiProvider === 'slipmate' && (
                            <Badge variant="blue" size="sm" className="text-[8px]">PRIMARY</Badge>
                          )}
                          {slipProviderSettings.slipApiProviderSecondary === 'slipmate' && (
                            <Badge variant="outline" size="sm" className="text-[8px]">BACKUP</Badge>
                          )}
                          <Badge
                            variant={slipProviderSettings.hasSlipMateApiKey ? "emerald" : "outline"}
                            size="sm"
                            className="text-[8px]"
                          >
                            {slipProviderSettings.hasSlipMateApiKey ? "เชื่อมต่อแล้ว" : "ยังไม่ตั้งค่า"}
                          </Badge>
                        </div>
                      </div>

                      {/* Quota Status */}
                      {providerStatus.slipmate && (
                        <div className={cn(
                          "mb-4 p-3 rounded-xl text-xs",
                          providerStatus.slipmate.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        )}>
                          {providerStatus.slipmate.success ? (
                            <>
                              <div className="font-bold">✓ {providerStatus.slipmate.message}</div>
                              {providerStatus.slipmate.remainingQuota !== undefined && (
                                <div className="mt-1">เหลือ {providerStatus.slipmate.remainingQuota.toLocaleString()} quota</div>
                              )}
                            </>
                          ) : (
                            <div>✗ {providerStatus.slipmate.message}</div>
                          )}
                        </div>
                      )}

                      <Input
                        type="password"
                        label="API Key"
                        placeholder="ใส่ SlipMate API Key..."
                        value={slipApiKeySlipMate}
                        onChange={(e) => setSlipApiKeySlipMate(e.target.value)}
                        className="h-12 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono mb-4"
                      />

                      <div className="flex gap-3">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1 rounded-xl font-black text-[9px]"
                          onClick={() => handleSaveSlipProviderSettings({ slipApiKeySlipMate: slipApiKeySlipMate })}
                          isLoading={isSaving === 'slip_provider'}
                          disabled={!slipApiKeySlipMate}
                        >
                          บันทึก
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-xl font-black text-[9px] border border-white/10"
                          onClick={() => handleTestSlipProvider('slipmate')}
                          isLoading={testingSlipMate}
                        >
                          ทดสอบ
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Refresh Status Button */}
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl font-black text-[10px] text-slate-400"
                      onClick={fetchSlipProviderStatus}
                      isLoading={loadingProviderStatus}
                    >
                      🔄 รีเฟรชสถานะ Provider
                    </Button>
                  </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
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
                      <Badge variant={settings?.aiApiKey ? "emerald" : "outline"} size="sm" className="font-black uppercase tracking-widest text-[9px]">
                        {settings?.aiApiKey ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <Input
                          type={settings?.aiApiKey?.includes('....') ? 'text' : 'password'}
                          label="OpenAI API Key"
                          placeholder="ใส่ OpenAI API Key..."
                          value={aiApiKey || settings?.aiApiKey || ''}
                          onChange={(e) => setAiApiKey(e.target.value)}
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-mono"
                        />
                        {settings?.aiApiKey ? (
                          <div className="flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-2 rounded-lg">
                            <span className="text-xs">API Key ถูกเข้ารหัสแล้ว: {settings.aiApiKey}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 px-3 py-2 rounded-lg">
                            <span>⚠️</span>
                            <span className="text-xs">ยังไม่ได้ตั้งค่า API Key - สมัครที่ platform.openai.com</span>
                          </div>
                        )}
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
                        placeholder="นาย ดูสลิป ยินดี"
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
                        placeholder="นาย ดูสลิป ยินดี"
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

                      {/* Rate Limit Testing Section */}
                      <div className="mt-8 pt-8 border-t border-white/5">
                        <div className="flex items-center gap-3 mb-6">
                          <span className="text-xl">🧪</span>
                          <div>
                            <p className="text-sm font-black text-white uppercase tracking-wide">ทดสอบระบบ Rate Limiter</p>
                            <p className="text-xs text-slate-500">ทดสอบว่าระบบบล็อก request ที่เกิน limit ได้จริงหรือไม่</p>
                          </div>
                        </div>

                        {/* Current Settings Info */}
                        <div className="mb-6 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                          <p className="text-xs font-bold text-indigo-400 mb-2">⚙️ การตั้งค่าปัจจุบัน (จะใช้ทดสอบ)</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Per Account/s:</span>
                              <span className="text-white font-bold">{rateLimitSettings.webhookRateLimitPerAccountPerSecond}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Per Account/m:</span>
                              <span className="text-white font-bold">{rateLimitSettings.webhookRateLimitPerAccountPerMinute}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Global/s:</span>
                              <span className="text-white font-bold">{rateLimitSettings.webhookRateLimitGlobalPerSecond}</span>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2">
                            หากยิง {rateLimitSettings.webhookRateLimitPerAccountPerSecond + 1}+ req/s จะถูกบล็อก
                          </p>
                        </div>

                        {/* Test Mode Selection */}
                        <div className="mb-6">
                          <p className="text-xs font-bold text-slate-400 mb-3">โหมดทดสอบ</p>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => setRateLimitTestMode('real_webhook')}
                              className={cn(
                                'p-4 rounded-2xl border transition-all text-left',
                                rateLimitTestMode === 'real_webhook'
                                  ? 'bg-rose-500/20 border-rose-500/50'
                                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                              )}
                            >
                              <p className={cn(
                                'text-sm font-bold flex items-center gap-2',
                                rateLimitTestMode === 'real_webhook' ? 'text-rose-400' : 'text-white'
                              )}>
                                🎯 Webhook จริง
                              </p>
                              <p className="text-[10px] text-slate-500">ยิง HTTP request ไปที่ webhook endpoint จริง</p>
                            </button>
                            <button
                              onClick={() => setRateLimitTestMode('simulation')}
                              className={cn(
                                'p-4 rounded-2xl border transition-all text-left',
                                rateLimitTestMode === 'simulation'
                                  ? 'bg-blue-500/20 border-blue-500/50'
                                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                              )}
                            >
                              <p className={cn(
                                'text-sm font-bold flex items-center gap-2',
                                rateLimitTestMode === 'simulation' ? 'text-blue-400' : 'text-white'
                              )}>
                                🖥️ จำลอง (Redis)
                              </p>
                              <p className="text-[10px] text-slate-500">ทดสอบผ่าน Redis rate limiter โดยตรง</p>
                            </button>
                          </div>
                        </div>

                        {/* LINE Account Selection (only for real_webhook mode) */}
                        {rateLimitTestMode === 'real_webhook' && (
                          <div className="mb-6">
                            <p className="text-xs font-bold text-slate-400 mb-3">เลือก LINE Account ที่จะทดสอบ</p>
                            <select
                              value={selectedAccountForTest}
                              onChange={(e) => setSelectedAccountForTest(e.target.value)}
                              className="w-full p-3 rounded-xl bg-white/[0.02] border border-white/10 text-white text-sm focus:border-rose-500/50 focus:outline-none"
                            >
                              <option value="random" className="bg-slate-800">🎲 สุ่มอัตโนมัติ</option>
                              {lineAccountsForTest.map((account) => (
                                <option key={account.id} value={account.id} className="bg-slate-800">
                                  {account.name} ({account.webhookSlug})
                                </option>
                              ))}
                            </select>
                            {lineAccountsForTest.length === 0 && (
                              <p className="text-xs text-amber-400 mt-2">⚠️ ไม่พบ LINE Account ที่เชื่อมต่อแล้ว</p>
                            )}
                          </div>
                        )}

                        {/* Test Preset Selection */}
                        <div className="mb-6">
                          <p className="text-xs font-bold text-slate-400 mb-3">ระดับความหนัก</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                              { value: 'light', label: 'เบา', desc: '5 req, 200ms', color: 'emerald', icon: '🟢' },
                              { value: 'medium', label: 'ปานกลาง', desc: '15 req, 50ms', color: 'amber', icon: '🟡' },
                              { value: 'heavy', label: 'หนัก', desc: '30 req, 10ms', color: 'orange', icon: '🟠' },
                              { value: 'ddos_simulation', label: 'DDoS', desc: '50 req, 0ms', color: 'rose', icon: '🔴' },
                            ].map((preset) => (
                              <button
                                key={preset.value}
                                onClick={() => setSelectedTestPreset(preset.value as any)}
                                className={cn(
                                  'p-4 rounded-2xl border transition-all text-left',
                                  selectedTestPreset === preset.value
                                    ? `bg-${preset.color}-500/20 border-${preset.color}-500/50`
                                    : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                )}
                              >
                                <p className={cn(
                                  'text-sm font-bold flex items-center gap-2',
                                  selectedTestPreset === preset.value ? `text-${preset.color}-400` : 'text-white'
                                )}>
                                  {preset.icon} {preset.label}
                                </p>
                                <p className="text-[10px] text-slate-500">{preset.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Expected Result Info */}
                        <div className="mb-6 p-4 rounded-2xl bg-slate-500/10 border border-slate-500/20">
                          <p className="text-xs font-bold text-slate-400 mb-2">📊 คาดการณ์ผลลัพธ์</p>
                          <div className="text-xs text-slate-300">
                            {
                              selectedTestPreset === 'light' ? (
                                <p>ยิง 5 requests ด้วย delay 200ms → ควรผ่านทั้งหมด (ไม่เกิน {rateLimitSettings.webhookRateLimitPerAccountPerSecond}/s)</p>
                              ) : selectedTestPreset === 'medium' ? (
                                <p>ยิง 15 requests ด้วย delay 50ms → ควรถูกบล็อกบางส่วน (เกิน {rateLimitSettings.webhookRateLimitPerAccountPerSecond}/s)</p>
                              ) : selectedTestPreset === 'heavy' ? (
                                <p>ยิง 30 requests ด้วย delay 10ms → ควรถูกบล็อกหลาย requests (เกิน {rateLimitSettings.webhookRateLimitPerAccountPerSecond}/s มาก)</p>
                              ) : (
                                <p>ยิง 50 requests พร้อมกัน (0ms delay) → ควรถูกบล็อกเกือบทั้งหมด (เกิน {rateLimitSettings.webhookRateLimitPerAccountPerSecond}/s มากๆ)</p>
                              )
                            }
                          </div>
                        </div>

                        {/* Test Button */}
                        <div className="flex gap-3">
                          <Button
                            onClick={handleRunRateLimitTest}
                            isLoading={rateLimitTestRunning}
                            disabled={rateLimitTestRunning || (rateLimitTestMode === 'real_webhook' && lineAccountsForTest.length === 0)}
                            className={cn(
                              "flex-1 h-12 rounded-xl font-bold",
                              rateLimitTestMode === 'real_webhook'
                                ? "bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600"
                                : "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                            )}
                          >
                            {rateLimitTestRunning
                              ? 'กำลังทดสอบ...'
                              : rateLimitTestMode === 'real_webhook'
                                ? '🚀 ยิง Webhook จริง!'
                                : '🖥️ ทดสอบจำลอง'
                            }
                          </Button>
                          <Button
                            onClick={() => setShowRateLimitLogs(!showRateLimitLogs)}
                            variant="outline"
                            className="h-12 rounded-xl px-4"
                          >
                            📋 {showRateLimitLogs ? 'ซ่อน' : 'ดู'} Logs
                          </Button>
                        </div>

                        {/* Test Result */}
                        {rateLimitTestResult && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-6 p-6 rounded-2xl bg-white/[0.02] border border-white/5"
                          >
                            {/* Result Header */}
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <span className={cn(
                                  'text-2xl',
                                  rateLimitTestResult.requestsBlocked > 0 ? 'animate-pulse' : ''
                                )}>
                                  {rateLimitTestResult.requestsBlocked > 0 ? '✅' : rateLimitTestResult.requestsError > 0 ? '⚠️' : 'ℹ️'}
                                </span>
                                <div>
                                  <p className="text-sm font-bold text-white">
                                    {rateLimitTestResult.requestsBlocked > 0
                                      ? '🛡️ ระบบบล็อกทำงานปกติ!'
                                      : rateLimitTestResult.requestsError > 0
                                        ? 'มี Error - ตรวจสอบ Webhook URL'
                                        : 'ไม่มี request ถูกบล็อก (ยังไม่เกิน limit)'}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    โหมด: {rateLimitTestResult.mode === 'real_webhook' ? 'Webhook จริง' : 'จำลอง'}
                                    {rateLimitTestResult.targetAccount && ` | Account: ${rateLimitTestResult.targetAccount.name}`}
                                  </p>
                                </div>
                              </div>
                              <Badge variant={rateLimitTestResult.requestsBlocked > 0 ? 'success' : 'warning'}>
                                {rateLimitTestResult.preset?.toUpperCase() || 'CUSTOM'}
                              </Badge>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                              <div className="text-center p-3 bg-blue-500/10 rounded-xl">
                                <p className="text-xl font-black text-blue-400">{rateLimitTestResult.requestsSent}</p>
                                <p className="text-[10px] text-slate-500">ส่งทั้งหมด</p>
                              </div>
                              <div className="text-center p-3 bg-emerald-500/10 rounded-xl">
                                <p className="text-xl font-black text-emerald-400">{rateLimitTestResult.requestsAllowed}</p>
                                <p className="text-[10px] text-slate-500">ผ่าน</p>
                              </div>
                              <div className="text-center p-3 bg-rose-500/10 rounded-xl">
                                <p className="text-xl font-black text-rose-400">{rateLimitTestResult.requestsBlocked}</p>
                                <p className="text-[10px] text-slate-500">ถูกบล็อก</p>
                              </div>
                              {rateLimitTestResult.requestsError !== undefined && (
                                <div className="text-center p-3 bg-orange-500/10 rounded-xl">
                                  <p className="text-xl font-black text-orange-400">{rateLimitTestResult.requestsError}</p>
                                  <p className="text-[10px] text-slate-500">Error</p>
                                </div>
                              )}
                              <div className="text-center p-3 bg-amber-500/10 rounded-xl">
                                <p className="text-xl font-black text-amber-400">{rateLimitTestResult.blockRate?.toFixed(1)}%</p>
                                <p className="text-[10px] text-slate-500">อัตราบล็อก</p>
                              </div>
                            </div>

                            {/* Detailed Info */}
                            <div className="p-3 rounded-xl bg-slate-500/10 text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-slate-400">การตั้งค่า Per Account/s:</span>
                                <span className="text-white font-bold">{rateLimitSettings.webhookRateLimitPerAccountPerSecond}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">ยิงไปทั้งหมด:</span>
                                <span className="text-white font-bold">{rateLimitTestResult.requestsSent} requests</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">ควรถูกบล็อกอย่างน้อย:</span>
                                <span className="text-white font-bold">
                                  {Math.max(0, rateLimitTestResult.requestsSent - rateLimitSettings.webhookRateLimitPerAccountPerSecond)} requests
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">ถูกบล็อกจริง:</span>
                                <span className={cn(
                                  'font-bold',
                                  rateLimitTestResult.requestsBlocked >= Math.max(0, rateLimitTestResult.requestsSent - rateLimitSettings.webhookRateLimitPerAccountPerSecond)
                                    ? 'text-emerald-400'
                                    : 'text-amber-400'
                                )}>
                                  {rateLimitTestResult.requestsBlocked} requests
                                  {rateLimitTestResult.requestsBlocked >= Math.max(0, rateLimitTestResult.requestsSent - rateLimitSettings.webhookRateLimitPerAccountPerSecond)
                                    ? ' ✅'
                                    : ' ⚠️'
                                  }
                                </span>
                              </div>
                              {rateLimitTestResult.averageResponseTime && (
                                <div className="flex justify-between">
                                  <span className="text-slate-400">เวลาตอบสนองเฉลี่ย:</span>
                                  <span className="text-white font-bold">{rateLimitTestResult.averageResponseTime.toFixed(2)}ms</span>
                                </div>
                              )}
                              {rateLimitTestResult.duration && (
                                <div className="flex justify-between">
                                  <span className="text-slate-400">เวลาทดสอบทั้งหมด:</span>
                                  <span className="text-white font-bold">{rateLimitTestResult.duration}ms</span>
                                </div>
                              )}
                            </div>

                            {/* Verdict */}
                            <div className={cn(
                              'mt-4 p-3 rounded-xl text-center text-sm font-bold',
                              rateLimitTestResult.requestsBlocked > 0
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : rateLimitTestResult.requestsError > 0
                                  ? 'bg-orange-500/20 text-orange-400'
                                  : 'bg-amber-500/20 text-amber-400'
                            )}>
                              {rateLimitTestResult.requestsBlocked > 0
                                ? `🛡️ ระบบป้องกัน DDoS ทำงานได้ดี! บล็อกได้ ${rateLimitTestResult.requestsBlocked} requests`
                                : rateLimitTestResult.requestsError > 0
                                  ? `⚠️ มี ${rateLimitTestResult.requestsError} requests error - ตรวจสอบการเชื่อมต่อ`
                                  : `ℹ️ ยังไม่เกิน limit (${rateLimitSettings.webhookRateLimitPerAccountPerSecond}/s) - ลองเพิ่มความหนักการทดสอบ`
                              }
                            </div>
                          </motion.div>
                        )}

                        {/* Rate Limit Stats */}
                        {rateLimitStats && (
                          <div className="mt-6 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-sm font-bold text-white">📊 สถิติ (60 นาทีล่าสุด)</p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={fetchRateLimitStats}
                                className="text-xs"
                              >
                                🔄 รีเฟรช
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="text-center p-3 bg-slate-500/10 rounded-xl">
                                <p className="text-xl font-black text-slate-300">{rateLimitStats.totalRequests || 0}</p>
                                <p className="text-[10px] text-slate-500">Total Requests</p>
                              </div>
                              <div className="text-center p-3 bg-rose-500/10 rounded-xl">
                                <p className="text-xl font-black text-rose-400">{rateLimitStats.blockedRequests || 0}</p>
                                <p className="text-[10px] text-slate-500">Blocked</p>
                              </div>
                              <div className="text-center p-3 bg-amber-500/10 rounded-xl">
                                <p className="text-xl font-black text-amber-400">{(rateLimitStats.blockRate || 0).toFixed(1)}%</p>
                                <p className="text-[10px] text-slate-500">Block Rate</p>
                              </div>
                              <div className="text-center p-3 bg-purple-500/10 rounded-xl">
                                <p className="text-xl font-black text-purple-400">{rateLimitStats.blockedByIp || 0}</p>
                                <p className="text-[10px] text-slate-500">By IP</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Rate Limit Logs */}
                        {showRateLimitLogs && rateLimitLogs.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-6"
                          >
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-sm font-bold text-white">📋 Logs ล่าสุด</p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleClearTestLogs}
                                className="text-xs text-rose-400 hover:text-rose-300"
                              >
                                🗑️ ลบ Logs ทดสอบ
                              </Button>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {rateLimitLogs.map((log: any, index: number) => (
                                <div
                                  key={log._id || index}
                                  className={cn(
                                    'p-3 rounded-xl text-xs flex items-center justify-between',
                                    log.action === 'blocked' ? 'bg-rose-500/10' : 'bg-emerald-500/10'
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <span>{log.action === 'blocked' ? '🚫' : '✅'}</span>
                                    <div>
                                      <p className="font-medium text-white">
                                        {log.type} - {log.clientIp}
                                      </p>
                                      <p className="text-slate-500">
                                        {log.endpoint} | {new Date(log.createdAt).toLocaleTimeString('th-TH')}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className={log.action === 'blocked' ? 'text-rose-400' : 'text-emerald-400'}>
                                      {log.requestCount}/{log.limit}
                                    </p>
                                    {log.isTest && <Badge size="sm" variant="purple">TEST</Badge>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
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


                      {/* Network-specific API Keys */}
                      <div className="pt-6 border-t border-white/5 space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">🔑</span>
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">ตั้งค่า API Keys</h3>
                        </div>

                        {/* Etherscan */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                              Etherscan API Key (สำหรับ ERC20)
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
                              className="px-4 border border-white/10 hover:bg-white/5 text-slate-300"
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

                        {/* BSCScan */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                              BSCScan API Key (สำหรับ BEP20)
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
                              className="px-4 border border-white/10 hover:bg-white/5 text-slate-300"
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

                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 flex gap-3">
                          <div className="text-emerald-400">ℹ️</div>
                          <p className="text-xs text-emerald-200/80 leading-relaxed">
                            <strong>TRC20 (Tron)</strong> ไม่จำเป็นต้องใช้ API Key สามารถใช้งานได้ทันที<br />
                            ระบบจะเลือกใช้ API Key ตามเครือข่ายที่คุณเลือกด้านบนโดยอัตโนมัติ
                          </p>
                        </div>
                      </div>

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

            {activeTab === 'access' && (
              <motion.div
                key="access"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-10"
              >
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-2xl">🔐</div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight text-white">การควบคุมการเข้าถึง</h2>
                      <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">เปิด/ปิด ระบบลงทะเบียน และเข้าสู่ระบบ</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Registration Control */}
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <span className="text-xl">📝</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">อนุญาตให้สมัครสมาชิก</h3>
                            <p className="text-xs text-slate-500">เปิดหรือปิดการรับสมาชิกใหม่</p>
                          </div>
                        </div>
                        <Switch
                          checked={accessControlSettings.allowRegistration}
                          onChange={(checked) => setAccessControlSettings({
                            ...accessControlSettings,
                            allowRegistration: checked
                          })}
                        />
                      </div>
                      {!accessControlSettings.allowRegistration && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                            ข้อความแจ้งเตือน (เมื่อปิดการสมัคร)
                          </label>
                          <input
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500/50"
                            value={accessControlSettings.registrationDisabledMessage}
                            onChange={(e) => setAccessControlSettings({
                              ...accessControlSettings,
                              registrationDisabledMessage: e.target.value
                            })}
                            placeholder="ข้อความที่จะแสดงเมื่อปิดการสมัคร"
                          />
                        </motion.div>
                      )}
                    </div>

                    {/* Login Control */}
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                            <span className="text-xl">🔑</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">อนุญาตให้เข้าสู่ระบบ</h3>
                            <p className="text-xs text-slate-500">เปิดหรือปิดการเข้าสู่ระบบของผู้ใช้</p>
                          </div>
                        </div>
                        <Switch
                          checked={accessControlSettings.allowLogin}
                          onChange={(checked) => setAccessControlSettings({
                            ...accessControlSettings,
                            allowLogin: checked
                          })}
                        />
                      </div>
                      {!accessControlSettings.allowLogin && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                            ข้อความแจ้งเตือน (เมื่อปิดการเข้าสู่ระบบ)
                          </label>
                          <input
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500/50"
                            value={accessControlSettings.loginDisabledMessage}
                            onChange={(e) => setAccessControlSettings({
                              ...accessControlSettings,
                              loginDisabledMessage: e.target.value
                            })}
                            placeholder="ข้อความที่จะแสดงเมื่อปิดการเข้าสู่ระบบ"
                          />
                        </motion.div>
                      )}
                      {!accessControlSettings.allowLogin && (
                        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                          <p className="text-xs text-rose-400 font-semibold flex items-center gap-2">
                            <span>⚠️</span>
                            <span>คำเตือน: การปิดระบบเข้าสู่ระบบจะทำให้ผู้ใช้ทุกคน (ยกเว้นแอดมิน) ไม่สามารถเข้าใช้งานได้</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Current Status */}
                    <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/50 to-slate-800/50 border border-white/5">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">สถานะปัจจุบัน</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            accessControlSettings.allowRegistration ? "bg-emerald-500 shadow-emerald-500/50 shadow-lg" : "bg-rose-500 shadow-rose-500/50 shadow-lg"
                          )} />
                          <span className="text-sm text-slate-300">
                            การสมัครสมาชิก: <span className={cn("font-bold", accessControlSettings.allowRegistration ? "text-emerald-400" : "text-rose-400")}>
                              {accessControlSettings.allowRegistration ? 'เปิด' : 'ปิด'}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-3 h-3 rounded-full",
                            accessControlSettings.allowLogin ? "bg-emerald-500 shadow-emerald-500/50 shadow-lg" : "bg-rose-500 shadow-rose-500/50 shadow-lg"
                          )} />
                          <span className="text-sm text-slate-300">
                            การเข้าสู่ระบบ: <span className={cn("font-bold", accessControlSettings.allowLogin ? "text-emerald-400" : "text-rose-400")}>
                              {accessControlSettings.allowLogin ? 'เปิด' : 'ปิด'}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 pt-8 border-t border-white/5 flex justify-end">
                    <Button
                      variant="primary"
                      size="lg"
                      className="px-10 h-16 rounded-2xl shadow-emerald-500/20 font-black tracking-widest uppercase text-[11px]"
                      onClick={() => handleUpdate('access', accessControlSettings)}
                      isLoading={isSaving === 'access'}
                    >
                      บันทึกการตั้งค่า
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'branding' && (
              <motion.div
                key="branding"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-10"
              >
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">🎨</div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">ข้อความใต้สลิป</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">ตั้งค่าข้อความแบรนด์และสีสลิป</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Brand Name & Verification Text */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          ชื่อแบรนด์
                        </label>
                        <Input
                          value={slipBrandingSettings.slipBrandName}
                          onChange={(e) => setSlipBrandingSettings({
                            ...slipBrandingSettings,
                            slipBrandName: e.target.value
                          })}
                          placeholder="DooSlip"
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                          hint="ชื่อที่แสดงใต้สลิป (เว้นว่างเพื่อไม่แสดง)"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          ข้อความตรวจสอบ
                        </label>
                        <Input
                          value={slipBrandingSettings.slipVerificationText}
                          onChange={(e) => setSlipBrandingSettings({
                            ...slipBrandingSettings,
                            slipVerificationText: e.target.value
                          })}
                          placeholder="สลิปจริง ตรวจสอบโดย DooSlip"
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                          hint="ข้อความหลักใต้สลิป (เว้นว่างเพื่อไม่แสดง)"
                        />
                      </div>
                    </div>

                    {/* Footer Message */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                        ข้อความท้าย
                      </label>
                      <Input
                        value={slipBrandingSettings.slipFooterMessage}
                        onChange={(e) => setSlipBrandingSettings({
                          ...slipBrandingSettings,
                          slipFooterMessage: e.target.value
                        })}
                        placeholder="ผู้ให้บริการเช็คสลิปอันดับ 1"
                        className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                        hint="ข้อความรองใต้สลิป (เว้นว่างเพื่อไม่แสดง)"
                      />
                    </div>

                    {/* Brand Logo Upload */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                        โลโก้แบรนด์ (ไม่บังคับ)
                      </label>
                      {/* URL Input for LINE compatibility */}
                      <div className="mb-4">
                        <Input
                          value={slipBrandingSettings.slipBrandLogoUrl}
                          onChange={(e) => setSlipBrandingSettings({
                            ...slipBrandingSettings,
                            slipBrandLogoUrl: e.target.value
                          })}
                          placeholder="https://example.com/logo.png"
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                          hint="URL ของโลโก้ (ต้องเป็น HTTPS) - ใช้สำหรับแสดงใน LINE"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Preview */}
                        <div className="w-20 h-20 rounded-xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {slipBrandingSettings.slipBrandLogoUrl ? (
                            <img
                              src={slipBrandingSettings.slipBrandLogoUrl}
                              alt="Logo"
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : slipBrandingSettings.slipBrandLogoBase64 ? (
                            <img
                              src={slipBrandingSettings.slipBrandLogoBase64}
                              alt="Logo"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-2xl text-slate-500">🖼️</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 500 * 1024) {
                                  toast.error('ไฟล์ต้องมีขนาดไม่เกิน 500KB');
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  setSlipBrandingSettings({
                                    ...slipBrandingSettings,
                                    slipBrandLogoBase64: event.target?.result as string,
                                  });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="hidden"
                            id="logo-upload"
                          />
                          <label
                            htmlFor="logo-upload"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer transition-colors text-sm text-white"
                          >
                            📤 อัปโหลดโลโก้ (สำหรับตัวอย่าง)
                          </label>
                          {slipBrandingSettings.slipBrandLogoBase64 && (
                            <button
                              onClick={() => setSlipBrandingSettings({
                                ...slipBrandingSettings,
                                slipBrandLogoBase64: '',
                              })}
                              className="ml-2 text-xs text-rose-400 hover:text-rose-300"
                            >
                              ลบโลโก้
                            </button>
                          )}
                          <p className="text-[10px] text-slate-500">PNG, JPG, WEBP (ไม่เกิน 500KB)</p>
                          <p className="text-[10px] text-amber-400">⚠️ LINE ต้องใช้ URL (HTTPS) เท่านั้น - อัปโหลดใช้แค่ดูตัวอย่าง</p>
                        </div>
                      </div>
                    </div>

                    {/* Button Settings */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          ข้อความปุ่ม (ไม่บังคับ)
                        </label>
                        <Input
                          value={slipBrandingSettings.slipBrandButtonText}
                          onChange={(e) => setSlipBrandingSettings({
                            ...slipBrandingSettings,
                            slipBrandButtonText: e.target.value
                          })}
                          placeholder="ติดต่อเรา"
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                          hint="ข้อความที่แสดงบนปุ่ม"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          ลิงก์ปุ่ม
                        </label>
                        <Input
                          value={slipBrandingSettings.slipBrandButtonUrl}
                          onChange={(e) => setSlipBrandingSettings({
                            ...slipBrandingSettings,
                            slipBrandButtonUrl: e.target.value
                          })}
                          placeholder="https://line.me/ti/p/@yourlineid หรือ tel:021234567"
                          className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-mono text-sm"
                          hint="ต้องขึ้นต้นด้วย https:// หรือ tel:"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Colors Section */}
                  <div className="mt-10 pt-8 border-t border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-tight mb-6">🎨 สีสลิป</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          สีสำเร็จ
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={slipBrandingSettings.slipSuccessColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipSuccessColor: e.target.value
                            })}
                            className="w-14 h-14 rounded-xl border-2 border-white/10 cursor-pointer"
                          />
                          <Input
                            value={slipBrandingSettings.slipSuccessColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipSuccessColor: e.target.value
                            })}
                            className="h-14 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono text-xs flex-1"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          สีสลิปซ้ำ
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={slipBrandingSettings.slipDuplicateColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipDuplicateColor: e.target.value
                            })}
                            className="w-14 h-14 rounded-xl border-2 border-white/10 cursor-pointer"
                          />
                          <Input
                            value={slipBrandingSettings.slipDuplicateColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipDuplicateColor: e.target.value
                            })}
                            className="h-14 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono text-xs flex-1"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          สีผิดพลาด
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={slipBrandingSettings.slipErrorColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipErrorColor: e.target.value
                            })}
                            className="w-14 h-14 rounded-xl border-2 border-white/10 cursor-pointer"
                          />
                          <Input
                            value={slipBrandingSettings.slipErrorColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipErrorColor: e.target.value
                            })}
                            className="h-14 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono text-xs flex-1"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          สีจำนวนเงิน
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={slipBrandingSettings.slipAmountColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipAmountColor: e.target.value
                            })}
                            className="w-14 h-14 rounded-xl border-2 border-white/10 cursor-pointer"
                          />
                          <Input
                            value={slipBrandingSettings.slipAmountColor}
                            onChange={(e) => setSlipBrandingSettings({
                              ...slipBrandingSettings,
                              slipAmountColor: e.target.value
                            })}
                            className="h-14 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono text-xs flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview Section */}
                  <div className="mt-10 pt-8 border-t border-white/5">
                    <h3 className="text-lg font-black text-white uppercase tracking-tight mb-6">👁️ ตัวอย่างข้อความใต้สลิป</h3>
                    <div className="p-6 bg-white rounded-2xl">
                      <div className="text-center space-y-2">
                        <div className="border-t border-gray-200 pt-4">
                          {slipBrandingSettings.slipVerificationText && (
                            <p className="text-sm text-gray-600">{slipBrandingSettings.slipVerificationText}</p>
                          )}
                          {slipBrandingSettings.slipFooterMessage && (
                            <p className="text-xs text-gray-400 mt-1">{slipBrandingSettings.slipFooterMessage}</p>
                          )}
                          {slipBrandingSettings.slipBrandButtonText && slipBrandingSettings.slipBrandButtonUrl && (
                            <div className="mt-3">
                              <span
                                className="inline-block px-4 py-2 text-white text-sm font-semibold rounded-lg"
                                style={{ backgroundColor: slipBrandingSettings.slipSuccessColor }}
                              >
                                {slipBrandingSettings.slipBrandButtonText}
                              </span>
                            </div>
                          )}
                          {!slipBrandingSettings.slipVerificationText && !slipBrandingSettings.slipFooterMessage && !slipBrandingSettings.slipBrandButtonText && (
                            <p className="text-xs text-gray-400 italic">ไม่มีข้อความใต้สลิป</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="mt-10 pt-8 border-t border-white/5 flex justify-between items-center">
                    <Button
                      variant="ghost"
                      className="text-slate-400 hover:text-white"
                      onClick={() => setSlipBrandingSettings({
                        slipBrandName: '',
                        slipVerificationText: '',
                        slipFooterMessage: '',
                        slipShowPromptPayLogo: false,
                        slipBrandLogoUrl: '',
                        slipBrandLogoBase64: '',
                        slipBrandButtonText: '',
                        slipBrandButtonUrl: '',
                        slipSuccessColor: '#22C55E',
                        slipDuplicateColor: '#F59E0B',
                        slipErrorColor: '#EF4444',
                        slipAmountColor: '#1E3A5F',
                      })}
                    >
                      ล้างข้อความทั้งหมด
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      className="px-10 h-16 rounded-2xl shadow-emerald-500/20 font-black tracking-widest uppercase text-[11px]"
                      onClick={() => handleUpdate('branding', slipBrandingSettings)}
                      isLoading={isSaving === 'branding'}
                    >
                      บันทึกการตั้งค่า
                    </Button>
                  </div>
                </Card>

                {/* Floating Contact Button Settings */}
                <Card variant="glass" className="p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3rem]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-10">
                    <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0">💬</div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">ปุ่มติดต่อแอดมิน</h2>
                      <p className="text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-widest">ปุ่มลอยมุมขวาล่างของหน้าจอ</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                      <div>
                        <p className="text-sm font-bold text-white">เปิดใช้งานปุ่มติดต่อ</p>
                        <p className="text-xs text-slate-500">แสดงปุ่มลอยที่มุมขวาล่างของทุกหน้า</p>
                      </div>
                      <Switch
                        checked={floatingContactSettings.floatingContactEnabled}
                        onChange={(checked) => setFloatingContactSettings({
                          ...floatingContactSettings,
                          floatingContactEnabled: checked
                        })}
                      />
                    </div>

                    {floatingContactSettings.floatingContactEnabled && (
                      <>
                        {/* URL */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                            ลิงก์ติดต่อ *
                          </label>
                          <Input
                            value={floatingContactSettings.floatingContactUrl}
                            onChange={(e) => setFloatingContactSettings({
                              ...floatingContactSettings,
                              floatingContactUrl: e.target.value
                            })}
                            placeholder="https://line.me/ti/p/@yourlineid"
                            className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-mono text-sm"
                            hint="ลิงก์ LINE, เว็บไซต์, หรือเบอร์โทร (tel:021234567)"
                          />
                        </div>

                        {/* Icon Upload */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                            ไอคอน/โลโก้ (ไม่บังคับ)
                          </label>
                          <div className="mb-4">
                            <Input
                              value={floatingContactSettings.floatingContactIconUrl}
                              onChange={(e) => setFloatingContactSettings({
                                ...floatingContactSettings,
                                floatingContactIconUrl: e.target.value
                              })}
                              placeholder="https://example.com/icon.png"
                              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                              hint="URL ของไอคอน (ต้องเป็น HTTPS)"
                            />
                          </div>
                          <div className="flex items-center gap-4">
                            <div
                              className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg"
                              style={{ backgroundColor: floatingContactSettings.floatingContactBgColor }}
                            >
                              {floatingContactSettings.floatingContactIconUrl ? (
                                <img
                                  src={floatingContactSettings.floatingContactIconUrl}
                                  alt="Icon"
                                  className="w-12 h-12 object-cover rounded-full"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : floatingContactSettings.floatingContactIconBase64 ? (
                                <img
                                  src={floatingContactSettings.floatingContactIconBase64}
                                  alt="Icon"
                                  className="w-12 h-12 object-cover rounded-full"
                                />
                              ) : (
                                <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7">
                                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
                                  <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 space-y-2">
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    if (file.size > 500 * 1024) {
                                      toast.error('ไฟล์ต้องมีขนาดไม่เกิน 500KB');
                                      return;
                                    }
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                      setFloatingContactSettings({
                                        ...floatingContactSettings,
                                        floatingContactIconBase64: event.target?.result as string,
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="hidden"
                                id="floating-icon-upload"
                              />
                              <label
                                htmlFor="floating-icon-upload"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl cursor-pointer transition-colors text-sm text-white"
                              >
                                📤 อัปโหลดไอคอน
                              </label>
                              {floatingContactSettings.floatingContactIconBase64 && (
                                <button
                                  onClick={() => setFloatingContactSettings({
                                    ...floatingContactSettings,
                                    floatingContactIconBase64: '',
                                  })}
                                  className="ml-2 text-xs text-rose-400 hover:text-rose-300"
                                >
                                  ลบไอคอน
                                </button>
                              )}
                              <p className="text-[10px] text-slate-500">PNG, JPG, WEBP (ไม่เกิน 500KB) - แนะนำขนาด 100x100px</p>
                            </div>
                          </div>
                        </div>

                        {/* Tooltip & Background Color */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                              ข้อความ Tooltip
                            </label>
                            <Input
                              value={floatingContactSettings.floatingContactTooltip}
                              onChange={(e) => setFloatingContactSettings({
                                ...floatingContactSettings,
                                floatingContactTooltip: e.target.value
                              })}
                              placeholder="ติดต่อแอดมิน"
                              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                              hint="ข้อความที่แสดงเมื่อชี้เมาส์"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                              สีพื้นหลัง
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="color"
                                value={floatingContactSettings.floatingContactBgColor}
                                onChange={(e) => setFloatingContactSettings({
                                  ...floatingContactSettings,
                                  floatingContactBgColor: e.target.value
                                })}
                                className="w-14 h-14 rounded-xl border-2 border-white/10 cursor-pointer"
                              />
                              <Input
                                value={floatingContactSettings.floatingContactBgColor}
                                onChange={(e) => setFloatingContactSettings({
                                  ...floatingContactSettings,
                                  floatingContactBgColor: e.target.value
                                })}
                                className="h-14 rounded-xl bg-white/[0.03] border-white/10 text-white font-mono text-xs flex-1"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Size & Position */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                              ขนาดปุ่ม (px)
                            </label>
                            <Input
                              type="number"
                              value={floatingContactSettings.floatingContactSize}
                              onChange={(e) => setFloatingContactSettings({
                                ...floatingContactSettings,
                                floatingContactSize: parseInt(e.target.value) || 56
                              })}
                              min={40}
                              max={80}
                              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                              hint="40-80px (แนะนำ 56)"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                              ระยะจากด้านล่าง (px)
                            </label>
                            <Input
                              type="number"
                              value={floatingContactSettings.floatingContactBottom}
                              onChange={(e) => setFloatingContactSettings({
                                ...floatingContactSettings,
                                floatingContactBottom: parseInt(e.target.value) || 24
                              })}
                              min={8}
                              max={100}
                              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                              hint="8-100px"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                              ระยะจากด้านขวา (px)
                            </label>
                            <Input
                              type="number"
                              value={floatingContactSettings.floatingContactRight}
                              onChange={(e) => setFloatingContactSettings({
                                ...floatingContactSettings,
                                floatingContactRight: parseInt(e.target.value) || 24
                              })}
                              min={8}
                              max={100}
                              className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white"
                              hint="8-100px"
                            />
                          </div>
                        </div>

                        {/* Mobile Toggle */}
                        <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                          <div>
                            <p className="text-sm font-bold text-white">แสดงบนมือถือ</p>
                            <p className="text-xs text-slate-500">แสดงปุ่มบนอุปกรณ์มือถือ</p>
                          </div>
                          <Switch
                            checked={floatingContactSettings.floatingContactShowOnMobile}
                            onChange={(checked) => setFloatingContactSettings({
                              ...floatingContactSettings,
                              floatingContactShowOnMobile: checked
                            })}
                          />
                        </div>
                      </>
                    )}

                    {/* Save Button */}
                    <div className="mt-10 pt-8 border-t border-white/5 flex justify-end">
                      <Button
                        variant="primary"
                        size="lg"
                        className="px-10 h-16 rounded-2xl shadow-emerald-500/20 font-black tracking-widest uppercase text-[11px]"
                        onClick={() => handleUpdate('floatingContact', floatingContactSettings)}
                        isLoading={isSaving === 'floatingContact'}
                      >
                        บันทึกการตั้งค่า
                      </Button>
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
