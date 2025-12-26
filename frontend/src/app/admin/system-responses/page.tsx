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

// Interaction Protocol Deployment Matrix
// [NOTE] REDUNDANT SLIPS UTILIZE SLIP TEMPLATES; LOW QUOTA SIGNALS ARE INJECTED INTO SLIP PAYLOADS
const RESPONSE_CATEGORIES = {
  main: {
    label: 'CORE PROTOCOLS',
    description: 'ESSENTIAL INTERACTION SIGNALS',
    types: ['quota_exhausted', 'package_expired', 'slip_not_found', 'system_error'],
  },
  optional: {
    label: 'EXTENDED LOGIC',
    description: 'OPTIONAL COMMUNICATION LAYERS',
    types: ['bot_disabled', 'processing'],
  },
  extra: {
    label: 'ANCILLARY DATA',
    description: 'SUPPLEMENTARY TELEMETRY',
    types: ['quota_low'],
  },
};

// INTERACTION PROTOCOL DEFINITIONS
const RESPONSE_TYPES: Record<string, { label: string; icon: string; description: string; color: string; userConfigurable?: boolean }> = {
  // CORE
  quota_exhausted: { label: 'QUOTA EXHAUSTED', icon: '🔴', description: 'CREDIT PAYLOAD DEPLETED', color: '#DC2626' },
  package_expired: { label: 'PACKAGE EXPIRED', icon: '⏰', description: 'SUBSCRIPTION CYCLE TERMINATED', color: '#F59E0B' },
  slip_not_found: { label: 'SLIP DATA NOT FOUND', icon: '❌', description: 'VERIFICATION REGISTRY MISMATCH', color: '#EF4444' },
  system_error: { label: 'SYSTEM CRITICAL ERROR', icon: '⚠️', description: 'INTERNAL PROTOCOL FAILURE', color: '#F97316' },
  // OPTIONAL
  bot_disabled: { label: 'BOT DISCONNECTED', icon: '📵', description: 'NEURAL INTERFACE INACTIVE', color: '#64748B', userConfigurable: true },
  processing: { label: 'SIGNAL PROCESSING', icon: '⏳', description: 'METADATA VALIDATION ACTIVE', color: '#0EA5E9', userConfigurable: true },
  // EXTRA
  quota_low: { label: 'QUOTA LOW THRESHOLD', icon: '⚠️', description: 'CREDIT RESERVES CRITICAL', color: '#EAB308' },
};

// Color presets for quick selection
const COLOR_PRESETS = [
  { name: 'EMERALD', primary: '#10B981', bg: '#ECFDF5' },
  { name: 'ROSE', primary: '#EF4444', bg: '#FEF2F2' },
  { name: 'ORANGE', primary: '#F97316', bg: '#FFF7ED' },
  { name: 'AMBER', primary: '#EAB308', bg: '#FEFCE8' },
  { name: 'BLUE', primary: '#3B82F6', bg: '#EFF6FF' },
  { name: 'VIOLET', primary: '#8B5CF6', bg: '#F5F3FF' },
  { name: 'PINK', primary: '#EC4899', bg: '#FDF2F8' },
  { name: 'SLATE', primary: '#64748B', bg: '#F8FAFC' },
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
  contactButtonText: 'UPLINK OPERATOR',
  contactButtonUrl: '',
  showRetryButton: true,
  retryButtonText: 'RETRY PROTOCOL',
};

