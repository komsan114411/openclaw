'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, banksApi } from '@/lib/api';
import { Bank } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
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
  // New enhanced fields
  showSenderAccount: boolean;
  showReceiverAccount: boolean;
  showSenderNameEn: boolean;
  showReceiverNameEn: boolean;
  showLocalAmount: boolean;
  bankId?: string;
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
  // New enhanced fields
  showSenderAccount: boolean;
  showReceiverAccount: boolean;
  showSenderNameEn: boolean;
  showReceiverNameEn: boolean;
  showLocalAmount: boolean;
  bankId: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', color: 'emerald', icon: '✅', description: 'สลิปที่ผ่านการยืนยันแล้ว' },
  { value: 'duplicate', label: 'สลิปซ้ำ', color: 'amber', icon: '⚠️', description: 'รายการที่เคยตรวจสอบแล้ว' },
  { value: 'error', label: 'เกิดข้อผิดพลาด', color: 'rose', icon: '❌', description: 'ข้อผิดพลาดในการประมวลผล' },
  { value: 'not_found', label: 'ไม่พบข้อมูล', color: 'slate', icon: '🔍', description: 'ไม่พบรายการธุรกรรม' },
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
};

// Sample data matching the Thunder API response structure
const SAMPLE_SLIP_DATA = {
  amount: 1000,
  amountFormatted: '฿1,000.00',
  fee: 0,
  feeFormatted: '฿0',
  countryCode: 'TH',
  ref1: '',
  ref2: '',
  ref3: '',
  payload: '00000000000000000000000000000000000000000000000000000000000',
  transRef: '68370160657749I376388B35',
  date: '24 ธ.ค. 2568',
  time: '09:41',
  sender: {
    name: 'นาย ธันเดอร์ มานะ',
    nameEn: 'MR. THUNDER MANA',
    bank: 'กสิกรไทย',
    bankCode: 'KBANK',
    bankId: '001',
    account: '1234xxxx5678',
  },
  receiver: {
    name: 'นาย ธันเดอร์ มานะ',
    nameEn: '',
    bank: 'ธนาคารออมสิน',
    bankCode: 'GSB',
    bankId: '030',
    account: '12xxxx3456',
    proxyType: 'EWALLETID',
    proxyAccount: '123xxxxxxxx4567',
  },
};

// Toggle Switch Component
const ToggleSwitch = memo(({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ring-offset-2',
      'focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner',
      checked ? 'bg-emerald-500' : 'bg-slate-300',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    )}
  >
    <span
      className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-all duration-300',
        checked ? 'translate-x-6' : 'translate-x-1'
      )}
    />
  </button>
));
ToggleSwitch.displayName = 'ToggleSwitch';

// Display Option Item Component
const DisplayOptionItem = memo(({ 
  icon, 
  label, 
  checked, 
  onChange 
}: { 
  icon: string; 
  label: string; 
  checked: boolean; 
  onChange: (checked: boolean) => void;
}) => (
  <div className={cn(
    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none",
    checked 
      ? "bg-emerald-50 border-emerald-300 shadow-sm" 
      : "bg-white border-slate-200 hover:border-slate-300"
  )} onClick={() => onChange(!checked)}>
    <span className="text-lg">{icon}</span>
    <ToggleSwitch checked={checked} onChange={onChange} />
    <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">{label}</span>
  </div>
));
DisplayOptionItem.displayName = 'DisplayOptionItem';

