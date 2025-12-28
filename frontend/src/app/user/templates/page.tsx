'use client';

import { useState, useEffect, useCallback, Suspense, useMemo, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, lineAccountsApi } from '@/lib/api';
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

  const fetchTemplates = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    try {
      // Fetch templates
      const response = await api.get(`/line-accounts/${accountId}/slip-templates`);
      if (response.data.success) {
        setTemplates(response.data.templates || []);
      }

      // Fetch current account info
      const accountRes = await lineAccountsApi.getById(accountId);
      const ids = accountRes.data?.account?.settings?.slipTemplateIds || {};
      setSelectedTemplateIds(ids);
      setCurrentAccount(accountRes.data?.account || null);

      // Fetch all accounts for navigation
      const allAccountsRes = await lineAccountsApi.getMyAccounts();
      setAllAccounts(allAccountsRes.data?.accounts || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลด Templates ได้');
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
    } catch (err: any) {
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

  if (!accountId) {
    return (
      <DashboardLayout>
        <Card className="p-12">
          <EmptyState
            icon={
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl">
                🎨
              </div>
            }
            title="ไม่พบ Account ID"
            description="กรุณาเลือกบัญชี LINE จากหน้า LINE Accounts"
            action={
              <Button variant="primary" onClick={() => router.push('/user/line-accounts')}>
                ไปหน้า LINE Accounts
              </Button>
            }
          />
        </Card>
      </DashboardLayout>
    );
  }

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
              <h1 className="text-base md:text-xl lg:text-2xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
                🎨 Template Gallery
              </h1>
              <p className="text-slate-500 text-[10px] md:text-sm mt-0.5 font-bold uppercase tracking-wider">Configure your verification response interface</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="indigo" className="text-[10px] md:text-xs">
              🌐 {globalTemplates.length} ส่วนกลาง
            </Badge>
            {accountTemplates.length > 0 && (
              <Badge variant="emerald" className="text-[10px] md:text-xs">
                📁 {accountTemplates.length} ของบัญชี
              </Badge>
            )}
          </div>
        </div>

        {/* Current LINE Account Info Card */}
        {currentAccount && (
          <Card className="p-3 md:p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xl md:text-2xl shadow-lg shadow-emerald-500/30 flex-shrink-0">
                  📱
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base md:text-lg text-slate-900 truncate">{currentAccount.accountName}</h3>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold flex-shrink-0",
                      currentAccount.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {currentAccount.isActive ? '🟢 ใช้งาน' : '🔴 ปิด'}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-slate-500 font-mono truncate">ID: {currentAccount.channelId}</p>
                </div>
              </div>
              {otherAccounts.length > 0 && (
                <div className="flex flex-col items-start sm:items-end gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-emerald-100/50">
                  <span className="text-[9px] text-emerald-600/60 uppercase font-black tracking-widest">Switch Channel</span>
                  <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
                    {otherAccounts.slice(0, 3).map(acc => (
                      <Button
                        key={acc._id}
                        variant="ghost"
                        size="xs"
                        className="text-[10px] bg-white/80 hover:bg-white border border-emerald-100/50 rounded-lg px-3 py-1.5 h-auto font-bold shadow-sm"
                        onClick={() => router.push(`/user/templates?accountId=${acc._id}`)}
                      >
                        📱 {acc.accountName}
                      </Button>
                    ))}
                    {otherAccounts.length > 3 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[10px] bg-white/80 hover:bg-white border border-emerald-100/50 rounded-lg px-2 py-1.5 h-auto font-bold"
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
        <Card className="p-4 bg-gradient-to-r from-slate-50 to-white border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">📋</span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">สรุป Template ที่เลือก</h3>
              <p className="text-[10px] text-slate-400">Template ที่ใช้สำหรับแต่ละประเภทการตอบกลับ</p>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {TYPE_OPTIONS.map((typeOption) => {
              const templateName = getSelectedTemplateName(typeOption.value as SlipTemplate['type']);
              return (
                <div
                  key={typeOption.value}
                  className={cn(
                    "p-3 sm:p-4 rounded-2xl border-2 transition-all shadow-premium-sm",
                    typeOption.bgColor, typeOption.borderColor
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base sm:text-lg">{typeOption.icon}</span>
                    <span className={cn("font-black text-[10px] uppercase tracking-wider", typeOption.textColor)}>{typeOption.label}</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-900 truncate font-black uppercase tracking-tight">
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
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-premium-sm",
                  typeOption.bgColor
                )}>
                  {typeOption.icon}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{typeOption.label}</h2>
                  <p className="text-sm text-slate-400">
                    {typeTemplates.length} เทมเพลต •
                    {selectedId ? ' มีเทมเพลตที่เลือก' : ' ใช้ค่าเริ่มต้น'}
                  </p>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
              </div>

              {/* Templates Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                {typeTemplates.map((template) => {
                  const isSelected = selectedId === template._id || (!selectedId && template.isDefault);
                  const typeInfo = getTypeInfo(template.type);

                  return (
                    <Card
                      key={template._id}
                      className={cn(
                        "p-0 overflow-hidden transition-all duration-300 hover:shadow-lg rounded-[2.5rem]",
                        isSelected
                          ? "ring-4 ring-emerald-500/30 shadow-lg shadow-emerald-500/10"
                          : "hover:border-slate-300",
                        template.isGlobal && "border-purple-200/50"
                      )}
                    >
                      {/* Color Bar */}
                      <div
                        className="h-2 w-full"
                        style={{ backgroundColor: template.primaryColor || '#10b981' }}
                      />

                      {/* Preview */}
                      <div className="p-6 bg-gradient-to-b from-slate-50/50 to-white flex justify-center">
                        <div className="transform scale-[0.9] origin-top hover:scale-100 transition-transform duration-500">
                          <MiniSlipPreview template={template} />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-5 border-t border-slate-100 space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              {template.isGlobal && (
                                <span className="text-[9px] font-black px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg uppercase tracking-wider">
                                  🌐 ส่วนกลาง
                                </span>
                              )}
                            </div>
                            <h3 className="font-black text-slate-900 text-sm truncate uppercase tracking-tight">{template.name}</h3>
                            {template.description && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5 font-bold">{template.description}</p>
                            )}
                          </div>
                          {isSelected && (
                            <Badge variant="success" size="sm" className="flex-shrink-0 animate-pulse">
                              ✓ ใช้งาน
                            </Badge>
                          )}
                        </div>

                        {/* Features */}
                        <div className="flex flex-wrap gap-1.5">
                          {template.showAmount && <span className="text-[8px] px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-black uppercase tracking-wider border border-emerald-100">Amount</span>}
                          {template.showSender && <span className="text-[8px] px-2 py-1 bg-blue-50 text-blue-600 rounded-lg font-black uppercase tracking-wider border border-blue-100">Sender</span>}
                          {template.showReceiver && <span className="text-[8px] px-2 py-1 bg-purple-50 text-purple-600 rounded-lg font-black uppercase tracking-wider border border-purple-100">Receiver</span>}
                          {template.showDate && <span className="text-[8px] px-2 py-1 bg-orange-50 text-orange-600 rounded-lg font-black uppercase tracking-wider border border-orange-100">Date</span>}
                          {template.showTime && <span className="text-[8px] px-2 py-1 bg-pink-50 text-pink-600 rounded-lg font-black uppercase tracking-wider border border-pink-100">Time</span>}
                          {template.showTransRef && <span className="text-[8px] px-2 py-1 bg-slate-100 text-slate-600 rounded-lg font-black uppercase tracking-wider border border-slate-200">Ref</span>}
                          {template.showBankLogo && <span className="text-[8px] px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-black uppercase tracking-wider border border-indigo-100">Logo</span>}
                        </div>

                        {/* Action */}
                        <div className="pt-2">
                          {isSelected ? (
                            <div className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                              <span className="text-sm">✓</span>
                              <span className="text-[10px] font-black uppercase tracking-widest">Active Template</span>
                            </div>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              fullWidth
                              onClick={() => handleSetDefault(template)}
                              isLoading={updatingType === template.type}
                              className="shadow-sm rounded-xl font-black uppercase tracking-widest text-[10px] h-10"
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
        <Card className="p-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-blue-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-2xl flex-shrink-0 shadow-lg shadow-blue-500/30">
              💡
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-blue-900 text-base mb-2">วิธีใช้งาน Template</h4>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-500 font-bold">✅</span>
                    <p className="text-xs text-blue-800">เลือก Template สำหรับแต่ละประเภทการตอบกลับ (สำเร็จ, ซ้ำ, ผิดพลาด, ไม่พบ)</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-500 font-bold">🌐</span>
                    <p className="text-xs text-blue-800">Template ส่วนกลาง สร้างโดยผู้ดูแลระบบ สามารถใช้ได้ทันที</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold">⚡</span>
                    <p className="text-xs text-blue-800">หากไม่เลือก จะใช้ Template ค่าเริ่มต้นอัตโนมัติ</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">📱</span>
                    <p className="text-xs text-blue-800">แต่ละบัญชี LINE สามารถตั้งค่า Template แยกกันได้อิสระ</p>
                  </div>
                </div>
              </div>
              {otherAccounts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-blue-700 font-bold">🔗 ตั้งค่าบัญชี LINE อื่น:</span>
                    {otherAccounts.slice(0, 5).map(acc => (
                      <Button
                        key={acc._id}
                        variant="ghost"
                        size="xs"
                        className="text-[11px] bg-white/60 hover:bg-white border border-blue-200 text-blue-700"
                        onClick={() => router.push(`/user/templates?accountId=${acc._id}`)}
                      >
                        {acc.accountName}
                      </Button>
                    ))}
                    {otherAccounts.length > 5 && (
                      <span className="text-[10px] text-blue-500">+{otherAccounts.length - 5} อื่นๆ</span>
                    )}
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