export default function SystemResponsesPage() {
  const [templates, setTemplates] = useState<SystemResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SystemResponseTemplate> | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('main');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await systemResponseTemplatesApi.getAll();
      const data = res.data;
      if (data.success && data.data) {
        setTemplates(data.data);
        if (data.data.length > 0 && !selectedType) {
          // Select first main template by default
          const firstMain = data.data.find((t: SystemResponseTemplate) =>
            RESPONSE_CATEGORIES.main.types.includes(t.type)
          );
          if (firstMain) handleSelectTemplate(firstMain);
          else if (data.data[0]) handleSelectTemplate(data.data[0]);
        }
      } else {
        // No templates found - might need to create them
        toast.error('MATRIX REGISTRY EMPTY: PLEASE INITIALIZE SYSTEM CONFIGURATION');
      }
    } catch (error: any) {
      console.error('Failed to fetch templates:', error);
      toast.error(error.response?.data?.message || 'SIGNAL ACQUISITION FAILED: MATRIX UNREACHABLE');
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
        toast.success('PROTOCOL COMMITTED SUCCESSFULLY');
        fetchTemplates();
      } else {
        toast.error(res.data.error || 'PROTOCOL COMMIT FAILED');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'SIGNAL TRANSMISSION ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedType) return;
    if (!confirm('WARNING: RESETTING DOMAIN WILL REVERT ALL PARAMETERS. PROCEED?')) return;

    try {
      setSaving(true);
      const res = await systemResponseTemplatesApi.reset(selectedType);
      if (res.data.success) {
        toast.success('DOMAIN PARAMETERS RESET');
        setFormData({ ...res.data.data, styling: { ...DEFAULT_STYLING, ...res.data.data.styling } });
        fetchTemplates();
      } else {
        toast.error(res.data.error || 'RESET PROTOCOL FAILED');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'SIGNAL TRANSMISSION ERROR');
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

  if (loading) return <DashboardLayout requiredRole="admin"><PageLoading message="LOGGING INTO INTERACTION MATRIX..." /></DashboardLayout>;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-4 md:space-y-6 animate-fade max-w-[1800px] mx-auto pb-6 md:pb-12">

        {/* Neural Header Section */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 md:gap-8 mb-4">
          <div className="space-y-1 md:space-y-2">
            <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-black text-slate-900 tracking-[-0.04em] uppercase">
              Response <span className="text-emerald-500">Matrix</span>
            </h1>
            <p className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.3em] flex items-center gap-2">
              <span className="w-4 md:w-8 h-[2px] bg-emerald-500/30"></span>
              Interaction Protocol & Automation Logic
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3 w-full lg:w-auto">
            <Button
              variant="ghost"
              className="h-11 md:h-14 px-4 md:px-8 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[9px] md:text-[10px] text-slate-400 hover:text-slate-900 bg-white/50 border border-slate-100 hover:bg-white"
              onClick={handleReset}
              disabled={saving || !selectedType}
            >
              <span className="hidden sm:inline">Reset Domain</span>
              <span className="sm:hidden">Reset</span>
            </Button>
            <Button
              variant="primary"
              className="h-11 md:h-14 px-6 md:px-10 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-[9px] md:text-[11px] shadow-emerald-500/20 shadow-2xl"
              onClick={handleSave}
              isLoading={saving}
              leftIcon={
                <div className="w-5 h-5 md:w-6 md:h-6 rounded-lg bg-white/20 flex items-center justify-center mr-1 md:mr-2">
                  <svg className="w-3 h-3 md:w-3.5 md:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              }
            >
              <span className="hidden sm:inline">Commit Protocol</span>
              <span className="sm:hidden">Commit</span>
            </Button>
          </div>
        </div>

        {/* Protocol Flow Visualization - Hidden on Mobile */}
        <Card className="hidden lg:block p-6 md:p-8 bg-white/40 backdrop-blur-3xl border-none shadow-inner rounded-2xl md:rounded-[3rem]">
          <div className="flex flex-wrap items-center gap-4 md:gap-8 justify-center">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-[10px] md:text-xs shadow-xl">01</div>
              <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Signal</p>
            </div>
            <div className="w-6 md:w-10 h-[1px] bg-slate-200" />
            <div className="flex items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-[10px] md:text-xs shadow-xl">02</div>
              <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Verify</p>
            </div>
            <div className="w-6 md:w-10 h-[1px] bg-slate-200" />
            <div className="flex items-center gap-2 md:gap-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black text-[10px] md:text-xs shadow-xl">03</div>
              <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">Transmit</p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Sidebar - Template Selector */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">

            {/* Neural Search */}
            <div className="relative group">
              <input
                type="text"
                placeholder="SEARCH INTERACTION MATRIX..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 pl-12 pr-6 rounded-2xl bg-white/60 backdrop-blur-xl border-none shadow-premium-sm focus:shadow-premium focus:ring-0 font-black text-[10px] tracking-widest uppercase transition-all"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            {/* Neural Domain Tabs */}
            {!searchQuery && (
              <div className="flex flex-wrap gap-2 bg-slate-100/50 p-1.5 rounded-[1.5rem] backdrop-blur-md">
                {Object.entries(RESPONSE_CATEGORIES).map(([key, cat]) => (
                  <button
                    key={key}
                    onClick={() => setActiveCategory(key)}
                    className={cn(
                      "flex-1 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-500",
                      activeCategory === key
                        ? "bg-white text-slate-900 shadow-premium-sm scale-100"
                        : "text-slate-400 hover:text-slate-600 scale-95"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* Interaction Protocol List */}
            <Card className="p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium rounded-[2.5rem] overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100/50 bg-slate-50/50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  {searchQuery ? `Search Results (${filteredTemplates.length})` : RESPONSE_CATEGORIES[activeCategory as keyof typeof RESPONSE_CATEGORIES]?.label}
                </p>
              </div>
              <div className="p-3 space-y-2 max-h-[55vh] overflow-y-auto custom-scrollbar">
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-16 opacity-30">
                    <p className="text-[10px] font-black uppercase tracking-widest">Zero Signals Filtered</p>
                  </div>
                ) : filteredTemplates.map((template) => {
                  const typeInfo = RESPONSE_TYPES[template.type];
                  const isSelected = selectedType === template.type;
                  return (
                    <motion.button
                      key={template._id}
                      onClick={() => handleSelectTemplate(template)}
                      className={cn(
                        "relative w-full p-4 rounded-[1.8rem] flex items-center gap-4 transition-all duration-500 group overflow-hidden border border-transparent",
                        isSelected
                          ? "bg-slate-900 text-white shadow-2xl shadow-slate-900/10 border-white/5"
                          : "hover:bg-white hover:shadow-premium-sm"
                      )}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="activeResponseSlot"
                          className="absolute inset-0 bg-slate-900 -z-10"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <div
                        className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center text-lg shadow-inner transition-transform duration-500 group-hover:scale-110 relative z-10",
                          isSelected ? "bg-white/10 border border-white/10" : "bg-slate-50 border border-slate-100"
                        )}
                        style={{ color: typeInfo?.color }}
                      >
                        {typeInfo?.icon || '📄'}
                      </div>
                      <div className="flex-1 min-w-0 text-left relative z-10">
                        <p className={cn("font-black text-[11px] truncate uppercase tracking-tight mb-0.5", isSelected ? "text-white" : "text-slate-900")}>
                          {template.name || typeInfo?.label}
                        </p>
                        <p className={cn("text-[9px] font-bold truncate uppercase tracking-widest opacity-40", isSelected && "text-emerald-400 opacity-100")}>
                          {typeInfo?.description}
                        </p>
                      </div>
                      <div className="relative z-10">
                        {template.isActive ? (
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-200" />
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

                  {/* Interaction Protocol Header */}
                  <Card className="p-8 bg-white/60 backdrop-blur-3xl border-none shadow-premium rounded-[3.5rem] overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full" />
                    <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                      <div
                        className="w-20 h-20 rounded-3xl flex items-center justify-center text-3xl shadow-premium group-hover:scale-110 transition-transform duration-700"
                        style={{
                          backgroundColor: RESPONSE_TYPES[selectedType || '']?.color + '15',
                          color: RESPONSE_TYPES[selectedType || '']?.color
                        }}
                      >
                        {RESPONSE_TYPES[selectedType || '']?.icon}
                      </div>
                      <div className="flex-1 text-center md:text-left">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-1">
                          {formData.name || RESPONSE_TYPES[selectedType || '']?.label}
                        </h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                          {RESPONSE_TYPES[selectedType || '']?.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white shadow-inner">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Protocol Active</span>
                        <Switch
                          checked={formData.isActive ?? true}
                          onChange={(checked) => updateFormData('isActive', checked)}
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Communication Logistics */}
                  <Card className="p-8 bg-white/60 backdrop-blur-3xl border-none shadow-premium rounded-[3.5rem] space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-xl shadow-inner">🛰️</div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Deployment Format</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select interaction layer architecture</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => updateFormData('responseFormat', 'flex')}
                        className={cn(
                          "p-6 rounded-[2.5rem] border-2 transition-all duration-500 text-left relative overflow-hidden group",
                          formData.responseFormat === 'flex'
                            ? "border-emerald-500 bg-emerald-50/30"
                            : "border-slate-100 bg-slate-50/50 hover:border-slate-300"
                        )}
                      >
                        <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">💎</div>
                        <p className="font-black text-[13px] text-slate-900 uppercase tracking-tight mb-1">Neural Flex</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">High-fidelity visual matrix</p>
                        {formData.responseFormat === 'flex' && (
                          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFormData('responseFormat', 'text')}
                        className={cn(
                          "p-6 rounded-[2.5rem] border-2 transition-all duration-500 text-left relative overflow-hidden group",
                          formData.responseFormat === 'text'
                            ? "border-emerald-500 bg-emerald-50/30"
                            : "border-slate-100 bg-slate-50/50 hover:border-slate-300"
                        )}
                      >
                        <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">⌨️</div>
                        <p className="font-black text-[13px] text-slate-900 uppercase tracking-tight mb-1">Standard Cipher</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Clean terminal-style response</p>
                        {formData.responseFormat === 'text' && (
                          <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        )}
                      </button>
                    </div>

                    <Textarea
                      label="NOMINAL CLI FALLBACK"
                      value={formData.textMessage || ''}
                      onChange={(e) => updateFormData('textMessage', e.target.value)}
                      rows={3}
                      placeholder="ENTER FALLBACK SIGNAL CIPHER..."
                      className="rounded-[2rem] bg-slate-50 border-none shadow-inner font-black text-[11px] p-6 leading-relaxed uppercase"
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
                        {/* Signal Content Mapping */}
                        <Card className="p-8 bg-white/60 backdrop-blur-3xl border-none shadow-premium rounded-[3.5rem] space-y-8">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-xl shadow-inner">📡</div>
                            <div>
                              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Signal Parameters</h3>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Define the core interaction payload</p>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <Input
                              label="PRIMARY NOMENCLATURE (TITLE)"
                              value={formData.title || ''}
                              onChange={(e) => updateFormData('title', e.target.value)}
                              placeholder="e.g. QUOTA DEPLETED..."
                              className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-[11px] px-6 uppercase tracking-widest"
                            />
                            <Input
                              label="CORE TRANSMISSION (MAIN MESSAGE)"
                              value={formData.mainMessage || ''}
                              onChange={(e) => updateFormData('mainMessage', e.target.value)}
                              placeholder="e.g. YOUR ACCOUNT HAS REACHED ZERO CREDITS..."
                              className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-[11px] px-6 uppercase tracking-widest"
                            />
                            <Textarea
                              label="ANCILLARY TELEMETRY (SUB MESSAGE)"
                              value={formData.subMessage || ''}
                              onChange={(e) => updateFormData('subMessage', e.target.value)}
                              rows={3}
                              placeholder="e.g. PLEASE REFUND TO CONTINUE AUTOMATED SERVICES..."
                              className="rounded-[2rem] bg-slate-50 border-none shadow-inner font-black text-[11px] p-6 leading-relaxed uppercase"
                            />
                          </div>
                        </Card>

                        {/* Visual Matrix Aesthetics */}
                        <Card className="p-8 bg-white/60 backdrop-blur-3xl border-none shadow-premium rounded-[3.5rem] space-y-8">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-pink-50 flex items-center justify-center text-xl shadow-inner">🎨</div>
                            <div>
                              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Visual Matrix</h3>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configure chromatic deployment parameters</p>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Neural Chromatic Presets</p>
                              <div className="flex flex-wrap gap-3">
                                {COLOR_PRESETS.map((preset) => (
                                  <button
                                    key={preset.name}
                                    type="button"
                                    onClick={() => applyColorPreset(preset)}
                                    className="w-12 h-12 rounded-2xl shadow-lg hover:scale-110 transition-all duration-500 border-2 border-white ring-2 ring-slate-100/50"
                                    style={{ backgroundColor: preset.primary }}
                                    title={preset.name}
                                  />
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Primary Frequency</p>
                                <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 shadow-inner">
                                  <input
                                    type="color"
                                    value={formData.styling?.primaryColor || '#10b981'}
                                    onChange={(e) => updateStyling('primaryColor', e.target.value)}
                                    className="w-12 h-12 rounded-xl border-none cursor-pointer bg-transparent"
                                  />
                                  <span className="text-[11px] font-black font-mono text-slate-400 uppercase">{formData.styling?.primaryColor}</span>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Background Void</p>
                                <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 shadow-inner">
                                  <input
                                    type="color"
                                    value={formData.styling?.backgroundColor || '#f8fafc'}
                                    onChange={(e) => updateStyling('backgroundColor', e.target.value)}
                                    className="w-12 h-12 rounded-xl border-none cursor-pointer bg-transparent"
                                  />
                                  <span className="text-[11px] font-black font-mono text-slate-400 uppercase">{formData.styling?.backgroundColor}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between p-6 bg-slate-50/50 rounded-3xl border border-slate-100/50 backdrop-blur-md">
                              <div className="flex items-center gap-4">
                                <Switch
                                  checked={formData.styling?.showIcon ?? true}
                                  onChange={(checked) => updateStyling('showIcon', checked)}
                                />
                                <div>
                                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Signal Marker</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Visual identifier toggle</p>
                                </div>
                              </div>
                              {formData.styling?.showIcon && (
                                <input
                                  value={formData.styling?.icon || '⚡'}
                                  onChange={(e) => updateStyling('icon', e.target.value)}
                                  className="w-16 h-16 bg-white rounded-2xl border-none shadow-premium-sm text-center text-3xl focus:ring-0 transition-all font-black"
                                />
                              )}
                            </div>
                          </div>
                        </Card>

                        {/* Control Interface Buttons */}
                        <Card className="p-8 bg-white/60 backdrop-blur-3xl border-none shadow-premium rounded-[3.5rem] space-y-8">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-xl shadow-inner">🔘</div>
                            <div>
                              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Control Interface</h3>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manage interaction triggers & links</p>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100/50 space-y-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <Switch
                                    checked={formData.styling?.showRetryButton ?? true}
                                    onChange={(checked) => updateStyling('showRetryButton', checked)}
                                  />
                                  <div>
                                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Retry Protocol</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Re-initiation trigger</p>
                                  </div>
                                </div>
                              </div>
                              {formData.styling?.showRetryButton && (
                                <Input
                                  label="RETRY TRIGGER NOMENCLATURE"
                                  value={formData.styling?.retryButtonText || ''}
                                  onChange={(e) => updateStyling('retryButtonText', e.target.value)}
                                  placeholder="e.g. RE-TRANSMIT PROTOCOL..."
                                  className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-black text-[11px] px-6 uppercase tracking-widest"
                                />
                              )}
                            </div>

                            <div className="p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100/50 space-y-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <Switch
                                    checked={formData.styling?.showContactButton ?? true}
                                    onChange={(checked) => updateStyling('showContactButton', checked)}
                                  />
                                  <div>
                                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Uplink Contact</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Operator communication conduit</p>
                                  </div>
                                </div>
                              </div>
                              {formData.styling?.showContactButton && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <Input
                                    label="UPLINK LABEL"
                                    value={formData.styling?.contactButtonText || ''}
                                    onChange={(e) => updateStyling('contactButtonText', e.target.value)}
                                    placeholder="e.g. UPLINK TO OPERATOR..."
                                    className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-black text-[11px] px-6 uppercase tracking-widest"
                                  />
                                  <Input
                                    label="CONDUIT URI (LINK)"
                                    value={formData.styling?.contactButtonUrl || ''}
                                    onChange={(e) => updateStyling('contactButtonUrl', e.target.value)}
                                    placeholder="https://..."
                                    className="h-14 rounded-2xl bg-white border-none shadow-premium-sm font-black text-[11px] px-6 uppercase tracking-widest"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Neural Visualization Preview */}
                <div className="xl:col-span-2 space-y-6">
                  <div className="sticky top-10 space-y-6">
                    <Card className="p-8 bg-slate-900 border-none shadow-2xl rounded-[3.5rem] overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                      <p className="text-[10px] font-black text-white/40 mb-8 text-center uppercase tracking-[0.4em] flex items-center justify-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Neural Interface Preview
                      </p>

                      <div className="bg-slate-800/50 rounded-[2.8rem] p-6 min-h-[450px] flex flex-col items-center justify-center border border-white/5 relative shadow-inner">
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-4 rounded-full bg-slate-900 border border-white/5" />

                        <motion.div
                          key={selectedType}
                          initial={{ scale: 0.9, opacity: 0, y: 20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          className="w-full max-w-[280px] bg-white rounded-[2.2rem] shadow-2xl overflow-hidden"
                        >
                          {/* Neural Header */}
                          <div
                            className="px-6 py-5 flex items-center gap-3 justify-center"
                            style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}
                          >
                            {formData.styling?.showIcon && (
                              <span className="text-xl drop-shadow-md">{formData.styling?.icon || '⚡'}</span>
                            )}
                            <span className="font-black text-[12px] text-white uppercase tracking-widest drop-shadow-sm">
                              {formData.title || 'PROTOCOL TITLE'}
                            </span>
                          </div>

                          {/* Neural Body */}
                          <div
                            className="px-6 py-10 text-center space-y-4"
                            style={{ backgroundColor: formData.styling?.backgroundColor || '#f8fafc' }}
                          >
                            <p className="font-black text-slate-900 text-[13px] leading-tight uppercase tracking-tight">
                              {formData.mainMessage || 'MAIN PAYLOAD MESSAGE'}
                            </p>
                            {formData.subMessage && (
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">{formData.subMessage}</p>
                            )}
                          </div>

                          {/* Neural Controls */}
                          {(formData.styling?.showRetryButton || formData.styling?.showContactButton) && (
                            <div className="p-4 bg-white space-y-2 border-t border-slate-50">
                              {formData.styling?.showRetryButton && (
                                <div
                                  className="w-full h-12 flex items-center justify-center text-[10px] font-black text-white rounded-2xl uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/10"
                                  style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}
                                >
                                  {formData.styling?.retryButtonText || 'RETRY PROTOCOL'}
                                </div>
                              )}
                              {formData.styling?.showContactButton && (
                                <div className="w-full h-12 flex items-center justify-center text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100/50 rounded-2xl uppercase tracking-[0.2em]">
                                  {formData.styling?.contactButtonText || 'UPLINK OPERATOR'}
                                </div>
                              )}
                            </div>
                          )}
                        </motion.div>

                        <div className="mt-8 flex gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                          <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                          <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                        </div>
                      </div>
                    </Card>

                    {/* Operational Summary */}
                    <Card className="p-8 bg-emerald-50/50 border border-emerald-100/50 backdrop-blur-md rounded-[2.5rem]">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-xl shadow-lg">⚡</div>
                        <div>
                          <p className="font-black text-emerald-900 text-xs uppercase tracking-widest mb-1">Activation Trigger</p>
                          <p className="text-[10px] font-bold text-emerald-700/60 leading-relaxed uppercase">
                            {RESPONSE_TYPES[selectedType || '']?.description}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Quick Access Matrix */}
                    <div className="flex gap-4">
                      <Button
                        variant="ghost"
                        size="lg"
                        fullWidth
                        onClick={handleReset}
                        disabled={saving}
                        className="rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400"
                      >
                        Reset Domain
                      </Button>
                      <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        onClick={handleSave}
                        isLoading={saving}
                        className="rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-emerald-500/20"
                      >
                        Deploy Signal
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Card className="p-20 text-center bg-white/40 backdrop-blur-3xl border-none shadow-inner rounded-[4rem] flex flex-col items-center justify-center space-y-6">
                <div className="w-24 h-24 bg-slate-900 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-2xl animate-bounce">👈</div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Initialize Control</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Select an Interaction Protocol from the manifest</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
