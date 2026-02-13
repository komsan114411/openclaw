'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Switch } from '@/components/ui/Input';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Edit,
  Eye,
  RotateCcw,
  Loader2,
  Palette,
  FileText,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { systemResponseTemplatesApi } from '@/lib/api';

interface SystemResponseTemplate {
  type: string;
  name: string;
  description: string;
  responseFormat: 'text' | 'flex';
  textMessage?: string;
  title?: string;
  mainMessage?: string;
  subMessage?: string;
  customFlexTemplate?: Record<string, unknown>;
  useCustomTemplate?: boolean;
  styling?: SystemResponseStyling;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface SystemResponseStyling {
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  icon?: string;
  showIcon?: boolean;
  showContactButton?: boolean;
  contactButtonText?: string;
  contactButtonUrl?: string;
  showRetryButton?: boolean;
  retryButtonText?: string;
}

interface FormData {
  name: string;
  description: string;
  responseFormat: 'text' | 'flex';
  textMessage: string;
  title: string;
  mainMessage: string;
  subMessage: string;
  useCustomTemplate: boolean;
  styling: SystemResponseStyling;
  isActive: boolean;
}

const defaultFormData: FormData = {
  name: '',
  description: '',
  responseFormat: 'text',
  textMessage: '',
  title: '',
  mainMessage: '',
  subMessage: '',
  useCustomTemplate: false,
  styling: {
    primaryColor: '#DC2626',
    textColor: '#FFFFFF',
    backgroundColor: '#FEE2E2',
    icon: '🔴',
    showIcon: true,
    showContactButton: false,
    contactButtonText: 'ติดต่อเรา',
    contactButtonUrl: '',
    showRetryButton: false,
    retryButtonText: 'ลองใหม่',
  },
  isActive: true,
};

// Template metadata
const TEMPLATE_METADATA: Record<string, { icon: string; color: string; thName: string }> = {
  QUOTA_EXHAUSTED: { icon: '🔴', color: '#DC2626', thName: 'โควต้าหมด' },
  PACKAGE_EXPIRED: { icon: '⏰', color: '#F59E0B', thName: 'แพ็คเกจหมดอายุ' },
  SLIP_NOT_FOUND: { icon: '❌', color: '#EF4444', thName: 'ไม่พบสลิป' },
  SYSTEM_ERROR: { icon: '⚠️', color: '#F97316', thName: 'เกิดข้อผิดพลาด' },
  BOT_DISABLED: { icon: '🔴', color: '#64748B', thName: 'ปิดให้บริการ (บอท)' },
  PROCESSING: { icon: '⏳', color: '#0EA5E9', thName: 'กำลังตรวจสอบ' },
  SLIP_DISABLED: { icon: '🔴', color: '#64748B', thName: 'ปิดให้บริการ (สลิป)' },
  QUOTA_LOW: { icon: '⚠️', color: '#EAB308', thName: 'โควต้าใกล้หมด' },
};

// Color presets for quick selection
const COLOR_PRESETS = [
  { bg: '#DC2626', text: '#FFFFFF', name: 'Red' },
  { bg: '#F59E0B', text: '#FFFFFF', name: 'Orange' },
  { bg: '#EF4444', text: '#FFFFFF', name: 'Rose' },
  { bg: '#F97316', text: '#FFFFFF', name: 'Amber' },
  { bg: '#64748B', text: '#FFFFFF', name: 'Slate' },
  { bg: '#0EA5E9', text: '#FFFFFF', name: 'Blue' },
  { bg: '#EAB308', text: '#FFFFFF', name: 'Yellow' },
  { bg: '#06C755', text: '#FFFFFF', name: 'Green' },
];

export default function SystemResponsesPage() {
  const [templates, setTemplates] = useState<SystemResponseTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SystemResponseTemplate | null>(null);
  const [previewData, setPreviewData] = useState<string>('');
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await systemResponseTemplatesApi.getAll();
      if (response.data.success) {
        setTemplates(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      toast.error('ไม่สามารถโหลดเทมเพลตได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (template: SystemResponseTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      responseFormat: template.responseFormat,
      textMessage: template.textMessage || '',
      title: template.title || '',
      mainMessage: template.mainMessage || '',
      subMessage: template.subMessage || '',
      useCustomTemplate: template.useCustomTemplate || false,
      styling: {
        primaryColor: template.styling?.primaryColor || '#DC2626',
        textColor: template.styling?.textColor || '#FFFFFF',
        backgroundColor: template.styling?.backgroundColor || '#FEE2E2',
        icon: template.styling?.icon || TEMPLATE_METADATA[template.type]?.icon || '🔴',
        showIcon: template.styling?.showIcon ?? true,
        showContactButton: template.styling?.showContactButton ?? false,
        contactButtonText: template.styling?.contactButtonText || 'ติดต่อเรา',
        contactButtonUrl: template.styling?.contactButtonUrl || '',
        showRetryButton: template.styling?.showRetryButton ?? false,
        retryButtonText: template.styling?.retryButtonText || 'ลองใหม่',
      },
      isActive: template.isActive,
    });
    setShowModal(true);
  };

  const handlePreview = async (template: SystemResponseTemplate) => {
    try {
      const response = await systemResponseTemplatesApi.preview(template.type);
      if (response.data.success) {
        setPreviewData(JSON.stringify(response.data.data, null, 2));
        setSelectedTemplate(template);
        setShowPreviewModal(true);
      }
    } catch (error) {
      console.error('Failed to preview:', error);
      toast.error('ไม่สามารถดูตัวอย่างได้');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate) return;

    if (!formData.name.trim()) {
      toast.error('กรุณากรอกชื่อเทมเพลต');
      return;
    }

    setIsSaving(true);

    try {
      const response = await systemResponseTemplatesApi.update(selectedTemplate.type, formData);
      if (response.data.success) {
        toast.success('อัปเดตเทมเพลตสำเร็จ');
        setShowModal(false);
        resetForm();
        fetchTemplates();
      } else {
        toast.error(response.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      console.error('Failed to update template:', error);
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await systemResponseTemplatesApi.reset(selectedTemplate.type);
      if (response.data.success) {
        toast.success('รีเซ็ตเทมเพลตสำเร็จ');
        setShowResetModal(false);
        setSelectedTemplate(null);
        fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to reset template:', error);
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleResetAll = async () => {
    try {
      const response = await systemResponseTemplatesApi.resetAll();
      if (response.data.success) {
        toast.success('รีเซ็ตเทมเพลตทั้งหมดสำเร็จ');
        setShowResetAllModal(false);
        fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to reset all templates:', error);
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const resetForm = () => {
    setSelectedTemplate(null);
    setFormData(defaultFormData);
  };

  const stats = {
    total: templates.length,
    active: templates.filter(t => t.isActive).length,
    flex: templates.filter(t => t.responseFormat === 'flex').length,
    text: templates.filter(t => t.responseFormat === 'text').length,
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">ข้อความตอบกลับระบบ</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">จัดการข้อความตอบกลับอัตโนมัติของระบบ</p>
            </div>
          </div>
          <Button
            onClick={() => setShowResetAllModal(true)}
            variant="outline"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            className="border-red-300 text-red-600 hover:bg-red-50 w-full sm:w-auto"
          >
            รีเซ็ตทั้งหมด
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-3 sm:p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-500 flex items-center justify-center shadow-md flex-shrink-0">
                <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl sm:text-3xl font-bold text-purple-700 truncate">{stats.total}</p>
                <p className="text-xs sm:text-sm text-purple-600 truncate">ทั้งหมด</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl sm:text-3xl font-bold text-emerald-700 truncate">{stats.active}</p>
                <p className="text-xs sm:text-sm text-emerald-600 truncate">เปิดใช้งาน</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-md flex-shrink-0">
                <Palette className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl sm:text-3xl font-bold text-blue-700 truncate">{stats.flex}</p>
                <p className="text-xs sm:text-sm text-blue-600 truncate">รูปแบบ Flex</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-500 flex items-center justify-center shadow-md flex-shrink-0">
                <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl sm:text-3xl font-bold text-amber-700 truncate">{stats.text}</p>
                <p className="text-xs sm:text-sm text-amber-600 truncate">รูปแบบข้อความ</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Template List */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-purple-500" />
              <p className="mt-3 text-slate-500">กำลังโหลดเทมเพลต...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <MessageSquare className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-slate-500 text-lg font-medium">ยังไม่มีเทมเพลต</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <AnimatePresence>
                {templates.map((template, index) => {
                  const metadata = TEMPLATE_METADATA[template.type];
                  return (
                    <motion.div
                      key={template.type}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                        {/* Icon */}
                        <div
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm text-xl sm:text-2xl"
                          style={{ backgroundColor: `${metadata?.color}20` }}
                        >
                          {template.styling?.icon || metadata?.icon || '📝'}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-semibold text-slate-800 text-sm sm:text-base">{template.name}</h3>
                            <Badge variant="outline" className="text-[9px] sm:text-[10px]">
                              {template.type}
                            </Badge>
                            {template.isActive ? (
                              <Badge variant="success" className="text-[9px] sm:text-xs">เปิดใช้งาน</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] sm:text-xs">ปิดใช้งาน</Badge>
                            )}
                            <Badge variant={template.responseFormat === 'flex' ? 'info' : 'warning'} className="text-[9px] sm:text-[10px]">
                              {template.responseFormat === 'flex' ? 'FLEX' : 'TEXT'}
                            </Badge>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mb-2 line-clamp-2">{template.description}</p>
                          <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 break-words">
                            {template.mainMessage || template.textMessage || 'ไม่มีข้อความ'}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex sm:flex-col items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                          <button
                            onClick={() => handleEdit(template)}
                            className="p-2 sm:p-2.5 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex-1 sm:flex-none"
                            title="แก้ไข"
                          >
                            <Edit className="w-4 h-4 mx-auto" />
                          </button>
                          <button
                            onClick={() => handlePreview(template)}
                            className="p-2 sm:p-2.5 rounded-xl bg-purple-100 text-purple-600 hover:bg-purple-200 transition-colors flex-1 sm:flex-none"
                            title="ดูตัวอย่าง"
                          >
                            <Eye className="w-4 h-4 mx-auto" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowResetModal(true);
                            }}
                            className="p-2 sm:p-2.5 rounded-xl bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors flex-1 sm:flex-none"
                            title="รีเซ็ต"
                          >
                            <RotateCcw className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </Card>

        {/* Edit Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          title={`แก้ไขเทมเพลต: ${selectedTemplate?.name}`}
          size="xl"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4" />
                ข้อมูลเทมเพลต
              </h3>
              <Input
                label="ชื่อเทมเพลต"
                placeholder="เช่น ข้อความโควต้าหมด"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Textarea
                label="คำอธิบาย"
                placeholder="คำอธิบายเทมเพลต..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Response Format */}
            <div className="space-y-4">
              <h3 className="text-xs sm:text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4" />
                รูปแบบข้อความ
              </h3>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">รูปแบบ</label>
                <select
                  value={formData.responseFormat}
                  onChange={(e) => setFormData({ ...formData, responseFormat: e.target.value as 'text' | 'flex' })}
                  className="w-full h-11 px-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                >
                  <option value="text">ข้อความธรรมดา (TEXT)</option>
                  <option value="flex">Flex Message (FLEX)</option>
                </select>
              </div>
            </div>

            {/* Message Content */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                ข้อความ
              </h3>
              {formData.responseFormat === 'text' ? (
                <Textarea
                  label="ข้อความ"
                  placeholder="ข้อความที่จะแสดงแก่ผู้ใช้..."
                  value={formData.textMessage}
                  onChange={(e) => setFormData({ ...formData, textMessage: e.target.value })}
                  rows={4}
                />
              ) : (
                <>
                  <Input
                    label="หัวข้อ (Title)"
                    placeholder="หัวข้อข้อความ"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                  <Textarea
                    label="ข้อความหลัก (Main Message)"
                    placeholder="ข้อความหลักที่จะแสดง..."
                    value={formData.mainMessage}
                    onChange={(e) => setFormData({ ...formData, mainMessage: e.target.value })}
                    rows={3}
                  />
                  <Input
                    label="ข้อความรอง (Sub Message)"
                    placeholder="ข้อความรองเพิ่มเติม"
                    value={formData.subMessage}
                    onChange={(e) => setFormData({ ...formData, subMessage: e.target.value })}
                  />
                </>
              )}
            </div>

            {/* Styling */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-4 h-4" />
                สไตล์
              </h3>

              {/* Color Presets */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-2">ธีมสี (เลือกด่วน)</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          styling: {
                            ...formData.styling,
                            primaryColor: preset.bg,
                            textColor: preset.text,
                          },
                        })
                      }
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-transform hover:scale-110 ${
                        formData.styling.primaryColor === preset.bg
                          ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-900'
                          : ''
                      }`}
                      style={{ backgroundColor: preset.bg }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>

              {/* Color Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">สีหลัก</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.styling.primaryColor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, primaryColor: e.target.value },
                        })
                      }
                      className="w-11 h-11 rounded-xl cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={formData.styling.primaryColor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, primaryColor: e.target.value },
                        })
                      }
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">สีตัวอักษร</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.styling.textColor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, textColor: e.target.value },
                        })
                      }
                      className="w-11 h-11 rounded-xl cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={formData.styling.textColor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, textColor: e.target.value },
                        })
                      }
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">สีพื้นหลัง</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.styling.backgroundColor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, backgroundColor: e.target.value },
                        })
                      }
                      className="w-11 h-11 rounded-xl cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={formData.styling.backgroundColor}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, backgroundColor: e.target.value },
                        })
                      }
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Icon */}
              <Input
                label="ไอคอน (Emoji)"
                placeholder="🔴"
                value={formData.styling.icon}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    styling: { ...formData.styling, icon: e.target.value },
                  })
                }
              />

              {/* Switches */}
              <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl">
                <Switch
                  label="แสดงไอคอน"
                  description="แสดงไอคอนในข้อความ"
                  checked={formData.styling.showIcon ?? true}
                  onChange={(checked) =>
                    setFormData({
                      ...formData,
                      styling: { ...formData.styling, showIcon: checked },
                    })
                  }
                />
                <Switch
                  label="แสดงปุ่มติดต่อ"
                  description="แสดงปุ่มติดต่อแอดมิน"
                  checked={formData.styling.showContactButton ?? false}
                  onChange={(checked) =>
                    setFormData({
                      ...formData,
                      styling: { ...formData.styling, showContactButton: checked },
                    })
                  }
                />
                {formData.styling.showContactButton && (
                  <>
                    <Input
                      label="ข้อความปุ่มติดต่อ"
                      placeholder="ติดต่อเรา"
                      value={formData.styling.contactButtonText}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, contactButtonText: e.target.value },
                        })
                      }
                    />
                    <Input
                      label="URL ปุ่มติดต่อ"
                      placeholder="https://line.me/..."
                      value={formData.styling.contactButtonUrl}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          styling: { ...formData.styling, contactButtonUrl: e.target.value },
                        })
                      }
                    />
                  </>
                )}
                <Switch
                  label="แสดงปุ่มลองใหม่"
                  description="แสดงปุ่มลองใหม่"
                  checked={formData.styling.showRetryButton ?? false}
                  onChange={(checked) =>
                    setFormData({
                      ...formData,
                      styling: { ...formData.styling, showRetryButton: checked },
                    })
                  }
                />
                {formData.styling.showRetryButton && (
                  <Input
                    label="ข้อความปุ่มลองใหม่"
                    placeholder="ลองใหม่"
                    value={formData.styling.retryButtonText}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        styling: { ...formData.styling, retryButtonText: e.target.value },
                      })
                    }
                  />
                )}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                ตัวเลือก
              </h3>
              <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl">
                <Switch
                  label="เปิดใช้งานเทมเพลต"
                  description="เปิดใช้งานข้อความตอบกลับนี้"
                  checked={formData.isActive}
                  onChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-slate-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="w-full sm:w-auto"
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !formData.name.trim()}
                className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 w-full sm:w-auto"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  'บันทึกการแก้ไข'
                )}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Preview Modal */}
        <Modal
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewData('');
            setSelectedTemplate(null);
          }}
          title={`ตัวอย่าง: ${selectedTemplate?.name}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-800 rounded-xl">
              <pre className="text-sm text-slate-300 overflow-auto max-h-96 whitespace-pre-wrap">
                {previewData}
              </pre>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewData('');
                  setSelectedTemplate(null);
                }}
              >
                ปิด
              </Button>
            </div>
          </div>
        </Modal>

        {/* Reset Confirmation */}
        <ConfirmModal
          isOpen={showResetModal}
          onClose={() => {
            setShowResetModal(false);
            setSelectedTemplate(null);
          }}
          onConfirm={handleReset}
          title="รีเซ็ตเทมเพลต"
          message={`ต้องการรีเซ็ตเทมเพลต "${selectedTemplate?.name}" กลับเป็นค่าเริ่มต้นหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`}
          confirmText="รีเซ็ตเทมเพลต"
          type="warning"
        />

        {/* Reset All Confirmation */}
        <ConfirmModal
          isOpen={showResetAllModal}
          onClose={() => setShowResetAllModal(false)}
          onConfirm={handleResetAll}
          title="รีเซ็ตเทมเพลตทั้งหมด"
          message="ต้องการรีเซ็ตเทมเพลตทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
          confirmText="รีเซ็ตทั้งหมด"
          type="danger"
        />
      </div>
    </DashboardLayout>
  );
}
