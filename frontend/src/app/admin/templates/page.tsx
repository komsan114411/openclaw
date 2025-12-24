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

// Sample data for preview
const SAMPLE_DATA = {
  amount: '฿1,000.00',
  date: '24 ธ.ค. 2568',
  time: '09:41',
  sender: { name: 'นาย ธันเดอร์ มานะ', nameEn: 'MR. THUNDER MANA', account: '1234xxxx5678', bank: 'กสิกรไทย' },
  receiver: { name: 'นาย ธันเดอร์ มานะ', nameEn: '', account: '12xxxx3456', bank: 'ธนาคารออมสิน', proxy: 'EWALLETID: 123xxx4567' },
  transRef: '68370160657749I376388B35',
};

// Simple Toggle Component
const Toggle = memo(({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <button
    type="button"
    onClick={onChange}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all w-full text-left",
      checked ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
    )}
  >
    <div className={cn(
      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
      checked ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
    )}>
      {checked && <span className="text-white text-xs">✓</span>}
    </div>
    <span className={cn("text-sm font-medium", checked ? "text-emerald-700" : "text-slate-600")}>{label}</span>
  </button>
));
Toggle.displayName = 'Toggle';

// Bank Logo Button Component
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
    emerald: 'border-emerald-500 bg-emerald-50 ring-emerald-500/20',
    blue: 'border-blue-500 bg-blue-50 ring-blue-500/20',
  };
  
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center p-2 rounded-xl border-2 transition-all min-w-[60px]",
        isSelected ? `${colors[color]} ring-4` : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      )}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-sm mb-1">
        {logo ? (
          <img src={logo} alt={bank.shortName} className="w-8 h-8 object-contain" />
        ) : (
          <span className="text-xs font-black text-slate-400">{(bank.shortName || bank.code)?.substring(0, 2)}</span>
        )}
      </div>
      <span className={cn(
        "text-[10px] font-bold text-center truncate w-full",
        isSelected ? (color === 'emerald' ? 'text-emerald-700' : 'text-blue-700') : 'text-slate-500'
      )}>
        {bank.shortName || bank.code}
      </span>
    </button>
  );
});
BankButton.displayName = 'BankButton';

