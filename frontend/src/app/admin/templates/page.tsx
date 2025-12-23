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
import { Input, Select, Textarea, Switch } from '@/components/ui/Input';
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
  bankId: '',
};

// Preview Component
const SlipPreview = memo(({ config, selectedBank }: { config: FormData; selectedBank: Bank | null }) => {
  const isDuplicate = config.type === 'duplicate';
  const mainColor = isDuplicate ? '#f59e0b' : config.primaryColor;
  const bankLogo = selectedBank?.logoBase64 || selectedBank?.logoUrl || null;

  return (
    <div className="bg-slate-900/5 backdrop-blur-3xl rounded-3xl p-4 border border-white max-w-[320px] w-full mx-auto shadow-xl">
      {/* Header */}
      <div className="rounded-2xl p-3 mb-3 flex items-center gap-3" style={{ backgroundColor: `${mainColor}15` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-lg" style={{ backgroundColor: mainColor }}>
          {isDuplicate ? '!' : '✓'}
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest font-bold opacity-40 mb-0.5">สถานะ</p>
          <span className="font-bold text-xs" style={{ color: mainColor }}>
            {config.headerText || (isDuplicate ? 'พบสลิปซ้ำ' : 'ตรวจสอบสำเร็จ')}
          </span>
        </div>
      </div>

      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-sm border border-white/50 space-y-3">
        {config.showAmount && (
          <div className="text-center py-1">
            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">จำนวนเงิน</p>
            <p className="text-xl font-black" style={{ color: mainColor }}>฿1,250.00</p>
            {(config.showDate || config.showTime) && (
              <p className="text-[9px] font-medium text-slate-400 mt-0.5">24 ธ.ค. 2568 • 09:41</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {config.showSender && (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
              {config.showBankLogo && (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-inner">
                  {bankLogo ? (
                    <img src={bankLogo} alt="Bank" className="w-6 h-6 object-contain" />
                  ) : (
                    <span className="text-sm">🏦</span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[8px] uppercase tracking-widest font-bold text-slate-400">ผู้โอน</p>
                <p className="text-xs font-bold text-slate-900 truncate">นายตัวอย่าง ทดสอบ</p>
              </div>
            </div>
          )}
          {config.showReceiver && (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
              {config.showBankLogo && (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-blue-50 shadow-inner">
                  <span className="text-sm">🏦</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[8px] uppercase tracking-widest font-bold text-slate-400">ผู้รับ</p>
                <p className="text-xs font-bold text-slate-900 truncate">บริษัท ตัวอย่าง จำกัด</p>
              </div>
            </div>
          )}
        </div>

        {config.showTransRef && (
          <div className="flex justify-between items-center p-2 bg-slate-900 text-white rounded-lg">
            <span className="text-[8px] uppercase tracking-widest font-bold opacity-50">รหัสอ้างอิง</span>
            <span className="text-[10px] font-mono font-bold">RX-084-2219</span>
          </div>
        )}

        {(config.showCountryCode || config.showFee || config.showRefs || config.showPayload || config.showSenderBankId || config.showReceiverBankId || config.showReceiverProxy) && (
          <div className="p-2 bg-slate-50 rounded-lg space-y-1">
            <p className="text-[8px] uppercase tracking-widest font-bold text-slate-400">รายละเอียดเพิ่มเติม</p>
            {config.showCountryCode && <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">ประเทศ</span><span className="font-mono text-slate-700">TH</span></div>}
            {config.showFee && <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">ค่าธรรมเนียม</span><span className="font-mono text-slate-700">฿0</span></div>}
            {config.showRefs && (
              <>
                <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">Ref1</span><span className="font-mono text-slate-700">-</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">Ref2</span><span className="font-mono text-slate-700">-</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">Ref3</span><span className="font-mono text-slate-700">-</span></div>
              </>
            )}
            {config.showSenderBankId && <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">ธนาคารผู้โอน (ID)</span><span className="font-mono text-slate-700">001</span></div>}
            {config.showReceiverBankId && <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">ธนาคารผู้รับ (ID)</span><span className="font-mono text-slate-700">030</span></div>}
            {config.showReceiverProxy && <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">Proxy</span><span className="font-mono text-slate-700">EWALLETID</span></div>}
            {config.showPayload && <div className="flex justify-between text-[9px]"><span className="text-slate-500 font-medium">Payload</span><span className="font-mono text-slate-700">00000000…</span></div>}
          </div>
        )}

        {isDuplicate && (
          <div className="p-3 bg-amber-500 rounded-lg text-center shadow-lg">
            <p className="text-[10px] text-white font-bold uppercase tracking-wide">⚠️ คำเตือน</p>
            <p className="text-[9px] text-amber-50/90">พบสลิปนี้ถูกใช้งานแล้ว</p>
          </div>
        )}

        {(config.footerText || config.footerLink) && (
          <div className="pt-1 text-center">
            {config.footerText && <p className="text-[9px] font-medium text-slate-400">{config.footerText}</p>}
            {config.footerLink && config.footerLinkText && (
              <p className="text-[9px] text-indigo-500 font-bold underline">{config.footerLinkText}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
SlipPreview.displayName = 'SlipPreview';

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
  const [previewBankId, setPreviewBankId] = useState<string>(''); // For selecting bank for preview

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
      // If this page was opened from Banks page, prefer that bank for preview
      const requestedBankId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('bankId') || ''
          : '';
      if (requestedBankId && allBanks.some((b: Bank) => b._id === requestedBankId)) {
        setPreviewBankId(requestedBankId);
        return;
      }

      // Auto-select first active bank for preview
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

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-8 animate-fade max-w-[1600px] mx-auto pb-12">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">เทมเพลตสลิป</h1>
              <Badge variant="indigo" className="text-[10px]">ระดับระบบ</Badge>
            </div>
            <p className="text-slate-500">จัดการรูปแบบการแสดงผลสลิปสำหรับทุกบัญชี</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleInitDefaults} isLoading={isProcessing}>
              รีเซ็ตค่าเริ่มต้น
            </Button>
            <Button variant="primary" className="flex-1 sm:flex-none shadow-lg shadow-emerald-500/20" onClick={openCreateModal}>
              + สร้างเทมเพลต
            </Button>
          </div>
        </div>

        {/* Bank Selector for Preview */}
        <Card className="p-4 bg-slate-50/50 border-slate-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm mb-0.5">ตัวอย่างธนาคาร</h3>
              <p className="text-xs text-slate-400">เลือกธนาคารเพื่อดูตัวอย่างโลโก้ในสลิป</p>
            </div>
            <div className="flex-1 overflow-x-auto">
              <div className="flex items-center gap-2">
                {activeBanks.slice(0, 10).map((bank) => {
                  const logo = bank.logoBase64 || bank.logoUrl;
                  return (
                    <button
                      key={bank._id}
                      onClick={() => setPreviewBankId(bank._id)}
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all min-w-[60px]",
                        previewBankId === bank._id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-inner">
                        {logo ? (
                          <img src={logo} alt={bank.shortName} className="w-6 h-6 object-contain" />
                        ) : (
                          <span className="text-[10px] font-black text-slate-400">{bank.shortName?.substring(0, 2)}</span>
                        )}
                      </div>
                      <span className="text-[8px] font-bold text-slate-600 truncate w-full text-center">{bank.shortName || bank.code}</span>
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
          <StatCard title="ค่าเริ่มต้น" value={templates.filter(t => t.isDefault).length} icon="⭐️" color="blue" variant="glass" />
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
                      "w-12 h-12 rounded-xl flex items-center justify-center text-xl",
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
                        <div className="relative h-56 bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-6 overflow-hidden">
                          <div className="transform scale-[0.6] group-hover:scale-[0.65] transition-transform duration-500">
                            <SlipPreview config={{ ...DEFAULT_FORM_DATA, ...template } as FormData} selectedBank={selectedPreviewBank} />
                          </div>
                          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                            <Button variant="primary" size="sm" onClick={() => openEditModal(template)}>✏️ แก้ไข</Button>
                            {!template.isDefault && (
                              <Button variant="ghost" size="sm" className="text-white hover:bg-rose-500" onClick={() => { setSelectedTemplate(template); setShowDeleteConfirm(true); }}>
                                🗑️ ลบ
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{template.name}</h3>
                              <p className="text-xs text-slate-400 truncate max-w-[200px]">{template.description || 'ไม่มีคำอธิบาย'}</p>
                            </div>
                            {template.isDefault && <Badge variant="emerald" size="sm">ค่าเริ่มต้น</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {template.showAmount && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">จำนวนเงิน</span>}
                            {template.showSender && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">ผู้โอน</span>}
                            {template.showReceiver && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">ผู้รับ</span>}
                            {template.showBankLogo && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">โลโก้</span>}
                          </div>
                          {!template.isDefault && (
                            <div className="pt-3 border-t border-slate-100">
                              <Button variant="ghost" size="sm" className="text-xs text-slate-400 hover:text-emerald-500 px-0" onClick={() => handleSetDefault(template._id)}>
                                ⭐️ ตั้งเป็นค่าเริ่มต้น
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
          <div className="flex-1 space-y-5 order-2 lg:order-1 max-h-[70vh] overflow-y-auto pr-2">
            {/* Basic Info */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span>📝</span> ข้อมูลพื้นฐาน
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="ชื่อเทมเพลต"
                  value={formData.name}
                  onChange={(e) => updateFormField('name', e.target.value)}
                  placeholder="เช่น เทมเพลตหลัก"
                />
                <Select label="ประเภท" value={formData.type} onChange={(e) => updateFormField('type', e.target.value)}>
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                </Select>
              </div>
              <Textarea
                label="คำอธิบาย (ไม่บังคับ)"
                value={formData.description}
                onChange={(e) => updateFormField('description', e.target.value)}
                placeholder="อธิบายการใช้งานเทมเพลตนี้..."
                rows={2}
              />
            </div>

            {/* Appearance */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span>🎨</span> การแสดงผล
              </h3>
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-700 text-sm">สีหลัก</p>
                  <p className="text-[10px] text-slate-400">สีที่ใช้แสดงในเทมเพลต</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => updateFormField('primaryColor', e.target.value)}
                    className="w-8 h-8 rounded-md border-none cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-slate-500 px-1">{formData.primaryColor}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="ข้อความหัว" value={formData.headerText} onChange={(e) => updateFormField('headerText', e.target.value)} placeholder="เช่น ✅ ตรวจสอบสำเร็จ" />
                <Input label="ข้อความท้าย" value={formData.footerText} onChange={(e) => updateFormField('footerText', e.target.value)} placeholder="เช่น ขอบคุณที่ใช้บริการ" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="ลิงก์ (URL)" value={formData.footerLink} onChange={(e) => updateFormField('footerLink', e.target.value)} placeholder="https://..." />
                <Input label="ข้อความลิงก์" value={formData.footerLinkText} onChange={(e) => updateFormField('footerLinkText', e.target.value)} placeholder="ดูรายละเอียด" />
              </div>
            </div>

            {/* Display Options */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <span>👁️</span> ตัวเลือกการแสดง
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[
                  { label: 'จำนวนเงิน', key: 'showAmount' as keyof FormData, icon: '💰' },
                  { label: 'ผู้โอน', key: 'showSender' as keyof FormData, icon: '👤' },
                  { label: 'ผู้รับ', key: 'showReceiver' as keyof FormData, icon: '🏦' },
                  { label: 'วันที่', key: 'showDate' as keyof FormData, icon: '📅' },
                  { label: 'เวลา', key: 'showTime' as keyof FormData, icon: '🕐' },
                  { label: 'รหัสอ้างอิง', key: 'showTransRef' as keyof FormData, icon: '🔢' },
                  { label: 'โลโก้ธนาคาร', key: 'showBankLogo' as keyof FormData, icon: '🖼️' },
                  { label: 'ประเทศ', key: 'showCountryCode' as keyof FormData, icon: '🌍' },
                  { label: 'ค่าธรรมเนียม', key: 'showFee' as keyof FormData, icon: '💸' },
                  { label: 'Ref1-3', key: 'showRefs' as keyof FormData, icon: '🏷️' },
                  { label: 'Payload', key: 'showPayload' as keyof FormData, icon: '🧾' },
                  { label: 'Bank ID (ผู้โอน)', key: 'showSenderBankId' as keyof FormData, icon: '🆔' },
                  { label: 'Bank ID (ผู้รับ)', key: 'showReceiverBankId' as keyof FormData, icon: '🆔' },
                  { label: 'Proxy ผู้รับ', key: 'showReceiverProxy' as keyof FormData, icon: '🔗' },
                ].map((item) => (
                  <div key={item.key} className="flex flex-col gap-1 p-2 bg-white rounded-lg border border-slate-200 hover:border-emerald-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{item.icon}</span>
                      <Switch checked={formData[item.key] as boolean} onChange={(checked) => updateFormField(item.key, checked)} />
                    </div>
                    <span className="text-[9px] font-bold text-slate-500">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Duplicate Warning */}
            {formData.type === 'duplicate' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 rounded-2xl p-4 space-y-3 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-amber-900 text-sm">⚠️ แจ้งเตือนสลิปซ้ำ</h4>
                    <p className="text-[10px] text-amber-600">แสดงระยะเวลาที่ผ่านมา</p>
                  </div>
                  <Switch checked={formData.showDelayWarning} onChange={(checked) => updateFormField('showDelayWarning', checked)} />
                </div>
                {formData.showDelayWarning && (
                  <Input label="ระยะเวลา (นาที)" type="number" value={formData.delayWarningMinutes} onChange={(e) => updateFormField('delayWarningMinutes', parseInt(e.target.value) || 5)} className="bg-white" />
                )}
              </motion.div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="lg:w-[340px] order-1 lg:order-2">
            <div className="bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl p-4 border border-slate-200 lg:sticky lg:top-4">
              <div className="text-center mb-4">
                <h4 className="font-bold text-slate-700 text-sm">👁️ ตัวอย่างการแสดงผล</h4>
                <p className="text-[10px] text-slate-400">ลูกค้าจะเห็นแบบนี้</p>
              </div>
              <SlipPreview config={formData} selectedBank={selectedModalBank} />
              <div className="space-y-2 pt-4">
                <Button variant="primary" fullWidth size="lg" className="rounded-xl font-bold shadow-lg shadow-emerald-500/20" onClick={modalSubmit} isLoading={isProcessing}>
                  {modalSubmitText}
                </Button>
                <Button variant="ghost" fullWidth className="text-slate-400" onClick={closeModal}>
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
        title="ลบเทมเพลต?"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบเทมเพลต "${selectedTemplate?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบเทมเพลต"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
