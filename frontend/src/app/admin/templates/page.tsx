'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, banksApi } from '@/lib/api';
import { Bank } from '@/types';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
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
}

const TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', color: 'emerald', icon: '✅', bgColor: 'bg-emerald-100' },
  { value: 'duplicate', label: 'สลิปซ้ำ', color: 'amber', icon: '⚠️', bgColor: 'bg-amber-100' },
  { value: 'error', label: 'เกิดข้อผิดพลาด', color: 'rose', icon: '❌', bgColor: 'bg-rose-100' },
  { value: 'not_found', label: 'ไม่พบข้อมูล', color: 'slate', icon: '🔍', bgColor: 'bg-slate-100' },
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
};

// Sample data for preview (matching Thunder API format)
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

// Premium Switch Toggle Component
const Toggle = memo(({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <button
    type="button"
    onClick={onChange}
    className={cn(
      "flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border-2 transition-all w-full text-left group",
      checked ? "border-emerald-500/20 bg-emerald-50/50 shadow-premium-sm" : "border-slate-100 bg-white hover:border-slate-200"
    )}
  >
    <span className={cn("text-[11px] font-black uppercase tracking-widest transition-colors", checked ? "text-emerald-700" : "text-slate-400 group-hover:text-slate-600")}>{label}</span>
    <div className={cn(
      "w-10 h-6 rounded-full relative transition-all duration-300",
      checked ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "bg-slate-200"
    )}>
      <div className={cn(
        "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300",
        checked ? "left-5" : "left-1"
      )} />
    </div>
  </button>
));
Toggle.displayName = 'Toggle';

// Bank Logo Selection Component
const BankButton = memo(({
  bank,
  isSelected,
  onClick,
  color = 'emerald'
}: {
  bank: Bank;
  isSelected: boolean;
  onClick: () => void;
  color?: 'emerald' | 'blue';
}) => {
  const logo = bank.logoBase64 || bank.logoUrl;
  const colors = {
    emerald: 'border-emerald-500 bg-emerald-50/80 shadow-emerald-500/10',
    blue: 'border-indigo-500 bg-indigo-50/80 shadow-indigo-500/10',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center p-3 rounded-2xl border-2 transition-all min-w-[70px] group relative overflow-hidden",
        isSelected ? `${colors[color]} shadow-lg -translate-y-1` : "border-transparent bg-slate-50 hover:bg-white hover:border-slate-200"
      )}
    >
      <div className="w-12 h-12 rounded-[1.2rem] flex items-center justify-center overflow-hidden bg-white shadow-premium-sm mb-2 group-hover:scale-110 transition-transform">
        {logo ? (
          <img src={logo} alt={bank.shortName} className="w-9 h-9 object-contain" />
        ) : (
          <span className="text-[10px] font-black text-slate-300">{(bank.shortName || bank.code)?.substring(0, 2)}</span>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-black text-center truncate w-full uppercase tracking-tighter",
        isSelected ? (color === 'emerald' ? 'text-emerald-700' : 'text-indigo-700') : 'text-slate-400'
      )}>
        {bank.shortName || bank.code}
      </span>
      {isSelected && (
        <div className={cn(
          "absolute top-0 right-0 w-4 h-4 p-1 flex items-center justify-center rounded-bl-lg text-[8px] text-white font-black",
          color === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'
        )}>✓</div>
      )}
    </button>
  );
});
BankButton.displayName = 'BankButton';