// Slip Preview Component
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
    if (isDuplicate) return 'พบสลิปซ้ำ';
    if (isError) return 'เกิดข้อผิดพลาด';
    if (isNotFound) return 'ไม่พบข้อมูล';
    return 'ตรวจสอบสำเร็จ';
  };

  const senderLogo = senderBank?.logoBase64 || senderBank?.logoUrl;
  const receiverLogo = receiverBank?.logoBase64 || receiverBank?.logoUrl;

  return (
    <div className="bg-gradient-to-b from-slate-100 to-slate-200 rounded-2xl p-3 max-w-[280px] mx-auto shadow-lg">
      {/* Header */}
      <div className="rounded-xl p-2.5 mb-2 flex items-center gap-2" style={{ backgroundColor: `${mainColor}15` }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-md" style={{ backgroundColor: mainColor }}>
          {isDuplicate ? '!' : isError ? '✕' : isNotFound ? '?' : '✓'}
        </div>
        <span className="font-bold text-sm flex-1" style={{ color: mainColor }}>{getStatusText()}</span>
      </div>

      <div className="bg-white rounded-xl p-3 space-y-2">
        {/* Amount */}
        {config.showAmount && (
          <div className="text-center py-1">
            <p className="text-[10px] text-slate-400 uppercase font-bold">จำนวนเงิน</p>
            <p className="text-xl font-black" style={{ color: mainColor }}>{SAMPLE_DATA.amount}</p>
            {(config.showDate || config.showTime) && (
              <p className="text-[10px] text-slate-400">
                {config.showDate && SAMPLE_DATA.date}{config.showDate && config.showTime && ' • '}{config.showTime && SAMPLE_DATA.time}
              </p>
            )}
          </div>
        )}

        {/* Sender */}
        {config.showSender && (
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            {config.showBankLogo && (
              <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                {senderLogo ? <img src={senderLogo} alt="ธนาคาร" className="w-7 h-7 object-contain" /> : <span>👤</span>}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-slate-400 font-bold uppercase">ผู้โอน</p>
              <p className="text-[11px] font-bold text-slate-900 truncate">{SAMPLE_DATA.sender.name}</p>
              {config.showSenderNameEn && SAMPLE_DATA.sender.nameEn && <p className="text-[9px] text-slate-500 truncate">{SAMPLE_DATA.sender.nameEn}</p>}
              {config.showSenderAccount && <p className="text-[9px] text-slate-500 font-mono">{SAMPLE_DATA.sender.account}</p>}
              {senderBank && <p className="text-[8px] text-emerald-600 font-medium">{senderBank.shortName}</p>}
            </div>
          </div>
        )}

        {/* Receiver */}
        {config.showReceiver && (
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            {config.showBankLogo && (
              <div className="w-9 h-9 rounded-lg bg-blue-50 shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
                {receiverLogo ? <img src={receiverLogo} alt="ธนาคาร" className="w-7 h-7 object-contain" /> : <span>🏛️</span>}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-slate-400 font-bold uppercase">ผู้รับ</p>
              <p className="text-[11px] font-bold text-slate-900 truncate">{SAMPLE_DATA.receiver.name}</p>
              {config.showReceiverAccount && <p className="text-[9px] text-slate-500 font-mono">{SAMPLE_DATA.receiver.account}</p>}
              {config.showReceiverProxy && <p className="text-[9px] text-blue-500 font-mono">{SAMPLE_DATA.receiver.proxy}</p>}
              {receiverBank && <p className="text-[8px] text-blue-600 font-medium">{receiverBank.shortName}</p>}
            </div>
          </div>
        )}

        {/* TransRef */}
        {config.showTransRef && (
          <div className="flex justify-between items-center p-2 bg-slate-900 text-white rounded-lg">
            <span className="text-[9px] font-bold opacity-60">อ้างอิง</span>
            <span className="text-[10px] font-mono">{SAMPLE_DATA.transRef.slice(0, 16)}...</span>
          </div>
        )}

        {/* Duplicate Warning */}
        {isDuplicate && (
          <div className="p-2 bg-amber-500 rounded-lg text-center">
            <p className="text-[10px] text-white font-bold">⚠️ สลิปนี้ถูกใช้งานแล้ว</p>
          </div>
        )}

        {/* Footer */}
        {config.footerText && (
          <p className="text-[10px] text-slate-400 text-center pt-1">{config.footerText}</p>
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
      <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🎨 เทมเพลตสลิป</h1>
            <p className="text-slate-500 text-sm">จัดการรูปแบบการแสดงผลสลิป</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleInitDefaults} isLoading={isProcessing}>
              🔄 รีเซ็ต
            </Button>
            <Button variant="primary" onClick={openCreateModal}>
              ➕ สร้างใหม่
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard title="ทั้งหมด" value={templates.length} icon="🎨" color="indigo" variant="glass" />
          <StatCard title="สำเร็จ" value={templates.filter(t => t.type === 'success').length} icon="✅" color="emerald" variant="glass" />
          <StatCard title="สลิปซ้ำ" value={templates.filter(t => t.type === 'duplicate').length} icon="⚠️" color="amber" variant="glass" />
          <StatCard title="ค่าเริ่มต้น" value={templates.filter(t => t.isDefault).length} icon="⭐" color="blue" variant="glass" />
        </div>

        {/* Templates List */}
        {templates.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-5xl mb-4">🎨</div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">ยังไม่มีเทมเพลต</h3>
            <p className="text-slate-500 mb-6">กดปุ่ม &quot;รีเซ็ต&quot; เพื่อสร้างเทมเพลตเริ่มต้น</p>
            <Button onClick={handleInitDefaults}>สร้างเทมเพลตเริ่มต้น</Button>
          </Card>
        ) : (
          <div className="space-y-8">
            {TYPE_OPTIONS.map((type) => {
              const list = templatesByType[type.value] || [];
              if (list.length === 0) return null;
              
              return (
                <div key={type.value}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl", type.bgColor)}>
                      {type.icon}
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900">{type.label}</h2>
                      <p className="text-xs text-slate-400">{list.length} เทมเพลต</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {list.map((template) => (
                      <Card key={template._id} className="p-4 hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-slate-900">{template.name}</h3>
                            <p className="text-xs text-slate-400">{template.description || 'ไม่มีคำอธิบาย'}</p>
                          </div>
                          {template.isDefault && <Badge variant="emerald" size="sm">⭐ เริ่มต้น</Badge>}
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mb-4">
                          {template.showAmount && <span className="text-[9px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded font-bold">💰 เงิน</span>}
                          {template.showSender && <span className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-bold">👤 ผู้โอน</span>}
                          {template.showReceiver && <span className="text-[9px] px-2 py-0.5 bg-purple-50 text-purple-600 rounded font-bold">🏛️ ผู้รับ</span>}
                          {template.showBankLogo && <span className="text-[9px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-bold">🖼️ โลโก้</span>}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" fullWidth onClick={() => openEditModal(template)}>
                            ✏️ แก้ไข
                          </Button>
                          {!template.isDefault && (
                            <Button variant="ghost" size="sm" onClick={() => handleSetDefault(template._id)}>
                              ⭐
                            </Button>
                          )}
                          {!template.isDefault && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-rose-500 hover:bg-rose-50"
                              onClick={() => { setSelectedTemplate(template); setShowDeleteConfirm(true); }}
                            >
                              🗑️
                            </Button>
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

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={selectedTemplate ? 'แก้ไขเทมเพลต' : 'สร้างเทมเพลตใหม่'} size="xl">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Settings */}
          <div className="flex-1 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {[
                { id: 'basic', label: '📝 ข้อมูล', icon: '📝' },
                { id: 'display', label: '👁️ การแสดง', icon: '👁️' },
                { id: 'banks', label: '🏦 ธนาคาร', icon: '🏦' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all",
                    activeTab === tab.id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-slate-50 rounded-xl p-4 max-h-[50vh] overflow-y-auto">
              {/* Basic Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <Input
                    label="ชื่อเทมเพลต"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="เช่น เทมเพลตหลัก"
                  />
                  
                  <Select label="ประเภท" value={formData.type} onChange={(e) => updateField('type', e.target.value)}>
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                    ))}
                  </Select>
                  
                  <Textarea
                    label="คำอธิบาย"
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="อธิบายการใช้งาน..."
                    rows={2}
                  />
                  
                  <div className="flex items-center gap-4 p-3 bg-white rounded-xl">
                    <span className="text-sm font-bold text-slate-700">🎨 สีหลัก</span>
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="w-10 h-10 rounded-lg border cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-400">{formData.primaryColor}</span>
                  </div>
                  
                  <Input
                    label="ข้อความหัว"
                    value={formData.headerText}
                    onChange={(e) => updateField('headerText', e.target.value)}
                    placeholder="เช่น ✅ ตรวจสอบสำเร็จ"
                  />
                  
                  <Input
                    label="ข้อความท้าย"
                    value={formData.footerText}
                    onChange={(e) => updateField('footerText', e.target.value)}
                    placeholder="เช่น ขอบคุณที่ใช้บริการ"
                  />
                </div>
              )}

              {/* Display Tab */}
              {activeTab === 'display' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">💰 ข้อมูลหลัก</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle label="จำนวนเงิน" checked={formData.showAmount} onChange={() => updateField('showAmount', !formData.showAmount)} />
                    <Toggle label="วันที่" checked={formData.showDate} onChange={() => updateField('showDate', !formData.showDate)} />
                    <Toggle label="เวลา" checked={formData.showTime} onChange={() => updateField('showTime', !formData.showTime)} />
                    <Toggle label="รหัสอ้างอิง" checked={formData.showTransRef} onChange={() => updateField('showTransRef', !formData.showTransRef)} />
                  </div>
                  
                  <p className="text-xs text-slate-500 font-bold uppercase mt-4 mb-2">👤 ผู้โอน</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle label="แสดงผู้โอน" checked={formData.showSender} onChange={() => updateField('showSender', !formData.showSender)} />
                    <Toggle label="เลขบัญชี" checked={formData.showSenderAccount} onChange={() => updateField('showSenderAccount', !formData.showSenderAccount)} />
                    <Toggle label="ชื่อ EN" checked={formData.showSenderNameEn} onChange={() => updateField('showSenderNameEn', !formData.showSenderNameEn)} />
                    <Toggle label="Bank ID" checked={formData.showSenderBankId} onChange={() => updateField('showSenderBankId', !formData.showSenderBankId)} />
                  </div>
                  
                  <p className="text-xs text-slate-500 font-bold uppercase mt-4 mb-2">🏛️ ผู้รับ</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle label="แสดงผู้รับ" checked={formData.showReceiver} onChange={() => updateField('showReceiver', !formData.showReceiver)} />
                    <Toggle label="เลขบัญชี" checked={formData.showReceiverAccount} onChange={() => updateField('showReceiverAccount', !formData.showReceiverAccount)} />
                    <Toggle label="Proxy" checked={formData.showReceiverProxy} onChange={() => updateField('showReceiverProxy', !formData.showReceiverProxy)} />
                    <Toggle label="Bank ID" checked={formData.showReceiverBankId} onChange={() => updateField('showReceiverBankId', !formData.showReceiverBankId)} />
                  </div>
                  
                  <p className="text-xs text-slate-500 font-bold uppercase mt-4 mb-2">🖼️ อื่นๆ</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle label="โลโก้ธนาคาร" checked={formData.showBankLogo} onChange={() => updateField('showBankLogo', !formData.showBankLogo)} />
                    <Toggle label="ค่าธรรมเนียม" checked={formData.showFee} onChange={() => updateField('showFee', !formData.showFee)} />
                    <Toggle label="ประเทศ" checked={formData.showCountryCode} onChange={() => updateField('showCountryCode', !formData.showCountryCode)} />
                    <Toggle label="Ref1-3" checked={formData.showRefs} onChange={() => updateField('showRefs', !formData.showRefs)} />
                  </div>
                </div>
              )}

              {/* Banks Tab */}
              {activeTab === 'banks' && (
                <div className="space-y-6">
                  {/* Sender Bank */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">👤</span>
                      <span className="font-bold text-slate-900">ธนาคารผู้โอน</span>
                      {senderBank && (
                        <Badge variant="emerald" size="sm">{senderBank.shortName}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 p-3 bg-white rounded-xl border-2 border-emerald-100">
                      <button
                        type="button"
                        onClick={() => updateField('senderBankId', '')}
                        className={cn(
                          "flex flex-col items-center p-2 rounded-xl border-2 transition-all min-w-[60px]",
                          !formData.senderBankId ? "border-emerald-500 bg-emerald-50 ring-4 ring-emerald-500/20" : "border-slate-200 bg-white"
                        )}
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-1">
                          <span className="text-lg">🔄</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">อัตโนมัติ</span>
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
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">🏛️</span>
                      <span className="font-bold text-slate-900">ธนาคารผู้รับ</span>
                      {receiverBank && (
                        <Badge variant="info" size="sm">{receiverBank.shortName}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 p-3 bg-white rounded-xl border-2 border-blue-100">
                      <button
                        type="button"
                        onClick={() => updateField('receiverBankId', '')}
                        className={cn(
                          "flex flex-col items-center p-2 rounded-xl border-2 transition-all min-w-[60px]",
                          !formData.receiverBankId ? "border-blue-500 bg-blue-50 ring-4 ring-blue-500/20" : "border-slate-200 bg-white"
                        )}
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-1">
                          <span className="text-lg">🔄</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">อัตโนมัติ</span>
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

                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs text-blue-700">
                      💡 <strong>วิธีใช้:</strong> เลือกธนาคารตัวอย่างสำหรับแสดงโลโก้ในสลิป เลือก &quot;อัตโนมัติ&quot; เพื่อใช้ธนาคารจริงจากข้อมูลสลิป
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="lg:w-[320px]">
            <div className="bg-gradient-to-b from-slate-100 to-slate-50 rounded-2xl p-4 border border-slate-200 sticky top-4">
              <div className="text-center mb-3">
                <p className="font-bold text-slate-700 text-sm">👁️ ตัวอย่างการแสดงผล</p>
                <p className="text-[10px] text-slate-400">ลูกค้าจะเห็นแบบนี้</p>
              </div>
              
              <SlipPreview 
                config={formData} 
                senderBank={senderBank}
                receiverBank={receiverBank}
              />
              
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                <Button variant="primary" fullWidth onClick={handleSubmit} isLoading={isProcessing}>
                  {selectedTemplate ? '💾 บันทึก' : '➕ สร้างเทมเพลต'}
                </Button>
                <Button variant="ghost" fullWidth onClick={() => setShowModal(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="🗑️ ลบเทมเพลต?"
        message={`คุณแน่ใจหรือไม่ว่าต้องการลบ "${selectedTemplate?.name}"?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
