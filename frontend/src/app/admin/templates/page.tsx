'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, lineAccountsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select, Textarea, Switch } from '@/components/ui/Input';
import { Spinner, PageLoading } from '@/components/ui/Loading';

interface SlipTemplate {
  _id: string;
  name: string;
  description?: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault: boolean;
  isActive: boolean;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: 'สำเร็จ', color: 'bg-green-100 text-green-800' },
  { value: 'duplicate', label: 'สลิปซ้ำ', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'error', label: 'ผิดพลาด', color: 'bg-red-100 text-red-800' },
  { value: 'not_found', label: 'ไม่พบ', color: 'bg-gray-100 text-gray-800' },
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
};

function AdminTemplatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accountId);
  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SlipTemplate | null>(null);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch all LINE accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await lineAccountsApi.getAll();
      setAccounts(response.data.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  // Fetch templates for selected account
  const fetchTemplates = useCallback(async () => {
    if (!selectedAccountId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/line-accounts/${selectedAccountId}/slip-templates`);
      if (response.data.success) {
        setTemplates(response.data.templates || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลด Templates ได้');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchTemplates();
  }, [selectedAccountId, fetchTemplates]);

  const handleSelectAccount = (id: string) => {
    setSelectedAccountId(id);
    router.push(`/admin/templates?accountId=${id}`, { scroll: false });
  };

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
      await api.post(`/line-accounts/${selectedAccountId}/slip-templates`, formData);
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
      await api.put(`/line-accounts/${selectedAccountId}/slip-templates/${selectedTemplate._id}`, formData);
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
      await api.delete(`/line-accounts/${selectedAccountId}/slip-templates/${selectedTemplate._id}`);
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
      await api.put(`/line-accounts/${selectedAccountId}/slip-templates/${templateId}/default`);
      toast.success('ตั้งเป็น Default สำเร็จ');
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถตั้งเป็น Default ได้');
    }
  };

  const handleInitDefaults = async () => {
    setIsProcessing(true);
    try {
      await api.post(`/line-accounts/${selectedAccountId}/slip-templates/init-defaults`);
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

  const selectedAccount = accounts.find(a => a._id === selectedAccountId);

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
              label="จำนวนเงิน"
            />
            <Switch
              checked={formData.showSender}
              onChange={(checked) => setFormData({ ...formData, showSender: checked })}
              label="ผู้โอน"
            />
            <Switch
              checked={formData.showReceiver}
              onChange={(checked) => setFormData({ ...formData, showReceiver: checked })}
              label="ผู้รับ"
            />
            <Switch
              checked={formData.showDate}
              onChange={(checked) => setFormData({ ...formData, showDate: checked })}
              label="วันที่"
            />
            <Switch
              checked={formData.showTime}
              onChange={(checked) => setFormData({ ...formData, showTime: checked })}
              label="เวลา"
            />
            <Switch
              checked={formData.showTransRef}
              onChange={(checked) => setFormData({ ...formData, showTransRef: checked })}
              label="เลขอ้างอิง"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">ตัวอย่าง</p>
          <div className="border rounded-lg overflow-hidden">
            <div className="h-2" style={{ backgroundColor: formData.primaryColor }} />
            <div className="p-4 bg-gray-50">
              {formData.headerText && (
                <p className="font-semibold mb-2">{formData.headerText}</p>
              )}
              <div className="space-y-1 text-sm text-gray-600">
                {formData.showAmount && <p>💰 จำนวนเงิน: 1,000.00 บาท</p>}
                {formData.showSender && <p>👤 ผู้โอน: นาย ทดสอบ</p>}
                {formData.showReceiver && <p>🏦 ผู้รับ: บริษัท ABC</p>}
                {formData.showDate && <p>📅 วันที่: 23/12/2025</p>}
                {formData.showTime && <p>🕐 เวลา: 14:30:00</p>}
                {formData.showTransRef && <p>🔢 เลขอ้างอิง: 123456789</p>}
              </div>
              {formData.footerText && (
                <p className="text-sm text-gray-500 mt-2 pt-2 border-t">{formData.footerText}</p>
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
            <h1 className="page-title">จัดการ Templates</h1>
            <p className="page-subtitle">จัดการรูปแบบการตอบกลับสลิปสำหรับแต่ละบัญชี LINE</p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="w-64"
            >
              <option value="">-- เลือกบัญชี LINE --</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.accountName}
                </option>
              ))}
            </Select>
            {selectedAccountId && (
              <Button variant="primary" onClick={openCreateModal}>
                + สร้าง Template
              </Button>
            )}
          </div>
        </div>

        {!selectedAccountId ? (
          <Card className="p-12">
            <EmptyState
              icon={
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="เลือกบัญชี LINE"
              description="กรุณาเลือกบัญชี LINE เพื่อจัดการ Templates"
            />
          </Card>
        ) : loading ? (
          <PageLoading message="กำลังโหลด Templates..." />
        ) : templates.length === 0 ? (
          <Card className="p-12">
            <EmptyState
              icon={
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="ยังไม่มี Template"
              description="สร้าง Template เพื่อกำหนดรูปแบบการตอบกลับสลิป"
              action={
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={handleInitDefaults} isLoading={isProcessing}>
                    สร้าง Template เริ่มต้น
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
            {/* Account Info */}
            {selectedAccount && (
              <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{selectedAccount.accountName}</h2>
                      <p className="text-white/80 text-sm">{templates.length} Templates</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/20"
                    onClick={handleInitDefaults}
                    disabled={isProcessing}
                  >
                    + เพิ่ม Template เริ่มต้น
                  </Button>
                </div>
              </Card>
            )}

            {/* Templates Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => {
                const typeInfo = getTypeInfo(template.type);
                return (
                  <Card key={template._id} className="overflow-hidden p-0">
                    <div className="h-2" style={{ backgroundColor: template.primaryColor || '#00C851' }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{template.name}</h3>
                          {template.description && (
                            <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                          )}
                        </div>
                        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                      </div>

                      {template.headerText && (
                        <p className="text-sm text-gray-600 mb-2">Header: {template.headerText}</p>
                      )}

                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.showAmount && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">จำนวนเงิน</span>
                        )}
                        {template.showSender && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">ผู้โอน</span>
                        )}
                        {template.showReceiver && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">ผู้รับ</span>
                        )}
                        {template.showDate && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">วันที่</span>
                        )}
                        {template.showTime && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">เวลา</span>
                        )}
                        {template.showTransRef && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">เลขอ้างอิง</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t">
                        <div>
                          {template.isDefault ? (
                            <Badge variant="success" size="sm">✓ Default</Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefault(template._id)}
                            >
                              ตั้งเป็น Default
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(template)}
                          >
                            แก้ไข
                          </Button>
                          {!template.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setSelectedTemplate(template);
                                setShowDeleteConfirm(true);
                              }}
                            >
                              ลบ
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      <TemplateFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        title="สร้าง Template ใหม่"
        submitText="สร้าง Template"
      />

      {/* Edit Modal */}
      <TemplateFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdate}
        title="แก้ไข Template"
        submitText="บันทึก"
      />

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="ยืนยันการลบ Template"
        message={`คุณต้องการลบ Template "${selectedTemplate?.name}" หรือไม่?`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}

export default function AdminTemplatesPage() {
  return (
    <Suspense fallback={
      <DashboardLayout requiredRole="admin">
        <PageLoading message="กำลังโหลด..." />
      </DashboardLayout>
    }>
      <AdminTemplatesContent />
    </Suspense>
  );
}