// Premium Slip Preview Component
const SlipPreview = memo(({ config, senderBank, receiverBank }: {
  config: FormData;
  senderBank: Bank | null;
  receiverBank: Bank | null;
}) => {
  const isDuplicate = config.type === 'duplicate';
  const isError = config.type === 'error';
  const isNotFound = config.type === 'not_found';
  const mainColor = isDuplicate ? '#f59e0b' : isError ? '#ef4444' : isNotFound ? '#64748b' : config.primaryColor;

  const getStatusText = () => {
    if (config.headerText) return config.headerText;
    if (isDuplicate) return 'ตรวจพบสลิปซ้ำในระบบ';
    if (isError) return 'ระบบขัดข้องกรุณาลองใหม่';
    if (isNotFound) return 'ไม่พบข้อมูลสลิปนี้';
    return 'ตรวจสอบสลิปสำเร็จ';
  };

  const senderLogo = senderBank?.logoBase64 || senderBank?.logoUrl;
  const receiverLogo = receiverBank?.logoBase64 || receiverBank?.logoUrl;

  return (
    <div className="bg-slate-900 rounded-[3rem] p-6 max-w-[320px] mx-auto shadow-3xl border border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[60px] -mr-32 -mt-32 pointer-events-none group-hover:bg-emerald-500/20 transition-all duration-1000" />

      {/* Dynamic Header Node */}
      <div className="rounded-[1.5rem] p-4 mb-4 flex items-center gap-4 border border-white/5 bg-white/5 backdrop-blur-md">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-lg" style={{ backgroundColor: mainColor }}>
          {isDuplicate ? '!' : isError ? '✕' : isNotFound ? '?' : '✓'}
        </div>
        <div>
          <p className="text-[14px] font-black leading-none" style={{ color: mainColor }}>{getStatusText()}</p>
          <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-1">Transaction Verified</p>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] p-6 space-y-4 shadow-inner relative z-10">
        {/* Amount Section */}
        {config.showAmount && (
          <div className="text-center py-2 border-b border-slate-50">
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Total Amount</p>
            <p className="text-3xl font-black tracking-tighter" style={{ color: mainColor }}>{SAMPLE_DATA.amount}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              {config.showDate && <p className="text-[10px] text-slate-400 font-bold uppercase">{SAMPLE_DATA.date}</p>}
              {config.showDate && config.showTime && <div className="w-1 h-1 rounded-full bg-slate-200" />}
              {config.showTime && <p className="text-[10px] text-slate-400 font-bold uppercase">{SAMPLE_DATA.time}</p>}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {/* Sender Node */}
          {config.showSender && (
            <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
              {config.showBankLogo && (
                <div className="w-11 h-11 rounded-xl bg-white shadow-premium-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {senderLogo ? <img src={senderLogo} alt="Bank" className="w-8 h-8 object-contain" /> : <div className="text-lg">👤</div>}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Sender</p>
                <p className="text-[12px] font-black text-slate-900 truncate leading-none mb-1">{SAMPLE_DATA.sender.name}</p>
                {config.showSenderAccount && (
                  <p className="text-[10px] text-slate-400 font-mono font-bold">{SAMPLE_DATA.sender.account}</p>
                )}
              </div>
            </div>
          )}

          {/* Transition Icon */}
          <div className="flex justify-center -my-3 relative z-20">
            <div className="w-8 h-8 rounded-full bg-white border-4 border-slate-50 flex items-center justify-center shadow-md">
              <div className="w-1 h-4 bg-slate-200 rounded-full" />
            </div>
          </div>

          {/* Receiver Node */}
          {config.showReceiver && (
            <div className="flex items-center gap-4 p-4 bg-emerald-50/10 rounded-2xl border border-emerald-50">
              {config.showBankLogo && (
                <div className="w-11 h-11 rounded-xl bg-white shadow-premium-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-emerald-50">
                  {receiverLogo ? <img src={receiverLogo} alt="Bank" className="w-8 h-8 object-contain" /> : <div className="text-lg text-emerald-500">🏛️</div>}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest mb-0.5">Receiver</p>
                <p className="text-[12px] font-black text-slate-900 truncate leading-none mb-1">{SAMPLE_DATA.receiver.name}</p>
                {config.showReceiverAccount && (
                  <p className="text-[10px] text-slate-400 font-mono font-bold">{SAMPLE_DATA.receiver.account}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Protocol Data Table */}
        <div className="pt-4 border-t border-dashed border-slate-100 space-y-2">
          {config.showTransRef && (
            <div className="flex justify-between items-center text-[9px] font-bold">
              <span className="text-slate-400 uppercase tracking-widest">Trans ID</span>
              <span className="text-slate-900 font-mono">{SAMPLE_DATA.transRef.slice(0, 12)}...{SAMPLE_DATA.transRef.slice(-4)}</span>
            </div>
          )}
          {config.showFee && (
            <div className="flex justify-between items-center text-[9px] font-bold">
              <span className="text-slate-400 uppercase tracking-widest">Processing Fee</span>
              <span className="text-emerald-600">฿0.00 FREE</span>
            </div>
          )}
          {config.showRefs && SAMPLE_DATA.ref1 && (
            <div className="flex justify-between items-center text-[9px] font-bold">
              <span className="text-slate-400 uppercase tracking-widest">Protocol Ref</span>
              <span className="text-slate-900 font-mono">{SAMPLE_DATA.ref1}</span>
            </div>
          )}
        </div>

        {/* Verification Footer Text */}
        {config.footerText && (
          <div className="pt-4 mt-2 border-t border-slate-50">
            <p className="text-[9px] text-slate-400 text-center font-bold tracking-tight px-4">{config.footerText}</p>
          </div>
        )}
      </div>

      {/* Bottom Brand Mark */}
      <div className="mt-6 flex justify-center opacity-20 filter invert grayscale">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white">Line Identity</p>
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

  const openCreateModal = () => {
    setSelectedTemplate(null);
    setFormData(DEFAULT_FORM_DATA);
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
    });
    setActiveTab('basic');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('กรุณากรอกชื่อเทมเพลต');
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
    } catch (err: any) {
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
    } catch (err: any) {
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

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      <div className="space-y-6 md:space-y-8 lg:space-y-12 max-w-[1600px] mx-auto pb-10 md:pb-20 animate-fade">
        {/* Superior Studio Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              จัดการ<span className="text-[#06C755]">เทมเพลต</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              ออกแบบเลเยอร์การแสดงผลสลิป
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button variant="outline" onClick={handleInitDefaults} isLoading={isProcessing} className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs border-emerald-500/20 bg-[#0F1A14] text-slate-400 hover:text-[#06C755] hover:bg-emerald-500/10">
              รีเซ็ตเทมเพลต
            </Button>
            <Button variant="primary" onClick={openCreateModal} className="h-11 md:h-14 px-4 md:px-8 rounded-xl md:rounded-2xl font-semibold text-xs shadow-emerald-500/20 shadow-xl">
              + สร้างเทมเพลตใหม่
            </Button>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
          <StatCard title="ทั้งหมด" value={templates.length} icon="🧩" color="indigo" variant="glass" className="rounded-xl md:rounded-[2.5rem] shadow-premium-sm" />
          <StatCard title="สำเร็จ" value={templates.filter(t => t.type === 'success').length} icon="✅" color="emerald" variant="glass" className="rounded-xl md:rounded-[2.5rem] shadow-premium-sm" />
          <StatCard title="ซ้ำ" value={templates.filter(t => t.type === 'duplicate').length} icon="⚠️" color="amber" variant="glass" className="rounded-xl md:rounded-[2.5rem] shadow-premium-sm" />
          <StatCard title="เริ่มต้น" value={templates.filter(t => t.isDefault).length} icon="⭐" color="blue" variant="glass" className="rounded-xl md:rounded-[2.5rem] shadow-premium-sm" />
        </div>

        {/* Templates List */}
        {templates.length === 0 ? (
          <Card className="p-12 text-center rounded-[3.5rem] border-none shadow-premium-lg bg-white/60 backdrop-blur-xl">
            <div className="text-5xl mb-4 grayscale opacity-30">🎨</div>
            <h3 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">ยังไม่มีเทมเพลต</h3>
            <p className="text-slate-500 mb-8 font-bold text-xs uppercase tracking-widest">กดปุ่ม &quot;Reset Protocols&quot; เพื่อสร้างเทมเพลตเริ่มต้น</p>
            <Button onClick={handleInitDefaults} variant="primary" className="rounded-2xl font-black uppercase tracking-widest text-xs px-8 h-12 shadow-xl shadow-emerald-500/20">สร้างเทมเพลตเริ่มต้น</Button>
          </Card>
        ) : (
          <div className="space-y-12">
            {TYPE_OPTIONS.map((type) => {
              const list = templatesByType[type.value] || [];
              if (list.length === 0) return null;

              return (
                <div key={type.value} className="space-y-6">
                  <div className="flex items-center gap-4 px-2">
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-premium-sm", type.bgColor)}>
                      {type.icon}
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">{type.label} Protocol</h2>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{list.length} ACTIVE LAYERS</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {list.map((template) => (
                      <Card key={template._id} className="p-8 hover:shadow-premium transition-all duration-500 rounded-[2.5rem] border-none bg-white/70 group relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-700" />

                        <div className="flex items-start justify-between mb-6 relative z-10">
                          <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">{template.name}</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate max-w-[200px]">{template.description || 'ไม่มีคำอธิบายโครร่าง'}</p>
                          </div>
                          {template.isDefault && (
                            <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] px-3 py-1 uppercase tracking-widest rounded-lg animate-fade shadow-sm">Primary Node</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 mb-8 relative z-10">
                          {template.showAmount && <span className="text-[9px] px-3 py-1 bg-slate-50 text-slate-500 rounded-lg font-black uppercase tracking-widest border border-slate-100">Amount</span>}
                          {template.showSender && <span className="text-[9px] px-3 py-1 bg-slate-50 text-slate-500 rounded-lg font-black uppercase tracking-widest border border-slate-100">Sender</span>}
                          {template.showReceiver && <span className="text-[9px] px-3 py-1 bg-slate-50 text-slate-500 rounded-lg font-black uppercase tracking-widest border border-slate-100">Receiver</span>}
                          {template.showBankLogo && <span className="text-[9px] px-3 py-1 bg-slate-50 text-slate-500 rounded-lg font-black uppercase tracking-widest border border-slate-100">Brand UI</span>}
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-6 border-t border-slate-100 relative z-10">
                          <Button variant="ghost" className="h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-slate-50 hover:bg-white hover:shadow-md transition-all border border-slate-100" onClick={() => openEditModal(template)}>
                            Modify Node
                          </Button>
                          <div className="flex gap-2">
                            {!template.isDefault && (
                              <Button variant="ghost" className="h-12 w-12 p-0 rounded-2xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-transparent hover:border-emerald-100" onClick={() => handleSetDefault(template._id)}>
                                ⭐
                              </Button>
                            )}
                            {!template.isDefault && (
                              <Button
                                variant="ghost"
                                className="h-12 w-12 p-0 rounded-2xl flex items-center justify-center text-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-all border border-transparent hover:border-rose-100"
                                onClick={() => { setSelectedTemplate(template); setShowDeleteConfirm(true); }}
                              >
                                🗑️
                              </Button>
                            )}
                          </div>
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

      {/* Advanced Studio Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => !isProcessing && setShowModal(false)}
        title={selectedTemplate ? `DEPLOYMENT STUDIO: ${selectedTemplate.name}` : 'NEW PROTOCOL DEPLOYMENT'}
        size="fullMobile"
      >
        <div className="flex flex-col lg:flex-row gap-12 p-2">
          {/* Left: Configuration Matrix */}
          <div className="flex-1 space-y-8">
            {/* Neural Tabs */}
            <div className="flex gap-2 p-1.5 bg-slate-100/50 rounded-2xl backdrop-blur-sm border border-slate-100">
              {[
                { id: 'basic', label: 'Core Config', icon: '📝' },
                { id: 'display', label: 'Layer Matrix', icon: '👁️' },
                { id: 'banks', label: 'Bank Identity', icon: '🏦' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex-1 py-3 px-2 sm:px-4 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                    activeTab === tab.id
                      ? "bg-white shadow-premium-sm text-emerald-600 scale-100"
                      : "text-slate-400 hover:text-slate-600 hover:scale-95"
                  )}
                >
                  <span className="hidden sm:inline-block mr-2">{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content Node */}
            <div className="bg-slate-50/50 rounded-[2rem] p-8 border border-slate-100 shadow-inner max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Core Config Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-6 animate-fade">
                  <Input
                    label="Protocol Name"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., Emerald Standard"
                    className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-bold"
                  />

                  <Select
                    label="Response Type"
                    value={formData.type}
                    onChange={(e) => updateField('type', e.target.value)}
                    className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-bold px-4"
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                    ))}
                  </Select>

                  <Textarea
                    label="Deployment Brief"
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Describe the operational scope..."
                    rows={2}
                    className="rounded-2xl bg-white border-none shadow-premium-sm font-medium p-4"
                  />

                  <div className="flex items-center justify-between p-5 bg-white rounded-2xl shadow-premium-sm border border-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">🎨</div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Brand Accent</p>
                        <p className="text-xs font-bold text-slate-900">{formData.primaryColor}</p>
                      </div>
                    </div>
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="w-12 h-12 rounded-xl border-4 border-white shadow-lg cursor-pointer transition-transform hover:scale-110"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Header Directive"
                      value={formData.headerText}
                      onChange={(e) => updateField('headerText', e.target.value)}
                      placeholder="e.g., ✅ VERIFIED"
                      className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-bold text-xs"
                    />
                    <Input
                      label="Footer Directive"
                      value={formData.footerText}
                      onChange={(e) => updateField('footerText', e.target.value)}
                      placeholder="e.g., System Secure"
                      className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-bold text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Display Matrix Tab */}
              {activeTab === 'display' && (
                <div className="space-y-8 animate-fade">
                  <section>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 pl-1">Financial Parameters</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Toggle label="Total Amount" checked={formData.showAmount} onChange={() => updateField('showAmount', !formData.showAmount)} />
                      <Toggle label="Trans ID" checked={formData.showTransRef} onChange={() => updateField('showTransRef', !formData.showTransRef)} />
                      <Toggle label="Auth Date" checked={formData.showDate} onChange={() => updateField('showDate', !formData.showDate)} />
                      <Toggle label="Auth Time" checked={formData.showTime} onChange={() => updateField('showTime', !formData.showTime)} />
                    </div>
                  </section>

                  <section>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 pl-1">Sender Identity</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Toggle label="Enable Sender" checked={formData.showSender} onChange={() => updateField('showSender', !formData.showSender)} />
                      <Toggle label="Account Mask" checked={formData.showSenderAccount} onChange={() => updateField('showSenderAccount', !formData.showSenderAccount)} />
                      <Toggle label="Global Name" checked={formData.showSenderNameEn} onChange={() => updateField('showSenderNameEn', !formData.showSenderNameEn)} />
                      <Toggle label="Bank ID" checked={formData.showSenderBankId} onChange={() => updateField('showSenderBankId', !formData.showSenderBankId)} />
                    </div>
                  </section>

                  <section>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 pl-1">Receiver Identity</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Toggle label="Enable Receiver" checked={formData.showReceiver} onChange={() => updateField('showReceiver', !formData.showReceiver)} />
                      <Toggle label="Account Mask" checked={formData.showReceiverAccount} onChange={() => updateField('showReceiverAccount', !formData.showReceiverAccount)} />
                      <Toggle label="Receiver Bank ID" checked={formData.showReceiverBankId} onChange={() => updateField('showReceiverBankId', !formData.showReceiverBankId)} />
                      <Toggle label="Proxy Trace" checked={formData.showReceiverProxy} onChange={() => updateField('showReceiverProxy', !formData.showReceiverProxy)} />
                    </div>
                  </section>

                  <section>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 pl-1">UI Elements</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Toggle label="Brand Logos" checked={formData.showBankLogo} onChange={() => updateField('showBankLogo', !formData.showBankLogo)} />
                      <Toggle label="Fee Trace" checked={formData.showFee} onChange={() => updateField('showFee', !formData.showFee)} />
                      <Toggle label="Extra Refs" checked={formData.showRefs} onChange={() => updateField('showRefs', !formData.showRefs)} />
                      <Toggle label="Region Code" checked={formData.showCountryCode} onChange={() => updateField('showCountryCode', !formData.showCountryCode)} />
                    </div>
                  </section>
                </div>
              )}

              {/* Banks Tab */}
              {activeTab === 'banks' && (
                <div className="space-y-8 animate-fade">
                  {/* Sender Bank */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">👤</span>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Sender UI Context</span>
                      </div>
                      {senderBank && <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] uppercase">{senderBank.shortName}</Badge>}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3 p-4 sm:p-6 bg-white rounded-[2rem] border border-slate-100 shadow-premium-sm">
                      <button
                        type="button"
                        onClick={() => updateField('senderBankId', '')}
                        className={cn(
                          "flex flex-col items-center p-2 rounded-2xl border-2 transition-all min-w-[60px] group",
                          !formData.senderBankId ? "border-emerald-500 bg-emerald-50 shadow-lg" : "border-transparent bg-slate-50 hover:bg-white hover:border-slate-200"
                        )}
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[1.2rem] bg-white shadow-premium-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                          <span className="text-xl">🔄</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auto</span>
                      </button>
                      {activeBanks.map((bank) => (
                        <BankButton
                          key={bank._id}
                          bank={bank}
                          isSelected={formData.senderBankId === bank._id}
                          onClick={() => updateField('senderBankId', bank._id)}
                          color="emerald"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Receiver Bank */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🏛️</span>
                        <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Receiver UI Context</span>
                      </div>
                      {receiverBank && <Badge className="bg-indigo-50 text-indigo-600 border-none font-black text-[9px] uppercase">{receiverBank.shortName}</Badge>}
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3 p-4 sm:p-6 bg-white rounded-[2rem] border border-slate-100 shadow-premium-sm">
                      <button
                        type="button"
                        onClick={() => updateField('receiverBankId', '')}
                        className={cn(
                          "flex flex-col items-center p-2 rounded-2xl border-2 transition-all min-w-[60px] group",
                          !formData.receiverBankId ? "border-indigo-500 bg-indigo-50 shadow-lg" : "border-transparent bg-slate-50 hover:bg-white hover:border-slate-200"
                        )}
                      >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[1.2rem] bg-white shadow-premium-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                          <span className="text-xl">🔄</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auto</span>
                      </button>
                      {activeBanks.map((bank) => (
                        <BankButton
                          key={bank._id}
                          bank={bank}
                          isSelected={formData.receiverBankId === bank._id}
                          onClick={() => updateField('receiverBankId', bank._id)}
                          color="blue"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] text-blue-700 font-bold leading-relaxed">
                      💡 <strong>PROTOCOL GUIDANCE:</strong> Select standard UI contexts for real-time preview simulation. Selecting &quot;Auto&quot; will prioritize real-time metadata from the verified slip.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Neural Preview Studio */}
          <div className="lg:w-[400px] flex flex-col">
            <div className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-premium sticky top-8 flex flex-col items-center">
              <div className="text-center mb-10">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Neural Live Preview</h4>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2 px-10">Real-time simulation of mobile verified interface</p>
              </div>

              <div className="scale-90 xl:scale-100 transition-transform origin-top">
                <SlipPreview
                  config={formData}
                  senderBank={senderBank}
                  receiverBank={receiverBank}
                />
              </div>

              <div className="w-full mt-10 pt-8 border-t border-slate-50 space-y-4">
                <Button variant="primary" fullWidth className="h-16 rounded-[2rem] font-black uppercase tracking-widest text-[12px] shadow-emerald-500/20 shadow-2xl" onClick={handleSubmit} isLoading={isProcessing}>
                  {selectedTemplate ? '⚡ Commit Protocol' : '🚀 Launch Layer'}
                </Button>
                <Button variant="ghost" fullWidth className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all" onClick={() => setShowModal(false)}>
                  Abort Deployment
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Security Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="PROTOCOL DESTRUCTION"
        message={`Are you absolutely sure you want to terminate the "${selectedTemplate?.name}" layout matrix? This action cannot be reversed.`}
        confirmText="Confirm Termination"
        cancelText="Abort"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
