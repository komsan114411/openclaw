'use client';

import { useEffect, useState, memo } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, systemSettingsApi, banksApi } from '@/lib/api';
import { LineAccount, SlipTemplateListItem, Bank } from '@/types';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Textarea, Select, Switch } from '@/components/ui/Input';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  FileCheck,
  Bot,
  Plus,
  Trash2,
  Edit,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Activity,
  HelpCircle,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

// Extended SlipTemplate interface for preview
interface SlipTemplateForPreview {
  _id: string;
  name: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  showBankLogo?: boolean;
  showFee?: boolean;
  showSenderAccount?: boolean;
  showReceiverAccount?: boolean;
}

// Default sample data for realistic preview (Thai) - will be overridden by API config
const DEFAULT_SAMPLE_DATA = {
  amount: '฿1,500.00',
  fee: '฿0',
  date: '5 ม.ค. 2569',
  time: '14:32',
  transRef: '69010516324789A123456B78',
  sender: {
    name: 'นาย ธันเดอร์ มานะ',
    account: '1234xxxx5678',
    bankId: '004', // KBANK
  },
  receiver: {
    name: 'นาย ธันเดอร์ มานะ',
    account: '9876xxxx4321',
    bankId: '014', // SCB
  },
};

// Default template for preview when none selected
const DEFAULT_PREVIEW_TEMPLATE: SlipTemplateForPreview = {
  _id: 'default',
  name: 'ค่าเริ่มต้น',
  type: 'success',
  primaryColor: '#10b981',
  headerText: 'ตรวจสอบสลิปสำเร็จ',
  footerText: 'ขอบคุณที่ใช้บริการ',
  showAmount: true,
  showSender: true,
  showReceiver: true,
  showDate: true,
  showTime: true,
  showTransRef: true,
  showBankLogo: true,
  showFee: true,
  showSenderAccount: true,
  showReceiverAccount: true,
};

// Sample data type
interface SampleData {
  amount: string;
  fee: string;
  date: string;
  time: string;
  transRef: string;
  sender: { name: string; account: string; bankId: string };
  receiver: { name: string; account: string; bankId: string };
}

// Connection status type
type ConnectionStatusType = 'connected' | 'disconnected' | 'checking' | 'unknown';

interface ConnectionStatusInfo {
  status: ConnectionStatusType;
  lastChecked?: Date;
  errorMessage?: string;
  botName?: string;
}