// Enhanced Slip Preview Component
const SlipPreview = memo(({ config, selectedBank }: { config: FormData; selectedBank: Bank | null }) => {
  const isDuplicate = config.type === 'duplicate';
  const isError = config.type === 'error';
  const isNotFound = config.type === 'not_found';
  const mainColor = isDuplicate ? '#f59e0b' : isError ? '#ef4444' : isNotFound ? '#64748b' : config.primaryColor;
  const bankLogo = selectedBank?.logoBase64 || selectedBank?.logoUrl || null;

  const getStatusIcon = () => {
    if (isDuplicate) return '!';
    if (isError) return '✕';
    if (isNotFound) return '?';
    return '✓';
  };

  const getStatusText = () => {
    if (config.headerText) return config.headerText;
    if (isDuplicate) return 'พบสลิปซ้ำ';
    if (isError) return 'เกิดข้อผิดพลาด';
    if (isNotFound) return 'ไม่พบข้อมูล';
    return 'ตรวจสอบสำเร็จ';
  };

  return (
    <div className="bg-gradient-to-b from-slate-100 to-slate-200 rounded-3xl p-4 border border-slate-200/50 max-w-[320px] w-full mx-auto shadow-xl">
      {/* Header */}
      <div className="rounded-2xl p-3 mb-3 flex items-center gap-3" style={{ backgroundColor: `${mainColor}15` }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-lg" style={{ backgroundColor: mainColor }}>
          {getStatusIcon()}
        </div>
        <div className="flex-1">
          <p className="text-[9px] uppercase tracking-widest font-bold opacity-40 mb-0.5">สถานะ</p>
          <span className="font-bold text-sm" style={{ color: mainColor }}>
            {getStatusText()}
          </span>
        </div>
      </div>

      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/50 space-y-3">
        {/* Amount Display */}
        {config.showAmount && (
          <div className="text-center py-2">
            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-1">จำนวนเงิน</p>
            <p className="text-2xl font-black" style={{ color: mainColor }}>
              {SAMPLE_SLIP_DATA.amountFormatted}
            </p>
            {(config.showDate || config.showTime) && (
              <p className="text-[10px] font-medium text-slate-400 mt-1">
                {config.showDate && SAMPLE_SLIP_DATA.date}
                {config.showDate && config.showTime && ' • '}
                {config.showTime && SAMPLE_SLIP_DATA.time}
              </p>
            )}
          </div>
        )}

        {/* Sender Info */}
        {config.showSender && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            {config.showBankLogo && (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-inner flex-shrink-0">
                {bankLogo ? (
                  <img src={bankLogo} alt="Bank" className="w-7 h-7 object-contain" />
                ) : (
                  <span className="text-lg">🏦</span>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[8px] uppercase tracking-widest font-bold text-slate-400">ผู้โอน</p>
              <p className="text-xs font-bold text-slate-900 truncate">{SAMPLE_SLIP_DATA.sender.name}</p>
              {config.showSenderNameEn && SAMPLE_SLIP_DATA.sender.nameEn && (
                <p className="text-[9px] text-slate-500 truncate">{SAMPLE_SLIP_DATA.sender.nameEn}</p>
              )}
              {config.showSenderAccount && (
                <p className="text-[9px] text-slate-500 font-mono">{SAMPLE_SLIP_DATA.sender.account}</p>
              )}
            </div>
          </div>
        )}

        {/* Receiver Info */}
        {config.showReceiver && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            {config.showBankLogo && (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-blue-50 shadow-inner flex-shrink-0">
                <span className="text-lg">🏛️</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[8px] uppercase tracking-widest font-bold text-slate-400">ผู้รับ</p>
              <p className="text-xs font-bold text-slate-900 truncate">{SAMPLE_SLIP_DATA.receiver.name}</p>
              {config.showReceiverNameEn && SAMPLE_SLIP_DATA.receiver.nameEn && (
                <p className="text-[9px] text-slate-500 truncate">{SAMPLE_SLIP_DATA.receiver.nameEn}</p>
              )}
              {config.showReceiverAccount && (
                <p className="text-[9px] text-slate-500 font-mono">{SAMPLE_SLIP_DATA.receiver.account}</p>
              )}
              {config.showReceiverProxy && SAMPLE_SLIP_DATA.receiver.proxyType && (
                <p className="text-[9px] text-blue-500 font-mono">
                  {SAMPLE_SLIP_DATA.receiver.proxyType}: {SAMPLE_SLIP_DATA.receiver.proxyAccount}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Transaction Reference */}
        {config.showTransRef && (
          <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded-xl">
            <span className="text-[9px] uppercase tracking-widest font-bold opacity-60">รหัสอ้างอิง</span>
            <span className="text-[11px] font-mono font-bold">{SAMPLE_SLIP_DATA.transRef.slice(0, 16)}...</span>
          </div>
        )}

        {/* Extended Details */}
        {(config.showCountryCode || config.showFee || config.showRefs || config.showPayload || 
          config.showSenderBankId || config.showReceiverBankId || config.showLocalAmount) && (
          <div className="p-3 bg-slate-50 rounded-xl space-y-2">
            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400">รายละเอียดเพิ่มเติม</p>
            
            {config.showLocalAmount && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">จำนวนเงิน (สกุลท้องถิ่น)</span>
                <span className="font-mono text-slate-700">-</span>
              </div>
            )}
            {config.showCountryCode && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">ประเทศ</span>
                <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.countryCode}</span>
              </div>
            )}
            {config.showFee && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">ค่าธรรมเนียม</span>
                <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.feeFormatted}</span>
              </div>
            )}
            {config.showRefs && (
              <>
                {SAMPLE_SLIP_DATA.ref1 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Ref1</span>
                    <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.ref1 || '-'}</span>
                  </div>
                )}
                {SAMPLE_SLIP_DATA.ref2 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Ref2</span>
                    <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.ref2 || '-'}</span>
                  </div>
                )}
                {SAMPLE_SLIP_DATA.ref3 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Ref3</span>
                    <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.ref3 || '-'}</span>
                  </div>
                )}
              </>
            )}
            {config.showSenderBankId && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Bank ID (ผู้โอน)</span>
                <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.sender.bankId}</span>
              </div>
            )}
            {config.showReceiverBankId && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Bank ID (ผู้รับ)</span>
                <span className="font-mono text-slate-700">{SAMPLE_SLIP_DATA.receiver.bankId}</span>
              </div>
            )}
            {config.showPayload && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Payload</span>
                <span className="font-mono text-slate-700 truncate max-w-[120px]">{SAMPLE_SLIP_DATA.payload.slice(0, 20)}...</span>
              </div>
            )}
          </div>
        )}

        {/* Duplicate Warning */}
        {isDuplicate && (
          <div className="p-3 bg-amber-500 rounded-xl text-center shadow-lg">
            <p className="text-[11px] text-white font-bold uppercase tracking-wide">⚠️ คำเตือน</p>
            <p className="text-[10px] text-amber-50/90 mt-0.5">พบสลิปนี้ถูกใช้งานแล้ว</p>
            {config.showDelayWarning && (
              <p className="text-[9px] text-amber-100/70 mt-1">ตรวจสอบช้า {config.delayWarningMinutes} นาที</p>
            )}
          </div>
        )}

        {/* Footer */}
        {(config.footerText || config.footerLink) && (
          <div className="pt-2 text-center">
            {config.footerText && (
              <p className="text-[10px] font-medium text-slate-400">{config.footerText}</p>
            )}
            {config.footerLink && config.footerLinkText && (
              <p className="text-[10px] text-blue-500 font-bold underline mt-1">{config.footerLinkText}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
SlipPreview.displayName = 'SlipPreview';

// Section Header Component
const SectionHeader = memo(({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">{icon}</div>
    <div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
    </div>
  </div>
));
SectionHeader.displayName = 'SectionHeader';

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SlipTemplate | null>(null);
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewBankId, setPreviewBankId] = useState<string>('');

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/slip-templates/global');
      if (response.data.success) {
        setTemplates(response.data.templates || []);
      }
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      toast.error('ไม่สามารถโหลดเทมเพลตได้');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBanks = useCallback(async () => {
    try {
      const response = await banksApi.getAll();
      const allBanks = response.data.banks || [];
      setBanks(allBanks);
      const requestedBankId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('bankId') || ''
          : '';
      if (requestedBankId && allBanks.some((b: Bank) => b._id === requestedBankId)) {
        setPreviewBankId(requestedBankId);
        return;
      }
      const firstActiveBank = allBanks.find((b: Bank) => b.isActive);
      if (firstActiveBank) setPreviewBankId(firstActiveBank._id);
    } catch (err) {
      console.error('Failed to load banks:', err);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchBanks();
  }, [fetchTemplates, fetchBanks]);

  const openCreateModal = () => {
    const firstActive = (banks.find((b) => b.isActive)?._id || '') as string;
    setFormData({ ...DEFAULT_FORM_DATA, bankId: firstActive });
    setShowCreateModal(true);
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
    });
    setShowEditModal(true);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('กรุณากรอกชื่อเทมเพลต');
      return;
    }
    setIsProcessing(true);
    try {
      await api.post('/slip-templates/global', formData);
      toast.success('สร้างเทมเพลตสำเร็จ');
      setShowCreateModal(false);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถสร้างเทมเพลตได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTemplate || !formData.name.trim()) {
      toast.error('กรุณากรอกชื่อเทมเพลต');
      return;
    }
    setIsProcessing(true);
    try {
      await api.put(`/slip-templates/global/${selectedTemplate._id}`, formData);
      toast.success('อัปเดตเทมเพลตสำเร็จ');
      setShowEditModal(false);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถอัปเดตเทมเพลตได้');
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
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถลบเทมเพลตได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      await api.put(`/slip-templates/global/${templateId}/default`);
      toast.success('ตั้งเป็นค่าเริ่มต้นสำเร็จ');
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถตั้งเป็นค่าเริ่มต้นได้');
    }
  };

  const handleInitDefaults = async () => {
    setIsProcessing(true);
    try {
      await api.post('/slip-templates/global/init-defaults');
      toast.success('สร้างเทมเพลตเริ่มต้นสำเร็จ');
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถสร้างเทมเพลตเริ่มต้นได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateFormField = useCallback((field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const templatesByType = useMemo(() => templates.reduce((acc, template) => {
    if (!acc[template.type]) acc[template.type] = [];
    acc[template.type].push(template);
    return acc;
  }, {} as Record<string, SlipTemplate[]>), [templates]);

  const activeBanks = useMemo(() => banks.filter(b => b.isActive), [banks]);
  const selectedPreviewBank = useMemo(() => banks.find(b => b._id === previewBankId) || null, [banks, previewBankId]);
  const selectedModalBank = useMemo(() => {
    const id = (formData.bankId || previewBankId) as string;
    return banks.find(b => b._id === id) || null;
  }, [banks, formData.bankId, previewBankId]);

  const isModalOpen = showCreateModal || showEditModal;
  const modalTitle = showCreateModal ? 'สร้างเทมเพลตใหม่' : 'แก้ไขเทมเพลต';
  const modalSubmitText = showCreateModal ? 'สร้างเทมเพลต' : 'บันทึกการเปลี่ยนแปลง';
  const modalSubmit = showCreateModal ? handleCreate : handleUpdate;
  const closeModal = () => { setShowCreateModal(false); setShowEditModal(false); };

  // Group display options by category
  const displayOptionGroups = [
    {
      title: 'ข้อมูลหลัก',
      icon: '💰',
      options: [
        { key: 'showAmount' as keyof FormData, icon: '💰', label: 'จำนวนเงิน' },
        { key: 'showSender' as keyof FormData, icon: '👤', label: 'ผู้โอน' },
        { key: 'showReceiver' as keyof FormData, icon: '🏦', label: 'ผู้รับ' },
        { key: 'showDate' as keyof FormData, icon: '📅', label: 'วันที่' },
      ],
    },
    {
      title: 'รายละเอียดเวลา',
      icon: '🕐',
      options: [
        { key: 'showTime' as keyof FormData, icon: '🕐', label: 'เวลา' },
        { key: 'showTransRef' as keyof FormData, icon: '🔢', label: 'รหัสอ้างอิง' },
        { key: 'showBankLogo' as keyof FormData, icon: '🖼️', label: 'โลโก้ธนาคาร' },
        { key: 'showCountryCode' as keyof FormData, icon: '🌍', label: 'ประเทศ' },
      ],
    },
    {
      title: 'ค่าธรรมเนียม',
      icon: '💸',
      options: [
        { key: 'showFee' as keyof FormData, icon: '💸', label: 'ค่าธรรมเนียม' },
        { key: 'showRefs' as keyof FormData, icon: '🏷️', label: 'Ref1-3' },
        { key: 'showPayload' as keyof FormData, icon: '🧾', label: 'Payload' },
        { key: 'showLocalAmount' as keyof FormData, icon: '💱', label: 'สกุลท้องถิ่น' },
      ],
    },
    {
      title: 'ข้อมูลธนาคาร',
      icon: '🆔',
      options: [
        { key: 'showSenderBankId' as keyof FormData, icon: '🆔', label: 'Bank ID\n(ผู้โอน)' },
        { key: 'showReceiverBankId' as keyof FormData, icon: '🆔', label: 'Bank ID\n(ผู้รับ)' },
        { key: 'showReceiverProxy' as keyof FormData, icon: '🔗', label: 'Proxy\nผู้รับ' },
      ],
    },
    {
      title: 'ข้อมูลบัญชี',
      icon: '📝',
      options: [
        { key: 'showSenderAccount' as keyof FormData, icon: '📝', label: 'เลขบัญชี\nผู้โอน' },
        { key: 'showReceiverAccount' as keyof FormData, icon: '📝', label: 'เลขบัญชี\nผู้รับ' },
        { key: 'showSenderNameEn' as keyof FormData, icon: '🔤', label: 'ชื่อ EN\nผู้โอน' },
        { key: 'showReceiverNameEn' as keyof FormData, icon: '🔤', label: 'ชื่อ EN\nผู้รับ' },
      ],
    },
  ];

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-8 animate-fade max-w-[1600px] mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">🎨 เทมเพลตสลิป</h1>
              <Badge variant="indigo" className="text-[10px]">ระดับระบบ</Badge>
            </div>
            <p className="text-slate-500">จัดการรูปแบบการแสดงผลสลิปสำหรับทุกบัญชี</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleInitDefaults} isLoading={isProcessing}>
              🔄 รีเซ็ตค่าเริ่มต้น
            </Button>
            <Button variant="primary" className="flex-1 sm:flex-none shadow-lg shadow-emerald-500/20" onClick={openCreateModal}>
              ➕ สร้างเทมเพลต
            </Button>
          </div>
        </div>

        {/* Bank Selector for Preview */}
        <Card className="p-4 bg-gradient-to-r from-slate-50 to-white border-slate-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm mb-0.5">🏦 ตัวอย่างธนาคาร</h3>
              <p className="text-xs text-slate-400">เลือกธนาคารเพื่อดูตัวอย่างโลโก้ในสลิป</p>
            </div>
            <div className="flex-1 overflow-x-auto pb-2">
              <div className="flex items-center gap-2">
                {activeBanks.slice(0, 12).map((bank) => {
                  const logo = bank.logoBase64 || bank.logoUrl;
                  return (
                    <button
                      key={bank._id}
                      onClick={() => setPreviewBankId(bank._id)}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all min-w-[70px]",
                        previewBankId === bank._id 
                          ? "border-emerald-500 bg-emerald-50 shadow-md" 
                          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                      )}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-inner">
                        {logo ? (
                          <img src={logo} alt={bank.shortName} className="w-7 h-7 object-contain" />
                        ) : (
                          <span className="text-xs font-black text-slate-400">{bank.shortName?.substring(0, 2)}</span>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-600 truncate w-full text-center">
                        {bank.shortName || bank.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="เทมเพลตทั้งหมด" value={templates.length} icon="🎨" color="indigo" variant="glass" />
          <StatCard title="ตรวจสอบสำเร็จ" value={templates.filter(t => t.type === 'success').length} icon="✅" color="emerald" variant="glass" />
          <StatCard title="สลิปซ้ำ" value={templates.filter(t => t.type === 'duplicate').length} icon="⚠️" color="amber" variant="glass" />
          <StatCard title="ค่าเริ่มต้น" value={templates.filter(t => t.isDefault).length} icon="⭐" color="blue" variant="glass" />
        </div>

        {loading ? (
          <PageLoading message="กำลังโหลดเทมเพลต..." />
        ) : (
          <div className="space-y-12">
            {TYPE_OPTIONS.map((typeOption) => {
              const typeTemplates = templatesByType[typeOption.value] || [];
              if (typeTemplates.length === 0) return null;

              return (
                <section key={typeOption.value} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-sm",
                      typeOption.color === 'emerald' && 'bg-emerald-100',
                      typeOption.color === 'amber' && 'bg-amber-100',
                      typeOption.color === 'rose' && 'bg-rose-100',
                      typeOption.color === 'slate' && 'bg-slate-100'
                    )}>
                      {typeOption.icon}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{typeOption.label}</h2>
                      <p className="text-sm text-slate-400">{typeOption.description}</p>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {typeTemplates.map((template) => (
                      <Card key={template._id} className="p-0 overflow-hidden group hover:shadow-xl transition-all duration-300">
                        <div className="relative h-60 bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-6 overflow-hidden">
                          <div className="transform scale-[0.55] group-hover:scale-[0.6] transition-transform duration-500">
                            <SlipPreview config={{ ...DEFAULT_FORM_DATA, ...template } as FormData} selectedBank={selectedPreviewBank} />
                          </div>
                          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                            <Button variant="primary" size="sm" onClick={() => openEditModal(template)}>
                              ✏️ แก้ไข
                            </Button>
                            {!template.isDefault && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-white hover:bg-rose-500" 
                                onClick={() => { setSelectedTemplate(template); setShowDeleteConfirm(true); }}
                              >
                                🗑️ ลบ
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                                {template.name}
                              </h3>
                              <p className="text-xs text-slate-400 truncate max-w-[200px]">
                                {template.description || 'ไม่มีคำอธิบาย'}
                              </p>
                            </div>
                            {template.isDefault && <Badge variant="emerald" size="sm">⭐ ค่าเริ่มต้น</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {template.showAmount && <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded">💰 เงิน</span>}
                            {template.showSender && <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded">👤 ผู้โอน</span>}
                            {template.showReceiver && <span className="text-[9px] font-bold px-2 py-0.5 bg-purple-50 text-purple-600 rounded">🏦 ผู้รับ</span>}
                            {template.showBankLogo && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">🖼️ โลโก้</span>}
                          </div>
                          {!template.isDefault && (
                            <div className="pt-3 border-t border-slate-100">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-xs text-slate-400 hover:text-emerald-500 px-0" 
                                onClick={() => handleSetDefault(template._id)}
                              >
                                ⭐ ตั้งเป็นค่าเริ่มต้น
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              );
            })}

            {templates.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center text-4xl mb-6">🎨</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">ยังไม่มีเทมเพลต</h3>
                <p className="text-slate-400 max-w-sm text-center mb-6">เริ่มต้นด้วยการสร้างเทมเพลตเริ่มต้น หรือสร้างเทมเพลตใหม่ตามต้องการ</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleInitDefaults}>สร้างค่าเริ่มต้น</Button>
                  <Button variant="primary" className="shadow-lg shadow-emerald-500/20" onClick={openCreateModal}>สร้างเทมเพลตใหม่</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template Form Modal */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title={modalTitle} size="xl">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Settings Panel */}
          <div className="flex-1 space-y-6 order-2 lg:order-1 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
            
            {/* Basic Info Section */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-5 border border-slate-100">
              <SectionHeader icon="📝" title="ข้อมูลพื้นฐาน" subtitle="ชื่อและประเภทของเทมเพลต" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="ชื่อเทมเพลต"
                  value={formData.name}
                  onChange={(e) => updateFormField('name', e.target.value)}
                  placeholder="เช่น เทมเพลตหลัก"
                />
                <Select label="ประเภท" value={formData.type} onChange={(e) => updateFormField('type', e.target.value as any)}>
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                </Select>
              </div>
              <div className="mt-4">
                <Textarea
                  label="คำอธิบาย (ไม่บังคับ)"
                  value={formData.description}
                  onChange={(e) => updateFormField('description', e.target.value)}
                  placeholder="อธิบายการใช้งานเทมเพลตนี้..."
                  rows={2}
                />
              </div>
            </div>

            {/* Appearance Section */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-5 border border-slate-100">
              <SectionHeader icon="🎨" title="การแสดงผล" subtitle="ธนาคาร สี และข้อความ" />
              
              <div className="space-y-4">
                <Select
                  label="ธนาคาร (สำหรับโลโก้/ตัวอย่างในสลิป)"
                  value={formData.bankId}
                  onChange={(e) => updateFormField('bankId', e.target.value)}
                >
                  <option value="">ใช้ธนาคารจากตัวอย่างด้านบน</option>
                  {activeBanks.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.shortName ? `${b.shortName} • ` : ''}{b.nameTh || b.name}
                    </option>
                  ))}
                </Select>

                <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-700 text-sm">🎨 สีหลัก</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">สีที่ใช้แสดงในเทมเพลต</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => updateFormField('primaryColor', e.target.value)}
                      className="w-10 h-10 rounded-lg border-2 border-slate-200 cursor-pointer"
                    />
                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                      {formData.primaryColor}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="ข้อความหัว" 
                    value={formData.headerText} 
                    onChange={(e) => updateFormField('headerText', e.target.value)} 
                    placeholder="เช่น ✅ ตรวจสอบสำเร็จ" 
                  />
                  <Input 
                    label="ข้อความท้าย" 
                    value={formData.footerText} 
                    onChange={(e) => updateFormField('footerText', e.target.value)} 
                    placeholder="เช่น ขอบคุณที่ใช้บริการ" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="ลิงก์ (URL)" 
                    value={formData.footerLink} 
                    onChange={(e) => updateFormField('footerLink', e.target.value)} 
                    placeholder="https://..." 
                  />
                  <Input 
                    label="ข้อความลิงก์" 
                    value={formData.footerLinkText} 
                    onChange={(e) => updateFormField('footerLinkText', e.target.value)} 
                    placeholder="ดูรายละเอียด" 
                  />
                </div>
              </div>
            </div>

            {/* Display Options Section */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-5 border border-slate-100">
              <SectionHeader icon="👁️" title="ตัวเลือกการแสดง" subtitle="เลือกข้อมูลที่ต้องการแสดงในสลิป" />
              
              <div className="space-y-6">
                {displayOptionGroups.map((group, groupIndex) => (
                  <div key={groupIndex}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">{group.icon}</span>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{group.title}</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {group.options.map((item) => (
                        <DisplayOptionItem
                          key={item.key}
                          icon={item.icon}
                          label={item.label}
                          checked={formData[item.key] as boolean}
                          onChange={(checked) => updateFormField(item.key, checked)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Duplicate Warning Settings */}
            {formData.type === 'duplicate' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-200"
              >
                <SectionHeader icon="⚠️" title="แจ้งเตือนสลิปซ้ำ" subtitle="การตั้งค่าสำหรับสลิปที่ถูกใช้แล้ว" />
                
                <div className="flex items-center justify-between p-4 bg-white/80 rounded-xl border border-amber-200">
                  <div>
                    <p className="font-bold text-amber-900 text-sm">แสดงระยะเวลาที่ผ่านมา</p>
                    <p className="text-[10px] text-amber-600">แจ้งผู้ใช้ว่าสลิปถูกใช้ไปนานเท่าไหร่</p>
                  </div>
                  <ToggleSwitch 
                    checked={formData.showDelayWarning} 
                    onChange={(checked) => updateFormField('showDelayWarning', checked)} 
                  />
                </div>
                
                {formData.showDelayWarning && (
                  <div className="mt-4">
                    <Input 
                      label="ระยะเวลา (นาที)" 
                      type="number" 
                      value={formData.delayWarningMinutes} 
                      onChange={(e) => updateFormField('delayWarningMinutes', parseInt(e.target.value) || 5)} 
                    />
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="lg:w-[360px] order-1 lg:order-2">
            <div className="bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl p-5 border border-slate-200 lg:sticky lg:top-4">
              <div className="text-center mb-4">
                <h4 className="font-bold text-slate-700 text-sm">👁️ ตัวอย่างการแสดงผล</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">ลูกค้าจะเห็นแบบนี้</p>
              </div>
              
              <SlipPreview config={formData} selectedBank={selectedModalBank} />
              
              <div className="space-y-3 pt-5 mt-5 border-t border-slate-200">
                <Button 
                  variant="primary" 
                  fullWidth 
                  size="lg" 
                  className="rounded-xl font-bold shadow-lg shadow-emerald-500/20" 
                  onClick={modalSubmit} 
                  isLoading={isProcessing}
                >
                  {modalSubmitText}
                </Button>
                <Button 
                  variant="ghost" 
                  fullWidth 
                  className="text-slate-400" 
                  onClick={closeModal}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="🗑️ ลบเทมเพลต?"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบเทมเพลต "${selectedTemplate?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบเทมเพลต"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </DashboardLayout>
  );
}
