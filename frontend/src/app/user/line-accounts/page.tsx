'use client';

import { useEffect, useState, memo } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, systemSettingsApi, banksApi } from '@/lib/api';
import { LineAccount, SlipTemplateListItem, Bank, AngpaoHistoryItem, AngpaoStats } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Textarea, Switch } from '@/components/ui/Input';
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
  Building2,
  Users,
  AlertTriangle,
  FileText,
  Brain,
  Ban,
  BookOpen,
  Zap,
  Settings,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  ChevronLeft,
  ChevronRight,
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

// Smart AI Intent UI Configuration
const INTENT_UI_CONFIG: Record<string, { name: string; desc: string; example: string; action: string; emoji: string; defaultUseAi: boolean; defaultTemplate: string }> = {
  deposit_issue: { name: 'ฝาก/ถอนเงิน', desc: 'ลูกค้าถามเรื่องฝาก-ถอนเงิน', example: '"เติมเงินไม่เข้า", "โอนแล้วยังไม่ได้"', action: 'AI ตอบ + แนะนำส่งสลิป', emoji: '💰', defaultUseAi: true, defaultTemplate: '' },
  frustrated: { name: 'ลูกค้าหงุดหงิด', desc: 'ข้อความแสดงอารมณ์ไม่พอใจ', example: '"เล่นแล้วเสียตลอด", "ไม่แจ็คพ็อตเลย"', action: 'AI ตอบสุภาพ ให้กำลังใจ', emoji: '😤', defaultUseAi: true, defaultTemplate: '' },
  abusive: { name: 'ข้อความหยาบคาย', desc: 'คำหยาบ ด่า ก้าวร้าว', example: 'คำหยาบคาย, ข้อความก้าวร้าว', action: 'ไม่ตอบ (เงียบ)', emoji: '🚫', defaultUseAi: false, defaultTemplate: '__NO_RESPONSE__' },
  ask_link: { name: 'ถามลิงก์เกม', desc: 'ลูกค้าขอลิงก์ทางเข้าเล่น', example: '"ขอทางเข้า", "ลิงก์เล่นอยู่ไหน"', action: 'ส่งลิงก์อัตโนมัติ', emoji: '🔗', defaultUseAi: false, defaultTemplate: '__SEND_LINKS__' },
  ask_game_recommend: { name: 'แนะนำเกม', desc: 'ลูกค้าอยากได้เกมที่เหมาะ', example: '"เกมไหนดี", "แนะนำเกมแตกง่าย"', action: 'AI แนะนำจากความรู้', emoji: '🎮', defaultUseAi: true, defaultTemplate: '' },
  general: { name: 'ข้อความทั่วไป', desc: 'คำถามอื่นๆ ที่ไม่เข้าข้างบน', example: '"สมัครยังไง", "ขอบคุณ", "สวัสดี"', action: 'AI ตอบจากคลังความรู้', emoji: '💬', defaultUseAi: true, defaultTemplate: '' },
};

