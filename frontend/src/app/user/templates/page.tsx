'use client';

import { useState, useEffect, useCallback, Suspense, useMemo, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, slipTemplatesApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

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
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', color: 'emerald', icon: '✅', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', borderColor: 'border-emerald-200' },
  { value: 'duplicate', label: 'สลิปซ้ำ', color: 'amber', icon: '⚠️', bgColor: 'bg-amber-50', textColor: 'text-amber-700', borderColor: 'border-amber-200' },
  { value: 'error', label: 'ผิดพลาด', color: 'rose', icon: '❌', bgColor: 'bg-rose-50', textColor: 'text-rose-700', borderColor: 'border-rose-200' },
  { value: 'not_found', label: 'ไม่พบข้อมูล', color: 'slate', icon: '🔍', bgColor: 'bg-slate-100', textColor: 'text-slate-700', borderColor: 'border-slate-200' },
];

// Sample data for preview
const SAMPLE_SLIP_DATA = {
  amount: '฿1,000.00',
  date: '24 ธ.ค. 2568',
  time: '09:41',
  sender: 'นาย ธันเดอร์ มานะ',
  receiver: 'นาย ธันเดอร์ มานะ',
  transRef: '68370160657749I...',
};

// Mock templates for fallback when API fails
const MOCK_TEMPLATES: SlipTemplate[] = [
  {
    _id: 'mock-success-1',
    name: 'Standard Success',
    description: 'เทมเพลตมาตรฐานสำหรับการตรวจสอบสำเร็จ',
    type: 'success',
    isDefault: true,
    isActive: true,
    isGlobal: true,
    primaryColor: '#10b981',
    headerText: 'ตรวจสอบสำเร็จ',
    showAmount: true,
    showSender: true,
    showReceiver: true,
    showDate: true,
    showTime: true,
    showTransRef: true,
    showBankLogo: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-success-2',
    name: 'Minimal Success',
    description: 'แสดงเฉพาะข้อมูลสำคัญ',
    type: 'success',
    isDefault: false,
    isActive: true,
    isGlobal: true,
    primaryColor: '#06C755',
    headerText: 'โอนสำเร็จ',
    showAmount: true,
    showSender: false,
    showReceiver: true,
    showDate: false,
    showTime: false,
    showTransRef: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-duplicate-1',
    name: 'Duplicate Warning',
    description: 'แจ้งเตือนสลิปที่เคยใช้แล้ว',
    type: 'duplicate',
    isDefault: true,
    isActive: true,
    isGlobal: true,
    primaryColor: '#f59e0b',
    headerText: 'สลิปซ้ำ',
    showAmount: true,
    showSender: true,
    showReceiver: true,
    showDate: true,
    showTime: true,
    showTransRef: true,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-error-1',
    name: 'Error Template',
    description: 'แสดงเมื่อเกิดข้อผิดพลาด',
    type: 'error',
    isDefault: true,
    isActive: true,
    isGlobal: true,
    primaryColor: '#ef4444',
    headerText: 'เกิดข้อผิดพลาด',
    showAmount: false,
    showSender: false,
    showReceiver: false,
    showDate: false,
    showTime: false,
    showTransRef: false,
    createdAt: new Date().toISOString(),
  },
  {
    _id: 'mock-not-found-1',
    name: 'Not Found Template',
    description: 'แสดงเมื่อไม่พบข้อมูลสลิป',
    type: 'not_found',
    isDefault: true,
    isActive: true,
    isGlobal: true,
    primaryColor: '#64748b',
    headerText: 'ไม่พบข้อมูล',
    showAmount: false,
    showSender: false,
    showReceiver: false,
    showDate: false,
    showTime: false,
    showTransRef: true,
    createdAt: new Date().toISOString(),
  },
];

