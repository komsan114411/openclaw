'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Switch, Select } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

// System Response Types - Thai Labels
const RESPONSE_TYPES = {
  no_slip_found: { label: 'ไม่พบสลิป', icon: '🔍', description: 'เมื่อไม่พบสลิปในรูป' },
  qr_unclear: { label: 'QR ไม่ชัด', icon: '📡', description: 'เมื่อ QR code อ่านไม่ได้' },
  quota_exceeded: { label: 'โควต้าหมด', icon: '🔴', description: 'เมื่อโควต้าหมด' },
  quota_low: { label: 'โควต้าใกล้หมด', icon: '⚠️', description: 'เตือนโควต้าเหลือน้อย' },
  invalid_image: { label: 'รูปไม่ถูกต้อง', icon: '🖼️', description: 'เมื่อรูปไม่ใช่สลิป' },
  image_download_error: { label: 'ดาวน์โหลดไม่ได้', icon: '📥', description: 'เมื่อดาวน์โหลดรูปล้มเหลว' },
  general_error: { label: 'ข้อผิดพลาดทั่วไป', icon: '❌', description: 'ข้อผิดพลาดของระบบ' },
  bot_disabled: { label: 'บอทปิด', icon: '📵', description: 'เมื่อบอทถูกปิด' },
  slip_disabled: { label: 'ตรวจสลิปปิด', icon: '🔒', description: 'เมื่อระบบตรวจสลิปปิด' },
  processing: { label: 'กำลังประมวลผล', icon: '⏳', description: 'ขณะกำลังตรวจสอบ' },
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
  primaryColor: '#10b981',
  textColor: '#FFFFFF',
  backgroundColor: '#f8fafc',
  icon: '⚡',
  showIcon: true,
  showContactButton: true,
  contactButtonText: 'ติดต่อผู้ดูแล',
  contactButtonUrl: '',
  showRetryButton: true,
  retryButtonText: 'ส่งใหม่',
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
      const res = await fetch('/api/admin/system-response-templates', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data);
        if (data.data.length > 0 && !selectedType) {
          handleSelectTemplate(data.data[0]);
        }
      }
    } catch (error) {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

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
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedType) return;
    if (!confirm('รีเซ็ตเป็นค่าเริ่มต้น?')) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/system-response-templates/${selectedType}/reset`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('รีเซ็ตสำเร็จ');
        setFormData({ ...data.data, styling: { ...DEFAULT_STYLING, ...data.data.styling } });
        fetchTemplates();
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = useCallback((field: string, value: any) => {
    setFormData((prev) => prev ? { ...prev, [field]: value } : null);
  }, []);

  const updateStyling = useCallback((field: string, value: any) => {
    setFormData((prev) => prev ? {
      ...prev,
      styling: { ...(prev.styling || DEFAULT_STYLING), [field]: value },
    } : null);
  }, []);

  if (loading) return <DashboardLayout requiredRole="admin"><PageLoading message="กำลังโหลดข้อมูล..." /></DashboardLayout>;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-8 animate-fade max-w-[1600px] mx-auto pb-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">ข้อความตอบกลับระบบ</h1>
              <Badge variant="indigo" className="text-[10px]">ผู้ดูแลเท่านั้น</Badge>
            </div>
            <p className="text-slate-500">กำหนดข้อความตอบกลับอัตโนมัติสำหรับกรณีต่างๆ (ผู้ใช้ไม่สามารถแก้ไขได้)</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Button variant="outline" onClick={handleReset} disabled={saving || !selectedType}>
              รีเซ็ตค่าเริ่มต้น
            </Button>
            <Button variant="primary" className="shadow-lg shadow-emerald-500/20" onClick={handleSave} isLoading={saving}>
              บันทึกการเปลี่ยนแปลง
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Response Type Selector */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-bold text-slate-700">ประเภทข้อความ</p>
                <p className="text-xs text-slate-400">เลือกประเภทที่ต้องการแก้ไข</p>
              </div>
              <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
                {templates.map((template) => {
                  const typeInfo = RESPONSE_TYPES[template.type as keyof typeof RESPONSE_TYPES];
                  const isSelected = selectedType === template.type;
                  return (
                    <motion.button
                      key={template._id}
                      whileHover={{ x: 3 }}
                      onClick={() => handleSelectTemplate(template)}
                      className={cn(
                        "w-full p-3 rounded-xl flex items-center gap-3 transition-all group",
                        isSelected ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-lg",
                        isSelected ? "bg-white/20" : "bg-slate-100"
                      )}>
                        {typeInfo?.icon || '📄'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-bold text-sm truncate">{template.name}</p>
                        <p className={cn("text-[10px] opacity-60", isSelected && "opacity-80")}>{typeInfo?.description}</p>
                      </div>
                      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", template.isActive ? "bg-emerald-400" : "bg-slate-300")} />
                    </motion.button>
                  );
                })}
              </div>
            </Card>

            {/* Info Card */}
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <p className="font-bold text-amber-900 text-sm">หมายเหตุ</p>
                  <p className="text-xs text-amber-700 mt-1">ข้อความเหล่านี้จะถูกส่งไปยังลูกค้าโดยอัตโนมัติเมื่อเกิดเหตุการณ์ที่กำหนด ผู้ใช้ทั่วไปไม่สามารถแก้ไขการตั้งค่าเหล่านี้ได้</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Form & Preview */}
          <div className="lg:col-span-8 space-y-6">
            {formData ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Settings Form */}
                <div className="space-y-6">
                  {/* Basic Settings */}
                  <Card className="p-5 space-y-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <span>⚙️</span> ตั้งค่าพื้นฐาน
                    </h3>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-sm font-medium text-slate-700">สถานะการใช้งาน</span>
                      <Switch checked={formData.isActive ?? true} onChange={(checked) => updateFormData('isActive', checked)} />
                    </div>
                    <Select label="รูปแบบการตอบกลับ" value={formData.responseFormat || 'flex'} onChange={(e) => updateFormData('responseFormat', e.target.value)}>
                      <option value="flex">Flex Message (สวยงาม)</option>
                      <option value="text">Text (ข้อความธรรมดา)</option>
                    </Select>
                    <Textarea label="ข้อความ Text (สำรอง)" value={formData.textMessage || ''} onChange={(e) => updateFormData('textMessage', e.target.value)} rows={3} placeholder="ข้อความสำรองเมื่อไม่รองรับ Flex..." />
                  </Card>

                  <AnimatePresence mode="wait">
                    {formData.responseFormat === 'flex' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                        {/* Flex Message Content */}
                        <Card className="p-5 space-y-4">
                          <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span>💬</span> เนื้อหาข้อความ
                          </h3>
                          <Input label="หัวข้อ" value={formData.title || ''} onChange={(e) => updateFormData('title', e.target.value)} placeholder="เช่น ไม่พบสลิป" />
                          <Input label="ข้อความหลัก" value={formData.mainMessage || ''} onChange={(e) => updateFormData('mainMessage', e.target.value)} placeholder="ข้อความหลักที่ต้องการแสดง" />
                          <Textarea label="ข้อความรอง" value={formData.subMessage || ''} onChange={(e) => updateFormData('subMessage', e.target.value)} rows={2} placeholder="คำอธิบายเพิ่มเติม..." />
                        </Card>

                        {/* Appearance */}
                        <Card className="p-5 space-y-4">
                          <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span>🎨</span> การแสดงผล
                          </h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-2 block">สีหัวข้อ</label>
                              <input type="color" value={formData.styling?.primaryColor || '#10b981'} onChange={(e) => updateStyling('primaryColor', e.target.value)} className="w-full h-10 rounded-xl border-2 border-slate-200 cursor-pointer" />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-2 block">สีพื้นหลัง</label>
                              <input type="color" value={formData.styling?.backgroundColor || '#f8fafc'} onChange={(e) => updateStyling('backgroundColor', e.target.value)} className="w-full h-10 rounded-xl border-2 border-slate-200 cursor-pointer" />
                            </div>
                          </div>
                          <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                            <Switch checked={formData.styling?.showIcon ?? true} onChange={(checked) => updateStyling('showIcon', checked)} />
                            <span className="text-sm font-medium text-slate-700">แสดงไอคอน</span>
                            {formData.styling?.showIcon && (
                              <input value={formData.styling?.icon || '⚡'} onChange={(e) => updateStyling('icon', e.target.value)} className="w-10 h-10 bg-white rounded-lg border border-slate-200 text-center text-lg ml-auto" />
                            )}
                          </div>
                        </Card>

                        {/* Buttons */}
                        <Card className="p-5 space-y-4">
                          <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span>🔘</span> ปุ่มกด
                          </h3>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">ปุ่มลองใหม่</span>
                              <Switch checked={formData.styling?.showRetryButton ?? true} onChange={(checked) => updateStyling('showRetryButton', checked)} />
                            </div>
                            {formData.styling?.showRetryButton && (
                              <Input label="ข้อความปุ่ม" value={formData.styling?.retryButtonText || ''} onChange={(e) => updateStyling('retryButtonText', e.target.value)} placeholder="เช่น ส่งใหม่" />
                            )}
                          </div>
                          <div className="space-y-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">ปุ่มติดต่อ</span>
                              <Switch checked={formData.styling?.showContactButton ?? true} onChange={(checked) => updateStyling('showContactButton', checked)} />
                            </div>
                            {formData.styling?.showContactButton && (
                              <>
                                <Input label="ข้อความปุ่ม" value={formData.styling?.contactButtonText || ''} onChange={(e) => updateStyling('contactButtonText', e.target.value)} placeholder="เช่น ติดต่อผู้ดูแล" />
                                <Input label="ลิงก์ (ไม่บังคับ)" value={formData.styling?.contactButtonUrl || ''} onChange={(e) => updateStyling('contactButtonUrl', e.target.value)} placeholder="https://..." />
                              </>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Preview */}
                <div className="sticky top-4 h-fit space-y-4">
                  <Card className="p-4 bg-slate-100">
                    <p className="text-sm font-bold text-slate-700 mb-3 text-center">👁️ ตัวอย่างการแสดงผล</p>
                    <div className="bg-slate-800 rounded-2xl p-6 shadow-xl">
                      <div className="w-full max-w-[280px] mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">

                        {/* Header */}
                        <div className="px-4 py-3 flex items-center gap-2 justify-center" style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}>
                          {formData.styling?.showIcon && <span className="text-lg">{formData.styling?.icon || '⚡'}</span>}
                          <span className="font-bold text-sm text-white">{formData.title || 'หัวข้อ'}</span>
                        </div>

                        {/* Body */}
                        <div className="px-4 py-5 text-center space-y-2" style={{ backgroundColor: formData.styling?.backgroundColor || '#f8fafc' }}>
                          <p className="font-bold text-slate-900 text-sm">{formData.mainMessage || 'ข้อความหลัก'}</p>
                          {formData.subMessage && <p className="text-xs text-slate-500">{formData.subMessage}</p>}
                        </div>

                        {/* Buttons */}
                        <div className="p-3 bg-white space-y-2">
                          {formData.styling?.showRetryButton && (
                            <div className="w-full h-9 flex items-center justify-center text-xs font-bold text-white rounded-lg" style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}>
                              {formData.styling?.retryButtonText || 'ส่งใหม่'}
                            </div>
                          )}
                          {formData.styling?.showContactButton && (
                            <div className="w-full h-9 flex items-center justify-center text-xs font-bold text-slate-500 bg-slate-100 rounded-lg">
                              {formData.styling?.contactButtonText || 'ติดต่อผู้ดูแล'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-emerald-50 border-emerald-200">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">✅</span>
                      <p className="text-xs text-emerald-700">
                        ข้อความนี้จะถูกส่งไปยังลูกค้าเมื่อเกิดเหตุการณ์: {RESPONSE_TYPES[selectedType as keyof typeof RESPONSE_TYPES]?.description || selectedType}
                      </p>
                    </div>
                  </Card>
                </div>

              </div>
            ) : (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">🛠️</div>
                <h4 className="text-xl font-bold text-slate-900 mb-2">เลือกประเภทข้อความ</h4>
                <p className="text-slate-500">เลือกประเภทข้อความจากรายการทางซ้ายเพื่อเริ่มแก้ไข</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