const DEFAULT_INTENT_RULES: Record<string, { enabled: boolean; useAi: boolean; customPrompt: string; responseTemplate: string }> = {
  deposit_issue: { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' },
  frustrated: { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' },
  abusive: { enabled: true, useAi: false, customPrompt: '', responseTemplate: '__NO_RESPONSE__' },
  ask_link: { enabled: true, useAi: false, customPrompt: '', responseTemplate: '__SEND_LINKS__' },
  ask_game_recommend: { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' },
  general: { enabled: true, useAi: true, customPrompt: '', responseTemplate: '' },
};

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
                    <Building2 className="w-3 h-3 text-slate-400" />
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

  // Angpao history state
  const [showAngpaoModal, setShowAngpaoModal] = useState(false);
  const [angpaoAccount, setAngpaoAccount] = useState<LineAccount | null>(null);
  const [angpaoItems, setAngpaoItems] = useState<AngpaoHistoryItem[]>([]);
  const [angpaoStats, setAngpaoStats] = useState<AngpaoStats>({ totalCount: 0, totalAmount: 0 });
  const [angpaoPage, setAngpaoPage] = useState(1);
  const [angpaoTotal, setAngpaoTotal] = useState(0);
  const [angpaoLoading, setAngpaoLoading] = useState(false);
  const [angpaoStatusFilter, setAngpaoStatusFilter] = useState<string>('all');

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
    slipTemplateIds: {
      success: '',
      duplicate: '',
      error: '',
      not_found: '',
    } as Record<string, string>,
  });

  const [settingsData, setSettingsData] = useState({
    enableBot: true,
    enableAi: false,
    enableSlipVerification: true,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    aiModel: '' as string,  // AI Model สำหรับบัญชีนี้
    sendProcessingMessage: true,
    slipImmediateMessage: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    // Knowledge Base
    knowledgeBase: [] as Array<{ topic: string; answer: string; enabled: boolean }>,
    // Smart AI
    enableSmartAi: false,
    intentRules: {} as Record<string, { enabled: boolean; useAi: boolean; customPrompt: string; responseTemplate: string }>,
    gameLinks: [] as Array<{ name: string; url: string }>,
    // Angpao
    enableAngpao: false,
    angpaoPhoneNumber: '',
  });

  const [activeSettingsTab, setActiveSettingsTab] = useState<'core' | 'ai'>('core');
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);

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
      slipTemplateIds: {
        success: '',
        duplicate: '',
        error: '',
        not_found: '',
      },
    });
    setEditAccount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation with specific messages
    if (!formData.accountName.trim()) {
      toast.error('กรุณากรอกชื่อบัญชี');
      return;
    }
    if (!formData.channelId.trim()) {
      toast.error('กรุณากรอก Channel ID (ดูได้จาก LINE Developers Console)');
      return;
    }
    if (!formData.channelSecret.trim()) {
      toast.error('กรุณากรอก Channel Secret (ดูได้จาก LINE Developers Console)');
      return;
    }
    if (!formData.accessToken.trim()) {
      toast.error('กรุณากรอก Access Token (ออก Long-lived token จาก LINE Developers Console)');
      return;
    }

    try {
      // Filter out empty template IDs
      const filteredTemplateIds: Record<string, string> = {};
      for (const [type, id] of Object.entries(formData.slipTemplateIds)) {
        if (id && id.trim()) {
          filteredTemplateIds[type] = id;
        }
      }

      const dataToSubmit = {
        accountName: formData.accountName,
        channelId: formData.channelId,
        channelSecret: formData.channelSecret,
        accessToken: formData.accessToken,
        description: formData.description,
        slipTemplateIds: Object.keys(filteredTemplateIds).length > 0 ? filteredTemplateIds : undefined,
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
      const err = error as { response?: { data?: { message?: string; error?: { message?: string } } }; message?: string };
      const serverMessage = err.response?.data?.message || err.response?.data?.error?.message;

      if (serverMessage) {
        toast.error(serverMessage);
      } else if (err.message === 'Network Error') {
        toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      } else {
        toast.error('เกิดข้อผิดพลาดในการสร้างบัญชี กรุณาลองใหม่อีกครั้ง');
      }
    }
  };

  const handleEdit = (account: LineAccount) => {
    setEditAccount(account);
    const existingTemplateIds = account.settings?.slipTemplateIds || {};
    setFormData({
      accountName: account.accountName,
      channelId: account.channelId,
      channelSecret: account.channelSecret,
      accessToken: account.accessToken,
      description: account.description || '',
      slipTemplateIds: {
        success: existingTemplateIds.success || '',
        duplicate: existingTemplateIds.duplicate || '',
        error: existingTemplateIds.error || '',
        not_found: existingTemplateIds.not_found || '',
      },
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

  // === Angpao History Functions ===
  const openAngpaoModal = async (account: LineAccount) => {
    setAngpaoAccount(account);
    setAngpaoPage(1);
    setAngpaoStatusFilter('all');
    setShowAngpaoModal(true);
    setAngpaoLoading(true);
    try {
      const res = await lineAccountsApi.getAngpaoHistory(account._id, 1, 20);
      setAngpaoItems(res.data.items || []);
      setAngpaoTotal(res.data.total || 0);
      setAngpaoStats(res.data.stats || { totalCount: 0, totalAmount: 0 });
    } catch {
      toast.error('โหลดประวัติอังเปาล้มเหลว');
    } finally {
      setAngpaoLoading(false);
    }
  };

  const fetchAngpaoPage = async (page: number) => {
    if (!angpaoAccount) return;
    setAngpaoPage(page);
    setAngpaoLoading(true);
    try {
      const res = await lineAccountsApi.getAngpaoHistory(angpaoAccount._id, page, 20);
      setAngpaoItems(res.data.items || []);
      setAngpaoTotal(res.data.total || 0);
    } catch {
      toast.error('โหลดข้อมูลล้มเหลว');
    } finally {
      setAngpaoLoading(false);
    }
  };

  const angpaoStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      success: 'สำเร็จ',
      already_redeemed: 'รับแล้ว',
      expired: 'หมดอายุ',
      not_found: 'ไม่พบ',
      own_voucher: 'ซองตัวเอง',
      invalid_phone: 'เบอร์ผิด',
      out_of_stock: 'หมดแล้ว',
      rate_limited: 'ถูกจำกัด',
      error: 'ข้อผิดพลาด',
    };
    return map[status] || status;
  };

  const angpaoStatusColor = (status: string): string => {
    if (status === 'success') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (status === 'already_redeemed') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (status === 'expired') return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    if (status === 'not_found') return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    if (status === 'out_of_stock') return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    if (status === 'rate_limited') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  const angpaoStatusIcon = (status: string): string => {
    const map: Record<string, string> = {
      success: '✓',
      already_redeemed: '↻',
      expired: '⏰',
      not_found: '?',
      own_voucher: '⊘',
      invalid_phone: '✕',
      out_of_stock: '∅',
      rate_limited: '⚡',
      error: '!',
    };
    return map[status] || '•';
  };

  const openSettingsModal = (account: LineAccount) => {
    setSelectedAccount(account);
    setActiveSettingsTab('core');
    setShowAdvancedAi(false);
    const s = account.settings || {};
    setSettingsData({
      enableBot: s.enableBot ?? true,
      enableAi: s.enableAi ?? false,
      enableSlipVerification: s.enableSlipVerification ?? true,
      aiSystemPrompt: s.aiSystemPrompt || '',
      aiTemperature: s.aiTemperature ?? 0.7,
      aiFallbackMessage: s.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
      aiModel: s.aiModel || '',
      sendProcessingMessage: s.sendProcessingMessage ?? true,
      slipImmediateMessage: s.slipImmediateMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
      knowledgeBase: (s as Record<string, unknown>).knowledgeBase as Array<{ topic: string; answer: string; enabled: boolean }> || [],
      enableSmartAi: (s as Record<string, unknown>).enableSmartAi as boolean ?? false,
      intentRules: { ...DEFAULT_INTENT_RULES, ...((s as Record<string, unknown>).intentRules as Record<string, { enabled: boolean; useAi: boolean; customPrompt: string; responseTemplate: string }> || {}) },
      gameLinks: ((s as Record<string, unknown>).gameLinks as Array<{ name: string; url: string }>) || [],
      // Angpao
      enableAngpao: (s as Record<string, unknown>).enableAngpao as boolean ?? false,
      angpaoPhoneNumber: (s as Record<string, unknown>).angpaoPhoneNumber as string || '',
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedAccount) return;
    try {
      await lineAccountsApi.updateSettings(selectedAccount._id, settingsData);
      toast.success('บันทึกการตั้งค่าสำเร็จ');
      setShowSettingsModal(false);
      fetchAccounts();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถบันทึกได้');
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
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">ผู้ใช้ทั้งหมด</p>
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                  <p className="text-xl sm:text-2xl font-black text-white">{accounts.reduce((sum, acc) => sum + (acc.statistics?.totalUsers || 0), 0).toLocaleString()}</p>
                  <span className="text-xs sm:text-sm font-semibold text-slate-400">คน</span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center flex-shrink-0 ml-2">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-[#06C755]" />
              </div>
            </div>
          </Card>
          <Card variant="glass" className="p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">ข้อความทั้งหมด</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <p className="text-xl sm:text-2xl font-black text-white">{accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0).toLocaleString()}</p>
                </div>
                <div className="flex gap-3 mt-1">
                  <span className="text-[8px] sm:text-[9px] font-semibold text-[#06C755] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> สลิป {accounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0).toLocaleString()}
                  </span>
                  <span className="text-[8px] sm:text-[9px] font-semibold text-violet-400 flex items-center gap-1">
                    <Brain className="w-3 h-3" /> AI {accounts.reduce((sum, acc) => sum + (acc.statistics?.totalAiResponses || 0), 0).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 ml-2">
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              </div>
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
              icon={<div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center shadow-inner"><MessageSquare className="w-10 h-10 text-slate-400" /></div>}
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

                    <div className={cn("grid gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-white/5", account.settings?.enableAngpao ? "grid-cols-3" : "grid-cols-2")}>
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
                      {account.settings?.enableAngpao && (
                        <Button
                          variant="outline"
                          className="h-9 sm:h-10 rounded-lg sm:rounded-xl font-semibold text-xs border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 transition-all"
                          onClick={() => openAngpaoModal(account)}
                        >
                          🧧
                        </Button>
                      )}
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
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          {/* Left Column - Form (3/5 width on desktop) */}
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-4 sm:space-y-5">
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

            {/* Slip Template Selection - Per Type */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-white">
                    รูปแบบสลิป (Template)
                  </label>
                  <span className="text-[10px] text-slate-500 font-normal px-2 py-0.5 bg-slate-800 rounded-full">ไม่บังคับ</span>
                </div>
                {templates.length > 0 && (
                  <span className="text-[10px] text-slate-500">
                    🌐 = เทมเพลตจากระบบ
                  </span>
                )}
              </div>

              {/* Template Type Cards */}
              <div className="space-y-3">
                {/* Success Template */}
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      สลิปถูกต้อง (Success)
                    </label>
                    {formData.slipTemplateIds.success && (
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          slipTemplateIds: { ...formData.slipTemplateIds, success: '' }
                        })}
                        className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                  <select
                    value={formData.slipTemplateIds.success || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      slipTemplateIds: { ...formData.slipTemplateIds, success: e.target.value }
                    })}
                    className="w-full h-12 px-4 bg-slate-900/50 border border-emerald-500/30 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none cursor-pointer [&>option]:bg-slate-800 [&>option]:text-white [&>option]:py-2"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2310b981'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                    {templates.filter(t => t.type === 'success').map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.isGlobal ? '🌐 ' : '📄 '}{t.name}
                      </option>
                    ))}
                  </select>
                  {templates.filter(t => t.type === 'success').length === 0 && (
                    <p className="text-[10px] text-slate-500 mt-2">ยังไม่มีเทมเพลตประเภทนี้</p>
                  )}
                </div>

                {/* Duplicate Template */}
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-amber-400 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </div>
                      สลิปซ้ำ (Duplicate)
                    </label>
                    {formData.slipTemplateIds.duplicate && (
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          slipTemplateIds: { ...formData.slipTemplateIds, duplicate: '' }
                        })}
                        className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                  <select
                    value={formData.slipTemplateIds.duplicate || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      slipTemplateIds: { ...formData.slipTemplateIds, duplicate: e.target.value }
                    })}
                    className="w-full h-12 px-4 bg-slate-900/50 border border-amber-500/30 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none cursor-pointer [&>option]:bg-slate-800 [&>option]:text-white [&>option]:py-2"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23f59e0b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                    {templates.filter(t => t.type === 'duplicate').map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.isGlobal ? '🌐 ' : '📄 '}{t.name}
                      </option>
                    ))}
                  </select>
                  {templates.filter(t => t.type === 'duplicate').length === 0 && (
                    <p className="text-[10px] text-slate-500 mt-2">ยังไม่มีเทมเพลตประเภทนี้</p>
                  )}
                </div>

                {/* Error Template */}
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-red-400 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center">
                        <XCircle className="w-3.5 h-3.5" />
                      </div>
                      สลิปผิดพลาด (Error)
                    </label>
                    {formData.slipTemplateIds.error && (
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          slipTemplateIds: { ...formData.slipTemplateIds, error: '' }
                        })}
                        className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                  <select
                    value={formData.slipTemplateIds.error || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      slipTemplateIds: { ...formData.slipTemplateIds, error: e.target.value }
                    })}
                    className="w-full h-12 px-4 bg-slate-900/50 border border-red-500/30 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 appearance-none cursor-pointer [&>option]:bg-slate-800 [&>option]:text-white [&>option]:py-2"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23ef4444'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                    {templates.filter(t => t.type === 'error').map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.isGlobal ? '🌐 ' : '📄 '}{t.name}
                      </option>
                    ))}
                  </select>
                  {templates.filter(t => t.type === 'error').length === 0 && (
                    <p className="text-[10px] text-slate-500 mt-2">ยังไม่มีเทมเพลตประเภทนี้</p>
                  )}
                </div>

                {/* Not Found Template */}
                <div className="p-4 bg-slate-500/5 border border-slate-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-500/20 flex items-center justify-center">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </div>
                      ไม่พบสลิป (Not Found)
                    </label>
                    {formData.slipTemplateIds.not_found && (
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          slipTemplateIds: { ...formData.slipTemplateIds, not_found: '' }
                        })}
                        className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                  <select
                    value={formData.slipTemplateIds.not_found || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      slipTemplateIds: { ...formData.slipTemplateIds, not_found: e.target.value }
                    })}
                    className="w-full h-12 px-4 bg-slate-900/50 border border-slate-500/30 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/50 appearance-none cursor-pointer [&>option]:bg-slate-800 [&>option]:text-white [&>option]:py-2"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                    {templates.filter(t => t.type === 'not_found').map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.isGlobal ? '🌐 ' : '📄 '}{t.name}
                      </option>
                    ))}
                  </select>
                  {templates.filter(t => t.type === 'not_found').length === 0 && (
                    <p className="text-[10px] text-slate-500 mt-2">ยังไม่มีเทมเพลตประเภทนี้</p>
                  )}
                </div>
              </div>

              {/* Info Note */}
              <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <span className="text-blue-400 text-sm">💡</span>
                <p className="text-xs text-blue-300/80">
                  เลือกเทมเพลตแต่ละประเภทเพื่อกำหนดรูปแบบการแสดงผล ประเภทที่ไม่เลือกจะใช้เทมเพลตเริ่มต้นของระบบ
                </p>
              </div>
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

            <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Button type="button" variant="ghost" className="flex-1 h-11 sm:h-14 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm border border-white/5 text-slate-500 hover:text-white min-h-[44px]" onClick={() => setShowModal(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" variant="primary" className="flex-1 h-11 sm:h-14 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 min-h-[44px]">
                {editAccount ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่มบัญชี'}
              </Button>
            </div>
          </form>

          {/* Right Column - Preview (2/5 width on desktop, hidden on mobile) */}
          <div className="hidden lg:block lg:col-span-2">
            <div className="sticky top-4 space-y-4">
              {/* Preview Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#06C755]/10 flex items-center justify-center border border-[#06C755]/20">
                  <FileCheck className="w-5 h-5 text-[#06C755]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">ตัวอย่างสลิป</h4>
                  <p className="text-[11px] text-slate-400">Preview การแสดงผลที่ผู้ใช้จะเห็น</p>
                </div>
              </div>

              {/* Preview Container */}
              <div className="bg-gradient-to-b from-slate-800/50 to-slate-900/50 rounded-2xl p-5 border border-white/10">
                {(() => {
                  // Find sender and receiver banks from API data using configurable sample data
                  const senderBank = banks.find(b => b.code === sampleData.sender.bankId) || null;
                  const receiverBank = banks.find(b => b.code === sampleData.receiver.bankId) || null;

                  // Check if any template is selected
                  const hasSelectedTemplates = Object.values(formData.slipTemplateIds).some(id => id);

                  if (hasSelectedTemplates) {
                    // Show only the first selected template as main preview
                    const selectedEntry = Object.entries(formData.slipTemplateIds).find(([, id]) => id);
                    if (!selectedEntry) return null;

                    const [type, id] = selectedEntry;
                    const template = templates.find(t => t._id === id);
                    if (!template) return null;

                    // Use actual template data from API
                    const defaultColorByType = {
                      success: '#10b981',
                      duplicate: '#f59e0b',
                      error: '#ef4444',
                      not_found: '#64748b',
                    };

                    const previewTemplate: SlipTemplateForPreview = {
                      _id: template._id,
                      name: template.name,
                      type: template.type || 'success',
                      // Use template's actual color, or fall back to type-based default
                      primaryColor: template.primaryColor || defaultColorByType[template.type] || '#10b981',
                      headerText: template.headerText,
                      footerText: template.footerText || 'ขอบคุณที่ใช้บริการ',
                      // Use actual template display settings
                      showAmount: template.showAmount ?? true,
                      showSender: template.showSender ?? true,
                      showReceiver: template.showReceiver ?? true,
                      showDate: template.showDate ?? true,
                      showTime: template.showTime ?? true,
                      showTransRef: template.showTransRef ?? true,
                      showBankLogo: template.showBankLogo ?? true,
                      showFee: template.showFee ?? false,
                      showSenderAccount: template.showSenderAccount ?? false,
                      showReceiverAccount: template.showReceiverAccount ?? false,
                    };

                    return (
                      <div className="space-y-4">
                        {/* Preview Label */}
                        <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold",
                          type === 'success' && 'bg-emerald-500/20 text-emerald-400',
                          type === 'duplicate' && 'bg-amber-500/20 text-amber-400',
                          type === 'error' && 'bg-red-500/20 text-red-400',
                          type === 'not_found' && 'bg-slate-500/20 text-slate-400'
                        )}>
                          {type === 'success' && <><CheckCircle2 className="w-3.5 h-3.5" /> สลิปถูกต้อง</>}
                          {type === 'duplicate' && <><HelpCircle className="w-3.5 h-3.5" /> สลิปซ้ำ</>}
                          {type === 'error' && <><XCircle className="w-3.5 h-3.5" /> ผิดพลาด</>}
                          {type === 'not_found' && <><HelpCircle className="w-3.5 h-3.5" /> ไม่พบสลิป</>}
                        </div>

                        {/* Main Preview */}
                        <div className="flex justify-center">
                          <div className="transform hover:scale-[1.02] transition-transform duration-300">
                            <SlipPreview template={previewTemplate} senderBank={senderBank} receiverBank={receiverBank} sampleData={sampleData} />
                          </div>
                        </div>

                        {/* Template Name */}
                        <div className="text-center">
                          <p className="text-xs text-white font-medium">{template.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {template.isGlobal ? '🌐 เทมเพลตจากระบบ' : '📄 เทมเพลตของคุณ'}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // Show default preview
                  return (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <SlipPreview template={DEFAULT_PREVIEW_TEMPLATE} senderBank={senderBank} receiverBank={receiverBank} sampleData={sampleData} />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-xs text-slate-400">ค่าเริ่มต้นของระบบ</p>
                        <p className="text-[10px] text-slate-500">
                          เลือกเทมเพลตด้านซ้ายเพื่อดูตัวอย่าง
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Selected Templates Summary */}
              {Object.values(formData.slipTemplateIds).some(id => id) && (
                <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
                  <p className="text-xs font-semibold text-white mb-3">เทมเพลตที่กำหนด</p>
                  <div className="space-y-2">
                    {formData.slipTemplateIds.success && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <span className="text-slate-400">สลิปถูกต้อง:</span>
                        <span className="text-white truncate">{templates.find(t => t._id === formData.slipTemplateIds.success)?.name}</span>
                      </div>
                    )}
                    {formData.slipTemplateIds.duplicate && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                        <span className="text-slate-400">สลิปซ้ำ:</span>
                        <span className="text-white truncate">{templates.find(t => t._id === formData.slipTemplateIds.duplicate)?.name}</span>
                      </div>
                    )}
                    {formData.slipTemplateIds.error && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-red-400"></div>
                        <span className="text-slate-400">ผิดพลาด:</span>
                        <span className="text-white truncate">{templates.find(t => t._id === formData.slipTemplateIds.error)?.name}</span>
                      </div>
                    )}
                    {formData.slipTemplateIds.not_found && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                        <span className="text-slate-400">ไม่พบสลิป:</span>
                        <span className="text-white truncate">{templates.find(t => t._id === formData.slipTemplateIds.not_found)?.name}</span>
                      </div>
                    )}
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
        footer={
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full">
            <Button variant="ghost" className="flex-1 h-11 sm:h-14 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm text-slate-500 hover:text-white min-h-[44px]" onClick={() => setShowSettingsModal(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" className="flex-1 sm:flex-[1.5] h-11 sm:h-14 rounded-xl sm:rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 min-h-[44px]" onClick={handleSaveSettings}>
              บันทึกการตั้งค่า
            </Button>
          </div>
        }
      >
        <div className="space-y-4 sm:space-y-6 pb-2">
          {/* Tab Navigation — 2 tabs */}
          <div className="flex gap-1 bg-white/[0.03] rounded-xl sm:rounded-2xl p-1 sm:p-1.5 border border-white/5">
            {([
              { id: 'core' as const, name: 'ระบบหลัก', icon: Zap },
              { id: 'ai' as const, name: 'ตั้งค่า AI', icon: Brain },
            ]).map((tab) => {
              const isActive = activeSettingsTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSettingsTab(tab.id)}
                  className={cn(
                    "relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-bold transition-all",
                    isActive ? "text-white" : "text-white/40 hover:text-white/60",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="userSettingsTabIndicator"
                      className="absolute inset-0 bg-white/10 rounded-xl border border-white/10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {/* ===== TAB: ระบบหลัก ===== */}
            {activeSettingsTab === 'core' && (
              <motion.div key="core" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-8">
                {/* Global AI Warning */}
                {!globalAiEnabled && (
                  <div className="bg-rose-500/20 border border-rose-500/30 rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0"><AlertTriangle className="w-5 h-5 text-white" /></div>
                      <div>
                        <p className="text-sm font-bold text-rose-400">AI ถูกปิดทั้งระบบ</p>
                        <p className="text-xs text-rose-300/70">แม้เปิด AI สำหรับบัญชีนี้ ระบบจะไม่ทำงานจนกว่า Admin จะเปิด Global AI</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Feature Toggles */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/10">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <span>เปิด/ปิด ฟีเจอร์</span>
                      <p className="text-[10px] text-slate-500 font-normal mt-0.5">ควบคุมฟังก์ชันหลักของบัญชี LINE OA นี้</p>
                    </div>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Bot Toggle */}
                    <div className={cn("p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center gap-3 sm:gap-4 transition-all border-2", settingsData.enableBot ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white/[0.02] border-white/5 opacity-60")}>
                      <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center", settingsData.enableBot ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400")}><Bot className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                      <div className="space-y-1">
                        <p className="font-bold text-xs uppercase tracking-widest text-white">Bot</p>
                        <p className="text-[10px] text-slate-400 font-medium">ระบบตอบกลับอัตโนมัติ</p>
                      </div>
                      <Switch checked={settingsData.enableBot} onChange={(checked) => {
                        setSettingsData({ ...settingsData, enableBot: checked });
                      }} />
                    </div>

                    {/* Slip Toggle */}
                    <div className={cn("p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center gap-3 sm:gap-4 transition-all border-2", settingsData.enableSlipVerification ? "bg-amber-500/10 border-amber-500/30" : "bg-white/[0.02] border-white/5 opacity-60")}>
                      <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center", settingsData.enableSlipVerification ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400")}><FileText className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                      <div className="space-y-1">
                        <p className="font-bold text-xs uppercase tracking-widest text-white">Slip</p>
                        <p className="text-[10px] text-slate-400 font-medium">ตรวจสอบสลิปโอนเงิน</p>
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
                          <span className="px-2 py-0.5 bg-rose-500 text-white text-[8px] font-bold rounded-full">ปิดโดย Admin</span>
                        </div>
                      )}
                      <div className={cn(
                        "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center",
                        !globalAiEnabled ? "bg-rose-500/20 text-rose-400" :
                        settingsData.enableAi ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-400"
                      )}><Brain className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                      <div className="space-y-1">
                        <p className="font-bold text-xs uppercase tracking-widest text-white">AI</p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {!globalAiEnabled ? "ถูกปิดโดยผู้ดูแล" : "สมองกล AI ตอบแชท"}
                        </p>
                      </div>
                      <Switch
                        checked={settingsData.enableAi}
                        onChange={(checked) => {
                          setSettingsData({ ...settingsData, enableAi: checked });
                        }}
                        disabled={!globalAiEnabled}
                      />
                    </div>

                    {/* Angpao Toggle */}
                    <div className={cn("p-4 sm:p-6 rounded-2xl flex flex-col items-center text-center gap-3 sm:gap-4 transition-all border-2", settingsData.enableAngpao ? "bg-rose-500/10 border-rose-500/30" : "bg-white/[0.02] border-white/5 opacity-60")}>
                      <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl", settingsData.enableAngpao ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30" : "bg-slate-700 text-slate-400")}>🧧</div>
                      <div className="space-y-1">
                        <p className="font-bold text-xs uppercase tracking-widest text-white">Angpao</p>
                        <p className="text-[10px] text-slate-400 font-medium">รับอังเปา TrueMoney</p>
                      </div>
                      <Switch checked={settingsData.enableAngpao} onChange={(checked) => setSettingsData({ ...settingsData, enableAngpao: checked })} />
                    </div>
                  </div>
                </div>

                {/* Angpao Phone Settings */}
                {settingsData.enableAngpao && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center text-lg border border-rose-500/10">
                        🧧
                      </div>
                      <div>
                        <span>ตั้งค่าอังเปา</span>
                        <p className="text-[10px] text-slate-500 font-normal mt-0.5">กรอกเบอร์ TrueMoney Wallet เพื่อรับเงินอังเปา</p>
                      </div>
                    </h3>
                    <div className="bg-white/[0.02] p-5 sm:p-6 rounded-2xl border border-white/5 space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-white/50 ml-1">เบอร์โทรศัพท์ (TrueMoney Wallet)</label>
                        <Input
                          type="tel"
                          placeholder="0812345678"
                          maxLength={10}
                          value={settingsData.angpaoPhoneNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                            setSettingsData({ ...settingsData, angpaoPhoneNumber: val });
                          }}
                          className={cn(
                            "bg-slate-950/50 border-white/10 h-12 rounded-xl text-white font-bold text-sm",
                            settingsData.angpaoPhoneNumber && !/^0[0-9]{9}$/.test(settingsData.angpaoPhoneNumber)
                              ? "border-red-500/50 focus:ring-red-500/50"
                              : ""
                          )}
                        />
                        {settingsData.angpaoPhoneNumber && !/^0[0-9]{9}$/.test(settingsData.angpaoPhoneNumber) && (
                          <p className="text-xs text-red-400">เบอร์โทรศัพท์ต้องเป็น 10 หลัก เริ่มต้นด้วย 0</p>
                        )}
                        {settingsData.enableAngpao && !settingsData.angpaoPhoneNumber && (
                          <p className="text-xs text-amber-400">กรุณากรอกเบอร์โทรศัพท์เพื่อเปิดใช้งานอังเปา</p>
                        )}
                        <p className="text-[10px] text-slate-500 ml-1">แต่ละบัญชีตั้งเบอร์แยกกันได้ เบอร์เดียวกันใช้ซ้ำในบัญชีอื่นไม่ได้</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Slip Settings */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/10">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <span>ตั้งค่าสลิป</span>
                      <p className="text-[10px] text-slate-500 font-normal mt-0.5">ข้อความแจ้งเตือนเมื่อตรวจสอบสลิป</p>
                    </div>
                  </h3>
                  <div className="bg-white/[0.02] p-5 sm:p-6 rounded-2xl border border-white/5 space-y-5">
                    <div className="p-4 bg-emerald-500/[0.02] rounded-xl border border-emerald-400/10 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white">ส่งข้อความ &quot;กำลังตรวจสอบ&quot;</p>
                        <p className="text-[10px] text-slate-400">แจ้งลูกค้าระหว่างรอตรวจสอบสลิป</p>
                      </div>
                      <Switch
                        checked={settingsData.sendProcessingMessage}
                        onChange={(checked) => setSettingsData({ ...settingsData, sendProcessingMessage: checked })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-white/50 ml-1">ข้อความกำลังตรวจสอบ</label>
                      <Input
                        value={settingsData.slipImmediateMessage}
                        onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })}
                        disabled={!settingsData.sendProcessingMessage}
                        className="bg-slate-950/50 border-white/10 h-12 rounded-xl text-white font-bold text-sm"
                      />
                      <p className="text-[10px] text-slate-500 ml-1">ข้อความที่ส่งให้ลูกค้าทันทีเมื่อส่งสลิปมา ระหว่างรอผลตรวจสอบ</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ===== TAB: ตั้งค่า AI (รวม คลังความรู้ + คำสั่ง AI + ขั้นสูง) ===== */}
            {activeSettingsTab === 'ai' && (
              <motion.div key="ai" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="space-y-6">

                {/* AI Disabled Warning */}
                {!globalAiEnabled && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                    <div className="flex items-start gap-3">
                      <Ban className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-rose-300">AI ถูกปิดโดยผู้ดูแลระบบ</p>
                        <p className="text-xs text-rose-200/70 mt-1">การตั้งค่าจะไม่มีผลจนกว่าผู้ดูแลจะเปิดใช้งาน</p>
                      </div>
                    </div>
                  </div>
                )}

                {!settingsData.enableAi && globalAiEnabled && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-300">AI ยังไม่ได้เปิดใช้งาน</p>
                        <p className="text-xs text-amber-200/70 mt-1">ไปที่แท็บ &quot;ระบบหลัก&quot; แล้วเปิดสวิตช์ AI ก่อน</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className={cn((!globalAiEnabled || !settingsData.enableAi) && "opacity-40 pointer-events-none")}>

                  {/* ========== SECTION 1: คลังความรู้ (สำคัญที่สุด — อยู่บนสุด) ========== */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-400 border border-teal-500/10">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <span>คลังความรู้</span>
                        <p className="text-[10px] text-slate-500 font-normal mt-0.5">ใส่ข้อมูลธุรกิจให้ AI ใช้ตอบลูกค้า — AI จะตอบเฉพาะข้อมูลที่ใส่ไว้เท่านั้น</p>
                      </div>
                    </h3>

                    {/* Tip Box */}
                    <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/10">
                      <p className="text-[11px] text-teal-300/80 font-semibold mb-1">ทำงานอย่างไร?</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">เมื่อลูกค้าถามคำถาม AI จะค้นหาคำตอบจากข้อมูลที่คุณใส่ไว้ ถ้าไม่มีข้อมูลตรง AI จะแจ้งว่าไม่มีข้อมูลและแนะนำให้ติดต่อแอดมิน</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-slate-500">ตัวอย่างการใส่ข้อมูล:</p>
                        <p className="text-[10px] text-white/40 font-mono">หัวข้อ: ฝากขั้นต่ำ → คำตอบ: ฝากขั้นต่ำ 100 บาท ผ่านธนาคารหรือทรูวอลเล็ท</p>
                        <p className="text-[10px] text-white/40 font-mono">หัวข้อ: เวลาทำการ → คำตอบ: เปิดให้บริการ 24 ชั่วโมง</p>
                      </div>
                    </div>

                    {/* Quick Templates */}
                    {settingsData.knowledgeBase.length === 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-white/50">เริ่มต้นเร็ว — กดเพื่อเพิ่ม:</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { topic: 'ฝากขั้นต่ำ', answer: '' },
                            { topic: 'ถอนขั้นต่ำ', answer: '' },
                            { topic: 'เวลาทำการ', answer: '' },
                            { topic: 'โปรโมชั่นสมาชิกใหม่', answer: '' },
                            { topic: 'วิธีสมัคร', answer: '' },
                            { topic: 'ช่องทางติดต่อแอดมิน', answer: '' },
                          ].map((tmpl) => (
                            <button
                              key={tmpl.topic}
                              type="button"
                              onClick={() => setSettingsData({ ...settingsData, knowledgeBase: [...settingsData.knowledgeBase, { ...tmpl, enabled: true }] })}
                              className="text-xs bg-white/5 text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors border border-white/5"
                            >
                              + {tmpl.topic}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Knowledge Entries */}
                    <div className="space-y-3">
                      {settingsData.knowledgeBase.map((entry, idx) => (
                        <div key={idx} className={cn(
                          "rounded-xl p-4 space-y-3 border transition-all",
                          entry.enabled ? "bg-white/[0.03] border-white/10" : "bg-white/[0.01] border-white/5 opacity-50"
                        )}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 space-y-1">
                              <label className="text-[10px] font-bold text-white/40">หัวข้อ</label>
                              <Input
                                value={entry.topic}
                                onChange={(e) => {
                                  const updated = [...settingsData.knowledgeBase];
                                  updated[idx] = { ...updated[idx], topic: e.target.value };
                                  setSettingsData({ ...settingsData, knowledgeBase: updated });
                                }}
                                placeholder="เช่น ฝากขั้นต่ำ, ถอนขั้นต่ำ, วิธีสมัคร"
                                className="bg-white/5 border-white/10 text-white h-10 rounded-lg text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-5">
                              <Switch
                                checked={entry.enabled}
                                onChange={(checked) => {
                                  const updated = [...settingsData.knowledgeBase];
                                  updated[idx] = { ...updated[idx], enabled: checked };
                                  setSettingsData({ ...settingsData, knowledgeBase: updated });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = settingsData.knowledgeBase.filter((_, i) => i !== idx);
                                  setSettingsData({ ...settingsData, knowledgeBase: updated });
                                }}
                                className="text-rose-400/60 hover:text-rose-400 transition-colors p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-white/40">คำตอบ</label>
                            <Textarea
                              value={entry.answer}
                              onChange={(e) => {
                                const updated = [...settingsData.knowledgeBase];
                                updated[idx] = { ...updated[idx], answer: e.target.value };
                                setSettingsData({ ...settingsData, knowledgeBase: updated });
                              }}
                              placeholder="เช่น ฝากขั้นต่ำ 100 บาท ผ่านธนาคารหรือทรูวอลเล็ท"
                              rows={2}
                              className="bg-white/5 border-white/10 text-white rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add / Summary */}
                    {settingsData.knowledgeBase.length > 0 ? (
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-white/30">ทั้งหมด {settingsData.knowledgeBase.length} รายการ, เปิดใช้ {settingsData.knowledgeBase.filter(k => k.enabled).length}</p>
                        <button
                          type="button"
                          onClick={() => setSettingsData({ ...settingsData, knowledgeBase: [...settingsData.knowledgeBase, { topic: '', answer: '', enabled: true }] })}
                          className="text-xs bg-white/5 text-white/50 px-3 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                        >
                          + เพิ่มอีก
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <BookOpen className="w-8 h-8 text-white/10 mx-auto mb-2" />
                        <p className="text-xs text-white/30">ยังไม่มีข้อมูลในคลังความรู้</p>
                        <button
                          type="button"
                          onClick={() => setSettingsData({ ...settingsData, knowledgeBase: [{ topic: '', answer: '', enabled: true }] })}
                          className="mt-3 text-xs bg-teal-500/20 text-teal-400 px-4 py-2 rounded-lg hover:bg-teal-500/30 transition-colors border border-teal-500/20"
                        >
                          + เพิ่มรายการแรก
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5 my-6" />

                  {/* ========== SECTION 2: คำสั่งให้ AI ========== */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 border border-violet-500/10">
                        <Brain className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <span>คำสั่งให้ AI (System Prompt)</span>
                        <p className="text-[10px] text-slate-500 font-normal mt-0.5">กำหนดบุคลิก น้ำเสียง และแนวทางการตอบของ AI</p>
                      </div>
                    </h3>

                    {/* Tip Box */}
                    <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/10">
                      <p className="text-[11px] text-violet-300/80 font-semibold mb-1">ทำงานอย่างไร?</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">คำสั่งนี้จะถูกส่งให้ AI ทุกครั้งที่ตอบแชท เหมือนกับบอก AI ว่า &quot;คุณเป็นใคร ตอบแบบไหน&quot;</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-slate-500">ตัวอย่าง:</p>
                        <p className="text-[10px] text-white/40 font-mono">&quot;คุณชื่อน้องมิ้น เป็นผู้ช่วยร้านค้า ตอบสุภาพ ใช้คำลงท้ายค่ะ/ครับ&quot;</p>
                        <p className="text-[10px] text-white/40 font-mono">&quot;ตอบสั้นกระชับไม่เกิน 2 บรรทัด ห้ามใช้อีโมจิ&quot;</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-white/50 ml-1">คำสั่งเริ่มต้น</label>
                        <button
                          type="button"
                          onClick={() => setSettingsData({ ...settingsData, aiSystemPrompt: 'คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น' })}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw size={10} />
                          รีเซ็ตเป็นค่าเริ่มต้น
                        </button>
                      </div>
                      <Textarea
                        value={settingsData.aiSystemPrompt}
                        onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })}
                        placeholder="คุณเป็นผู้ช่วยที่เป็นมิตรและให้ข้อมูลที่เป็นประโยชน์ ตอบเป็นภาษาไทย ตอบให้กระชับและตรงประเด็น"
                        className="bg-slate-950/50 border-white/10 text-white min-h-[100px] rounded-xl text-sm p-4"
                      />
                      <p className="text-[10px] text-slate-500 ml-1">เว้นว่างไว้จะใช้ค่าเริ่มต้น — กฎเรื่อง &quot;ตอบจากข้อมูลเท่านั้น&quot; จะถูกเพิ่มให้อัตโนมัติ ไม่ต้องพิมพ์เอง</p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5 my-6" />

                  {/* ========== SECTION: AI วิเคราะห์แชท (Smart AI) ========== */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/10">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <span>AI วิเคราะห์แชท (Smart AI)</span>
                          <p className="text-[10px] text-slate-500 font-normal mt-0.5">ให้ AI วิเคราะห์ข้อความแล้วตัดสินใจว่าจะตอบหรือไม่ ตอบแบบไหน</p>
                        </div>
                      </h3>
                      <Switch
                        checked={settingsData.enableSmartAi}
                        onChange={(checked) => setSettingsData({ ...settingsData, enableSmartAi: checked })}
                      />
                    </div>

                    {/* Smart AI Explanation */}
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                      <p className="text-[11px] text-amber-300/80 font-semibold mb-1">{settingsData.enableSmartAi ? 'Smart AI เปิดอยู่' : 'Smart AI ปิดอยู่'}</p>
                      {settingsData.enableSmartAi ? (
                        <p className="text-[10px] text-slate-400 leading-relaxed">AI จะอ่านข้อความลูกค้าก่อน → จำแนกประเภท → แล้วตอบตามกฎที่ตั้งไว้ เช่น ข้อความหยาบคายจะไม่ตอบ, ถามลิงก์จะส่งลิงก์ทันที, คำถามทั่วไปจะใช้ AI ตอบจากคลังความรู้</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 leading-relaxed">AI จะตอบทุกข้อความเหมือนกันหมด โดยใช้คลังความรู้ + คำสั่งด้านบน ไม่แยกประเภทข้อความ เปิด Smart AI เพื่อให้ AI ฉลาดขึ้น</p>
                      )}
                    </div>

                    <AnimatePresence>
                      {settingsData.enableSmartAi && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-4">
                            {/* Intent Rule Cards */}
                            <p className="text-xs font-semibold text-white/50 ml-1">ประเภทข้อความที่ AI จะจัดการ — เปิด/ปิดแต่ละประเภทได้</p>
                            <div className="grid grid-cols-1 gap-3">
                              {Object.entries(INTENT_UI_CONFIG).map(([intent, config]) => {
                                const rule = settingsData.intentRules[intent] || DEFAULT_INTENT_RULES[intent] || { enabled: true, useAi: config.defaultUseAi, customPrompt: '', responseTemplate: config.defaultTemplate };
                                return (
                                  <div
                                    key={intent}
                                    className={cn(
                                      "p-3 rounded-xl border transition-all",
                                      rule.enabled ? "bg-white/[0.03] border-white/10" : "bg-white/[0.01] border-white/5 opacity-50"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className="text-lg flex-shrink-0">{config.emoji}</span>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-xs font-bold text-white">{config.name}</p>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-medium">{config.action}</span>
                                          </div>
                                          <p className="text-[10px] text-slate-500 mt-0.5">{config.desc}</p>
                                          <p className="text-[9px] text-white/20 mt-0.5 italic">ตัวอย่าง: {config.example}</p>
                                        </div>
                                      </div>
                                      <Switch
                                        checked={rule.enabled}
                                        onChange={(checked) => {
                                          const updatedRules = { ...settingsData.intentRules };
                                          updatedRules[intent] = { ...rule, enabled: checked };
                                          setSettingsData({ ...settingsData, intentRules: updatedRules });
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Game Links (for ask_link intent) */}
                            {(settingsData.intentRules['ask_link']?.enabled ?? true) && (
                              <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                <div>
                                  <p className="text-xs font-semibold text-white/70 flex items-center gap-2">
                                    <span>🔗</span> ลิงก์เกม
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-1">เมื่อลูกค้าถาม &quot;ขอทางเข้า&quot; หรือ &quot;ลิงก์เล่น&quot; AI จะส่งลิงก์เหล่านี้ให้อัตโนมัติ</p>
                                </div>
                                {settingsData.gameLinks.map((link, idx) => (
                                  <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <Input
                                      value={link.name}
                                      onChange={(e) => {
                                        const updated = [...settingsData.gameLinks];
                                        updated[idx] = { ...updated[idx], name: e.target.value };
                                        setSettingsData({ ...settingsData, gameLinks: updated });
                                      }}
                                      placeholder="เช่น PG Slot"
                                      className="bg-white/5 border-white/10 text-white h-10 rounded-lg text-sm w-full sm:flex-1"
                                    />
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={link.url}
                                        onChange={(e) => {
                                          const updated = [...settingsData.gameLinks];
                                          updated[idx] = { ...updated[idx], url: e.target.value };
                                          setSettingsData({ ...settingsData, gameLinks: updated });
                                        }}
                                        placeholder="https://example.com/play"
                                        className="bg-white/5 border-white/10 text-white h-10 rounded-lg text-sm flex-1 sm:flex-[2]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = settingsData.gameLinks.filter((_, i) => i !== idx);
                                          setSettingsData({ ...settingsData, gameLinks: updated });
                                        }}
                                        className="text-rose-400/60 hover:text-rose-400 transition-colors p-2 flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {settingsData.gameLinks.length === 0 && (
                                  <p className="text-[10px] text-slate-500 text-center py-2">ยังไม่มีลิงก์ — เพิ่มลิงก์เพื่อให้ AI ส่งให้ลูกค้าเมื่อถาม &quot;ขอทางเข้า&quot;</p>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSettingsData({ ...settingsData, gameLinks: [...settingsData.gameLinks, { name: '', url: '' }] })}
                                  className="text-xs bg-white/5 text-white/50 px-3 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                                >
                                  + เพิ่มลิงก์
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5 my-6" />

                  {/* ========== SECTION 3: ขั้นสูง (ซ่อน/แสดง) ========== */}
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedAi(!showAdvancedAi)}
                      className="w-full flex items-center justify-between text-sm font-bold text-white/50 hover:text-white/70 transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-500/10 flex items-center justify-center text-slate-400 border border-slate-500/10">
                          <SlidersHorizontal className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <span className="block text-sm">ตั้งค่าขั้นสูง</span>
                          <span className="block text-[10px] text-slate-500 font-normal">AI Model, Temperature, ข้อความสำรอง</span>
                        </div>
                      </span>
                      <ChevronDown className={cn("w-5 h-5 transition-transform", showAdvancedAi && "rotate-180")} />
                    </button>

                    <AnimatePresence>
                      {showAdvancedAi && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-white/[0.02] p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-white/5 space-y-4 sm:space-y-6">
                            {/* AI Model */}
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-white/50 ml-1">AI Model</label>
                              <select
                                value={settingsData.aiModel}
                                onChange={(e) => setSettingsData({ ...settingsData, aiModel: e.target.value })}
                                className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-slate-950/50 border border-white/10 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[44px]"
                              >
                                <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                                {allowedAiModels.map((model) => (
                                  <option key={model} value={model}>{model}</option>
                                ))}
                              </select>
                              <p className="text-[10px] text-slate-500 ml-1">ปล่อยว่างเพื่อใช้ค่าเริ่มต้น</p>
                            </div>

                            {/* Temperature */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-semibold text-white/50">ความหลากหลายในการตอบ</label>
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
                              <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                                <span>0 = ตรงๆ แม่นยำ</span>
                                <span>1 = หลากหลาย สร้างสรรค์</span>
                              </div>
                              <p className="text-[10px] text-slate-500 ml-1">แนะนำ 0.7 สำหรับงานบริการลูกค้า</p>
                            </div>

                            {/* Fallback Message */}
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-white/50 ml-1">ข้อความเมื่อ AI ตอบไม่ได้</label>
                              <Input
                                value={settingsData.aiFallbackMessage}
                                onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })}
                                className="bg-slate-950/50 border-white/10 h-12 rounded-xl text-white font-bold text-sm"
                              />
                              <p className="text-[10px] text-slate-500 ml-1">ข้อความสำรองเมื่อ AI เกิดข้อผิดพลาด</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </Modal>

      {/* Angpao History Modal */}
      <Modal isOpen={showAngpaoModal} onClose={() => setShowAngpaoModal(false)} title="" size="lg">
        <div className="space-y-6 -mt-4">
          {/* Premium Header */}
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-rose-600 via-red-500 to-orange-500 p-6 sm:p-8">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-[50px] -mr-16 -mt-16 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-[40px] -ml-10 -mb-10 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg">🧧</div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">ประวัติซองอังเปา</h2>
                  <p className="text-xs text-white/70 font-semibold">{angpaoAccount?.accountName || ''}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">รับสำเร็จ</p>
                  <p className="text-2xl sm:text-3xl font-black text-white leading-none">{angpaoStats.totalCount.toLocaleString()}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">รายการ</p>
                </div>
                <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">ยอดรวม</p>
                  <p className="text-2xl sm:text-3xl font-black text-white leading-none">฿{angpaoStats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">บาท</p>
                </div>
              </div>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { key: 'all', label: 'ทั้งหมด', emoji: '📋' },
              { key: 'success', label: 'สำเร็จ', emoji: '✅' },
              { key: 'already_redeemed', label: 'รับแล้ว', emoji: '🔄' },
              { key: 'expired', label: 'หมดอายุ', emoji: '⏰' },
              { key: 'error', label: 'ผิดพลาด', emoji: '❌' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setAngpaoStatusFilter(f.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap",
                  angpaoStatusFilter === f.key
                    ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 scale-105"
                    : "bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06] hover:text-white/60"
                )}
              >
                <span className="text-sm">{f.emoji}</span> {f.label}
              </button>
            ))}
          </div>

          {/* History List */}
          {angpaoLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
              </div>
              <p className="text-xs text-white/30 font-semibold">กำลังโหลดข้อมูล...</p>
            </div>
          ) : (() => {
            const filtered = angpaoStatusFilter === 'all'
              ? angpaoItems
              : angpaoItems.filter(item => item.status === angpaoStatusFilter);
            return filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-rose-500/10 to-orange-500/10 border border-white/5 flex items-center justify-center text-4xl">🧧</div>
                <div className="text-center">
                  <p className="text-sm font-black text-white/30">ไม่มีรายการ</p>
                  <p className="text-[10px] text-white/20 mt-1">ยังไม่มีประวัติอังเปาที่ตรงกับตัวกรอง</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filtered.map((item, idx) => (
                  <motion.div
                    key={item._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="group relative overflow-hidden rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all duration-300"
                  >
                    <div className="flex items-center gap-4 p-4 sm:p-5">
                      {/* Status Icon */}
                      <div className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 border",
                        angpaoStatusColor(item.status)
                      )}>
                        {angpaoStatusIcon(item.status)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border", angpaoStatusColor(item.status))}>
                            {angpaoStatusLabel(item.status)}
                          </span>
                          {item.ownerName && (
                            <span className="text-[10px] text-white/30 truncate">{item.ownerName}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-white/30 font-mono">
                          {new Date(item.createdAt).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        {item.amount ? (
                          <>
                            <p className="text-lg sm:text-xl font-black text-white leading-none">฿{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p className="text-[9px] text-white/20 font-semibold mt-0.5">THB</p>
                          </>
                        ) : (
                          <p className="text-sm text-white/20 font-bold">-</p>
                        )}
                      </div>
                    </div>

                    {/* Subtle accent line */}
                    {item.status === 'success' && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-emerald-500 to-emerald-500/0 rounded-full" />
                    )}
                  </motion.div>
                ))}
              </div>
            );
          })()}

          {/* Pagination */}
          {angpaoTotal > 20 && (
            <div className="flex items-center justify-between px-2 pt-3">
              <p className="text-[10px] text-white/30 font-semibold">
                แสดง {((angpaoPage - 1) * 20) + 1}-{Math.min(angpaoPage * 20, angpaoTotal)} จาก {angpaoTotal} รายการ
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchAngpaoPage(angpaoPage - 1)}
                  disabled={angpaoPage <= 1 || angpaoLoading}
                  className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4 text-white/70" />
                </button>
                <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <span className="text-xs font-black text-rose-400">{angpaoPage}</span>
                  <span className="text-xs text-white/30 mx-1">/</span>
                  <span className="text-xs text-white/40">{Math.ceil(angpaoTotal / 20)}</span>
                </div>
                <button
                  onClick={() => fetchAngpaoPage(angpaoPage + 1)}
                  disabled={angpaoPage >= Math.ceil(angpaoTotal / 20) || angpaoLoading}
                  className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4 text-white/70" />
                </button>
              </div>
            </div>
          )}
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

