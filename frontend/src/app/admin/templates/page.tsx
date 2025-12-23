'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, banksApi } from '@/lib/api';
import { Bank } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
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
  showDelayWarning: boolean;
  delayWarningMinutes: number;
  bankId?: string;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', color: 'emerald', icon: '✅', description: 'สลิปที่ผ่านการยืนยันแล้ว' },
  { value: 'duplicate', label: 'สลิปซ้ำ', color: 'amber', icon: '⚠️', description: 'รายการที่เคยตรวจสอบแล้ว' },
  { value: 'error', label: 'เกิดข้อผิดพลาด', color: 'rose', icon: '❌', description: 'ข้อผิดพลาดในการประมวลผล' },
  { value: 'not_found', label: 'ไม่พบข้อมูล', color: 'slate', icon: '🔍', description: 'ไม่พบรายการธุรกรรม' },
] as const;

const DEFAULT_FORM_DATA = {
  name: '',
  description: '',
  type: 'success' as 'success' | 'duplicate' | 'error' | 'not_found',
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
  showBankLogo: false,
  showDelayWarning: false,
  delayWarningMinutes: 5,
  bankId: '',
};

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SlipTemplate | null>(null);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [isProcessing, setIsProcessing] = useState(false);

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
      setBanks(response.data.banks || []);
    } catch (err) {
      console.error('Failed to load banks:', err);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchBanks();
  }, [fetchTemplates, fetchBanks]);

  const openCreateModal = () => {
    setFormData(DEFAULT_FORM_DATA);
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

  const templatesByType = templates.reduce((acc, template) => {
    if (!acc[template.type]) {
      acc[template.type] = [];
    }
    acc[template.type].push(template);
    return acc;
  }, {} as Record<string, SlipTemplate[]>);

  // Bank Selection Component with Logo Preview
  const BankSelector = () => {
    const selectedBank = banks.find(b => b._id === formData.bankId);

    return (
      <div className="space-y-4">
        <label className="block text-sm font-bold text-slate-700">เลือกธนาคาร</label>

        {/* Visual Bank Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-[200px] overflow-y-auto p-2">
          {/* Default Option */}
          <button
            type="button"
            onClick={() => setFormData({ ...formData, bankId: '' })}
            className={cn(
              "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200",
              !formData.bankId
                ? "border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/20"
                : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">
              🏦
            </div>
            <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">ค่าเริ่มต้น</span>
          </button>

          {/* Bank Options with Logos */}
          {banks.filter(b => b.isActive).map((bank) => (
            <button
              key={bank._id}
              type="button"
              onClick={() => setFormData({ ...formData, bankId: bank._id })}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200",
                formData.bankId === bank._id
                  ? "border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/20"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-inner"
                style={{ backgroundColor: bank.color ? `${bank.color}15` : undefined }}
              >
                {bank.logoUrl ? (
                  <img src={bank.logoUrl} alt={bank.shortName} className="w-8 h-8 object-contain" />
                ) : bank.logoBase64 ? (
                  <img src={bank.logoBase64} alt={bank.shortName} className="w-8 h-8 object-contain" />
                ) : (
                  <span className="text-xs font-black" style={{ color: bank.color }}>{bank.shortName?.substring(0, 3)}</span>
                )}
              </div>
              <span className="text-[10px] font-bold text-slate-600 text-center leading-tight truncate w-full">
                {bank.shortName || bank.code}
              </span>
            </button>
          ))}
        </div>

        {/* Selected Bank Info */}
        {selectedBank && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow"
              style={{ backgroundColor: selectedBank.color ? `${selectedBank.color}15` : undefined }}
            >
              {selectedBank.logoUrl ? (
                <img src={selectedBank.logoUrl} alt={selectedBank.name} className="w-10 h-10 object-contain" />
              ) : selectedBank.logoBase64 ? (
                <img src={selectedBank.logoBase64} alt={selectedBank.name} className="w-10 h-10 object-contain" />
              ) : (
                <span className="text-lg">🏦</span>
              )}
            </div>
            <div>
              <p className="font-bold text-emerald-800">{selectedBank.name}</p>
              <p className="text-xs text-emerald-600">{selectedBank.nameTh || selectedBank.nameEn}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Preview Component
  const PreviewComponent = ({ config, type }: { config: typeof DEFAULT_FORM_DATA, type?: 'success' | 'duplicate' }) => {
    const isDuplicate = type === 'duplicate' || config.type === 'duplicate';
    const mainColor = isDuplicate ? '#f59e0b' : config.primaryColor;
    const selectedBank = banks.find(b => b._id === config.bankId);

    return (
      <div className="bg-slate-900/5 backdrop-blur-3xl rounded-3xl p-4 sm:p-6 border border-white max-w-full sm:max-w-[340px] w-full mx-auto shadow-xl">
        {/* Header */}
        <div
          className="rounded-2xl p-4 mb-4 flex items-center gap-3"
          style={{ backgroundColor: `${mainColor}15` }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-black shadow-lg"
            style={{ backgroundColor: mainColor }}
          >
            {isDuplicate ? '!' : '✓'}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold opacity-40 mb-1">สถานะการตรวจสอบ</p>
            <span className="font-bold text-sm" style={{ color: mainColor }}>
              {config.headerText || (isDuplicate ? 'พบสลิปซ้ำ' : 'ตรวจสอบสำเร็จ')}
            </span>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-sm border border-white/50 space-y-4">
          {/* Amount */}
          {config.showAmount && (
            <div className="text-center py-2">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">จำนวนเงิน</p>
              <p className="text-2xl sm:text-3xl font-black" style={{ color: mainColor }}>฿1,250.00</p>
              {(config.showDate || config.showTime) && (
                <p className="text-[10px] font-medium text-slate-400 mt-1">24 ธ.ค. 2568 • 09:41</p>
              )}
            </div>
          )}

          {/* Sender & Receiver */}
          <div className="space-y-3">
            {config.showSender && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                {config.showBankLogo && (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-inner">
                    {selectedBank?.logoUrl ? (
                      <img src={selectedBank.logoUrl} alt="Bank" className="w-8 h-8 object-contain" />
                    ) : selectedBank?.logoBase64 ? (
                      <img src={selectedBank.logoBase64} alt="Bank" className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="text-lg">🏦</span>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">ผู้โอน</p>
                  <p className="text-sm font-bold text-slate-900 truncate">นายตัวอย่าง ทดสอบ</p>
                  <p className="text-[10px] text-slate-400">xxx-x-x1234-x</p>
                </div>
              </div>
            )}
            {config.showReceiver && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                {config.showBankLogo && (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-blue-50 shadow-inner">
                    <span className="text-lg">🏦</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400 mb-0.5">ผู้รับ</p>
                  <p className="text-sm font-bold text-slate-900 truncate">บริษัท ตัวอย่าง จำกัด</p>
                  <p className="text-[10px] text-slate-400">xxx-x-x5678-x</p>
                </div>
              </div>
            )}
          </div>

          {/* Transaction Reference */}
          {config.showTransRef && (
            <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded-xl">
              <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">รหัสอ้างอิง</span>
              <span className="text-xs font-mono font-bold">RX-084-2219</span>
            </div>
          )}

          {/* Duplicate Warning */}
          {isDuplicate && (
            <div className="p-4 bg-amber-500 rounded-xl text-center shadow-lg">
              <p className="text-xs text-white font-bold uppercase tracking-wide mb-1">⚠️ คำเตือน</p>
              <p className="text-[10px] text-amber-50/90 leading-tight">
                พบสลิปนี้ถูกใช้งานแล้ว {config.showDelayWarning ? `(ภายใน ${config.delayWarningMinutes} นาที)` : ''}
              </p>
            </div>
          )}

          {/* Footer */}
          {(config.footerText || config.footerLink) && (
            <div className="pt-2 text-center">
              {config.footerText && <p className="text-[10px] font-medium text-slate-400">{config.footerText}</p>}
              {config.footerLink && config.footerLinkText && (
                <p className="text-[10px] text-indigo-500 font-bold mt-1 underline">{config.footerLinkText}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Template Form Modal - Redesigned for better UX
  const TemplateFormModal = ({ isOpen, onClose, onSubmit, title, submitText }: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    title: string;
    submitText: string;
  }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Panel */}
        <div className="flex-1 space-y-6 order-2 lg:order-1">
          {/* Basic Info Section */}
          <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="text-lg">📝</span> ข้อมูลพื้นฐาน
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="ชื่อเทมเพลต"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="เช่น เทมเพลตหลัก"
              />
              <Select
                label="ประเภท"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </Select>
            </div>
            <Textarea
              label="คำอธิบาย (ไม่บังคับ)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="อธิบายการใช้งานเทมเพลตนี้..."
              rows={2}
            />
          </div>

          {/* Bank Selection Section */}
          <div className="bg-slate-50 rounded-2xl p-5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <span className="text-lg">🏦</span> โลโก้ธนาคาร
            </h3>
            <BankSelector />
          </div>

          {/* Appearance Section */}
          <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="text-lg">🎨</span> การแสดงผล
            </h3>

            {/* Color Picker */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-700">สีหลัก</p>
                <p className="text-xs text-slate-400">สีที่ใช้แสดงในเทมเพลต</p>
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border-none cursor-pointer"
                />
                <span className="font-mono text-xs text-slate-500 px-2">{formData.primaryColor}</span>
              </div>
            </div>

            {/* Text Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="ข้อความหัว"
                value={formData.headerText}
                onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
                placeholder="เช่น ✅ ตรวจสอบสำเร็จ"
              />
              <Input
                label="ข้อความท้าย"
                value={formData.footerText}
                onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                placeholder="เช่น ขอบคุณที่ใช้บริการ"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="ลิงก์ (URL)"
                value={formData.footerLink}
                onChange={(e) => setFormData({ ...formData, footerLink: e.target.value })}
                placeholder="https://..."
              />
              <Input
                label="ข้อความลิงก์"
                value={formData.footerLinkText}
                onChange={(e) => setFormData({ ...formData, footerLinkText: e.target.value })}
                placeholder="ดูรายละเอียด"
              />
            </div>
          </div>

          {/* Display Options Section */}
          <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="text-lg">👁️</span> ตัวเลือกการแสดง
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: 'จำนวนเงิน', key: 'showAmount', icon: '💰' },
                { label: 'ผู้โอน', key: 'showSender', icon: '👤' },
                { label: 'ผู้รับ', key: 'showReceiver', icon: '🏦' },
                { label: 'วันที่', key: 'showDate', icon: '📅' },
                { label: 'เวลา', key: 'showTime', icon: '🕐' },
                { label: 'รหัสอ้างอิง', key: 'showTransRef', icon: '🔢' },
                { label: 'โลโก้ธนาคาร', key: 'showBankLogo', icon: '🖼️' },
              ].map((item) => (
                <div key={item.key} className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-slate-200 hover:border-emerald-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{item.icon}</span>
                    <Switch
                      checked={(formData as any)[item.key]}
                      onChange={(checked) => setFormData({ ...formData, [item.key]: checked })}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Duplicate Warning Options */}
          {formData.type === 'duplicate' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-amber-50 rounded-2xl p-5 space-y-4 border border-amber-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-amber-900">⚠️ แจ้งเตือนสลิปซ้ำ</h4>
                  <p className="text-xs text-amber-600">แสดงระยะเวลาที่ผ่านมา</p>
                </div>
                <Switch
                  checked={formData.showDelayWarning}
                  onChange={(checked) => setFormData({ ...formData, showDelayWarning: checked })}
                />
              </div>
              {formData.showDelayWarning && (
                <Input
                  label="ระยะเวลา (นาที)"
                  type="number"
                  value={formData.delayWarningMinutes}
                  onChange={(e) => setFormData({ ...formData, delayWarningMinutes: parseInt(e.target.value) || 5 })}
                  className="bg-white"
                />
              )}
            </motion.div>
          )}

          {/* Action Buttons - Mobile */}
          <div className="block lg:hidden space-y-3 pt-4">
            <Button
              variant="primary"
              fullWidth
              size="lg"
              className="rounded-xl font-bold"
              onClick={onSubmit}
              isLoading={isProcessing}
            >
              {submitText}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              className="text-slate-400"
              onClick={onClose}
            >
              ยกเลิก
            </Button>
          </div>
        </div>

        {/* Preview Panel - Fixed on Desktop */}
        <div className="lg:w-[380px] lg:sticky lg:top-0 order-1 lg:order-2">
          <div className="bg-gradient-to-b from-slate-100 to-slate-50 rounded-3xl p-6 border border-slate-200">
            <div className="text-center mb-6">
              <h4 className="font-bold text-slate-700">👁️ ตัวอย่างการแสดงผล</h4>
              <p className="text-xs text-slate-400">ลูกค้าจะเห็นแบบนี้</p>
            </div>

            <PreviewComponent config={formData} />

            {/* Action Buttons - Desktop */}
            <div className="hidden lg:block space-y-3 pt-6">
              <Button
                variant="primary"
                fullWidth
                size="lg"
                className="rounded-xl font-bold shadow-lg shadow-emerald-500/20"
                onClick={onSubmit}
                isLoading={isProcessing}
              >
                {submitText}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                className="text-slate-400"
                onClick={onClose}
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );

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
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={handleInitDefaults}
              isLoading={isProcessing}
            >
              รีเซ็ตค่าเริ่มต้น
            </Button>
            <Button
              variant="primary"
              className="flex-1 sm:flex-none shadow-lg shadow-emerald-500/20"
              onClick={openCreateModal}
            >
              + สร้างเทมเพลต
            </Button>
          </div>
        </div>

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
                        {/* Preview */}
                        <div className="relative h-56 bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-6 overflow-hidden">
                          <div className="transform scale-[0.65] group-hover:scale-[0.7] transition-transform duration-500">
                            <PreviewComponent config={{ ...DEFAULT_FORM_DATA, ...template }} type={template.type as any} />
                          </div>

                          {/* Hover Actions */}
                          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
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
                              <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{template.name}</h3>
                              <p className="text-xs text-slate-400 truncate max-w-[200px]">{template.description || 'ไม่มีคำอธิบาย'}</p>
                            </div>
                            {template.isDefault && (
                              <Badge variant="emerald" size="sm">ค่าเริ่มต้น</Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {template.showAmount && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">จำนวนเงิน</span>}
                            {template.showSender && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">ผู้โอน</span>}
                            {template.showReceiver && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">ผู้รับ</span>}
                            {template.showBankLogo && <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded">โลโก้</span>}
                          </div>

                          {!template.isDefault && (
                            <div className="pt-3 border-t border-slate-100">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-slate-400 hover:text-emerald-500 px-0"
                                onClick={() => handleSetDefault(template._id)}
                              >
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

      {/* Modals */}
      <TemplateFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        title="สร้างเทมเพลตใหม่"
        submitText="สร้างเทมเพลต"
      />

      <TemplateFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdate}
        title="แก้ไขเทมเพลต"
        submitText="บันทึกการเปลี่ยนแปลง"
      />

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
