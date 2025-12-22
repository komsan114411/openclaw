'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  success: { label: 'สำเร็จ', color: 'bg-green-100 text-green-800' },
  duplicate: { label: 'สลิปซ้ำ', color: 'bg-yellow-100 text-yellow-800' },
  error: { label: 'ผิดพลาด', color: 'bg-red-100 text-red-800' },
  not_found: { label: 'ไม่พบ', color: 'bg-gray-100 text-gray-800' },
};

export default function SlipTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SlipTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await api.get(`/api/user/line-accounts/${accountId}/slip-templates`);
      if (response.data.success) {
        setTemplates(response.data.templates);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSetDefault = async (templateId: string) => {
    try {
      await api.put(`/api/user/line-accounts/${accountId}/slip-templates/${templateId}/default`);
      await fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to set default');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('คุณต้องการลบ template นี้หรือไม่?')) return;

    try {
      await api.delete(`/api/user/line-accounts/${accountId}/slip-templates/${templateId}`);
      await fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete template');
    }
  };

  const handleInitDefaults = async () => {
    try {
      await api.post(`/api/user/line-accounts/${accountId}/slip-templates/init-defaults`);
      await fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initialize defaults');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                ← กลับ
              </button>
              <h1 className="text-xl font-bold">จัดการ Template ตอบกลับสลิป</h1>
            </div>
            <div className="flex space-x-2">
              {templates.length === 0 && (
                <button
                  onClick={handleInitDefaults}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  สร้าง Template เริ่มต้น
                </button>
              )}
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                + สร้าง Template ใหม่
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
            <button onClick={() => setError('')} className="float-right">&times;</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">ยังไม่มี Template</p>
            <button
              onClick={handleInitDefaults}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              สร้าง Template เริ่มต้น
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div
                key={template._id}
                className="bg-white rounded-lg shadow overflow-hidden"
              >
                <div
                  className="h-2"
                  style={{ backgroundColor: template.primaryColor || '#00C851' }}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{template.name}</h3>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        TYPE_LABELS[template.type]?.color || 'bg-gray-100'
                      }`}
                    >
                      {TYPE_LABELS[template.type]?.label || template.type}
                    </span>
                  </div>

                  {template.description && (
                    <p className="text-sm text-gray-500 mb-2">{template.description}</p>
                  )}

                  <div className="text-sm text-gray-600 mb-3">
                    <p>Header: {template.headerText || '-'}</p>
                  </div>

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
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          ✓ Default
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefault(template._id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          ตั้งเป็น Default
                        </button>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingTemplate(template)}
                        className="text-sm text-gray-600 hover:text-gray-900"
                      >
                        แก้ไข
                      </button>
                      {!template.isDefault && (
                        <button
                          onClick={() => handleDelete(template._id)}
                          className="text-sm text-red-600 hover:text-red-900"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTemplate) && (
        <TemplateModal
          accountId={accountId}
          template={editingTemplate}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingTemplate(null);
            fetchTemplates();
          }}
        />
      )}
    </div>
  );
}

interface TemplateModalProps {
  accountId: string;
  template: SlipTemplate | null;
  onClose: () => void;
  onSave: () => void;
}

function TemplateModal({ accountId, template, onClose, onSave }: TemplateModalProps) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    type: template?.type || 'success',
    primaryColor: template?.primaryColor || '#00C851',
    headerText: template?.headerText || '',
    footerText: template?.footerText || '',
    showAmount: template?.showAmount ?? true,
    showSender: template?.showSender ?? true,
    showReceiver: template?.showReceiver ?? true,
    showDate: template?.showDate ?? true,
    showTime: template?.showTime ?? true,
    showTransRef: template?.showTransRef ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (template) {
        await api.put(
          `/api/user/line-accounts/${accountId}/slip-templates/${template._id}`,
          formData
        );
      } else {
        await api.post(`/api/user/line-accounts/${accountId}/slip-templates`, formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">
            {template ? 'แก้ไข Template' : 'สร้าง Template ใหม่'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">ชื่อ Template</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">คำอธิบาย</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ประเภท</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="success">สำเร็จ</option>
              <option value="duplicate">สลิปซ้ำ</option>
              <option value="error">ผิดพลาด</option>
              <option value="not_found">ไม่พบข้อมูล</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">สี</label>
            <input
              type="color"
              value={formData.primaryColor}
              onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
              className="w-full h-10 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ข้อความ Header</label>
            <input
              type="text"
              value={formData.headerText}
              onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="เช่น ✅ ตรวจสอบสลิปสำเร็จ"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ข้อความ Footer</label>
            <input
              type="text"
              value={formData.footerText}
              onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="เช่น ขอบคุณที่ใช้บริการ"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">แสดงข้อมูล</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'showAmount', label: 'จำนวนเงิน' },
                { key: 'showSender', label: 'ผู้โอน' },
                { key: 'showReceiver', label: 'ผู้รับ' },
                { key: 'showDate', label: 'วันที่' },
                { key: 'showTime', label: 'เวลา' },
                { key: 'showTransRef', label: 'เลขอ้างอิง' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={(formData as any)[key]}
                    onChange={(e) =>
                      setFormData({ ...formData, [key]: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
