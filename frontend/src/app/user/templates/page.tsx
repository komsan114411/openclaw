'use client';

import { useState, useEffect, useCallback, Suspense, useMemo, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, slipTemplatesApi, banksApi, systemSettingsApi } from '@/lib/api';
import { LineAccount, Bank } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { Building2, Palette } from 'lucide-react';

interface SlipTemplate {
  _id: string;
  name: string;
  description?: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault: boolean;
  isActive: boolean;
  isGlobal?: boolean;
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
  showRefs?: boolean;
  showSenderAccount?: boolean;
  showReceiverAccount?: boolean;
  showReceiverProxy?: boolean;
  // Enhanced styling
  themePreset?: string;
  createdAt: string;
}

// Only show success and duplicate templates for users (error/not_found are system-managed)
const TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', icon: '✅', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400' },
  { value: 'duplicate', label: 'สลิปซ้ำ', icon: '⚠️', bgColor: 'bg-amber-500/10', textColor: 'text-amber-400' },
];

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

// Default sample data for realistic preview (Thai) - will be overridden by API config
const DEFAULT_SAMPLE_DATA: SampleData = {
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

// Mock templates with comprehensive data structure
const MOCK_TEMPLATES: SlipTemplate[] = [
  {
    _id: 'mock-success-1',
    name: 'มาตรฐาน (Standard)',
    description: 'แสดงข้อมูลครบถ้วน เหมาะสำหรับการใช้งานทั่วไป',
    type: 'success',
    isDefault: true,
    isActive: true,
    isGlobal: true,
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
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-success-2',
    name: 'กะทัดรัด (Compact)',
    description: 'แสดงเฉพาะข้อมูลสำคัญ ประหยัดพื้นที่',
    type: 'success',
    isDefault: false,
    isActive: true,
    isGlobal: true,
    primaryColor: '#06C755',
    headerText: 'โอนเงินสำเร็จ',
    showAmount: true,
    showSender: false,
    showReceiver: true,
    showDate: true,
    showTime: true,
    showTransRef: true,
    showBankLogo: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-success-3',
    name: 'โมเดิร์น (Modern)',
    description: 'ดีไซน์ทันสมัย โทนสีน้ำเงิน',
    type: 'success',
    isDefault: false,
    isActive: true,
    isGlobal: true,
    primaryColor: '#3b82f6',
    headerText: 'ยืนยันการโอนแล้ว',
    showAmount: true,
    showSender: true,
    showReceiver: true,
    showDate: true,
    showTime: true,
    showTransRef: true,
    showBankLogo: true,
    showFee: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-duplicate-1',
    name: 'แจ้งเตือนสลิปซ้ำ',
    description: 'แสดงเมื่อตรวจพบสลิปที่เคยใช้แล้ว',
    type: 'duplicate',
    isDefault: true,
    isActive: true,
    isGlobal: true,
    primaryColor: '#f59e0b',
    headerText: 'ตรวจพบสลิปซ้ำในระบบ',
    footerText: 'สลิปนี้เคยถูกใช้ตรวจสอบแล้ว',
    showAmount: true,
    showSender: true,
    showReceiver: true,
    showDate: true,
    showTime: true,
    showTransRef: true,
    showBankLogo: true,
    createdAt: new Date().toISOString(),
  },
];

// Realistic Bank Slip Preview Component (Admin-style with real bank logos)
const SlipPreview = memo(({ template, senderBank, receiverBank, sampleData = DEFAULT_SAMPLE_DATA }: {
  template: SlipTemplate;
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
    <div className="bg-slate-900 rounded-[1.5rem] p-3 w-full max-w-[220px] mx-auto shadow-2xl border border-white/10 relative overflow-hidden">
      {/* Decorative glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[30px] -mr-12 -mt-12 pointer-events-none opacity-40 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      />

      {/* Status Header */}
      <div
        className="rounded-xl p-2 mb-2 flex items-center gap-2 border border-white/10 backdrop-blur-sm transition-colors duration-200"
        style={{ backgroundColor: `${mainColor}20` }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-lg transition-colors duration-200 flex-shrink-0"
          style={{ backgroundColor: mainColor }}
        >
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-bold leading-tight transition-colors duration-200 truncate"
            style={{ color: mainColor }}
          >
            {getStatusText()}
          </p>
          <p className="text-[8px] text-white/50 font-medium">ยืนยันการทำรายการแล้ว</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl p-2.5 space-y-2 shadow-inner relative z-10">
        {/* Amount Section */}
        {template.showAmount && (
          <div className="text-center py-1 border-b border-slate-100">
            <p className="text-[8px] text-slate-400 font-medium mb-0.5">จำนวนเงิน</p>
            <p
              className="text-lg font-bold transition-colors duration-200"
              style={{ color: mainColor }}
            >
              {sampleData.amount}
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              {template.showDate && (
                <p className="text-[8px] text-slate-400">{sampleData.date}</p>
              )}
              {template.showDate && template.showTime && (
                <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
              )}
              {template.showTime && (
                <p className="text-[8px] text-slate-400">{sampleData.time}</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {/* Sender */}
          {template.showSender && (
            <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-lg">
              {template.showBankLogo && (
                <div className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {senderLogo ? (
                    <img src={senderLogo} alt={senderBank?.name || 'Bank'} className="w-5 h-5 object-contain" />
                  ) : (
                    <span className="text-[9px]">👤</span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[8px] text-slate-400 font-medium">ผู้โอน</p>
                <p className="text-[9px] font-semibold text-slate-800 truncate">
                  {sampleData.sender.name}
                </p>
                {template.showSenderAccount && (
                  <p className="text-[8px] text-slate-400 font-mono">
                    {sampleData.sender.account}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Arrow Divider */}
          {template.showSender && template.showReceiver && (
            <div className="flex justify-center -my-0.5 relative z-10">
              <div className="w-4 h-4 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                <span className="text-slate-400 text-[8px]">↓</span>
              </div>
            </div>
          )}

          {/* Receiver */}
          {template.showReceiver && (
            <div
              className="flex items-center gap-2 p-1.5 rounded-lg transition-colors duration-200"
              style={{ backgroundColor: `${mainColor}10` }}
            >
              {template.showBankLogo && (
                <div className="w-7 h-7 rounded-md bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {receiverLogo ? (
                    <img src={receiverLogo} alt={receiverBank?.name || 'Bank'} className="w-5 h-5 object-contain" />
                  ) : (
                    <Building2 className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[8px] font-medium transition-colors duration-200"
                  style={{ color: mainColor }}
                >
                  ผู้รับ
                </p>
                <p className="text-[9px] font-semibold text-slate-800 truncate">
                  {sampleData.receiver.name}
                </p>
                {template.showReceiverAccount && (
                  <p className="text-[8px] text-slate-400 font-mono">
                    {sampleData.receiver.account}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Transaction Details */}
        {(template.showTransRef || template.showFee) && (
          <div className="pt-1.5 border-t border-dashed border-slate-200 space-y-1">
            {template.showTransRef && (
              <div className="flex justify-between items-center text-[8px]">
                <span className="text-slate-400">เลขอ้างอิง</span>
                <span className="text-slate-700 font-mono font-medium truncate ml-1">
                  {sampleData.transRef.slice(0, 10)}...
                </span>
              </div>
            )}
            {template.showFee && (
              <div className="flex justify-between items-center text-[8px]">
                <span className="text-slate-400">ค่าธรรมเนียม</span>
                <span className="text-emerald-600 font-medium">{sampleData.fee}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer Text */}
        {template.footerText && (
          <div className="pt-1.5 border-t border-slate-100">
            <p className="text-[7px] text-slate-400 text-center leading-tight">{template.footerText}</p>
          </div>
        )}
      </div>

      {/* Bottom Branding */}
      <div className="mt-2 flex justify-center">
        <p className="text-[7px] text-white/30 font-medium">LINE OA System</p>
      </div>
    </div>
  );
});
SlipPreview.displayName = 'SlipPreview';

function TemplatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [sampleData, setSampleData] = useState<SampleData>(DEFAULT_SAMPLE_DATA);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Partial<Record<SlipTemplate['type'], string>>>({});
  const [updatingType, setUpdatingType] = useState<string | null>(null);
  const [currentAccount, setCurrentAccount] = useState<LineAccount | null>(null);
  const [allAccounts, setAllAccounts] = useState<LineAccount[]>([]);
  const [usingMockData, setUsingMockData] = useState(false);

  // Get sender and receiver banks from API data using configurable sample data
  const senderBank = useMemo(() => banks.find(b => b.code === sampleData.sender.bankId) || null, [banks, sampleData]);
  const receiverBank = useMemo(() => banks.find(b => b.code === sampleData.receiver.bankId) || null, [banks, sampleData]);

  // Fetch banks and preview config on mount
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const response = await banksApi.getAll();
        setBanks(response.data.banks || []);
      } catch (error) {
        console.error('Error fetching banks:', error);
      }
    };
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
    fetchBanks();
    fetchPreviewConfig();
  }, []);

  const fetchTemplates = useCallback(async () => {
    // Helper function to fetch global templates
    const fetchGlobalTemplates = async (): Promise<SlipTemplate[]> => {
      try {
        const globalRes = await slipTemplatesApi.getGlobal();
        if (globalRes.data.success && globalRes.data.templates?.length > 0) {
          return globalRes.data.templates;
        }
      } catch (e) {
        console.warn('Failed to fetch global templates:', e);
      }
      return [];
    };

    // If no accountId, show global templates in preview mode
    if (!accountId) {
      try {
        const globalTemplates = await fetchGlobalTemplates();
        if (globalTemplates.length > 0) {
          setTemplates(globalTemplates);
          setUsingMockData(false);
        } else {
          setTemplates(MOCK_TEMPLATES);
          setUsingMockData(true);
        }
      } catch {
        setTemplates(MOCK_TEMPLATES);
        setUsingMockData(true);
      }
      setLoading(false);
      return;
    }
    try {
      // Fetch templates using correct API path (includes global templates)
      const response = await slipTemplatesApi.getGlobal();
      if (response.data.success) {
        const apiTemplates = response.data.templates || [];
        // If API returns empty, try to fetch global templates
        if (apiTemplates.length === 0) {
          const globalTemplates = await fetchGlobalTemplates();
          if (globalTemplates.length > 0) {
            setTemplates(globalTemplates);
            setUsingMockData(false);
          } else {
            setTemplates(MOCK_TEMPLATES);
            setUsingMockData(true);
          }
        } else {
          setTemplates(apiTemplates);
          setUsingMockData(false);
        }
      }

      // Fetch current account info
      const accountRes = await lineAccountsApi.getById(accountId);
      const ids = accountRes.data?.account?.settings?.slipTemplateIds || {};
      setSelectedTemplateIds(ids);
      setCurrentAccount(accountRes.data?.account || null);

      // Fetch all accounts for navigation
      const allAccountsRes = await lineAccountsApi.getMyAccounts();
      setAllAccounts(allAccountsRes.data?.accounts || []);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลด Templates ได้ - กำลังแสดงตัวอย่าง');
      // Fallback: try global templates first, then mock data
      try {
        const globalTemplates = await fetchGlobalTemplates();
        if (globalTemplates.length > 0) {
          setTemplates(globalTemplates);
          setUsingMockData(false);
        } else {
          setTemplates(MOCK_TEMPLATES);
          setUsingMockData(true);
        }
      } catch {
        setTemplates(MOCK_TEMPLATES);
        setUsingMockData(true);
      }
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSelectTemplate = async (template: SlipTemplate) => {
    // Check if this is a mock template (ID starts with 'mock-')
    const isMockTemplate = template._id.startsWith('mock-');

    // In preview mode or using mock data, just show toast
    if (!accountId || usingMockData || isMockTemplate) {
      toast.success(`เลือก "${template.name}" สำเร็จ (โหมดตัวอย่าง)`);
      // Update local state for visual feedback only
      setSelectedTemplateIds(prev => ({ ...prev, [template.type]: template._id }));

      // Show warning if trying to use mock template with real account
      if (accountId && isMockTemplate) {
        toast.error('ไม่สามารถบันทึก Template ตัวอย่างได้ กรุณาสร้าง Template ใหม่หรือใช้ Global Template');
      }
      return;
    }

    setUpdatingType(template.type);
    try {
      const next = { ...selectedTemplateIds, [template.type]: template._id };
      await lineAccountsApi.updateSettings(accountId, { slipTemplateIds: next });
      setSelectedTemplateIds(next);
      toast.success(`เลือกใช้ "${template.name}" สำเร็จ`);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถเลือก Template ได้');
    } finally {
      setUpdatingType(null);
    }
  };

  // Filter and group templates by type (only success and duplicate for users)
  const templatesByType = useMemo(() => {
    const allowedTypes = ['success', 'duplicate'];
    return templates
      .filter(t => allowedTypes.includes(t.type))
      .reduce((acc, template) => {
        if (!acc[template.type]) acc[template.type] = [];
        acc[template.type].push(template);
        return acc;
      }, {} as Record<string, SlipTemplate[]>);
  }, [templates]);

  // Count only filtered templates for display
  const filteredTemplateCount = useMemo(() => {
    return Object.values(templatesByType).reduce((sum, arr) => sum + arr.length, 0);
  }, [templatesByType]);

  // Other LINE accounts (excluding current)
  const otherAccounts = allAccounts.filter(acc => acc._id !== accountId);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลด Templates..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-2 md:gap-4">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="!p-2 text-xs md:text-sm"
            >
              ← กลับ
            </Button>
            <div>
              <h1 className="text-base md:text-xl lg:text-2xl font-black text-white flex items-center gap-2 tracking-tight">
                เลือก<span className="text-[#06C755]">เทมเพลต</span>สลิป
              </h1>
              <p className="text-slate-400 text-[10px] md:text-sm mt-0.5 font-medium">
                เลือกรูปแบบการแสดงผลสลิปที่ต้องการใช้งาน
              </p>
            </div>
          </div>
          <Badge variant="indigo" className="text-xs px-2 sm:px-3 py-1">
            🎨 {filteredTemplateCount} เทมเพลต
          </Badge>
        </div>

        {/* Preview Mode Notice */}
        {usingMockData && (
          <Card className="p-3 sm:p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-yellow-500/10 border-amber-500/20" variant="glass">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl flex-shrink-0">
                👁️
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-amber-400 text-sm">โหมดแสดงตัวอย่าง</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {!accountId
                    ? 'ดูตัวอย่างเทมเพลต กรุณาเลือกบัญชี LINE เพื่อบันทึกการตั้งค่าจริง'
                    : 'กำลังแสดงเทมเพลตตัวอย่าง การเลือกจะไม่ถูกบันทึกจนกว่า API จะพร้อม'}
                </p>
              </div>
              {!accountId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push('/user/line-accounts')}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs"
                >
                  เลือกบัญชี LINE
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Current Account Info */}
        {currentAccount && (
          <Card className="p-3 sm:p-4 bg-gradient-to-r from-[#06C755]/10 via-teal-500/10 to-cyan-500/10 border-[#06C755]/20" variant="glass">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#06C755] to-teal-500 flex items-center justify-center text-white text-lg shadow-lg">
                📱
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-white truncate">{currentAccount.accountName}</h3>
                <p className="text-xs text-slate-400 font-mono truncate">ID: {currentAccount.channelId}</p>
              </div>
              <span className={cn(
                "px-2 py-1 rounded-full text-[9px] font-semibold",
                currentAccount.isActive ? "bg-[#06C755]/20 text-[#06C755]" : "bg-white/10 text-slate-400"
              )}>
                {currentAccount.isActive ? '🟢 ใช้งาน' : '🔴 ปิด'}
              </span>
            </div>
          </Card>
        )}

        {/* Templates by Type */}
        {TYPE_OPTIONS.map((typeOption) => {
          const typeTemplates = templatesByType[typeOption.value] || [];
          if (typeTemplates.length === 0) return null;

          const selectedId = selectedTemplateIds[typeOption.value as SlipTemplate['type']];

          return (
            <div key={typeOption.value} className="space-y-4">
              {/* Type Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0",
                  typeOption.bgColor
                )}>
                  {typeOption.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-black text-white">{typeOption.label}</h2>
                  <p className="text-xs text-slate-400">
                    {typeTemplates.length} เทมเพลต •
                    {selectedId ? ' มีเทมเพลตที่เลือก' : ' ใช้ค่าเริ่มต้น'}
                  </p>
                </div>
              </div>

              {/* Templates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {typeTemplates.map((template) => {
                  const isSelected = selectedId === template._id || (!selectedId && template.isDefault);

                  return (
                    <Card
                      key={template._id}
                      className={cn(
                        "p-0 overflow-hidden transition-all duration-300 hover:shadow-xl rounded-2xl border",
                        isSelected
                          ? "ring-2 ring-[#06C755] shadow-lg shadow-[#06C755]/20 border-[#06C755]/50"
                          : "border-white/10 hover:border-white/20"
                      )}
                      variant="glass"
                    >
                      {/* Color Bar */}
                      <div
                        className="h-1.5 w-full"
                        style={{ backgroundColor: template.primaryColor || '#06C755' }}
                      />

                      {/* Preview Section */}
                      <div className="p-4 sm:p-5 bg-gradient-to-b from-white/[0.02] to-white/[0.05] flex justify-center">
                        <div className="transform hover:scale-105 transition-transform duration-500">
                          <SlipPreview template={template} senderBank={senderBank} receiverBank={receiverBank} sampleData={sampleData} />
                        </div>
                      </div>

                      {/* Info Section */}
                      <div className="p-4 sm:p-5 border-t border-white/5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {template.isGlobal && (
                                <span className="text-[8px] font-semibold px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded">
                                  🌐 ส่วนกลาง
                                </span>
                              )}
                              {template.isDefault && (
                                <span className="text-[8px] font-semibold px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                                  ⭐ ค่าเริ่มต้น
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-white text-sm truncate">{template.name}</h3>
                            {template.description && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">{template.description}</p>
                            )}
                          </div>
                          {isSelected && (
                            <Badge variant="success" size="sm" className="flex-shrink-0 text-[9px] px-2 py-1">
                              ✓ ใช้งาน
                            </Badge>
                          )}
                        </div>

                        {/* Feature Tags */}
                        <div className="flex flex-wrap gap-1">
                          {template.showAmount && <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">จำนวนเงิน</span>}
                          {template.showSender && <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">ผู้โอน</span>}
                          {template.showReceiver && <span className="text-[8px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">ผู้รับ</span>}
                          {template.showBankLogo && <span className="text-[8px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded border border-indigo-500/20">โลโก้</span>}
                          {template.showTransRef && <span className="text-[8px] px-1.5 py-0.5 bg-slate-500/10 text-slate-400 rounded border border-slate-500/20">อ้างอิง</span>}
                        </div>

                        {/* Action Button */}
                        <div className="pt-2">
                          {isSelected ? (
                            <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#06C755]/10 text-[#06C755] rounded-xl border border-[#06C755]/20">
                              <span className="text-sm">✓</span>
                              <span className="text-[10px] font-semibold">กำลังใช้งาน Template นี้</span>
                            </div>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              fullWidth
                              onClick={() => handleSelectTemplate(template)}
                              isLoading={updatingType === template.type}
                              className="shadow-sm rounded-xl font-semibold text-[10px] h-10 bg-[#06C755] hover:bg-[#05B048] transition-all"
                            >
                              🎯 เลือกใช้งาน
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {filteredTemplateCount === 0 && (
          <Card className="p-12">
            <EmptyState
              icon={
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <Palette className="w-10 h-10 text-slate-400" />
                </div>
              }
              title="ยังไม่มี Template"
              description="กรุณาติดต่อผู้ดูแลระบบเพื่อสร้าง Template สำหรับใช้งาน"
            />
          </Card>
        )}

        {/* Help Info */}
        <Card className="p-4 sm:p-5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-blue-500/20" variant="glass">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-xl flex-shrink-0 shadow-lg">
              💡
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-white text-sm mb-2">วิธีใช้งาน</h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-[#06C755]">✓</span>
                  <span>เลือก Template ที่ต้องการใช้สำหรับแต่ละประเภทสลิป</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">⚡</span>
                  <span>หากไม่เลือก ระบบจะใช้ Template ค่าเริ่มต้นอัตโนมัติ</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400">🌐</span>
                  <span>Template ส่วนกลางถูกสร้างโดยผู้ดูแลระบบ</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function SlipTemplatesPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <PageLoading message="กำลังโหลด..." />
      </DashboardLayout>
    }>
      <TemplatesContent />
    </Suspense>
  );
}