// Mini Slip Preview Component
const MiniSlipPreview = memo(({ template }: { template: SlipTemplate }) => {
  const isDuplicate = template.type === 'duplicate';
  const isError = template.type === 'error';
  const isNotFound = template.type === 'not_found';
  const mainColor = isDuplicate ? '#f59e0b' : isError ? '#ef4444' : isNotFound ? '#64748b' : template.primaryColor || '#10b981';

  return (
    <div className="bg-gradient-to-b from-slate-50 to-slate-100 rounded-xl p-3 w-full max-w-[200px] mx-auto shadow-sm border border-slate-200/50">
      {/* Header */}
      <div className="rounded-lg p-2 mb-2 flex items-center gap-2" style={{ backgroundColor: `${mainColor}15` }}>
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
          style={{ backgroundColor: mainColor }}
        >
          {isDuplicate ? '!' : isError ? '✕' : isNotFound ? '?' : '✓'}
        </div>
        <span className="font-bold text-[10px] truncate" style={{ color: mainColor }}>
          {template.headerText || (isDuplicate ? 'สลิปซ้ำ' : isError ? 'ผิดพลาด' : isNotFound ? 'ไม่พบ' : 'สำเร็จ')}
        </span>
      </div>

      <div className="bg-white rounded-lg p-2 space-y-1.5">
        {template.showAmount && (
          <div className="text-center">
            <p className="text-[8px] text-slate-400 uppercase">จำนวนเงิน</p>
            <p className="text-sm font-bold" style={{ color: mainColor }}>{SAMPLE_SLIP_DATA.amount}</p>
          </div>
        )}

        {template.showSender && (
          <div className="text-[8px] p-1.5 bg-slate-50 rounded">
            <span className="text-slate-400">ผู้โอน: </span>
            <span className="text-slate-700">{SAMPLE_SLIP_DATA.sender.slice(0, 15)}...</span>
          </div>
        )}

        {template.showReceiver && (
          <div className="text-[8px] p-1.5 bg-slate-50 rounded">
            <span className="text-slate-400">ผู้รับ: </span>
            <span className="text-slate-700">{SAMPLE_SLIP_DATA.receiver.slice(0, 15)}...</span>
          </div>
        )}

        {template.showTransRef && (
          <div className="text-[8px] p-1.5 bg-slate-900 text-white rounded flex justify-between">
            <span className="opacity-60">อ้างอิง</span>
            <span className="font-mono">{SAMPLE_SLIP_DATA.transRef}</span>
          </div>
        )}
      </div>
    </div>
  );
});
MiniSlipPreview.displayName = 'MiniSlipPreview';

function TemplatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Partial<Record<SlipTemplate['type'], string>>>({});
  const [updatingType, setUpdatingType] = useState<string | null>(null);
  const [currentAccount, setCurrentAccount] = useState<LineAccount | null>(null);
  const [allAccounts, setAllAccounts] = useState<LineAccount[]>([]);
  const [usingMockData, setUsingMockData] = useState(false);

  const fetchTemplates = useCallback(async () => {
    // If no accountId, show mock templates in preview mode
    if (!accountId) {
      setTemplates(MOCK_TEMPLATES);
      setUsingMockData(true);
      setLoading(false);
      return;
    }
    try {
      // Fetch templates using correct API path
      const response = await slipTemplatesApi.getAll(accountId);
      if (response.data.success) {
        const apiTemplates = response.data.templates || [];
        // If API returns empty, use mock templates
        if (apiTemplates.length === 0) {
          setTemplates(MOCK_TEMPLATES);
          setUsingMockData(true);
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
      // Fallback to mock data when API fails
      setTemplates(MOCK_TEMPLATES);
      setUsingMockData(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSetDefault = async (template: SlipTemplate) => {
    setUpdatingType(template.type);
    try {
      const next = { ...selectedTemplateIds, [template.type]: template._id };
      await lineAccountsApi.updateSettings(accountId, { slipTemplateIds: next });
      setSelectedTemplateIds(next);
      toast.success('เลือก Template สำเร็จ');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถเลือก Template ได้');
    } finally {
      setUpdatingType(null);
    }
  };

  const getTypeInfo = (type: string) => {
    return TYPE_OPTIONS.find(t => t.value === type) || TYPE_OPTIONS[0];
  };

  // Group templates by type
  const templatesByType = useMemo(() => {
    return templates.reduce((acc, template) => {
      if (!acc[template.type]) acc[template.type] = [];
      acc[template.type].push(template);
      return acc;
    }, {} as Record<string, SlipTemplate[]>);
  }, [templates]);

  // Separate global and account templates
  const globalTemplates = templates.filter(t => t.isGlobal);
  const accountTemplates = templates.filter(t => !t.isGlobal);

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลด Templates..." />
      </DashboardLayout>
    );
  }

  // Get selected template names for summary
  const getSelectedTemplateName = (type: SlipTemplate['type']) => {
    const selectedId = selectedTemplateIds[type];
    if (selectedId) {
      const template = templates.find(t => t._id === selectedId);
      return template?.name || 'ไม่ระบุ';
    }
    const defaultTemplate = templates.find(t => t.type === type && t.isDefault);
    return defaultTemplate?.name || 'ค่าเริ่มต้น';
  };

  // Other LINE accounts (excluding current)
  const otherAccounts = allAccounts.filter(acc => acc._id !== accountId);

  return (
    <DashboardLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-6">
        {/* Header with Current Account Info */}
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
                เทมเพลต<span className="text-[#06C755]">ของฉัน</span>
              </h1>
              <p className="text-slate-400 text-[10px] md:text-sm mt-0.5 font-medium">จัดการเทมเพลตการตอบกลับสำหรับการตรวจสอบสลิป</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="indigo" className="text-[9px] sm:text-[10px] md:text-xs px-2 sm:px-3 py-1">
              🌐 {globalTemplates.length} ส่วนกลาง
            </Badge>
            {accountTemplates.length > 0 && (
              <Badge variant="emerald" className="text-[9px] sm:text-[10px] md:text-xs px-2 sm:px-3 py-1">
                📁 {accountTemplates.length} ของบัญชี
              </Badge>
            )}
          </div>
        </div>

        {/* Mock Data Notice */}
        {usingMockData && (
          <Card className="p-3 sm:p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-yellow-500/10 border-amber-500/20 mb-4 sm:mb-6" variant="glass">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl flex-shrink-0">
                🎨
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-amber-400 text-sm">โหมดตัวอย่าง (Preview Mode)</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {!accountId
                    ? 'กำลังแสดงเทมเพลตตัวอย่าง กรุณาเลือกบัญชี LINE เพื่อใช้งานจริง'
                    : 'กำลังแสดงเทมเพลตตัวอย่าง เนื่องจากไม่สามารถเชื่อมต่อ API ได้'}
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

        {/* Current LINE Account Info Card */}
        {currentAccount && (
          <Card className="p-3 sm:p-4 bg-gradient-to-r from-[#06C755]/10 via-teal-500/10 to-cyan-500/10 border-[#06C755]/20 mb-4 sm:mb-6" variant="glass">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#06C755] to-teal-500 flex items-center justify-center text-white text-lg sm:text-xl md:text-2xl shadow-lg shadow-[#06C755]/30 flex-shrink-0">
                  📱
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base md:text-lg text-white truncate">{currentAccount.accountName}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] md:text-[10px] font-semibold flex-shrink-0",
                      currentAccount.isActive ? "bg-[#06C755]/20 text-[#06C755]" : "bg-white/10 text-slate-400"
                    )}>
                      {currentAccount.isActive ? '🟢 ใช้งาน' : '🔴 ปิด'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400 font-mono truncate mt-0.5 sm:mt-1">ID: {currentAccount.channelId}</p>
                </div>
              </div>
              {otherAccounts.length > 0 && (
                <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#06C755]/20">
                  <span className="text-[8px] sm:text-[9px] text-[#06C755]/70 font-semibold">เปลี่ยนบัญชี</span>
                  <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
                    {otherAccounts.slice(0, 3).map(acc => (
                      <Button
                        key={acc._id}
                        variant="ghost"
                        size="xs"
                        className="text-[9px] sm:text-[10px] bg-white/[0.03] hover:bg-white/10 border border-white/10 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 h-auto font-semibold text-white"
                        onClick={() => router.push(`/user/templates?accountId=${acc._id}`)}
                      >
                        📱 {acc.accountName}
                      </Button>
                    ))}
                    {otherAccounts.length > 3 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[9px] sm:text-[10px] bg-white/[0.03] hover:bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 h-auto font-semibold text-white"
                        onClick={() => router.push('/user/line-accounts')}
                      >
                        +{otherAccounts.length - 3}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Template Selection Summary */}
        <Card className="p-4 sm:p-6 bg-gradient-to-r from-white/[0.02] to-white/[0.05] border-white/10 mb-4 sm:mb-6" variant="glass">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <span className="text-lg sm:text-xl">📋</span>
            <div>
              <h3 className="font-bold text-white text-sm sm:text-base">สรุป Template ที่เลือก</h3>
              <p className="text-[9px] sm:text-[10px] text-slate-400">Template ที่ใช้สำหรับแต่ละประเภทการตอบกลับ</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            {TYPE_OPTIONS.map((typeOption) => {
              const templateName = getSelectedTemplateName(typeOption.value as SlipTemplate['type']);
              return (
                <div
                  key={typeOption.value}
                  className={cn(
                    "p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/10 transition-all bg-white/[0.02] hover:bg-white/[0.05]",
                    typeOption.value === 'success' && 'border-[#06C755]/20',
                    typeOption.value === 'duplicate' && 'border-amber-500/20',
                    typeOption.value === 'error' && 'border-rose-500/20',
                    typeOption.value === 'not_found' && 'border-slate-500/20'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <span className="text-base sm:text-lg">{typeOption.icon}</span>
                    <span className={cn("font-semibold text-[9px] sm:text-[10px]", 
                      typeOption.value === 'success' ? 'text-[#06C755]' :
                      typeOption.value === 'duplicate' ? 'text-amber-400' :
                      typeOption.value === 'error' ? 'text-rose-400' :
                      'text-slate-400'
                    )}>{typeOption.label}</span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-white truncate font-semibold">
                    {templateName}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Templates by Type */}
        {TYPE_OPTIONS.map((typeOption) => {
          const typeTemplates = templatesByType[typeOption.value] || [];
          if (typeTemplates.length === 0) return null;

          const selectedId = selectedTemplateIds[typeOption.value as SlipTemplate['type']];

          return (
            <div key={typeOption.value} className="space-y-4">
              {/* Type Header */}
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl flex-shrink-0",
                  typeOption.value === 'success' ? 'bg-[#06C755]/10' :
                  typeOption.value === 'duplicate' ? 'bg-amber-500/10' :
                  typeOption.value === 'error' ? 'bg-rose-500/10' :
                  'bg-slate-500/10'
                )}>
                  {typeOption.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-white">{typeOption.label}</h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    {typeTemplates.length} เทมเพลต •
                    {selectedId ? ' มีเทมเพลตที่เลือก' : ' ใช้ค่าเริ่มต้น'}
                  </p>
                </div>
                <div className="hidden sm:flex flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-4" />
              </div>

              {/* Templates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                {typeTemplates.map((template) => {
                  const isSelected = selectedId === template._id || (!selectedId && template.isDefault);
                  const typeInfo = getTypeInfo(template.type);

                  return (
                    <Card
                      key={template._id}
                      className={cn(
                        "p-0 overflow-hidden transition-all duration-300 hover:shadow-lg rounded-xl sm:rounded-2xl border border-white/5",
                        isSelected
                          ? "ring-2 sm:ring-4 ring-[#06C755]/30 shadow-lg shadow-[#06C755]/10"
                          : "hover:border-white/10",
                        template.isGlobal && "border-purple-500/30"
                      )}
                      variant="glass"
                    >
                      {/* Color Bar */}
                      <div
                        className="h-1 sm:h-2 w-full"
                        style={{ backgroundColor: template.primaryColor || '#06C755' }}
                      />

                      {/* Preview */}
                      <div className="p-4 sm:p-6 bg-gradient-to-b from-white/[0.02] to-white/[0.05] flex justify-center">
                        <div className="transform scale-[0.85] sm:scale-[0.9] origin-top hover:scale-100 transition-transform duration-500">
                          <MiniSlipPreview template={template} />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4 sm:p-5 border-t border-white/5 space-y-3 sm:space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                              {template.isGlobal && (
                                <span className="text-[8px] sm:text-[9px] font-semibold px-1.5 sm:px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-lg">
                                  🌐 ส่วนกลาง
                                </span>
                              )}
                            </div>
                            <h3 className="font-black text-white text-xs sm:text-sm truncate">{template.name}</h3>
                            {template.description && (
                              <p className="text-[9px] sm:text-[10px] text-slate-400 truncate mt-0.5 font-semibold">{template.description}</p>
                            )}
                          </div>
                          {isSelected && (
                            <Badge variant="success" size="sm" className="flex-shrink-0 text-[8px] sm:text-[9px] px-2 py-1">
                              ✓ ใช้งาน
                            </Badge>
                          )}
                        </div>

                        {/* Features */}
                        <div className="flex flex-wrap gap-1 sm:gap-1.5">
                          {template.showAmount && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-[#06C755]/10 text-[#06C755] rounded-lg font-semibold border border-[#06C755]/20">จำนวนเงิน</span>}
                          {template.showSender && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-500/10 text-blue-400 rounded-lg font-semibold border border-blue-500/20">ผู้โอน</span>}
                          {template.showReceiver && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-500/10 text-purple-400 rounded-lg font-semibold border border-purple-500/20">ผู้รับ</span>}
                          {template.showDate && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-orange-500/10 text-orange-400 rounded-lg font-semibold border border-orange-500/20">วันที่</span>}
                          {template.showTime && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-pink-500/10 text-pink-400 rounded-lg font-semibold border border-pink-500/20">เวลา</span>}
                          {template.showTransRef && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-500/10 text-slate-400 rounded-lg font-semibold border border-slate-500/20">อ้างอิง</span>}
                          {template.showBankLogo && <span className="text-[7px] sm:text-[8px] px-1.5 sm:px-2 py-0.5 sm:py-1 bg-indigo-500/10 text-indigo-400 rounded-lg font-semibold border border-indigo-500/20">โลโก้</span>}
                        </div>

                        {/* Action */}
                        <div className="pt-2">
                          {isSelected && accountId ? (
                            <div className="flex items-center justify-center gap-2 py-2 sm:py-3 px-3 sm:px-4 bg-[#06C755]/10 text-[#06C755] rounded-lg sm:rounded-xl border border-[#06C755]/20">
                              <span className="text-sm">✓</span>
                              <span className="text-[9px] sm:text-[10px] font-semibold">Template ที่ใช้งาน</span>
                            </div>
                          ) : !accountId ? (
                            <div className="flex items-center justify-center gap-2 py-2 sm:py-3 px-3 sm:px-4 bg-slate-500/10 text-slate-400 rounded-lg sm:rounded-xl border border-slate-500/20">
                              <span className="text-sm">👁️</span>
                              <span className="text-[9px] sm:text-[10px] font-semibold">ตัวอย่าง</span>
                            </div>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              fullWidth
                              onClick={() => handleSetDefault(template)}
                              isLoading={updatingType === template.type}
                              className="shadow-sm rounded-lg sm:rounded-xl font-semibold text-[9px] sm:text-[10px] h-9 sm:h-10 bg-[#06C755] hover:bg-[#05B048] transition-all"
                            >
                              🎯 เลือกใช้ Template นี้
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
        {templates.length === 0 && (
          <Card className="p-12">
            <EmptyState
              icon={
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center text-4xl">
                  🎨
                </div>
              }
              title="ยังไม่มี Template"
              description="กรุณาติดต่อผู้ดูแลระบบเพื่อสร้าง Template สำหรับใช้งาน"
            />
          </Card>
        )}

        {/* Info Card */}
        <Card className="p-4 sm:p-5 lg:p-6 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-blue-500/20 mt-4 sm:mt-6" variant="glass">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-xl sm:text-2xl flex-shrink-0 shadow-lg shadow-blue-500/30">
              💡
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-white text-sm sm:text-base mb-2 sm:mb-3">วิธีใช้งาน Template</h4>
              <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-[#06C755] font-bold text-sm">✅</span>
                    <p className="text-xs sm:text-sm text-slate-300">เลือก Template สำหรับแต่ละประเภทการตอบกลับ (สำเร็จ, ซ้ำ, ผิดพลาด, ไม่พบ)</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400 font-bold text-sm">🌐</span>
                    <p className="text-xs sm:text-sm text-slate-300">Template ส่วนกลาง สร้างโดยผู้ดูแลระบบ สามารถใช้ได้ทันที</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold text-sm">⚡</span>
                    <p className="text-xs sm:text-sm text-slate-300">หากไม่เลือก จะใช้ Template ค่าเริ่มต้นอัตโนมัติ</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold text-sm">📱</span>
                    <p className="text-xs sm:text-sm text-slate-300">แต่ละบัญชี LINE สามารถตั้งค่า Template แยกกันได้อิสระ</p>
                  </div>
                </div>
              </div>
              {otherAccounts.length > 0 && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 font-semibold">🔗 ตั้งค่าบัญชี LINE อื่น:</span>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {otherAccounts.slice(0, 5).map(acc => (
                        <Button
                          key={acc._id}
                          variant="ghost"
                          size="xs"
                          className="text-[10px] sm:text-[11px] bg-white/[0.03] hover:bg-white/10 border border-white/10 text-white"
                          onClick={() => router.push(`/user/templates?accountId=${acc._id}`)}
                        >
                          {acc.accountName}
                        </Button>
                      ))}
                      {otherAccounts.length > 5 && (
                        <span className="text-[9px] sm:text-[10px] text-slate-400">+{otherAccounts.length - 5} อื่นๆ</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
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
