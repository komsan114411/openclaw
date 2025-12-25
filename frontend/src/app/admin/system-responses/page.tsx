'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Switch, Select } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { systemResponseTemplatesApi } from '@/lib/api';

// System Response Types organized by category
const RESPONSE_CATEGORIES = {
  critical: {
    label: '🚨 สถานะสำคัญ',
    description: 'ข้อความสำหรับปัญหาเร่งด่วนที่ต้องแจ้งลูกค้า',
    types: ['quota_exceeded', 'no_quota', 'package_expired'],
  },
  slip: {
    label: '📄 สลิป/QR Code',
    description: 'ข้อความเกี่ยวกับการตรวจสอบสลิป',
    types: ['no_slip_found', 'qrcode_not_found', 'qr_unclear', 'invalid_image'],
  },
  system: {
    label: '⚙️ ระบบ',
    description: 'ข้อความสถานะระบบ',
    types: ['bot_disabled', 'slip_disabled', 'processing'],
  },
  error: {
    label: '❌ ข้อผิดพลาด',
    description: 'ข้อความแจ้งเตือนข้อผิดพลาด',
    types: ['general_error', 'image_download_error', 'quota_low'],
  },
};

// System Response Types - Thai Labels
const RESPONSE_TYPES: Record<string, { label: string; icon: string; description: string; color: string }> = {
  quota_exceeded: { label: 'โควต้าหมด', icon: '🔴', description: 'เมื่อใช้โควต้าจนหมด', color: '#DC2626' },
  no_quota: { label: 'ไม่มีโควต้า', icon: '🚫', description: 'เมื่อไม่เคยมีโควต้า', color: '#EF4444' },
  package_expired: { label: 'แพ็คเกจหมดอายุ', icon: '⏰', description: 'เมื่อแพ็คเกจหมดอายุ', color: '#F59E0B' },
  no_slip_found: { label: 'ไม่พบสลิป', icon: '🔍', description: 'เมื่อไม่พบสลิปในรูป', color: '#6366F1' },
  qrcode_not_found: { label: 'ไม่พบ QR Code', icon: '🔳', description: 'เมื่อไม่พบ QR Code ในสลิป', color: '#8B5CF6' },
  qr_unclear: { label: 'QR ไม่ชัด', icon: '📡', description: 'เมื่อ QR code อ่านไม่ได้', color: '#EC4899' },
  invalid_image: { label: 'รูปไม่ถูกต้อง', icon: '🖼️', description: 'เมื่อรูปไม่ใช่สลิป', color: '#F43F5E' },
  bot_disabled: { label: 'บอทปิด', icon: '📵', description: 'เมื่อบอทถูกปิด', color: '#64748B' },
  slip_disabled: { label: 'ตรวจสลิปปิด', icon: '🔒', description: 'เมื่อระบบตรวจสลิปปิด', color: '#475569' },
  processing: { label: 'กำลังประมวลผล', icon: '⏳', description: 'ขณะกำลังตรวจสอบ', color: '#0EA5E9' },
  general_error: { label: 'ข้อผิดพลาดทั่วไป', icon: '❌', description: 'ข้อผิดพลาดของระบบ', color: '#EF4444' },
  image_download_error: { label: 'ดาวน์โหลดไม่ได้', icon: '📥', description: 'เมื่อดาวน์โหลดรูปล้มเหลว', color: '#F97316' },
  quota_low: { label: 'โควต้าใกล้หมด', icon: '⚠️', description: 'เตือนโควต้าเหลือน้อย', color: '#FBBF24' },
};

