'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, banksApi } from '@/lib/api';
import { Bank } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

interface SlipTemplate {
  _id: string;
  name: string;
  description?: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault: boolean;
  isActive: boolean;
  isGlobal: boolean;
  isSystemTemplate: boolean;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  footerLink?: string;
  footerLinkText?: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  showBankLogo: boolean;
  showCountryCode: boolean;
  showFee: boolean;
  showRefs: boolean;
  showPayload: boolean;
  showSenderBankId: boolean;
  showReceiverBankId: boolean;
  showReceiverProxy: boolean;
  showDelayWarning: boolean;
  delayWarningMinutes: number;
  showSenderAccount: boolean;
  showReceiverAccount: boolean;
  showSenderNameEn: boolean;
  showReceiverNameEn: boolean;
  showLocalAmount: boolean;
  bankId?: string;
  senderBankId?: string;
  receiverBankId?: string;
  // Preview sample data
  previewSenderName?: string;
  previewReceiverName?: string;
  previewSenderBankId?: string;
  previewReceiverBankId?: string;
  previewAmount?: string;
  previewSenderAccount?: string;
  previewReceiverAccount?: string;
  createdAt: string;
}

interface FormData {
  name: string;
  description: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  primaryColor: string;
  headerText: string;
  footerText: string;
  footerLink: string;
  footerLinkText: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  showBankLogo: boolean;
  showCountryCode: boolean;
  showFee: boolean;
  showRefs: boolean;
  showPayload: boolean;
  showSenderBankId: boolean;
  showReceiverBankId: boolean;
  showReceiverProxy: boolean;
  showDelayWarning: boolean;
  delayWarningMinutes: number;
  showSenderAccount: boolean;
  showReceiverAccount: boolean;
  showSenderNameEn: boolean;
  showReceiverNameEn: boolean;
  showLocalAmount: boolean;
  bankId: string;
  senderBankId: string;
  receiverBankId: string;
  // Preview sample data
  previewSenderName: string;
  previewReceiverName: string;
  previewAmount: string;
  previewSenderAccount: string;
  previewReceiverAccount: string;
}

interface FormErrors {
  name?: string;
  type?: string;
}

// Thai localized type options
const TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', color: 'emerald', icon: '✅', bgColor: 'bg-emerald-100', textColor: 'text-emerald-600' },
  { value: 'duplicate', label: 'สลิปซ้ำ', color: 'amber', icon: '⚠️', bgColor: 'bg-amber-100', textColor: 'text-amber-600' },
  { value: 'error', label: 'เกิดข้อผิดพลาด', color: 'rose', icon: '❌', bgColor: 'bg-rose-100', textColor: 'text-rose-600' },
  { value: 'not_found', label: 'ไม่พบข้อมูล', color: 'slate', icon: '🔍', bgColor: 'bg-slate-100', textColor: 'text-slate-600' },
] as const;

const DEFAULT_FORM_DATA: FormData = {
  name: '',
  description: '',
  type: 'success',
  primaryColor: '#10b981',
  headerText: '',
  footerText: '',
  footerLink: '',
  footerLinkText: '',
  showAmount: true,
  showSender: true,
  showReceiver: true,
  showDate: true,
  showTime: true,
  showTransRef: true,
  showBankLogo: true,
  showCountryCode: false,
  showFee: false,
  showRefs: false,
  showPayload: false,
  showSenderBankId: false,
  showReceiverBankId: false,
  showReceiverProxy: false,
  showDelayWarning: false,
  delayWarningMinutes: 5,
  showSenderAccount: false,
  showReceiverAccount: false,
  showSenderNameEn: false,
  showReceiverNameEn: false,
  showLocalAmount: false,
  bankId: '',
  senderBankId: '',
  receiverBankId: '',
  // Preview sample data
  previewSenderName: 'นาย ธันเดอร์ มานะ',
  previewReceiverName: 'นาย ธันเดอร์ มานะ',
  previewAmount: '1,000.00',
  previewSenderAccount: '1234xxxx5678',
  previewReceiverAccount: '12xxxx3456',
};

