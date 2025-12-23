'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Input, TextArea, Switch } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { toast } from 'react-hot-toast';

// System Response Types
const RESPONSE_TYPES = {
  no_slip_found: { label: 'ไม่พบสลิปในรูป', icon: '❌', color: '#FF6B6B' },
  qr_unclear: { label: 'QR Code ไม่ชัด', icon: '⚠️', color: '#FFB347' },
  quota_exceeded: { label: 'โควต้าหมด', icon: '🔴', color: '#DC3545' },
  quota_low: { label: 'โควต้าใกล้หมด', icon: '⚠️', color: '#FFC107' },
  invalid_image: { label: 'รูปภาพไม่ถูกต้อง', icon: '❌', color: '#FF6B6B' },
  image_download_error: { label: 'ดาวน์โหลดรูปไม่ได้', icon: '❌', color: '#FF6B6B' },
  general_error: { label: 'ข้อผิดพลาดทั่วไป', icon: '❌', color: '#FF6B6B' },
  bot_disabled: { label: 'บอทปิดให้บริการ', icon: '🔴', color: '#6C757D' },
  slip_disabled: { label: 'ระบบตรวจสลิปปิด', icon: '🔴', color: '#6C757D' },
  processing: { label: 'กำลังประมวลผล', icon: '⏳', color: '#17A2B8' },
};

interface ResponseStyling {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  icon: string;
  showIcon: boolean;
  showContactButton: boolean;
  contactButtonText: string;
  contactButtonUrl: string;
  showRetryButton: boolean;
  retryButtonText: string;
}

interface SystemResponseTemplate {
  _id: string;
  type: string;
  name: string;
  description: string;
  responseFormat: 'text' | 'flex';
  textMessage: string;
  title: string;
  mainMessage: string;
  subMessage: string;
  styling: ResponseStyling;
  isActive: boolean;
  sortOrder: number;
}

const DEFAULT_STYLING: ResponseStyling = {
  primaryColor: '#FF6B6B',
  textColor: '#FFFFFF',
  backgroundColor: '#FFF5F5',
  icon: '❌',
  showIcon: true,
  showContactButton: true,
  contactButtonText: 'ติดต่อผู้ดูแล',
  contactButtonUrl: '',
  showRetryButton: true,
  retryButtonText: 'ส่งรูปใหม่',
};