// Color presets for quick selection
const COLOR_PRESETS = [
  { name: 'เขียว', primary: '#10B981', bg: '#ECFDF5' },
  { name: 'แดง', primary: '#EF4444', bg: '#FEF2F2' },
  { name: 'ส้ม', primary: '#F97316', bg: '#FFF7ED' },
  { name: 'เหลือง', primary: '#EAB308', bg: '#FEFCE8' },
  { name: 'น้ำเงิน', primary: '#3B82F6', bg: '#EFF6FF' },
  { name: 'ม่วง', primary: '#8B5CF6', bg: '#F5F3FF' },
  { name: 'ชมพู', primary: '#EC4899', bg: '#FDF2F8' },
  { name: 'เทา', primary: '#64748B', bg: '#F8FAFC' },
];

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
  const [activeCategory, setActiveCategory] = useState<string>('critical');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await systemResponseTemplatesApi.getAll();
      const data = res.data;
      if (data.success && data.data) {
        setTemplates(data.data);
        if (data.data.length > 0 && !selectedType) {
          // Select first critical template by default
          const firstCritical = data.data.find((t: SystemResponseTemplate) => 
            RESPONSE_CATEGORIES.critical.types.includes(t.type)
          );
          if (firstCritical) handleSelectTemplate(firstCritical);
          else if (data.data[0]) handleSelectTemplate(data.data[0]);
        }
      } else {
        // No templates found - might need to create them
        toast.error('ไม่พบเทมเพลต กรุณาตรวจสอบการตั้งค่าระบบ');
      }
    } catch (error: any) {
      console.error('Failed to fetch templates:', error);
      toast.error(error.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้');
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
      const res = await systemResponseTemplatesApi.update(selectedType, formData);
      if (res.data.success) {
        toast.success('บันทึกสำเร็จ');
        fetchTemplates();
      } else {
        toast.error(res.data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedType) return;
    if (!confirm('รีเซ็ตเป็นค่าเริ่มต้น?')) return;

    try {
      setSaving(true);
      const res = await systemResponseTemplatesApi.reset(selectedType);
      if (res.data.success) {
        toast.success('รีเซ็ตสำเร็จ');
        setFormData({ ...res.data.data, styling: { ...DEFAULT_STYLING, ...res.data.data.styling } });
        fetchTemplates();
      } else {
        toast.error(res.data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
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

  const applyColorPreset = (preset: typeof COLOR_PRESETS[0]) => {
    updateStyling('primaryColor', preset.primary);
    updateStyling('backgroundColor', preset.bg);
  };

  // Filter templates by category and search
  const filteredTemplates = useMemo(() => {
    let result = templates;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(query) ||
        t.type.toLowerCase().includes(query) ||
        RESPONSE_TYPES[t.type]?.label.toLowerCase().includes(query)
      );
    } else if (activeCategory) {
      const categoryTypes = RESPONSE_CATEGORIES[activeCategory as keyof typeof RESPONSE_CATEGORIES]?.types || [];
      result = result.filter(t => categoryTypes.includes(t.type));
    }
    
    return result;
  }, [templates, activeCategory, searchQuery]);

  if (loading) return <DashboardLayout requiredRole="admin"><PageLoading message="กำลังโหลดข้อมูล..." /></DashboardLayout>;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade max-w-[1800px] mx-auto pb-12">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
                  💬
                </div>
                <div>
                  <h1 className="text-2xl font-bold">ข้อความตอบกลับระบบ</h1>
                  <p className="text-white/80 text-sm">ตั้งค่าข้อความที่จะส่งถึงลูกค้าอัตโนมัติ</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-white/20 text-white border-0">
                🔒 ผู้ดูแลเท่านั้น
              </Badge>
              <Button 
                variant="outline" 
                className="border-white/30 text-white hover:bg-white/10"
                onClick={handleReset} 
                disabled={saving || !selectedType}
              >
                รีเซ็ต
              </Button>
              <Button 
                className="bg-white text-indigo-600 hover:bg-white/90 shadow-lg"
                onClick={handleSave} 
                isLoading={saving}
              >
                💾 บันทึก
              </Button>
            </div>
          </div>
        </div>

        {/* Flow explanation */}
        <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex flex-wrap items-center gap-4 justify-center text-sm">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">1</span>
              <span className="text-blue-800">ลูกค้าส่งรูปมา LINE</span>
            </div>
            <span className="text-blue-400">→</span>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold">2</span>
              <span className="text-indigo-800">ระบบตรวจสอบสถานะ</span>
            </div>
            <span className="text-indigo-400">→</span>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold">3</span>
              <span className="text-purple-800">ส่งข้อความตอบกลับตาม Template</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Sidebar - Template Selector */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
            
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 ค้นหาข้อความ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all outline-none"
              />
            </div>

            {/* Category Tabs */}
            {!searchQuery && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(RESPONSE_CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setActiveCategory(key)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs font-bold transition-all",
                      activeCategory === key 
                        ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* Template List */}
            <Card className="p-0 overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100">
                <p className="text-sm font-bold text-slate-700">
                  {searchQuery ? `ผลการค้นหา (${filteredTemplates.length})` : RESPONSE_CATEGORIES[activeCategory as keyof typeof RESPONSE_CATEGORIES]?.label}
                </p>
              </div>
              <div className="p-2 space-y-1 max-h-[50vh] overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <span className="text-3xl block mb-2">🔍</span>
                    ไม่พบข้อความที่ค้นหา
                  </div>
                ) : filteredTemplates.map((template) => {
                  const typeInfo = RESPONSE_TYPES[template.type];
                  const isSelected = selectedType === template.type;
                  return (
                    <motion.button
                      key={template._id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSelectTemplate(template)}
                      className={cn(
                        "w-full p-3 rounded-xl flex items-center gap-3 transition-all border-2",
                        isSelected 
                          ? "border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-500/10" 
                          : "border-transparent hover:bg-slate-50"
                      )}
                    >
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm"
                        style={{ backgroundColor: typeInfo?.color + '20', color: typeInfo?.color }}
                      >
                        {typeInfo?.icon || '📄'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={cn("font-bold text-sm truncate", isSelected ? "text-indigo-700" : "text-slate-700")}>
                          {template.name || typeInfo?.label}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{typeInfo?.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {template.isActive ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </Card>

            {/* Info Card */}
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div>
                  <p className="font-bold text-amber-900 text-sm">วิธีการทำงาน</p>
                  <ul className="text-xs text-amber-700 mt-2 space-y-1">
                    <li>• ลูกค้าส่งรูปมาที่ LINE ของคุณ</li>
                    <li>• ระบบตรวจสอบสถานะโควต้า/แพ็คเกจ</li>
                    <li>• ส่งข้อความตามที่ตั้งค่าไว้อัตโนมัติ</li>
                    <li>• รองรับหลาย LINE Account ต่อผู้ใช้</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>

          {/* Right - Editor & Preview */}
          <div className="lg:col-span-8 xl:col-span-9">
            {formData ? (
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

                {/* Settings Form */}
                <div className="xl:col-span-3 space-y-6">
                  
                  {/* Template Header */}
                  <Card className="p-4 bg-gradient-to-r from-slate-50 to-slate-100">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-lg"
                        style={{ 
                          backgroundColor: RESPONSE_TYPES[selectedType || '']?.color + '20',
                          color: RESPONSE_TYPES[selectedType || '']?.color 
                        }}
                      >
                        {RESPONSE_TYPES[selectedType || '']?.icon}
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-slate-900">
                          {formData.name || RESPONSE_TYPES[selectedType || '']?.label}
                        </h2>
                        <p className="text-sm text-slate-500">
                          {RESPONSE_TYPES[selectedType || '']?.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white shadow-sm">
                        <span className="text-sm font-medium text-slate-600">สถานะ</span>
                        <Switch 
                          checked={formData.isActive ?? true} 
                          onChange={(checked) => updateFormData('isActive', checked)} 
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Response Format */}
                  <Card className="p-5 space-y-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">📝</span>
                      รูปแบบการตอบกลับ
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => updateFormData('responseFormat', 'flex')}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all text-left",
                          formData.responseFormat === 'flex' 
                            ? "border-indigo-500 bg-indigo-50" 
                            : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <div className="text-2xl mb-2">🎨</div>
                        <p className="font-bold text-slate-900">Flex Message</p>
                        <p className="text-xs text-slate-500">สวยงาม มีปุ่มกด</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFormData('responseFormat', 'text')}
                        className={cn(
                          "p-4 rounded-xl border-2 transition-all text-left",
                          formData.responseFormat === 'text' 
                            ? "border-indigo-500 bg-indigo-50" 
                            : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <div className="text-2xl mb-2">💬</div>
                        <p className="font-bold text-slate-900">ข้อความธรรมดา</p>
                        <p className="text-xs text-slate-500">เรียบง่าย รวดเร็ว</p>
                      </button>
                    </div>
                    <Textarea 
                      label="ข้อความ Text (สำรอง)" 
                      value={formData.textMessage || ''} 
                      onChange={(e) => updateFormData('textMessage', e.target.value)} 
                      rows={2} 
                      placeholder="ข้อความสำรองเมื่อไม่รองรับ Flex..." 
                    />
                  </Card>

                  <AnimatePresence mode="wait">
                    {formData.responseFormat === 'flex' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -20 }} 
                        className="space-y-6"
                      >
                        {/* Message Content */}
                        <Card className="p-5 space-y-4">
                          <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">💬</span>
                            เนื้อหาข้อความ
                          </h3>
                          <Input 
                            label="หัวข้อ" 
                            value={formData.title || ''} 
                            onChange={(e) => updateFormData('title', e.target.value)} 
                            placeholder="เช่น โควต้าหมด" 
                          />
                          <Input 
                            label="ข้อความหลัก" 
                            value={formData.mainMessage || ''} 
                            onChange={(e) => updateFormData('mainMessage', e.target.value)} 
                            placeholder="ข้อความที่ต้องการบอกลูกค้า" 
                          />
                          <Textarea 
                            label="ข้อความรอง (ไม่บังคับ)" 
                            value={formData.subMessage || ''} 
                            onChange={(e) => updateFormData('subMessage', e.target.value)} 
                            rows={2} 
                            placeholder="คำอธิบายเพิ่มเติม..." 
                          />
                        </Card>

                        {/* Colors */}
                        <Card className="p-5 space-y-4">
                          <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-pink-100 flex items-center justify-center">🎨</span>
                            สีและการแสดงผล
                          </h3>
                          
                          {/* Color Presets */}
                          <div>
                            <label className="text-xs font-bold text-slate-500 mb-2 block">ธีมสีด่วน</label>
                            <div className="flex flex-wrap gap-2">
                              {COLOR_PRESETS.map((preset) => (
                                <button
                                  key={preset.name}
                                  type="button"
                                  onClick={() => applyColorPreset(preset)}
                                  className="w-10 h-10 rounded-xl shadow-md hover:scale-110 transition-transform border-2 border-white"
                                  style={{ backgroundColor: preset.primary }}
                                  title={preset.name}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-2 block">สีหัวข้อ</label>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="color" 
                                  value={formData.styling?.primaryColor || '#10b981'} 
                                  onChange={(e) => updateStyling('primaryColor', e.target.value)} 
                                  className="w-12 h-12 rounded-xl border-2 border-slate-200 cursor-pointer" 
                                />
                                <span className="text-xs font-mono text-slate-400">{formData.styling?.primaryColor}</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-2 block">สีพื้นหลัง</label>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="color" 
                                  value={formData.styling?.backgroundColor || '#f8fafc'} 
                                  onChange={(e) => updateStyling('backgroundColor', e.target.value)} 
                                  className="w-12 h-12 rounded-xl border-2 border-slate-200 cursor-pointer" 
                                />
                                <span className="text-xs font-mono text-slate-400">{formData.styling?.backgroundColor}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <Switch 
                                checked={formData.styling?.showIcon ?? true} 
                                onChange={(checked) => updateStyling('showIcon', checked)} 
                              />
                              <span className="text-sm font-medium text-slate-700">แสดงไอคอน</span>
                            </div>
                            {formData.styling?.showIcon && (
                              <input 
                                value={formData.styling?.icon || '⚡'} 
                                onChange={(e) => updateStyling('icon', e.target.value)} 
                                className="w-12 h-12 bg-white rounded-xl border-2 border-slate-200 text-center text-xl" 
                              />
                            )}
                          </div>
                        </Card>

                        {/* Buttons */}
                        <Card className="p-5 space-y-4">
                          <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">🔘</span>
                            ปุ่มกด
                          </h3>
                          
                          <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">🔄</span>
                                <span className="text-sm font-bold text-slate-700">ปุ่มลองใหม่</span>
                              </div>
                              <Switch 
                                checked={formData.styling?.showRetryButton ?? true} 
                                onChange={(checked) => updateStyling('showRetryButton', checked)} 
                              />
                            </div>
                            {formData.styling?.showRetryButton && (
                              <Input 
                                value={formData.styling?.retryButtonText || ''} 
                                onChange={(e) => updateStyling('retryButtonText', e.target.value)} 
                                placeholder="เช่น ส่งรูปใหม่" 
                              />
                            )}
                          </div>

                          <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">📞</span>
                                <span className="text-sm font-bold text-slate-700">ปุ่มติดต่อ</span>
                              </div>
                              <Switch 
                                checked={formData.styling?.showContactButton ?? true} 
                                onChange={(checked) => updateStyling('showContactButton', checked)} 
                              />
                            </div>
                            {formData.styling?.showContactButton && (
                              <>
                                <Input 
                                  value={formData.styling?.contactButtonText || ''} 
                                  onChange={(e) => updateStyling('contactButtonText', e.target.value)} 
                                  placeholder="เช่น ติดต่อผู้ดูแล" 
                                />
                                <Input 
                                  value={formData.styling?.contactButtonUrl || ''} 
                                  onChange={(e) => updateStyling('contactButtonUrl', e.target.value)} 
                                  placeholder="ลิงก์ (ไม่บังคับ) https://..." 
                                />
                              </>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Preview */}
                <div className="xl:col-span-2 space-y-4">
                  <div className="sticky top-4 space-y-4">
                    <Card className="p-4 bg-gradient-to-br from-slate-800 to-slate-900 border-0">
                      <p className="text-sm font-bold text-white/80 mb-4 text-center flex items-center justify-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">📱</span>
                        ตัวอย่างใน LINE
                      </p>
                      
                      <div className="bg-[#8CABD9] rounded-2xl p-4 min-h-[300px] flex items-center justify-center">
                        <motion.div 
                          key={selectedType}
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="w-full max-w-[260px] bg-white rounded-2xl shadow-xl overflow-hidden"
                        >
                          {/* Header */}
                          <div 
                            className="px-4 py-3 flex items-center gap-2 justify-center"
                            style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}
                          >
                            {formData.styling?.showIcon && (
                              <span className="text-lg">{formData.styling?.icon || '⚡'}</span>
                            )}
                            <span className="font-bold text-sm text-white">
                              {formData.title || 'หัวข้อ'}
                            </span>
                          </div>

                          {/* Body */}
                          <div 
                            className="px-4 py-6 text-center space-y-2"
                            style={{ backgroundColor: formData.styling?.backgroundColor || '#f8fafc' }}
                          >
                            <p className="font-bold text-slate-900 text-sm">
                              {formData.mainMessage || 'ข้อความหลัก'}
                            </p>
                            {formData.subMessage && (
                              <p className="text-xs text-slate-500">{formData.subMessage}</p>
                            )}
                          </div>

                          {/* Buttons */}
                          {(formData.styling?.showRetryButton || formData.styling?.showContactButton) && (
                            <div className="p-3 bg-white space-y-2">
                              {formData.styling?.showRetryButton && (
                                <div 
                                  className="w-full h-10 flex items-center justify-center text-xs font-bold text-white rounded-lg"
                                  style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}
                                >
                                  {formData.styling?.retryButtonText || 'ส่งใหม่'}
                                </div>
                              )}
                              {formData.styling?.showContactButton && (
                                <div className="w-full h-10 flex items-center justify-center text-xs font-bold text-slate-600 bg-slate-100 rounded-lg">
                                  {formData.styling?.contactButtonText || 'ติดต่อผู้ดูแล'}
                                </div>
                              )}
                            </div>
                          )}
                        </motion.div>
                      </div>
                    </Card>

                    <Card className="p-4 bg-emerald-50 border-emerald-200">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">✅</span>
                        <div>
                          <p className="font-bold text-emerald-800 text-sm">จะส่งเมื่อ</p>
                          <p className="text-xs text-emerald-700 mt-1">
                            {RESPONSE_TYPES[selectedType || '']?.description}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Quick Actions */}
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        fullWidth
                        onClick={handleReset}
                        disabled={saving}
                      >
                        🔄 รีเซ็ต
                      </Button>
                      <Button 
                        variant="primary" 
                        size="sm" 
                        fullWidth
                        onClick={handleSave}
                        isLoading={saving}
                      >
                        💾 บันทึก
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Card className="p-12 text-center bg-gradient-to-br from-slate-50 to-slate-100">
                <div className="text-6xl mb-4">👈</div>
                <h4 className="text-xl font-bold text-slate-900 mb-2">เลือกประเภทข้อความ</h4>
                <p className="text-slate-500">เลือกจากรายการทางซ้ายเพื่อเริ่มปรับแต่ง</p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