// Sample data for preview (Thai)
const SAMPLE_DATA = {
  amount: '฿1,000.00',
  fee: '฿0',
  date: '24 ธ.ค. 2568',
  time: '09:41',
  countryCode: 'TH',
  transRef: '68370160657749I376388B35',
  ref1: 'REF001',
  ref2: 'REF002',
  ref3: '',
  sender: {
    name: 'นาย ธันเดอร์ มานะ',
    nameEn: 'MR. THUNDER MANA',
    account: '1234xxxx5678',
    bankId: '004',
    bankName: 'กสิกรไทย',
    bankShort: 'KBANK'
  },
  receiver: {
    name: 'นาย ธันเดอร์ มานะ',
    nameEn: 'MR. THUNDER MANA',
    account: '12xxxx3456',
    bankId: '030',
    bankName: 'ธนาคารออมสิน',
    bankShort: 'GSB',
    proxyType: 'EWALLETID',
    proxyAccount: '123xxxxxxxx4567'
  },
};

// Responsive Toggle Switch Component
const Toggle = memo(({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) => (
  <button
    type="button"
    onClick={onChange}
    className={cn(
      "flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border transition-all w-full text-left group min-h-[48px]",
      checked
        ? "border-emerald-200 bg-emerald-50/50"
        : "border-slate-200 bg-white hover:border-slate-300"
    )}
  >
    <div className="flex-1 min-w-0">
      <span className={cn(
        "text-xs sm:text-sm font-medium transition-colors block leading-tight",
        checked ? "text-emerald-700" : "text-slate-600 group-hover:text-slate-800"
      )}>
        {label}
      </span>
      {description && (
        <span className="text-[10px] sm:text-xs text-slate-400 mt-0.5 block leading-tight">{description}</span>
      )}
    </div>
    <div className={cn(
      "w-10 sm:w-11 h-5 sm:h-6 rounded-full relative transition-all duration-200 flex-shrink-0",
      checked ? "bg-emerald-500" : "bg-slate-300"
    )}>
      <div className={cn(
        "absolute top-0.5 sm:top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
        checked ? "left-5 sm:left-6" : "left-0.5 sm:left-1"
      )} />
    </div>
  </button>
));
Toggle.displayName = 'Toggle';

// Responsive Bank Selection Button
const BankButton = memo(({
  bank,
  isSelected,
  onClick,
}: {
  bank: Bank;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const logo = bank.logoBase64 || bank.logoUrl;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center p-1.5 sm:p-2 md:p-3 rounded-lg sm:rounded-xl border-2 transition-all group relative min-w-0",
        isSelected
          ? "border-emerald-500 bg-emerald-50 shadow-md"
          : "border-transparent bg-slate-50 hover:bg-white hover:border-slate-200"
      )}
    >
      <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-sm mb-1 group-hover:scale-105 transition-transform">
        {logo ? (
          <img src={logo} alt={bank.shortName} className="w-6 h-6 sm:w-8 sm:h-8 md:w-9 md:h-9 object-contain" />
        ) : (
          <span className="text-[10px] sm:text-xs font-bold text-slate-400">{(bank.shortName || bank.code)?.substring(0, 2)}</span>
        )}
      </div>
      <span className={cn(
        "text-[8px] sm:text-[10px] font-semibold text-center truncate w-full leading-tight",
        isSelected ? 'text-emerald-700' : 'text-slate-500'
      )}>
        {bank.shortName || bank.code}
      </span>
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-500 rounded-full flex items-center justify-center">
          <span className="text-white text-[8px] sm:text-[10px]">✓</span>
        </div>
      )}
    </button>
  );
});
BankButton.displayName = 'BankButton';

