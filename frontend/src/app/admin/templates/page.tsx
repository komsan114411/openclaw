'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select, Textarea, Switch } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';

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
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  showBankLogo: boolean;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: '✅ สำเร็จ', color: 'bg-green-100 text-green-800', icon: '✅' },
  { value: 'duplicate', label: '⚠️ สลิปซ้ำ', color: 'bg-yellow-100 text-yellow-800', icon: '⚠️' },
  { value: 'error', label: '❌ ผิดพลาด', color: 'bg-red-100 text-red-800', icon: '❌' },
  { value: 'not_found', label: '🔍 ไม่พบ', color: 'bg-gray-100 text-gray-800', icon: '🔍' },
];

const DEFAULT_FORM_DATA = {
  name: '',
  description: '',
  type: 'success' as 'success' | 'duplicate' | 'error' | 'not_found',
  primaryColor: '#00C851',
  headerText: '',
  footerText: '',
  showAmount: true,
  showSender: true,
  showReceiver: true,
  showDate: true,
  showTime: true,
  showTransRef: true,
  showBankLogo: false,
};

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SlipTemplate | null>(null);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch global templates
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/slip-templates/global');
      if (response.data.success) {
        setTemplates(response.data.templates || []);
      }
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      toast.error('ไม่สามารถโหลด Templates ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

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
      primaryColor: template.primaryColor || '#00C851',
      headerText: template.headerText || '',
      footerText: template.footerText || '',
      showAmount: template.showAmount,
      showSender: template.showSender,
      showReceiver: template.showReceiver,
      showDate: template.showDate,
      showTime: template.showTime,
      showTransRef: template.showTransRef,
      showBankLogo: template.showBankLogo,
    });
    setShowEditModal(true);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('กรุณากรอกชื่อ Template');
      return;
    }

    setIsProcessing(true);
    try {
      await api.post('/slip-templates/global', formData);
      toast.success('สร้าง Template สำเร็จ');
      setShowCreateModal(false);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถสร้าง Template ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTemplate || !formData.name.trim()) {
      toast.error('กรุณากรอกชื่อ Template');
      return;
    }

    setIsProcessing(true);
    try {
      await api.put(`/slip-templates/global/${selectedTemplate._id}`, formData);
      toast.success('อัปเดต Template สำเร็จ');
      setShowEditModal(false);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถอัปเดต Template ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    setIsProcessing(true);
    try {
      await api.delete(`/slip-templates/global/${selectedTemplate._id}`);
      toast.success('ลบ Template สำเร็จ');
      setShowDeleteConfirm(false);
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถลบ Template ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      await api.put(`/slip-templates/global/${templateId}/default`);
      toast.success('ตั้งเป็น Default สำเร็จ');
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถตั้งเป็น Default ได้');
    }
  };

  const handleInitDefaults = async () => {
    setIsProcessing(true);
    try {
      await api.post('/slip-templates/global/init-defaults');
      toast.success('สร้าง Template เริ่มต้นสำเร็จ');
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถสร้าง Template เริ่มต้นได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const getTypeInfo = (type: string) => {
    return TYPE_OPTIONS.find(t => t.value === type) || TYPE_OPTIONS[0];
  };

  // Group templates by type
  const templatesByType = templates.reduce((acc, template) => {
    if (!acc[template.type]) {
      acc[template.type] = [];
    }
    acc[template.type].push(template);
    return acc;
  }, {} as Record<string, SlipTemplate[]>);

  const TemplateFormModal = ({ isOpen, onClose, onSubmit, title, submitText }: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    title: string;
    submitText: string;
  }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <Input
          label="ชื่อ Template *"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="เช่น Template สำเร็จ"
          disabled={isProcessing}
        />

        <Textarea
          label="คำอธิบาย"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
          rows={2}
          disabled={isProcessing}
        />

        <Select
          label="ประเภท"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
          disabled={isProcessing}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">สีหลัก</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.primaryColor}
              onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
              className="w-12 h-10 rounded border cursor-pointer"
              disabled={isProcessing}
            />
            <Input
              value={formData.primaryColor}
              onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
              className="flex-1"
              disabled={isProcessing}
            />
          </div>
        </div>

        <Input
          label="ข้อความ Header"
          value={formData.headerText}
          onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
          placeholder="เช่น ✅ ตรวจสอบสลิปสำเร็จ"
          disabled={isProcessing}
        />

        <Input
          label="ข้อความ Footer"
          value={formData.footerText}
          onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
          placeholder="เช่น ขอบคุณที่ใช้บริการ"
          disabled={isProcessing}
        />

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">ข้อมูลที่แสดง</p>
          <div className="grid grid-cols-2 gap-3">
            <Switch
              checked={formData.showAmount}
              onChange={(checked) => setFormData({ ...formData, showAmount: checked })}
              label="💰 จำนวนเงิน"
            />
            <Switch
              checked={formData.showSender}
              onChange={(checked) => setFormData({ ...formData, showSender: checked })}
              label="👤 ผู้โอน"
            />
            <Switch
              checked={formData.showReceiver}
              onChange={(checked) => setFormData({ ...formData, showReceiver: checked })}
              label="🏦 ผู้รับ"
            />
            <Switch
              checked={formData.showDate}
              onChange={(checked) => setFormData({ ...formData, showDate: checked })}
              label="📅 วันที่"
            />
            <Switch
              checked={formData.showTime}
              onChange={(checked) => setFormData({ ...formData, showTime: checked })}
              label="🕐 เวลา"
            />
            <Switch
              checked={formData.showTransRef}
              onChange={(checked) => setFormData({ ...formData, showTransRef: checked })}
              label="🔢 เลขอ้างอิง"
            />
            <Switch
              checked={formData.showBankLogo}
              onChange={(checked) => setFormData({ ...formData, showBankLogo: checked })}
              label="🏦 โลโก้ธนาคาร"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">👁️ ตัวอย่าง</p>
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="h-2" style={{ backgroundColor: formData.primaryColor }} />
            <div className="p-4 bg-gray-50">
              {formData.headerText && (
                <p className="font-semibold mb-3 text-lg" style={{ color: formData.primaryColor }}>
                  {formData.headerText}
                </p>
              )}
              <div className="space-y-2 text-sm text-gray-600">
                {formData.showAmount && <p>💰 จำนวนเงิน: <span className="font-medium text-gray-900">1,000.00 บาท</span></p>}
                {formData.showSender && <p>👤 ผู้โอน: <span className="font-medium text-gray-900">นาย ทดสอบ</span></p>}
                {formData.showReceiver && <p>🏦 ผู้รับ: <span className="font-medium text-gray-900">บริษัท ABC</span></p>}
                {formData.showDate && <p>📅 วันที่: <span className="font-medium text-gray-900">23/12/2025</span></p>}
                {formData.showTime && <p>🕐 เวลา: <span className="font-medium text-gray-900">14:30:00</span></p>}
                {formData.showTransRef && <p>🔢 เลขอ้างอิง: <span className="font-medium text-gray-900">123456789</span></p>}
              </div>
              {formData.footerText && (
                <p className="text-sm text-gray-500 mt-3 pt-3 border-t">{formData.footerText}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={isProcessing}>
            ยกเลิก
          </Button>
          <Button variant="primary" fullWidth onClick={onSubmit} isLoading={isProcessing}>
            {submitText}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">🎨 จัดการ Templates (ส่วนกลาง)</h1>
            <p className="page-subtitle">สร้าง Template กลางสำหรับให้ผู้ใช้ทุกคนเลือกใช้</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={openCreateModal}>
              + สร้าง Template ใหม่
            </Button>
          </div>
        </div>

        {/* Info Card */}
        <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">Templates ส่วนกลาง</h2>
              <p className="text-white/80 text-sm">
                สร้าง Template ที่นี่เพื่อให้ผู้ใช้ทุกคนสามารถเลือกใช้ได้ โดยไม่ต้องสร้างเอง
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{templates.length}</p>
              <p className="text-white/70 text-sm">Templates</p>
            </div>
          </div>
        </Card>

        {loading ? (
          <PageLoading message="กำลังโหลด Templates..." />
        ) : templates.length === 0 ? (
          <Card className="p-12">
            <EmptyState
              icon={
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="ยังไม่มี Template ส่วนกลาง"
              description="สร้าง Template เพื่อให้ผู้ใช้ทุกคนสามารถเลือกใช้ได้"
              action={
                <div className="flex gap-3 justify-center">
                  <Button variant="secondary" onClick={handleInitDefaults} isLoading={isProcessing}>
                    🚀 สร้าง Template เริ่มต้น
                  </Button>
                  <Button variant="primary" onClick={openCreateModal}>
                    + สร้าง Template ใหม่
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            {/* Templates by Type */}
            {TYPE_OPTIONS.map((typeOption) => {
              const typeTemplates = templatesByType[typeOption.value] || [];
              if (typeTemplates.length === 0) return null;

              return (
                <div key={typeOption.value}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">{typeOption.icon}</span>
                    <h2 className="text-lg font-semibold text-gray-900">{typeOption.label}</h2>
                    <Badge className={typeOption.color}>{typeTemplates.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {typeTemplates.map((template) => (
                      <Card key={template._id} className="overflow-hidden p-0 hover:shadow-lg transition-shadow">
                        {/* Mini Preview */}
                        <div className="p-3" style={{ backgroundColor: '#f8f9fa' }}>
                          <div className="bg-white rounded-xl p-3 shadow-sm border" style={{ maxWidth: '220px', margin: '0 auto' }}>
                            {/* Header */}
                            <div 
                              className="flex items-center gap-2 p-2 rounded-lg mb-2"
                              style={{ backgroundColor: `${template.primaryColor}15` }}
                            >
                              <div 
                                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: template.primaryColor || '#00C851' }}
                              >✓</div>
                              <span className="text-xs font-semibold" style={{ color: template.primaryColor }}>
                                {template.headerText || 'สลิปถูกต้อง'}
                              </span>
                            </div>
                            {/* Amount */}
                            {template.showAmount && (
                              <div className="text-center mb-2">
                                <span className="text-lg font-bold" style={{ color: template.primaryColor }}>฿2,000</span>
                                <div className="text-[10px] text-gray-400">23 ธ.ค. 68, 13:36 น.</div>
                              </div>
                            )}
                            {/* Sender/Receiver */}
                            <div className="space-y-1">
                              {template.showSender && (
                                <div className="flex items-center gap-2 p-1.5 bg-gray-50 rounded-lg">
                                  <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center text-[10px]">🏦</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[9px] text-gray-400">ผู้โอน</div>
                                    <div className="text-[10px] font-medium truncate">นาย ตัวอย่าง</div>
                                  </div>
                                </div>
                              )}
                              {template.showReceiver && (
                                <div className="flex items-center gap-2 p-1.5 bg-gray-50 rounded-lg">
                                  <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center text-[10px]">🏦</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[9px] text-gray-400">ผู้รับ</div>
                                    <div className="text-[10px] font-medium truncate">นาย ผู้รับ</div>
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Footer */}
                            {template.footerText && (
                              <div className="mt-2 p-1.5 bg-gray-100 rounded text-center">
                                <span className="text-[8px] text-gray-500">{template.footerText}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="p-4 border-t">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 text-sm">{template.name}</h3>
                              {template.description && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{template.description}</p>
                              )}
                            </div>
                            {template.isDefault && (
                              <Badge variant="success" size="sm">✓ Default</Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1 mb-2">
                            {template.showAmount && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">💰</span>
                            )}
                            {template.showSender && (
                              <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">👤</span>
                            )}
                            {template.showReceiver && (
                              <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">🏦</span>
                            )}
                            {template.showDate && (
                              <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">📅</span>
                            )}
                            {template.showTime && (
                              <span className="text-[10px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded">🕐</span>
                            )}
                            {template.showTransRef && (
                              <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">🔢</span>
                            )}
                            {template.showBankLogo && (
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">🖼️</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t">
                            <div>
                              {!template.isDefault && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSetDefault(template._id)}
                                >
                                  ตั้งเป็น Default
                                </Button>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(template)}
                              >
                                ✏️ แก้ไข
                              </Button>
                              {!template.isDefault && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    setSelectedTemplate(template);
                                    setShowDeleteConfirm(true);
                                  }}
                                >
                                  🗑️
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Add more button */}
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={openCreateModal}>
                + เพิ่ม Template ใหม่
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      <TemplateFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        title="🎨 สร้าง Template ใหม่"
        submitText="สร้าง Template"
      />

      {/* Edit Modal */}
      <TemplateFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdate}
        title="✏️ แก้ไข Template"
        submitText="บันทึก"
      />

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="🗑️ ยืนยันการลบ Template"
        message={`คุณต้องการลบ Template "${selectedTemplate?.name}" หรือไม่? การลบนี้จะมีผลกับผู้ใช้ทุกคนที่ใช้ Template นี้`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