// SlipPreview Component (Admin-style design with real bank logos)
const SlipPreview = memo(({ template, senderBank, receiverBank, sampleData = DEFAULT_SAMPLE_DATA }: {
  template: SlipTemplateForPreview;
  senderBank?: Bank | null;
  receiverBank?: Bank | null;
  sampleData?: SampleData;
}) => {
  const isDuplicate = template.type === 'duplicate';
  const isError = template.type === 'error';
  const isNotFound = template.type === 'not_found';
  const mainColor = isDuplicate ? '#f59e0b' : isError ? '#ef4444' : isNotFound ? '#64748b' : template.primaryColor || '#10b981';

  const getStatusIcon = () => {
    if (isDuplicate) return '!';
    if (isError) return '✕';
    if (isNotFound) return '?';
    return '✓';
  };

  const getStatusText = () => {
    if (template.headerText) return template.headerText;
    if (isDuplicate) return 'ตรวจพบสลิปซ้ำในระบบ';
    if (isError) return 'ระบบขัดข้อง กรุณาลองใหม่';
    if (isNotFound) return 'ไม่พบข้อมูลสลิปนี้';
    return 'ตรวจสอบสลิปสำเร็จ';
  };

  // Get bank logos
  const senderLogo = senderBank?.logoBase64 || senderBank?.logoUrl;
  const receiverLogo = receiverBank?.logoBase64 || receiverBank?.logoUrl;

  return (
    <div className="bg-slate-900 rounded-[1.5rem] p-3 w-full max-w-[200px] mx-auto shadow-2xl border border-white/10 relative overflow-hidden">
      {/* Decorative glow */}
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full blur-[25px] -mr-10 -mt-10 pointer-events-none opacity-40 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      />

      {/* Status Header */}
      <div
        className="rounded-xl p-2 mb-2 flex items-center gap-2 border border-white/10 backdrop-blur-sm transition-colors duration-200"
        style={{ backgroundColor: `${mainColor}20` }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shadow-lg transition-colors duration-200 flex-shrink-0"
          style={{ backgroundColor: mainColor }}
        >
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[9px] font-bold leading-tight transition-colors duration-200 truncate"
            style={{ color: mainColor }}
          >
            {getStatusText()}
          </p>
          <p className="text-[6px] text-white/40 font-medium">ยืนยันการทำรายการแล้ว</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl p-2 space-y-1.5 shadow-inner relative z-10">
        {/* Amount Section */}
        {template.showAmount && (
          <div className="text-center py-1 border-b border-slate-100">
            <p className="text-[6px] text-slate-400 font-medium mb-0.5">จำนวนเงิน</p>
            <p className="text-base font-bold transition-colors duration-200" style={{ color: mainColor }}>
              {sampleData.amount}
            </p>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              {template.showDate && <p className="text-[6px] text-slate-400">{sampleData.date}</p>}
              {template.showDate && template.showTime && <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />}
              {template.showTime && <p className="text-[6px] text-slate-400">{sampleData.time}</p>}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {/* Sender */}
          {template.showSender && (
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 rounded-lg">
              {template.showBankLogo && (
                <div className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {senderLogo ? (
                    <img src={senderLogo} alt={senderBank?.name || 'Bank'} className="w-4 h-4 object-contain" />
                  ) : (
                    <span className="text-[8px]">👤</span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[6px] text-slate-400 font-medium">ผู้โอน</p>
                <p className="text-[8px] font-semibold text-slate-800 truncate">{sampleData.sender.name}</p>
                {template.showSenderAccount && <p className="text-[6px] text-slate-400 font-mono">{sampleData.sender.account}</p>}
              </div>
            </div>
          )}

          {/* Arrow Divider */}
          {template.showSender && template.showReceiver && (
            <div className="flex justify-center -my-0.5 relative z-10">
              <div className="w-3.5 h-3.5 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                <span className="text-slate-400 text-[7px]">↓</span>
              </div>
            </div>
          )}

          {/* Receiver */}
          {template.showReceiver && (
            <div className="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors duration-200" style={{ backgroundColor: `${mainColor}10` }}>
              {template.showBankLogo && (
                <div className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {receiverLogo ? (
                    <img src={receiverLogo} alt={receiverBank?.name || 'Bank'} className="w-4 h-4 object-contain" />
                  ) : (
                    <span className="text-[8px]">🏦</span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[6px] font-medium transition-colors duration-200" style={{ color: mainColor }}>ผู้รับ</p>
                <p className="text-[8px] font-semibold text-slate-800 truncate">{sampleData.receiver.name}</p>
                {template.showReceiverAccount && <p className="text-[6px] text-slate-400 font-mono">{sampleData.receiver.account}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Transaction Details */}
        {(template.showTransRef || template.showFee) && (
          <div className="pt-1 border-t border-dashed border-slate-200 space-y-0.5">
            {template.showTransRef && (
              <div className="flex justify-between items-center text-[6px]">
                <span className="text-slate-400">เลขอ้างอิง</span>
                <span className="text-slate-700 font-mono font-medium truncate ml-1">{sampleData.transRef.slice(0, 10)}...</span>
              </div>
            )}
            {template.showFee && (
              <div className="flex justify-between items-center text-[6px]">
                <span className="text-slate-400">ค่าธรรมเนียม</span>
                <span className="text-emerald-600 font-medium">{sampleData.fee}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer Text */}
        {template.footerText && (
          <div className="pt-1 border-t border-slate-100">
            <p className="text-[5px] text-slate-400 text-center leading-tight">{template.footerText}</p>
          </div>
        )}
      </div>

      {/* Bottom Branding */}
      <div className="mt-1.5 flex justify-center">
        <p className="text-[5px] text-white/20 font-medium">LINE OA System</p>
      </div>
    </div>
  );
});
SlipPreview.displayName = 'SlipPreview';

export default function UserLineAccountsPage() {
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [templates, setTemplates] = useState<SlipTemplateListItem[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [sampleData, setSampleData] = useState<SampleData>(DEFAULT_SAMPLE_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatusInfo>>({});

  const [editAccount, setEditAccount] = useState<LineAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<LineAccount | null>(null);

  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
    slipTemplateId: '' as string,
  });

  const [settingsData, setSettingsData] = useState({
    enableBot: true,
    enableAi: false,
    enableSlipVerification: true,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    aiModel: '' as string,  // AI Model สำหรับบัญชีนี้
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
    sendMessageWhenAiQuotaExhausted: 'default' as string,
    sendProcessingMessage: true, // ส่งข้อความ "กำลังประมวลผล" หรือไม่
  });

  // AI Settings from system
  const [globalAiEnabled, setGlobalAiEnabled] = useState<boolean>(true);
  const [allowedAiModels, setAllowedAiModels] = useState<string[]>([]);

  const fetchAiSettings = async () => {
    try {
      const res = await systemSettingsApi.getAiSettings();
      setGlobalAiEnabled(res.data.globalAiEnabled ?? true);
      setAllowedAiModels(res.data.allowedAiModels || ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini']);
    } catch {
      setAllowedAiModels(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini']);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchPublicBaseUrl();
    fetchTemplates();
    fetchBanks();
    fetchPreviewConfig();
    fetchAiSettings();
  }, []);

  // Auto-check all connections when accounts are loaded
  useEffect(() => {
    if (accounts.length > 0 && !isLoading && Object.keys(connectionStatus).length === 0) {
      // Check all connections automatically on load (without showing toast)
      const autoCheckConnections = async () => {
        setIsCheckingAll(true);
        const checkingStatus: Record<string, ConnectionStatusInfo> = {};
        accounts.forEach(acc => {
          checkingStatus[acc._id] = { status: 'checking' };
        });
        setConnectionStatus(checkingStatus);

        for (const account of accounts) {
          await checkSingleConnection(account._id);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        setIsCheckingAll(false);
      };
      autoCheckConnections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, isLoading]);

  const fetchPreviewConfig = async () => {
    try {
      const response = await systemSettingsApi.getPreviewConfig();
      const config = response.data.previewConfig;
      if (config) {
        // Validate and sanitize data before setting
        const sanitizedAmount = config.amount && /^[\d,\.]+$/.test(config.amount)
          ? `฿${config.amount}`
          : DEFAULT_SAMPLE_DATA.amount;

        const sanitizedSenderBankId = config.senderBankCode && config.senderBankCode.length <= 10
          ? config.senderBankCode
          : DEFAULT_SAMPLE_DATA.sender.bankId;

        const sanitizedReceiverBankId = config.receiverBankCode && config.receiverBankCode.length <= 10
          ? config.receiverBankCode
          : DEFAULT_SAMPLE_DATA.receiver.bankId;

        setSampleData({
          ...DEFAULT_SAMPLE_DATA,
          amount: sanitizedAmount,
          sender: {
            ...DEFAULT_SAMPLE_DATA.sender,
            name: config.senderName?.trim() || DEFAULT_SAMPLE_DATA.sender.name,
            bankId: sanitizedSenderBankId,
          },
          receiver: {
            ...DEFAULT_SAMPLE_DATA.receiver,
            name: config.receiverName?.trim() || DEFAULT_SAMPLE_DATA.receiver.name,
            bankId: sanitizedReceiverBankId,
          },
        });
      }
    } catch (error: unknown) {
      // Silently fallback to default sample data
      console.warn('Using default preview config (API unavailable)');
      setSampleData(DEFAULT_SAMPLE_DATA);
    }
  };

  const fetchPublicBaseUrl = async () => {
    try {
      const res = await systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} }));
      setPublicBaseUrl(res.data.publicBaseUrl || '');
    } catch {
      setPublicBaseUrl('');
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await lineAccountsApi.getMyTemplates();
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchBanks = async () => {
    try {
      const response = await banksApi.getAll();
      setBanks(response.data.banks || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.accessToken) {
      toast.error('กรุณากรอก Access Token ก่อน');
      return;
    }
    setIsTesting(true);
    try {
      const response = await lineAccountsApi.testConnectionWithToken(formData.accessToken);
      if (response.data.success) {
        toast.success(response.data.message || 'เชื่อมต่อสำเร็จ');
        if (response.data.botInfo?.displayName) {
          toast.success(`ชื่อบอท: ${response.data.botInfo.displayName}`);
        }
      } else {
        toast.error(response.data.message || 'การเชื่อมต่อล้มเหลว');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถทดสอบการเชื่อมต่อได้');
    } finally {
      setIsTesting(false);
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

  // Check connection for a single account
  const checkSingleConnection = async (accountId: string) => {
    setConnectionStatus(prev => ({
      ...prev,
      [accountId]: { status: 'checking' }
    }));

    try {
      const response = await lineAccountsApi.testConnection(accountId);
      if (response.data.success) {
        setConnectionStatus(prev => ({
          ...prev,
          [accountId]: {
            status: 'connected',
            lastChecked: new Date(),
            botName: response.data.botInfo?.displayName || undefined,
          }
        }));
      } else {
        setConnectionStatus(prev => ({
          ...prev,
          [accountId]: {
            status: 'disconnected',
            lastChecked: new Date(),
            errorMessage: response.data.message || 'การเชื่อมต่อล้มเหลว',
          }
        }));
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setConnectionStatus(prev => ({
        ...prev,
        [accountId]: {
          status: 'disconnected',
          lastChecked: new Date(),
          errorMessage: err.response?.data?.message || 'ไม่สามารถเชื่อมต่อได้',
        }
      }));
    }
  };

  // Check all account connections
  const checkAllConnections = async () => {
    if (accounts.length === 0) return;

    setIsCheckingAll(true);

    // Set all to checking state
    const checkingStatus: Record<string, ConnectionStatusInfo> = {};
    accounts.forEach(acc => {
      checkingStatus[acc._id] = { status: 'checking' };
    });
    setConnectionStatus(checkingStatus);

    // Check each account (with slight delay to avoid rate limiting)
    for (const account of accounts) {
      await checkSingleConnection(account._id);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsCheckingAll(false);
    toast.success('ตรวจสอบการเชื่อมต่อเสร็จสิ้น');
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      channelId: '',
      channelSecret: '',
      accessToken: '',
      description: '',
      slipTemplateId: '',
    });
    setEditAccount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSubmit = {
        ...formData,
        slipTemplateId: formData.slipTemplateId || undefined,
      };
      if (editAccount) {
        await lineAccountsApi.update(editAccount._id, dataToSubmit);
        toast.success('อัปเดตบัญชีสำเร็จ');
      } else {
        await lineAccountsApi.create(dataToSubmit);
        toast.success('เพิ่มบัญชีสำเร็จ');
      }
      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
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
      slipTemplateId: account.settings?.slipTemplateId || '',
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

  const handleUpdateSettings = async (id: string, settings: Record<string, unknown>) => {
    try {
      await lineAccountsApi.updateSettings(id, settings);
      toast.success('อัปเดตสถานะสำเร็จ');
      fetchAccounts();
    } catch {
      toast.error('ไม่สามารถอัปเดตได้');
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
      enableBot: s.enableBot ?? true,
      enableAi: s.enableAi ?? false,
      enableSlipVerification: s.enableSlipVerification ?? true,
      aiSystemPrompt: s.aiSystemPrompt || '',
      aiTemperature: s.aiTemperature ?? 0.7,
      aiFallbackMessage: s.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
      aiModel: s.aiModel || '',
      slipImmediateMessage: s.slipImmediateMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
      customQuotaExceededMessage: s.customQuotaExceededMessage || '',
      customBotDisabledMessage: s.customBotDisabledMessage || '',
      customSlipDisabledMessage: s.customSlipDisabledMessage || '',
      customAiDisabledMessage: s.customAiDisabledMessage || '',
      customDuplicateSlipMessage: s.customDuplicateSlipMessage || '',
      customSlipErrorMessage: s.customSlipErrorMessage || '',
      customSlipSuccessMessage: s.customSlipSuccessMessage || '',
      sendMessageWhenBotDisabled: boolToString(s.sendMessageWhenBotDisabled),
      sendMessageWhenSlipDisabled: boolToString(s.sendMessageWhenSlipDisabled),
      sendMessageWhenAiDisabled: boolToString(s.sendMessageWhenAiDisabled),
      sendMessageWhenAiQuotaExhausted: boolToString(s.sendMessageWhenAiQuotaExhausted),
      sendProcessingMessage: s.sendProcessingMessage ?? true,
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
        sendMessageWhenAiQuotaExhausted: stringToBool(settingsData.sendMessageWhenAiQuotaExhausted),
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
              onClick={checkAllConnections}
              size="lg"
              variant="outline"
              disabled={isCheckingAll || accounts.length === 0}
              leftIcon={isCheckingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all"
            >
              {isCheckingAll ? 'กำลังตรวจสอบ...' : 'ตรวจสอบการเชื่อมต่อ'}
            </Button>
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
                            {/* Connection Status Badge */}
                            {connectionStatus[account._id] && (
                              <button
                                onClick={() => checkSingleConnection(account._id)}
                                disabled={connectionStatus[account._id]?.status === 'checking'}
                                className={cn(
                                  "px-2 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-semibold flex items-center gap-1 transition-all cursor-pointer hover:opacity-80",
                                  connectionStatus[account._id]?.status === 'connected' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                                  connectionStatus[account._id]?.status === 'disconnected' && 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                                  connectionStatus[account._id]?.status === 'checking' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                                  connectionStatus[account._id]?.status === 'unknown' && 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                )}
                              >
                                {connectionStatus[account._id]?.status === 'connected' && (
                                  <>
                                    <Wifi className="w-3 h-3" />
                                    <span className="hidden sm:inline">เชื่อมต่อแล้ว</span>
                                    <span className="sm:hidden">✓</span>
                                  </>
                                )}
                                {connectionStatus[account._id]?.status === 'disconnected' && (
                                  <>
                                    <WifiOff className="w-3 h-3" />
                                    <span className="hidden sm:inline">ไม่เชื่อมต่อ</span>
                                    <span className="sm:hidden">✕</span>
                                  </>
                                )}
                                {connectionStatus[account._id]?.status === 'checking' && (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="hidden sm:inline">กำลังตรวจ...</span>
                                  </>
                                )}
                                {connectionStatus[account._id]?.status === 'unknown' && (
                                  <>
                                    <RefreshCw className="w-3 h-3" />
                                    <span className="hidden sm:inline">ยังไม่ตรวจ</span>
                                  </>
                                )}
                              </button>
                            )}
                            {!connectionStatus[account._id] && (
                              <button
                                onClick={() => checkSingleConnection(account._id)}
                                className="px-2 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-semibold flex items-center gap-1 bg-slate-500/10 text-slate-400 border border-slate-500/20 cursor-pointer hover:bg-slate-500/20 transition-all"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span className="hidden sm:inline">ตรวจสอบ</span>
                              </button>
                            )}
                          </div>
                          {/* Show error message if disconnected */}
                          {connectionStatus[account._id]?.status === 'disconnected' && connectionStatus[account._id]?.errorMessage && (
                            <p className="text-[8px] text-rose-400/70 mt-1 truncate" title={connectionStatus[account._id]?.errorMessage}>
                              {connectionStatus[account._id]?.errorMessage}
                            </p>
                          )}
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
                        <button
                          type="button"
                          onClick={() => handleUpdateSettings(account._id, { enableBot: !account.settings?.enableBot })}
                          className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <div className={`w-10 sm:w-12 h-5 sm:h-6 rounded-full relative transition-all ${account.settings?.enableBot ? 'bg-[#06C755]' : 'bg-white/10'}`}>
                            <div className={`absolute right-0.5 sm:right-1 top-0.5 sm:top-1 w-3.5 sm:w-4 h-3.5 sm:h-4 bg-white rounded-full transition-all ${account.settings?.enableBot ? '' : 'translate-x-[-1.25rem] sm:translate-x-[-1.5rem]'}`}></div>
                          </div>
                          <span className={`text-[8px] sm:text-[10px] font-semibold hidden sm:inline ${account.settings?.enableBot ? 'text-[#06C755]' : 'text-slate-500'}`}>
                            {account.settings?.enableBot ? 'เปิด' : 'ปิด'}
                          </span>
                        </button>
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
        title={editAccount ? 'แก้ไขบัญชี LINE' : 'เพิ่มบัญชี LINE ใหม่'}
        subtitle="กรอกข้อมูลจาก LINE Messaging API Console"
        size="lg"
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - Form (3/5 width on desktop) */}
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
            {/* LINE Developers Guide */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-blue-400">ขั้นตอนที่ 1: รับข้อมูลจาก LINE</p>
                  <p className="text-xs text-slate-400">
                    ไปที่ LINE Developers Console เพื่อรับ Channel ID, Channel Secret และ Access Token
                  </p>
                  <a
                    href="https://developers.line.biz/console/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    เปิด LINE Developers Console
                  </a>
                </div>
              </div>
            </div>

            <Input
              label="ชื่อบัญชี (Display Name)"
              placeholder="เช่น ร้านค้าของฉัน"
              value={formData.accountName}
              onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
              required
              leftIcon={<Bot className="w-5 h-5 text-emerald-400" />}
              className="bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Channel ID"
                placeholder="1234567890"
                value={formData.channelId}
                onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
                required
                className="font-mono bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
              />
              <Input
                label="Channel Secret"
                placeholder="กรอก Channel Secret"
                value={formData.channelSecret}
                onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })}
                required
                type="password"
                className="font-mono bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
              />
            </div>

            <div className="space-y-3">
              <Textarea
                label="Channel Access Token"
                placeholder="วาง Access Token ที่ได้จาก LINE Developers Console"
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                required
                className="font-mono text-[10px] min-h-[100px] bg-white/[0.03] border-white/10 text-white rounded-[2rem] p-6"
              />
              {/* Test Connection Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting || !formData.accessToken}
                className="w-full h-10 rounded-xl border-white/10 text-white hover:bg-white/5"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    กำลังทดสอบ...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    ทดสอบการเชื่อมต่อ
                  </>
                )}
              </Button>
            </div>

            {/* Slip Template Selection */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-400 ml-1 flex items-center gap-2">
                รูปแบบสลิป (Template)
                <span className="text-[10px] text-slate-500 font-normal">(ไม่บังคับ)</span>
              </label>
              <select
                value={formData.slipTemplateId}
                onChange={(e) => setFormData({ ...formData, slipTemplateId: e.target.value })}
                className="w-full h-14 px-4 bg-white/[0.03] border border-white/10 rounded-2xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]/50"
              >
                <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                {templates.filter(t => t.type === 'success').length > 0 && (
                  <optgroup label="เทมเพลตสลิปถูกต้อง">
                    {templates.filter(t => t.type === 'success').map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.isGlobal ? '🌐 ' : ''}{t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {templates.filter(t => t.type === 'duplicate').length > 0 && (
                  <optgroup label="เทมเพลตสลิปซ้ำ">
                    {templates.filter(t => t.type === 'duplicate').map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.isGlobal ? '🌐 ' : ''}{t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {formData.slipTemplateId && (
                <p className="text-xs text-[#06C755] ml-1 flex items-center gap-1">
                  <span>✓</span>
                  {templates.find(t => t._id === formData.slipTemplateId)?.name || 'เทมเพลตที่เลือก'}
                </p>
              )}
            </div>

            <Input
              label="คำอธิบาย (ไม่บังคับ)"
              placeholder="เช่น บัญชีสำหรับร้านค้าสาขา 1"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-white/[0.03] border-white/10 text-white h-14 rounded-2xl"
            />

            {/* Webhook URL Section (shown for edit mode or after creation instruction) */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-400">ขั้นตอนที่ 2: ตั้งค่า Webhook URL</p>
                  {editAccount ? (
                    <>
                      <p className="text-xs text-slate-400">
                        คัดลอก URL ด้านล่างและวางใน LINE Console {'->'} Messaging API {'->'} Webhook URL
                      </p>
                      <div className="bg-black/40 px-3 py-2 rounded-lg border border-white/5 flex items-center justify-between gap-2">
                        <code className="text-[10px] text-slate-300 font-mono break-all">
                          {getWebhookUrl(editAccount)}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyWebhookUrl(editAccount)}
                          className="text-[10px] font-semibold text-[#06C755] hover:text-[#05B048] px-2 py-1 rounded bg-[#06C755]/10 hover:bg-[#06C755]/20 flex-shrink-0"
                        >
                          คัดลอก
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">
                      หลังจากบันทึก จะได้ Webhook URL เพื่อนำไปวางใน LINE Console {'->'} Messaging API {'->'} Webhook URL
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-4">
              <Button type="button" variant="ghost" className="flex-1 h-14 rounded-2xl font-bold text-sm border border-white/5 text-slate-500 hover:text-white" onClick={() => setShowModal(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="primary" className="flex-1 h-14 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-500/20">
                {editAccount ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่มบัญชี'}
              </Button>
            </div>
          </form>

          {/* Right Column - Preview (2/5 width on desktop) */}
          <div className="lg:col-span-2">
            <div className="sticky top-0 space-y-4">
              {/* Preview Header */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[#06C755]/10 flex items-center justify-center">
                  <FileCheck className="w-4 h-4 text-[#06C755]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">ตัวอย่างสลิป</h4>
                  <p className="text-[10px] text-slate-400">รูปแบบการแสดงผลเมื่อตรวจสอบสำเร็จ</p>
                </div>
              </div>

              {/* Preview Container */}
              <div className="bg-gradient-to-b from-white/[0.02] to-white/[0.05] rounded-2xl p-6 border border-white/5">
                {(() => {
                  // Find sender and receiver banks from API data using configurable sample data
                  const senderBank = banks.find(b => b.code === sampleData.sender.bankId) || null;
                  const receiverBank = banks.find(b => b.code === sampleData.receiver.bankId) || null;

                  if (formData.slipTemplateId) {
                    const selectedTemplate = templates.find(t => t._id === formData.slipTemplateId);
                    if (selectedTemplate) {
                      // Create preview template with defaults for missing fields
                      const previewTemplate: SlipTemplateForPreview = {
                        _id: selectedTemplate._id,
                        name: selectedTemplate.name,
                        type: selectedTemplate.type || 'success',
                        primaryColor: selectedTemplate.type === 'duplicate' ? '#f59e0b' :
                          selectedTemplate.type === 'error' ? '#ef4444' :
                            selectedTemplate.type === 'not_found' ? '#64748b' : '#10b981',
                        headerText: selectedTemplate.headerText,
                        footerText: 'ขอบคุณที่ใช้บริการ',
                        showAmount: true,
                        showSender: true,
                        showReceiver: true,
                        showDate: true,
                        showTime: true,
                        showTransRef: true,
                        showBankLogo: true,
                        showFee: true,
                        showSenderAccount: true,
                        showReceiverAccount: true,
                      };
                      return (
                        <div className="transform hover:scale-105 transition-transform duration-500">
                          <SlipPreview template={previewTemplate} senderBank={senderBank} receiverBank={receiverBank} sampleData={sampleData} />
                        </div>
                      );
                    }
                    return null;
                  }

                  // Show default preview or placeholder
                  return (
                    <div className="space-y-4">
                      <SlipPreview template={DEFAULT_PREVIEW_TEMPLATE} senderBank={senderBank} receiverBank={receiverBank} sampleData={sampleData} />
                      <p className="text-[10px] text-slate-500 text-center">
                        กรุณาเลือกรูปแบบสลิปเพื่อดูตัวอย่าง
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Selected Template Info */}
              {formData.slipTemplateId && (
                <div className="bg-[#06C755]/10 border border-[#06C755]/20 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#06C755] flex items-center justify-center text-white text-xs font-bold">
                      ✓
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#06C755] truncate">
                        {templates.find(t => t._id === formData.slipTemplateId)?.name}
                      </p>
                      <p className="text-[9px] text-slate-400">เลือกใช้งานเทมเพลตนี้</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title={`ตั้งค่า: ${selectedAccount?.accountName}`}
        subtitle="ปรับแต่งการตอบกลับอัตโนมัติและการตรวจสอบสลิป"
        size="lg"
      >
        <div className="space-y-12 pb-6">
          {/* Global AI Warning */}
          {!globalAiEnabled && (
            <div className="bg-rose-500/20 border border-rose-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white text-lg flex-shrink-0">⚠️</div>
                <div>
                  <p className="text-sm font-bold text-rose-400">AI ถูกปิดทั้งระบบ</p>
                  <p className="text-xs text-rose-300/70">แม้เปิด AI สำหรับบัญชีนี้ ระบบจะไม่ทำงานจนกว่า Admin จะเปิด Global AI</p>
                </div>
              </div>
            </div>
          )}

          {/* Feature Toggles Section */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/10">
                <Bot className="w-5 h-5" />
              </div>
              เปิด/ปิด ฟีเจอร์
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Bot Toggle */}
              <div className={cn("p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center gap-3 sm:gap-4 transition-all border-2", settingsData.enableBot ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/[0.02] border-white/5 opacity-60")}>
                <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl", settingsData.enableBot ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400")}>🤖</div>
                <div className="space-y-1">
                  <p className="font-bold text-[10px] sm:text-xs uppercase tracking-widest text-white">Bot</p>
                  <p className="text-[8px] sm:text-[9px] text-slate-400 font-medium">ระบบตอบกลับ</p>
                </div>
                <Switch checked={settingsData.enableBot} onChange={(checked) => setSettingsData({ ...settingsData, enableBot: checked })} />
              </div>

              {/* Slip Toggle */}
              <div className={cn("p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center gap-3 sm:gap-4 transition-all border-2", settingsData.enableSlipVerification ? "bg-amber-500/10 border-amber-500/30" : "bg-white/[0.02] border-white/5 opacity-60")}>
                <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl", settingsData.enableSlipVerification ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400")}>📄</div>
                <div className="space-y-1">
                  <p className="font-bold text-[10px] sm:text-xs uppercase tracking-widest text-white">Slip</p>
                  <p className="text-[8px] sm:text-[9px] text-slate-400 font-medium">ตรวจสอบสลิป</p>
                </div>
                <Switch checked={settingsData.enableSlipVerification} onChange={(checked) => setSettingsData({ ...settingsData, enableSlipVerification: checked })} />
              </div>

              {/* AI Toggle */}
              <div className={cn(
                "p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center gap-3 sm:gap-4 transition-all border-2 relative",
                !globalAiEnabled ? "bg-rose-500/5 border-rose-500/20 opacity-60" :
                settingsData.enableAi ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/[0.02] border-white/5 opacity-60"
              )}>
                {!globalAiEnabled && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-bold rounded-full">
                      ปิดโดย Admin
                    </span>
                  </div>
                )}
                <div className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl",
                  !globalAiEnabled ? "bg-rose-500/20 text-rose-400" :
                  settingsData.enableAi ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-400"
                )}>🧠</div>
                <div className="space-y-1">
                  <p className="font-bold text-[10px] sm:text-xs uppercase tracking-widest text-white">AI</p>
                  <p className="text-[8px] sm:text-[9px] text-slate-400 font-medium">
                    {!globalAiEnabled ? "ถูกปิดโดยผู้ดูแล" : "สมองกล AI"}
                  </p>
                </div>
                <Switch
                  checked={settingsData.enableAi}
                  onChange={(checked) => setSettingsData({ ...settingsData, enableAi: checked })}
                  disabled={!globalAiEnabled}
                />
              </div>
            </div>
          </div>

          {/* AI Chatbot Settings */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/10">
                <MessageSquare className="w-5 h-5" />
              </div>
              ตั้งค่า AI Chatbot
            </h3>

            {/* Admin Disabled Warning */}
            {!globalAiEnabled && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <div className="flex items-start gap-3">
                  <span className="text-rose-400 text-lg">🚫</span>
                  <div>
                    <p className="text-sm font-bold text-rose-300">ระบบ AI ถูกปิดโดยผู้ดูแลระบบ</p>
                    <p className="text-xs text-rose-200/70 mt-1">
                      ขณะนี้ฟังก์ชัน AI Chatbot ถูกปิดใช้งานทั้งระบบ การตั้งค่าด้านล่างจะไม่มีผลจนกว่าผู้ดูแลจะเปิดใช้งาน
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className={cn(
              "bg-white/[0.02] p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6 sm:space-y-8 shadow-inner",
              !globalAiEnabled && "opacity-50 pointer-events-none"
            )}>
              {/* AI Model Selection */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 ml-1">เลือก AI Model</label>
                <select
                  value={settingsData.aiModel}
                  onChange={(e) => setSettingsData({ ...settingsData, aiModel: e.target.value })}
                  className="w-full h-12 sm:h-14 px-4 bg-slate-950/50 border border-white/10 rounded-2xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                  {allowedAiModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <p className="text-[9px] text-slate-500 ml-1">เลือก model ที่ต้องการใช้สำหรับบัญชีนี้ หรือปล่อยว่างเพื่อใช้ค่าเริ่มต้นของระบบ</p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 ml-1">System Prompt (คำสั่งเริ่มต้นให้ AI)</label>
                <Textarea
                  value={settingsData.aiSystemPrompt}
                  onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })}
                  placeholder="ระบุคำสั่งและพฤติกรรมของ AI..."
                  className="bg-slate-950/50 border-white/10 text-white min-h-[140px] rounded-[1.5rem] text-sm p-6"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                <div className="space-y-5">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-xs font-semibold text-slate-400">Temperature (ความคิดสร้างสรรค์)</label>
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
                  <div className="flex justify-between text-[9px] font-semibold text-slate-500">
                    <span>แม่นยำ</span>
                    <span>สร้างสรรค์</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-400 ml-1">ข้อความเมื่อ AI ไม่ตอบ</label>
                  <Input
                    value={settingsData.aiFallbackMessage}
                    onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })}
                    className="bg-slate-950/50 border-white/10 h-12 sm:h-14 rounded-2xl text-white font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* AI Message Settings */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/10">
                <MessageSquare className="w-5 h-5" />
              </div>
              ตั้งค่าข้อความ AI
            </h3>
            <div className={cn(
              "bg-white/[0.02] p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-6 shadow-inner",
              !globalAiEnabled && "opacity-50 pointer-events-none"
            )}>
              {/* Send message when AI is disabled */}
              <div className="p-5 bg-violet-500/[0.02] rounded-[1.5rem] border border-violet-400/10 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">ส่งข้อความเมื่อ AI ปิด</p>
                  <p className="text-xs text-slate-400">แจ้งลูกค้าเมื่อส่งข้อความมาแต่ AI ปิดอยู่</p>
                </div>
                <Select
                  value={settingsData.sendMessageWhenAiDisabled}
                  onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenAiDisabled: e.target.value })}
                  className="w-32 bg-slate-950/50 border-white/10 h-10 rounded-xl text-white text-xs"
                >
                  <option value="default">ค่าเริ่มต้น</option>
                  <option value="true">ส่ง</option>
                  <option value="false">ไม่ส่ง</option>
                </Select>
              </div>

              {/* Custom AI disabled message */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 ml-1">ข้อความเมื่อ AI ปิด (ถ้าไม่กรอกจะใช้ค่าเริ่มต้น)</label>
                <Input
                  placeholder="🤖 ระบบ AI ปิดให้บริการชั่วคราว"
                  value={settingsData.customAiDisabledMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customAiDisabledMessage: e.target.value })}
                  disabled={settingsData.sendMessageWhenAiDisabled === 'false'}
                  className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-white font-bold"
                />
              </div>

              {/* Send message when AI quota exhausted */}
              <div className="p-5 bg-amber-500/[0.02] rounded-[1.5rem] border border-amber-400/10 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">ส่งข้อความเมื่อโควต้า AI หมด</p>
                  <p className="text-xs text-slate-400">แจ้งลูกค้าเมื่อโควต้า AI หมดแล้ว</p>
                </div>
                <Select
                  value={settingsData.sendMessageWhenAiQuotaExhausted}
                  onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenAiQuotaExhausted: e.target.value })}
                  className="w-32 bg-slate-950/50 border-white/10 h-10 rounded-xl text-white text-xs"
                >
                  <option value="default">ค่าเริ่มต้น</option>
                  <option value="true">ส่ง</option>
                  <option value="false">ไม่ส่ง</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/10">
                <FileCheck className="w-5 h-5" />
              </div>
              ตั้งค่าการตรวจสอบสลิป
            </h3>
            <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 space-y-8 shadow-inner">
              <div className="p-5 bg-emerald-500/[0.02] rounded-[1.5rem] border border-emerald-400/10 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">ส่งข้อความ "กำลังตรวจสอบ"</p>
                  <p className="text-xs text-slate-400">แจ้งลูกค้าระหว่างรอตรวจสอบสลิป</p>
                </div>
                <Switch
                  checked={settingsData.sendProcessingMessage}
                  onChange={(checked) => setSettingsData({ ...settingsData, sendProcessingMessage: checked })}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 ml-1">ข้อความกำลังตรวจสอบ</label>
                <Input
                  value={settingsData.slipImmediateMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })}
                  disabled={!settingsData.sendProcessingMessage}
                  className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-400 ml-1">ข้อความสลิปถูกต้อง</label>
                  <Input
                    placeholder="✅ สลิปถูกต้อง!"
                    value={settingsData.customSlipSuccessMessage}
                    onChange={(e) => setSettingsData({ ...settingsData, customSlipSuccessMessage: e.target.value })}
                    className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-xs font-bold"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-400 ml-1">ข้อความสลิปซ้ำ</label>
                  <Input
                    placeholder="⚠️ สลิปนี้เคยใช้แล้ว"
                    value={settingsData.customDuplicateSlipMessage}
                    onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })}
                    className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ตั้งค่าเมื่อปิดระบบตรวจสอบสลิป */}
          <div className="space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400 border border-red-500/10">
                <XCircle className="w-5 h-5" />
              </div>
              ตั้งค่าเมื่อปิดระบบตรวจสอบสลิป
            </h3>
            <div className="bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 space-y-8 shadow-inner">
              <div className="p-5 bg-red-500/[0.02] rounded-[1.5rem] border border-red-400/10 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">ส่งข้อความเมื่อปิดระบบ</p>
                  <p className="text-xs text-slate-400">แจ้งลูกค้าเมื่อส่งรูปมาแต่ระบบตรวจสอบสลิปปิดอยู่</p>
                </div>
                <Select
                  value={settingsData.sendMessageWhenSlipDisabled}
                  onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenSlipDisabled: e.target.value })}
                  className="w-32 bg-slate-950/50 border-white/10 h-10 rounded-xl text-white text-xs"
                >
                  <option value="default">ค่าเริ่มต้น</option>
                  <option value="true">ส่ง</option>
                  <option value="false">ไม่ส่ง</option>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 ml-1">ข้อความเมื่อปิดระบบ (ถ้าไม่กรอกจะใช้ค่าเริ่มต้น)</label>
                <Input
                  placeholder="🔴 ระบบตรวจสอบสลิปปิดให้บริการชั่วคราว"
                  value={settingsData.customSlipDisabledMessage}
                  onChange={(e) => setSettingsData({ ...settingsData, customSlipDisabledMessage: e.target.value })}
                  disabled={settingsData.sendMessageWhenSlipDisabled === 'false'}
                  className="bg-slate-950/50 border-white/10 h-14 rounded-2xl text-white font-bold"
                />
              </div>
            </div>
          </div>

          <div className="pt-8 flex gap-4 sticky bottom-0 bg-slate-950/80 backdrop-blur-xl px-1 py-4 border-t border-white/5 mt-auto">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-bold text-sm text-slate-500 hover:text-white" onClick={() => setShowSettingsModal(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" className="flex-[1.5] h-14 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-500/20" onClick={handleSaveSettings}>
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