// Responsive Live Preview Component (Thai)
const SlipPreview = memo(({ config, senderBank, receiverBank, compact = false }: {
  config: FormData;
  senderBank: Bank | null;
  receiverBank: Bank | null;
  compact?: boolean;
}) => {
  const isDuplicate = config.type === 'duplicate';
  const isError = config.type === 'error';
  const isNotFound = config.type === 'not_found';
  const mainColor = isDuplicate ? '#f59e0b' : isError ? '#ef4444' : isNotFound ? '#64748b' : config.primaryColor;

  const getStatusIcon = () => {
    if (isDuplicate) return '!';
    if (isError) return '✕';
    if (isNotFound) return '?';
    return '✓';
  };

  const getStatusText = () => {
    if (config.headerText) return config.headerText;
    if (isDuplicate) return 'ตรวจพบสลิปซ้ำในระบบ';
    if (isError) return 'ระบบขัดข้อง กรุณาลองใหม่';
    if (isNotFound) return 'ไม่พบข้อมูลสลิปนี้';
    return 'ตรวจสอบสลิปสำเร็จ';
  };

  const senderLogo = senderBank?.logoBase64 || senderBank?.logoUrl;
  const receiverLogo = receiverBank?.logoBase64 || receiverBank?.logoUrl;

  return (
    <div className={cn(
      "bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-3 sm:p-4 md:p-5 w-full mx-auto shadow-2xl border border-white/10 relative overflow-hidden",
      compact ? "max-w-[260px]" : "max-w-[280px] sm:max-w-[300px]"
    )}>
      {/* Decorative glow */}
      <div
        className="absolute top-0 right-0 w-32 sm:w-40 h-32 sm:h-40 rounded-full blur-[40px] sm:blur-[50px] -mr-16 sm:-mr-20 -mt-16 sm:-mt-20 pointer-events-none opacity-30 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      />

      {/* Status Header */}
      <div
        className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 md:p-4 mb-2 sm:mb-3 flex items-center gap-2 sm:gap-3 border border-white/10 backdrop-blur-sm transition-colors duration-200"
        style={{ backgroundColor: `${mainColor}15` }}
      >
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-white text-xs sm:text-sm font-bold shadow-lg transition-colors duration-200 flex-shrink-0"
          style={{ backgroundColor: mainColor }}
        >
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs sm:text-sm md:text-[15px] font-bold leading-tight transition-colors duration-200 truncate"
            style={{ color: mainColor }}
          >
            {getStatusText()}
          </p>
          <p className="text-[8px] sm:text-[9px] text-white/40 font-medium mt-0.5">ยืนยันการทำรายการแล้ว</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 space-y-2 sm:space-y-3 shadow-inner relative z-10">
        {/* Amount Section */}
        {config.showAmount && (
          <div className="text-center py-1.5 sm:py-2 border-b border-slate-100">
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium mb-0.5 sm:mb-1">จำนวนเงิน</p>
            <p
              className="text-xl sm:text-2xl md:text-3xl font-bold transition-colors duration-200"
              style={{ color: mainColor }}
            >
              ฿{config.previewAmount || SAMPLE_DATA.amount}
            </p>
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
              {config.showDate && (
                <p className="text-[9px] sm:text-[10px] text-slate-400">{SAMPLE_DATA.date}</p>
              )}
              {config.showDate && config.showTime && (
                <span className="w-1 h-1 rounded-full bg-slate-300" />
              )}
              {config.showTime && (
                <p className="text-[9px] sm:text-[10px] text-slate-400">{SAMPLE_DATA.time}</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {/* Sender */}
          {config.showSender && (
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl">
              {config.showBankLogo && (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {senderLogo ? (
                    <img src={senderLogo} alt="Bank" className="w-5 h-5 sm:w-7 sm:h-7 object-contain" />
                  ) : (
                    <span className="text-sm sm:text-base">👤</span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[8px] sm:text-[9px] text-slate-400 font-medium mb-0.5">ผู้โอน</p>
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-800 truncate">
                  {config.previewSenderName || SAMPLE_DATA.sender.name}
                </p>
                {config.showSenderAccount && (
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono">
                    {config.previewSenderAccount || SAMPLE_DATA.sender.account}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Arrow Divider */}
          {config.showSender && config.showReceiver && (
            <div className="flex justify-center -my-0.5 sm:-my-1 relative z-10">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center shadow-sm">
                <span className="text-slate-400 text-[10px] sm:text-xs">↓</span>
              </div>
            </div>
          )}

          {/* Receiver */}
          {config.showReceiver && (
            <div
              className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl transition-colors duration-200"
              style={{ backgroundColor: `${mainColor}08` }}
            >
              {config.showBankLogo && (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {receiverLogo ? (
                    <img src={receiverLogo} alt="Bank" className="w-5 h-5 sm:w-7 sm:h-7 object-contain" />
                  ) : (
                    <span className="text-sm sm:text-base">🏦</span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[8px] sm:text-[9px] font-medium mb-0.5 transition-colors duration-200"
                  style={{ color: mainColor }}
                >
                  ผู้รับ
                </p>
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-800 truncate">
                  {config.previewReceiverName || SAMPLE_DATA.receiver.name}
                </p>
                {config.showReceiverAccount && (
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono">
                    {config.previewReceiverAccount || SAMPLE_DATA.receiver.account}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Transaction Details */}
        {(config.showTransRef || config.showFee || config.showRefs) && (
          <div className="pt-2 sm:pt-3 border-t border-dashed border-slate-200 space-y-1 sm:space-y-1.5">
            {config.showTransRef && (
              <div className="flex justify-between items-center text-[9px] sm:text-[10px]">
                <span className="text-slate-400">เลขอ้างอิง</span>
                <span className="text-slate-700 font-mono font-medium truncate ml-2">
                  {SAMPLE_DATA.transRef.slice(0, 8)}...
                </span>
              </div>
            )}
            {config.showFee && (
              <div className="flex justify-between items-center text-[9px] sm:text-[10px]">
                <span className="text-slate-400">ค่าธรรมเนียม</span>
                <span className="text-emerald-600 font-medium">ฟรี</span>
              </div>
            )}
            {config.showRefs && SAMPLE_DATA.ref1 && (
              <div className="flex justify-between items-center text-[9px] sm:text-[10px]">
                <span className="text-slate-400">อ้างอิงเพิ่มเติม</span>
                <span className="text-slate-700 font-mono">{SAMPLE_DATA.ref1}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer Text */}
        {config.footerText && (
          <div className="pt-2 sm:pt-3 border-t border-slate-100">
            <p className="text-[8px] sm:text-[9px] text-slate-400 text-center leading-tight">{config.footerText}</p>
          </div>
        )}
      </div>

      {/* Bottom Branding */}
      <div className="mt-3 sm:mt-4 flex justify-center">
        <p className="text-[8px] sm:text-[9px] text-white/20 font-medium">LINE OA System</p>
      </div>
    </div>
  );
});
SlipPreview.displayName = 'SlipPreview';

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SlipTemplate | null>(null);
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'display' | 'banks'>('basic');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, banksRes] = await Promise.all([
        api.get('/slip-templates/global'),
        banksApi.getAll()
      ]);
      setTemplates(templatesRes.data.templates || []);
      setBanks(banksRes.data.banks || []);
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeBanks = useMemo(() => banks.filter(b => b.isActive), [banks]);

  const senderBank = useMemo(() => {
    if (formData.senderBankId) {
      return banks.find(b => b._id === formData.senderBankId) || null;
    }
    return activeBanks[0] || null;
  }, [banks, formData.senderBankId, activeBanks]);

  const receiverBank = useMemo(() => {
    if (formData.receiverBankId) {
      return banks.find(b => b._id === formData.receiverBankId) || null;
    }
    return activeBanks[1] || activeBanks[0] || null;
  }, [banks, formData.receiverBankId, activeBanks]);

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.name.trim()) {
      errors.name = 'กรุณากรอกชื่อเทมเพลต';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreateModal = () => {
    setSelectedTemplate(null);
    setFormData(DEFAULT_FORM_DATA);
    setFormErrors({});
    setActiveTab('basic');
    setShowModal(true);
  };

  const openEditModal = (template: SlipTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      type: template.type,
      primaryColor: template.primaryColor || '#10b981',
      headerText: template.headerText || '',
      footerText: template.footerText || '',
      footerLink: template.footerLink || '',
      footerLinkText: template.footerLinkText || '',
      showAmount: template.showAmount,
      showSender: template.showSender,
      showReceiver: template.showReceiver,
      showDate: template.showDate,
      showTime: template.showTime,
      showTransRef: template.showTransRef,
      showBankLogo: template.showBankLogo,
      showCountryCode: template.showCountryCode ?? false,
      showFee: template.showFee ?? false,
      showRefs: template.showRefs ?? false,
      showPayload: template.showPayload ?? false,
      showSenderBankId: template.showSenderBankId ?? false,
      showReceiverBankId: template.showReceiverBankId ?? false,
      showReceiverProxy: template.showReceiverProxy ?? false,
      showDelayWarning: template.showDelayWarning,
      delayWarningMinutes: template.delayWarningMinutes || 5,
      showSenderAccount: template.showSenderAccount ?? false,
      showReceiverAccount: template.showReceiverAccount ?? false,
      showSenderNameEn: template.showSenderNameEn ?? false,
      showReceiverNameEn: template.showReceiverNameEn ?? false,
      showLocalAmount: template.showLocalAmount ?? false,
      bankId: template.bankId || '',
      senderBankId: template.senderBankId || '',
      receiverBankId: template.receiverBankId || '',
      // Preview sample data
      previewSenderName: template.previewSenderName || 'นาย ธันเดอร์ มานะ',
      previewReceiverName: template.previewReceiverName || 'นาย ธันเดอร์ มานะ',
      previewAmount: template.previewAmount || '1,000.00',
      previewSenderAccount: template.previewSenderAccount || '1234xxxx5678',
      previewReceiverAccount: template.previewReceiverAccount || '12xxxx3456',
    });
    setFormErrors({});
    setActiveTab('basic');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    setIsProcessing(true);
    try {
      if (selectedTemplate) {
        await api.put(`/slip-templates/global/${selectedTemplate._id}`, formData);
        toast.success('อัปเดตเทมเพลตสำเร็จ');
      } else {
        await api.post('/slip-templates/global', formData);
        toast.success('สร้างเทมเพลตสำเร็จ');
      }
      setShowModal(false);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    setIsProcessing(true);
    try {
      await api.delete(`/slip-templates/global/${selectedTemplate._id}`);
      toast.success('ลบเทมเพลตสำเร็จ');
      setShowDeleteConfirm(false);
      setSelectedTemplate(null);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถลบได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.put(`/slip-templates/global/${id}/default`);
      toast.success('ตั้งเป็นค่าเริ่มต้นสำเร็จ');
      fetchData();
    } catch (err) {
      toast.error('ไม่สามารถตั้งเป็นค่าเริ่มต้นได้');
    }
  };

  const handleInitDefaults = async () => {
    setIsProcessing(true);
    try {
      await api.post('/slip-templates/global/init-defaults');
      toast.success('สร้างเทมเพลตเริ่มต้นสำเร็จ');
      fetchData();
    } catch (err) {
      toast.error('ไม่สามารถสร้างเทมเพลตเริ่มต้นได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateField = (field: keyof FormData, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (formErrors[field as keyof FormErrors]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const templatesByType = useMemo(() => templates.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, SlipTemplate[]>), [templates]);

  if (loading) {
    return <DashboardLayout requiredRole="admin"><PageLoading message="กำลังโหลด..." /></DashboardLayout>;
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto pb-10 animate-fade">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-slate-500 text-sm mb-1">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              สตูดิโอ<span className="text-[#06C755]">เทมเพลต</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">ออกแบบและจัดการเทมเพลตการตอบกลับสลิป</p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleInitDefaults}
              isLoading={isProcessing}
              className="flex-1 sm:flex-none"
            >
              รีเซ็ตค่าเริ่มต้น
            </Button>
            <Button
              variant="primary"
              onClick={openCreateModal}
              className="flex-1 sm:flex-none"
            >
              + สร้างเทมเพลตใหม่
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard title="ทั้งหมด" value={templates.length} icon="🎨" color="indigo" variant="glass" />
          <StatCard title="สำเร็จ" value={templates.filter(t => t.type === 'success').length} icon="✅" color="emerald" variant="glass" />
          <StatCard title="ซ้ำ/ผิดพลาด" value={templates.filter(t => t.type === 'duplicate' || t.type === 'error').length} icon="⚠️" color="amber" variant="glass" />
          <StatCard title="ค่าเริ่มต้น" value={templates.filter(t => t.isDefault).length} icon="⭐" color="blue" variant="glass" />
        </div>

        {/* Templates List */}
        {templates.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center" variant="glass">
            <div className="text-5xl mb-4 opacity-50">🎨</div>
            <h3 className="text-lg font-bold text-white mb-2">ยังไม่มีเทมเพลต</h3>
            <p className="text-slate-400 mb-6 text-sm">กดปุ่ม "รีเซ็ตค่าเริ่มต้น" เพื่อสร้างเทมเพลตพื้นฐาน</p>
            <Button onClick={handleInitDefaults} variant="primary">
              สร้างเทมเพลตเริ่มต้น
            </Button>
          </Card>
        ) : (
          <div className="space-y-8">
            {TYPE_OPTIONS.map((type) => {
              const list = templatesByType[type.value] || [];
              if (list.length === 0) return null;

              return (
                <div key={type.value} className="space-y-4">
                  {/* Type Header */}
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg", type.bgColor)}>
                      {type.icon}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">{type.label}</h2>
                      <p className="text-xs text-slate-400">{list.length} เทมเพลต</p>
                    </div>
                  </div>

                  {/* Templates Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {list.map((template) => (
                      <Card key={template._id} className="p-5 hover:border-white/20 transition-all" variant="glass">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">{template.name}</h3>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {template.description || 'ไม่มีคำอธิบาย'}
                            </p>
                          </div>
                          {template.isDefault && (
                            <Badge variant="success" size="sm">ค่าเริ่มต้น</Badge>
                          )}
                        </div>

                        {/* Feature Tags */}
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {template.showAmount && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">จำนวนเงิน</span>}
                          {template.showSender && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">ผู้โอน</span>}
                          {template.showReceiver && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">ผู้รับ</span>}
                          {template.showBankLogo && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">โลโก้ธนาคาร</span>}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1"
                            onClick={() => openEditModal(template)}
                          >
                            แก้ไข
                          </Button>
                          {!template.isDefault && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSetDefault(template._id)}
                              >
                                ⭐
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-400 hover:text-rose-300"
                                onClick={() => { setSelectedTemplate(template); setShowDeleteConfirm(true); }}
                              >
                                🗑️
                              </Button>
                            </>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Studio Modal - Fully Responsive */}
      <Modal
        isOpen={showModal}
        onClose={() => !isProcessing && setShowModal(false)}
        title={selectedTemplate ? 'แก้ไขเทมเพลต' : 'สร้างเทมเพลตใหม่'}
        size="fullMobile"
      >
        {/* Main Content - Stacked on mobile, side-by-side on desktop */}
        <div className="flex flex-col xl:flex-row gap-5 sm:gap-6 xl:gap-8">
          {/* Form Section (Top on mobile, Left on desktop) */}
          <div className="flex-1 space-y-4 sm:space-y-5 order-1">
            {/* Responsive Tabs - Scrollable on mobile */}
            <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl min-w-max sm:min-w-0">
                {[
                  { id: 'basic', label: 'การตั้งค่าหลัก', shortLabel: 'ตั้งค่า', icon: '⚙️' },
                  { id: 'display', label: 'เลเยอร์', shortLabel: 'เลเยอร์', icon: '👁️' },
                  { id: 'banks', label: 'ข้อมูลธนาคาร', shortLabel: 'ธนาคาร', icon: '🏦' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "flex-1 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap min-w-[90px] sm:min-w-0",
                      activeTab === tab.id
                        ? "bg-white shadow-sm text-emerald-600"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <span className="mr-1 sm:mr-1.5">{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content - Scrollable */}
            <div className="bg-slate-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 max-h-[40vh] sm:max-h-[45vh] xl:max-h-[55vh] overflow-y-auto">
              {/* Basic Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <Input
                      label="ชื่อเทมเพลต"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="เช่น เทมเพลตมาตรฐาน"
                      error={formErrors.name}
                    />
                    {formErrors.name && (
                      <p className="text-rose-500 text-xs mt-1">{formErrors.name}</p>
                    )}
                  </div>

                  <Select
                    label="สถานะการตอบกลับ"
                    value={formData.type}
                    onChange={(e) => updateField('type', e.target.value)}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.icon} {opt.label}
                      </option>
                    ))}
                  </Select>

                  <Textarea
                    label="รายละเอียด"
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="อธิบายการใช้งานเทมเพลตนี้..."
                    rows={2}
                  />

                  {/* Color Picker - Responsive */}
                  <div className="flex items-center justify-between p-3 sm:p-4 bg-white rounded-lg sm:rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg shadow-inner flex-shrink-0"
                        style={{ backgroundColor: formData.primaryColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-slate-700">สีธีมหลัก</p>
                        <p className="text-[10px] sm:text-xs text-slate-400 truncate">{formData.primaryColor}</p>
                      </div>
                    </div>
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-white shadow cursor-pointer flex-shrink-0"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <Input
                      label="ข้อความหัวเรื่อง"
                      value={formData.headerText}
                      onChange={(e) => updateField('headerText', e.target.value)}
                      placeholder="เช่น ตรวจสอบสำเร็จ"
                    />
                    <Input
                      label="ข้อความท้าย"
                      value={formData.footerText}
                      onChange={(e) => updateField('footerText', e.target.value)}
                      placeholder="เช่น ขอบคุณที่ใช้บริการ"
                    />
                  </div>
                </div>
              )}

              {/* Display Tab - Responsive Grid */}
              {activeTab === 'display' && (
                <div className="space-y-4 sm:space-y-5">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">ข้อมูลการเงิน</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="จำนวนเงิน" checked={formData.showAmount} onChange={() => updateField('showAmount', !formData.showAmount)} />
                      <Toggle label="เลขอ้างอิง" checked={formData.showTransRef} onChange={() => updateField('showTransRef', !formData.showTransRef)} />
                      <Toggle label="วันที่" checked={formData.showDate} onChange={() => updateField('showDate', !formData.showDate)} />
                      <Toggle label="เวลา" checked={formData.showTime} onChange={() => updateField('showTime', !formData.showTime)} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">ข้อมูลผู้โอน</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="แสดงผู้โอน" checked={formData.showSender} onChange={() => updateField('showSender', !formData.showSender)} />
                      <Toggle label="เลขบัญชีผู้โอน" checked={formData.showSenderAccount} onChange={() => updateField('showSenderAccount', !formData.showSenderAccount)} />
                      <Toggle label="ชื่อภาษาอังกฤษ" checked={formData.showSenderNameEn} onChange={() => updateField('showSenderNameEn', !formData.showSenderNameEn)} />
                      <Toggle label="รหัสธนาคาร" checked={formData.showSenderBankId} onChange={() => updateField('showSenderBankId', !formData.showSenderBankId)} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">ข้อมูลผู้รับ</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="แสดงผู้รับ" checked={formData.showReceiver} onChange={() => updateField('showReceiver', !formData.showReceiver)} />
                      <Toggle label="เลขบัญชีผู้รับ" checked={formData.showReceiverAccount} onChange={() => updateField('showReceiverAccount', !formData.showReceiverAccount)} />
                      <Toggle label="รหัสธนาคารผู้รับ" checked={formData.showReceiverBankId} onChange={() => updateField('showReceiverBankId', !formData.showReceiverBankId)} />
                      <Toggle label="พร้อมเพย์" checked={formData.showReceiverProxy} onChange={() => updateField('showReceiverProxy', !formData.showReceiverProxy)} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">องค์ประกอบอื่นๆ</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="โลโก้ธนาคาร" checked={formData.showBankLogo} onChange={() => updateField('showBankLogo', !formData.showBankLogo)} />
                      <Toggle label="ค่าธรรมเนียม" checked={formData.showFee} onChange={() => updateField('showFee', !formData.showFee)} />
                      <Toggle label="อ้างอิงเพิ่มเติม" checked={formData.showRefs} onChange={() => updateField('showRefs', !formData.showRefs)} />
                      <Toggle label="รหัสประเทศ" checked={formData.showCountryCode} onChange={() => updateField('showCountryCode', !formData.showCountryCode)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Banks Tab - Highly Responsive Grid */}
              {activeTab === 'banks' && (
                <div className="space-y-4 sm:space-y-6">
                  {/* Preview Sample Data Section */}
                  <div className="p-3 sm:p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl border border-emerald-100">
                    <p className="text-xs sm:text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <span>🎨</span>
                      ข้อมูลตัวอย่างสำหรับ Preview
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="ชื่อผู้โอน"
                        value={formData.previewSenderName}
                        onChange={(e) => updateField('previewSenderName', e.target.value)}
                        placeholder="นาย ธันเดอร์ มานะ"
                        className="text-sm"
                      />
                      <Input
                        label="เลขบัญชีผู้โอน"
                        value={formData.previewSenderAccount}
                        onChange={(e) => updateField('previewSenderAccount', e.target.value)}
                        placeholder="1234xxxx5678"
                        className="text-sm"
                      />
                      <Input
                        label="เลขบัญชีผู้รับ"
                        value={formData.previewReceiverAccount}
                        onChange={(e) => updateField('previewReceiverAccount', e.target.value)}
                        placeholder="12xxxx3456"
                        className="text-sm"
                      />
                      <Input
                        label="ชื่อผู้รับ"
                        value={formData.previewReceiverName}
                        onChange={(e) => updateField('previewReceiverName', e.target.value)}
                        placeholder="นาย ธันเดอร์ มานะ"
                        className="text-sm"
                      />
                      <Input
                        label="เลขบัญชีผู้โอน"
                        value={formData.previewSenderAccount}
                        onChange={(e) => updateField('previewSenderAccount', e.target.value)}
                        placeholder="1234xxxx5678"
                        className="text-sm"
                      />
                      <Input
                        label="เลขบัญชีผู้รับ"
                        value={formData.previewReceiverAccount}
                        onChange={(e) => updateField('previewReceiverAccount', e.target.value)}
                        placeholder="12xxxx3456"
                        className="text-sm"
                      />
                      <div className="sm:col-span-2">
                        <Input
                          label="จำนวนเงินตัวอย่าง"
                          value={formData.previewAmount}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9,.]/g, '');
                            updateField('previewAmount', value);
                          }}
                          placeholder="1,000.00"
                          className="text-sm"
                          hint="รูปแบบ: 1,000.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sender Bank */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                      <span className="text-sm sm:text-base">👤</span>
                      <span className="text-xs sm:text-sm font-medium text-slate-700">ธนาคารผู้โอน</span>
                      {senderBank && (
                        <Badge variant="success" size="sm" className="text-[10px] sm:text-xs">{senderBank.shortName}</Badge>
                      )}
                    </div>
                    {/* Bank Grid - Auto-wrap with minimum size */}
                    <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => updateField('senderBankId', '')}
                        className={cn(
                          "flex flex-col items-center p-1.5 sm:p-2 rounded-lg border-2 transition-all",
                          !formData.senderBankId
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-transparent bg-slate-50 hover:bg-white"
                        )}
                      >
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white shadow-sm flex items-center justify-center mb-1">
                          <span className="text-sm sm:text-base">🔄</span>
                        </div>
                        <span className="text-[8px] sm:text-[10px] font-medium text-slate-500">อัตโนมัติ</span>
                      </button>
                      {activeBanks.slice(0, 11).map((bank) => (
                        <BankButton
                          key={bank._id}
                          bank={bank}
                          isSelected={formData.senderBankId === bank._id}
                          onClick={() => updateField('senderBankId', bank._id)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Receiver Bank */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                      <span className="text-sm sm:text-base">🏦</span>
                      <span className="text-xs sm:text-sm font-medium text-slate-700">ธนาคารผู้รับ</span>
                      {receiverBank && (
                        <Badge variant="info" size="sm" className="text-[10px] sm:text-xs">{receiverBank.shortName}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => updateField('receiverBankId', '')}
                        className={cn(
                          "flex flex-col items-center p-1.5 sm:p-2 rounded-lg border-2 transition-all",
                          !formData.receiverBankId
                            ? "border-blue-500 bg-blue-50"
                            : "border-transparent bg-slate-50 hover:bg-white"
                        )}
                      >
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white shadow-sm flex items-center justify-center mb-1">
                          <span className="text-sm sm:text-base">🔄</span>
                        </div>
                        <span className="text-[8px] sm:text-[10px] font-medium text-slate-500">อัตโนมัติ</span>
                      </button>
                      {activeBanks.slice(0, 11).map((bank) => (
                        <BankButton
                          key={bank._id}
                          bank={bank}
                          isSelected={formData.receiverBankId === bank._id}
                          onClick={() => updateField('receiverBankId', bank._id)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 bg-blue-50 rounded-lg sm:rounded-xl border border-blue-100">
                    <p className="text-[10px] sm:text-xs text-blue-700 leading-relaxed">
                      💡 <strong>คำแนะนำ:</strong> เลือกธนาคารเพื่อดูตัวอย่าง เมื่อใช้งานจริงระบบจะดึงข้อมูลจากสลิปอัตโนมัติ
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preview Section (Bottom on mobile, Right on desktop) */}
          <div className="xl:w-[340px] 2xl:w-[380px] flex flex-col order-2">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm xl:sticky xl:top-4">
              <div className="text-center mb-4 sm:mb-5">
                <h4 className="text-xs sm:text-sm font-bold text-slate-800">ตัวอย่างการแสดงผล</h4>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">อัปเดตตามการตั้งค่าแบบเรียลไทม์</p>
              </div>

              {/* Preview - Scales down on mobile */}
              <div className="flex justify-center">
                <div className="transform scale-90 sm:scale-100 origin-top">
                  <SlipPreview
                    config={formData}
                    senderBank={senderBank}
                    receiverBank={receiverBank}
                    compact={false}
                  />
                </div>
              </div>

              {/* Desktop Action Buttons */}
              <div className="hidden xl:flex flex-col gap-2 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-100">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleSubmit}
                  isLoading={isProcessing}
                  className="h-11 sm:h-12"
                >
                  {selectedTemplate ? '💾 บันทึกการแก้ไข' : '🚀 สร้างเทมเพลต'}
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => setShowModal(false)}
                  disabled={isProcessing}
                  className="text-slate-500"
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet Sticky Action Buttons */}
        <div className="xl:hidden sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 sm:py-4 bg-white border-t border-slate-200 shadow-lg mt-4 sm:mt-6">
          <div className="flex flex-col gap-2 sm:gap-3 max-w-lg mx-auto">
            <Button
              variant="primary"
              fullWidth
              onClick={handleSubmit}
              isLoading={isProcessing}
              className="h-12 sm:h-14 text-sm sm:text-base font-semibold"
            >
              {selectedTemplate ? '💾 บันทึกการแก้ไข' : '🚀 สร้างเทมเพลต'}
            </Button>
            <Button
              variant="outline"
              fullWidth
              onClick={() => setShowModal(false)}
              disabled={isProcessing}
              className="h-10 sm:h-12 text-sm"
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="ยืนยันการลบ"
        message={`คุณแน่ใจหรือไม่ที่จะลบเทมเพลต "${selectedTemplate?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบเทมเพลต"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