export default function SystemResponsesPage() {
  const [templates, setTemplates] = useState<SystemResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SystemResponseTemplate> | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/system-response-templates', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSelectTemplate = (template: SystemResponseTemplate) => {
    setSelectedType(template.type);
    setFormData({
      ...template,
      styling: { ...DEFAULT_STYLING, ...template.styling },
    });
  };

  const handleSave = async () => {
    if (!selectedType || !formData) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/system-response-templates/${selectedType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('บันทึกสำเร็จ');
        fetchTemplates();
      } else {
        toast.error(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('ไม่สามารถบันทึกได้');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedType) return;

    if (!confirm('ต้องการรีเซ็ตเป็นค่าเริ่มต้นหรือไม่?')) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/system-response-templates/${selectedType}/reset`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('รีเซ็ตสำเร็จ');
        setFormData({
          ...data.data,
          styling: { ...DEFAULT_STYLING, ...data.data.styling },
        });
        fetchTemplates();
      } else {
        toast.error(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      console.error('Error resetting:', error);
      toast.error('ไม่สามารถรีเซ็ตได้');
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: any) => {
    setFormData((prev) => prev ? { ...prev, [field]: value } : null);
  };

  const updateStyling = (field: string, value: any) => {
    setFormData((prev) => prev ? {
      ...prev,
      styling: { ...(prev.styling || DEFAULT_STYLING), [field]: value },
    } : null);
  };

  if (loading) {
    return (
      <PageLoading message="กำลังโหลดข้อมูล..." />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">ข้อความตอบกลับระบบ</h1>
          <p className="text-gray-500 mt-1">
            ตั้งค่าข้อความตอบกลับอัตโนมัติสำหรับกรณีต่างๆ (ผู้ใช้ไม่สามารถแก้ไขได้)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader title="ประเภทข้อความ" />
            <div className="-mt-4">
              <div className="divide-y divide-gray-100">
                {templates.map((template) => {
                  const typeInfo = RESPONSE_TYPES[template.type as keyof typeof RESPONSE_TYPES];
                  return (
                    <button
                      key={template._id}
                      onClick={() => handleSelectTemplate(template)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                        selectedType === template.type ? 'bg-green-50 border-l-4 border-green-500' : ''
                      }`}
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
                        style={{ backgroundColor: typeInfo?.color || '#666' }}
                      >
                        {typeInfo?.icon || '📄'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">
                          {template.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {template.responseFormat === 'flex' ? 'Flex Message' : 'Text'}
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${template.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2">
          {formData ? (
            <Card>
              <CardHeader 
                title={formData.name || 'แก้ไขเทมเพลต'}
                action={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      disabled={saving}
                    >
                      รีเซ็ต
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSave}
                      isLoading={saving}
                    >
                      บันทึก
                    </Button>
                  </div>
                }
              />
              <div className="space-y-6 -mt-2">
                {/* Basic Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-700 border-b pb-2">ตั้งค่าพื้นฐาน</h3>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">เปิดใช้งาน</span>
                    <Switch
                      checked={formData.isActive ?? true}
                      onChange={(checked) => updateFormData('isActive', checked)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      รูปแบบการตอบกลับ
                    </label>
                    <select
                      value={formData.responseFormat || 'flex'}
                      onChange={(e) => updateFormData('responseFormat', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="flex">Flex Message (สวยงาม)</option>
                      <option value="text">Text (ข้อความธรรมดา)</option>
                    </select>
                  </div>

                  <div>
                    <Input
                      label="ข้อความ Text"
                      value={formData.textMessage || ''}
                      onChange={(e) => updateFormData('textMessage', e.target.value)}
                      placeholder="ข้อความที่จะส่งเมื่อเลือกรูปแบบ Text"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      ใช้เมื่อเลือกรูปแบบ Text หรือเป็น fallback เมื่อ Flex ไม่ทำงาน
                    </p>
                  </div>
                </div>

                {/* Flex Message Settings */}
                {formData.responseFormat === 'flex' && (
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-700 border-b pb-2">ตั้งค่า Flex Message</h3>
                    
                    <Input
                      label="หัวข้อ"
                      value={formData.title || ''}
                      onChange={(e) => updateFormData('title', e.target.value)}
                      placeholder="หัวข้อที่แสดงใน header"
                    />

                    <Input
                      label="ข้อความหลัก"
                      value={formData.mainMessage || ''}
                      onChange={(e) => updateFormData('mainMessage', e.target.value)}
                      placeholder="ข้อความหลักที่จะแสดง"
                    />

                    <TextArea
                      label="ข้อความรอง"
                      value={formData.subMessage || ''}
                      onChange={(e) => updateFormData('subMessage', e.target.value)}
                      placeholder="ข้อความอธิบายเพิ่มเติม"
                      rows={2}
                    />
                  </div>
                )}

                {/* Styling Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-700 border-b pb-2">การแสดงผล</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        สี Header
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.styling?.primaryColor || '#FF6B6B'}
                          onChange={(e) => updateStyling('primaryColor', e.target.value)}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={formData.styling?.primaryColor || '#FF6B6B'}
                          onChange={(e) => updateStyling('primaryColor', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        สีพื้นหลัง
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.styling?.backgroundColor || '#FFF5F5'}
                          onChange={(e) => updateStyling('backgroundColor', e.target.value)}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={formData.styling?.backgroundColor || '#FFF5F5'}
                          onChange={(e) => updateStyling('backgroundColor', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={formData.styling?.showIcon ?? true}
                        onChange={(checked) => updateStyling('showIcon', checked)}
                      />
                      <span className="text-sm text-gray-600">แสดงไอคอน</span>
                    </div>
                    
                    {formData.styling?.showIcon && (
                      <Input
                        value={formData.styling?.icon || '❌'}
                        onChange={(e) => updateStyling('icon', e.target.value)}
                        placeholder="ไอคอน (emoji)"
                        className="w-20"
                      />
                    )}
                  </div>
                </div>

                {/* Button Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-700 border-b pb-2">ปุ่มกด</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">แสดงปุ่มลองใหม่</span>
                      <Switch
                        checked={formData.styling?.showRetryButton ?? true}
                        onChange={(checked) => updateStyling('showRetryButton', checked)}
                      />
                    </div>
                    
                    {formData.styling?.showRetryButton && (
                      <Input
                        label="ข้อความปุ่มลองใหม่"
                        value={formData.styling?.retryButtonText || ''}
                        onChange={(e) => updateStyling('retryButtonText', e.target.value)}
                        placeholder="เช่น ส่งรูปใหม่"
                      />
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">แสดงปุ่มติดต่อ</span>
                      <Switch
                        checked={formData.styling?.showContactButton ?? true}
                        onChange={(checked) => updateStyling('showContactButton', checked)}
                      />
                    </div>
                    
                    {formData.styling?.showContactButton && (
                      <>
                        <Input
                          label="ข้อความปุ่มติดต่อ"
                          value={formData.styling?.contactButtonText || ''}
                          onChange={(e) => updateStyling('contactButtonText', e.target.value)}
                          placeholder="เช่น ติดต่อผู้ดูแล"
                        />
                        <Input
                          label="ลิงก์ปุ่มติดต่อ (URL)"
                          value={formData.styling?.contactButtonUrl || ''}
                          onChange={(e) => updateStyling('contactButtonUrl', e.target.value)}
                          placeholder="https://line.me/... หรือปล่อยว่างเพื่อส่งข้อความ"
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-700 border-b pb-2">ตัวอย่าง Flex Message</h3>
                  
                  <div className="bg-gray-100 rounded-lg p-4 flex justify-center">
                    <div
                      className="rounded-xl overflow-hidden shadow-lg"
                      style={{ width: '280px' }}
                    >
                      {/* Header */}
                      <div
                        className="px-4 py-3 flex items-center gap-2 justify-center"
                        style={{ backgroundColor: formData.styling?.primaryColor || '#FF6B6B' }}
                      >
                        {formData.styling?.showIcon && (
                          <span className="text-xl">{formData.styling?.icon || '❌'}</span>
                        )}
                        <span
                          className="font-bold"
                          style={{ color: formData.styling?.textColor || '#FFFFFF' }}
                        >
                          {formData.title || 'หัวข้อ'}
                        </span>
                      </div>

                      {/* Body */}
                      <div
                        className="px-4 py-5 text-center space-y-2"
                        style={{ backgroundColor: formData.styling?.backgroundColor || '#FFF5F5' }}
                      >
                        <p className="font-bold text-gray-800">
                          {formData.mainMessage || 'ข้อความหลัก'}
                        </p>
                        {formData.subMessage && (
                          <p className="text-sm text-gray-600">
                            {formData.subMessage}
                          </p>
                        )}
                      </div>

                      {/* Footer Buttons */}
                      {(formData.styling?.showRetryButton || formData.styling?.showContactButton) && (
                        <div className="px-4 py-3 space-y-2 bg-white">
                          {formData.styling?.showRetryButton && (
                            <button
                              className="w-full py-2 rounded-lg text-white font-medium text-sm"
                              style={{ backgroundColor: formData.styling?.primaryColor || '#FF6B6B' }}
                            >
                              {formData.styling?.retryButtonText || 'ส่งรูปใหม่'}
                            </button>
                          )}
                          {formData.styling?.showContactButton && (
                            <button className="w-full py-2 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm">
                              {formData.styling?.contactButtonText || 'ติดต่อผู้ดูแล'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="py-12 text-center text-gray-500">
              <div className="text-5xl mb-4">📝</div>
              <p>เลือกประเภทข้อความจากรายการทางซ้ายเพื่อแก้ไข</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
