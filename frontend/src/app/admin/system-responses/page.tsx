'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Textarea, Switch, Select } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

// System Response Types Info
const RESPONSE_TYPES = {
  no_slip_found: { label: 'Asset Search Void', icon: '🔍', shadow: 'shadow-rose-500/10' },
  qr_unclear: { label: 'Signal Interference', icon: '📡', shadow: 'shadow-amber-500/10' },
  quota_exceeded: { label: 'Resource Depletion', icon: '🪫', shadow: 'shadow-rose-500/20' },
  quota_low: { label: 'Critical Threshold', icon: '⚠️', shadow: 'shadow-amber-500/20' },
  invalid_image: { label: 'Corrupt Data Object', icon: '🖼️', shadow: 'shadow-rose-500/10' },
  image_download_error: { label: 'Downlink Failure', icon: '📥', shadow: 'shadow-rose-500/10' },
  general_error: { label: 'Logic Breach', icon: '☣️', shadow: 'shadow-rose-500/10' },
  bot_disabled: { label: 'Relay Offline', icon: '📵', shadow: 'shadow-slate-500/10' },
  slip_disabled: { label: 'Extraction Halted', icon: '🔒', shadow: 'shadow-slate-500/10' },
  processing: { label: 'Quantum Sync', icon: '⏳', shadow: 'shadow-emerald-500/10' },
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
  contactButtonText: 'CONTACT COMMAND',
  contactButtonUrl: '',
  showRetryButton: true,
  retryButtonText: 'RETRY UPLINK',
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
      toast.error('Failed to sync response registry');
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
        toast.success('Core logic synchronized');
        fetchTemplates();
      }
    } catch (error) {
      toast.error('Sync failure');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedType) return;
    if (!confirm('Revert behavior to factory defaults?')) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/system-response-templates/${selectedType}/reset`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Behavior reset complete');
        setFormData({ ...data.data, styling: { ...DEFAULT_STYLING, ...data.data.styling } });
        fetchTemplates();
      }
    } catch (error) {
      toast.error('Reset failed');
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

  if (loading) return <DashboardLayout requiredRole="admin"><PageLoading message="Synchronizing Protocol Data..." /></DashboardLayout>;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-12 animate-fade max-w-[1600px] mx-auto pb-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter leading-none">Response Protocol Manifest</h1>
              <Badge variant="slate" className="px-2 py-0.5 font-black text-[10px] uppercase tracking-widest bg-slate-200">System Overrides</Badge>
            </div>
            <p className="text-slate-500 font-medium text-lg">Define immutable response patterns for organizational service-level events.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="font-bold uppercase tracking-widest text-[11px]" onClick={handleReset} disabled={saving || !selectedType}>
              Factory Reset
            </Button>
            <Button variant="primary" className="rounded-2xl font-black uppercase tracking-widest shadow-emerald-500/10 shadow-xl h-12" onClick={handleSave} isLoading={saving}>
              Synchronize Registry
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

          {/* Protocol Selection Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3.5rem] overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Signal Events</p>
              </div>
              <div className="px-4 py-6 space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {templates.map((template) => {
                  const typeInfo = RESPONSE_TYPES[template.type as keyof typeof RESPONSE_TYPES];
                  const isSelected = selectedType === template.type;
                  return (
                    <motion.button
                      key={template._id}
                      whileHover={{ x: 5 }}
                      onClick={() => handleSelectTemplate(template)}
                      className={cn(
                        "w-full p-4 rounded-[2rem] flex items-center gap-5 transition-all duration-500 group relative",
                        isSelected ? "bg-slate-900 text-white shadow-2xl" : "hover:bg-white hover:shadow-premium-sm"
                      )}
                    >
                      {isSelected && <motion.div layoutId="activeProtocol" className="absolute inset-0 bg-slate-900 rounded-[2rem] -z-10 shadow-2xl shadow-slate-900/10" />}
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner",
                        isSelected ? "bg-white/10" : "bg-slate-50"
                      )}>
                        {typeInfo?.icon || '📄'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-black text-sm uppercase tracking-tight truncate leading-none mb-1 group-hover:text-emerald-500 transition-colors">{template.name}</p>
                        <p className={cn("text-[9px] font-black uppercase tracking-widest opacity-40 leading-none", isSelected && "opacity-60")}>Format: {template.responseFormat}</p>
                      </div>
                      <div className={cn("w-2 h-2 rounded-full", template.isActive ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" : "bg-slate-300")} />
                    </motion.button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Logic Constructor & Preview */}
          <div className="lg:col-span-8 space-y-8 animate-slide-up">
            {formData ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">

                {/* Workspace */}
                <div className="space-y-10">
                  <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 px-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Fundamental Logic
                    </h3>
                    <Card className="p-8 bg-white border-none shadow-premium-sm rounded-[3rem] space-y-6">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-500">Service Status</span>
                        <Switch checked={formData.isActive ?? true} onChange={(checked) => updateFormData('isActive', checked)} />
                      </div>
                      <Select label="Response Architecture" value={formData.responseFormat || 'flex'} onChange={(e) => updateFormData('responseFormat', e.target.value)}>
                        <option value="flex">Neuro-Flex (High Fidelity)</option>
                        <option value="text">Legacy-Text (Plain Object)</option>
                      </Select>
                      <Textarea label="Fallback Signal (Text)" value={formData.textMessage || ''} onChange={(e) => updateFormData('textMessage', e.target.value)} rows={3} placeholder="Signal content for legacy devices..." />
                    </Card>
                  </div>

                  <AnimatePresence mode="wait">
                    {formData.responseFormat === 'flex' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                        <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 px-4 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" /> Neuro-Flex Parameters
                        </h3>
                        <Card className="p-8 bg-slate-900 border-none shadow-2xl shadow-slate-900/10 rounded-[3rem] text-white space-y-6">
                          <Input variant="glass" label="Primary Command (Title)" value={formData.title || ''} onChange={(e) => updateFormData('title', e.target.value)} className="bg-white/5 border-white/10 text-white" />
                          <Input variant="glass" label="Core Transmission (Main)" value={formData.mainMessage || ''} onChange={(e) => updateFormData('mainMessage', e.target.value)} className="bg-white/5 border-white/10 text-white" />
                          <Textarea variant="glass" label="Supplementary Data (Sub)" value={formData.subMessage || ''} onChange={(e) => updateFormData('subMessage', e.target.value)} rows={3} className="bg-white/5 border-white/10 text-white" />
                        </Card>

                        <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 px-4 flex items-center gap-2 pt-4">
                          <span className="w-2 h-2 rounded-full bg-purple-500" /> UI Schema
                        </h3>
                        <Card className="p-8 bg-white border-none shadow-premium-sm rounded-[3rem] space-y-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Header Hue</label><input type="color" value={formData.styling?.primaryColor || '#10b981'} onChange={(e) => updateStyling('primaryColor', e.target.value)} className="w-full h-12 rounded-2xl border-none cursor-pointer shadow-inner overflow-hidden flex-1" /></div>
                            <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Background Hue</label><input type="color" value={formData.styling?.backgroundColor || '#f8fafc'} onChange={(e) => updateStyling('backgroundColor', e.target.value)} className="w-full h-12 rounded-2xl border-none cursor-pointer shadow-inner overflow-hidden flex-1" /></div>
                          </div>
                          <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-2xl">
                            <div className="flex-1 flex items-center gap-4">
                              <Switch checked={formData.styling?.showIcon ?? true} onChange={(checked) => updateStyling('showIcon', checked)} />
                              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Visual Icon</span>
                            </div>
                            {formData.styling?.showIcon && <input value={formData.styling?.icon || '⚡'} onChange={(e) => updateStyling('icon', e.target.value)} className="w-12 h-12 bg-white rounded-xl border border-slate-100 text-center text-xl shadow-premium-sm" />}
                          </div>
                        </Card>

                        <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 px-4 flex items-center gap-2 pt-4">
                          <span className="w-2 h-2 rounded-full bg-rose-500" /> Action Nodes
                        </h3>
                        <Card className="p-8 bg-white border-none shadow-premium-sm rounded-[3rem] space-y-8">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-widest text-slate-500">Recalibration Button</span><Switch checked={formData.styling?.showRetryButton ?? true} onChange={(checked) => updateStyling('showRetryButton', checked)} /></div>
                            {formData.styling?.showRetryButton && <Input label="Recalibration Label" value={formData.styling?.retryButtonText || ''} onChange={(e) => updateStyling('retryButtonText', e.target.value)} />}
                          </div>
                          <div className="space-y-4 border-t border-slate-50 pt-6">
                            <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-widest text-slate-500">Support Terminal Button</span><Switch checked={formData.styling?.showContactButton ?? true} onChange={(checked) => updateStyling('showContactButton', checked)} /></div>
                            {formData.styling?.showContactButton && (
                              <>
                                <Input label="Terminal Label" value={formData.styling?.contactButtonText || ''} onChange={(e) => updateStyling('contactButtonText', e.target.value)} />
                                <Input label="Terminal Link Address" value={formData.styling?.contactButtonUrl || ''} onChange={(e) => updateStyling('contactButtonUrl', e.target.value)} placeholder="https://..." />
                              </>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* High Fidelity Preview Overlay */}
                <div className="sticky top-12 h-fit space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 px-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Real-time Simulation
                  </h3>
                  <div className="relative group p-12 bg-slate-900 rounded-[4.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-7xl font-black italic">PREVIEW</div>
                    <div className="relative z-10 w-full max-w-[320px] mx-auto bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-float">

                      {/* Device Top */}
                      <div className="h-6 bg-slate-50 flex items-center justify-center gap-1.5 opacity-20">
                        <div className="w-1 h-1 rounded-full bg-slate-700" />
                        <div className="w-8 h-1 rounded-full bg-slate-700" />
                      </div>

                      {/* Flex Message Rendering */}
                      <div className="flex flex-col">
                        <div className="px-6 py-5 flex items-center gap-3 justify-center text-center" style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}>
                          {formData.styling?.showIcon && <span className="text-2xl drop-shadow-lg">{formData.styling?.icon || '⚡'}</span>}
                          <span className="font-extrabold text-[15px] uppercase tracking-widest text-white">{formData.title || 'PROTOCOL_HEADER'}</span>
                        </div>

                        <div className="px-8 py-10 text-center space-y-3" style={{ backgroundColor: formData.styling?.backgroundColor || '#f8fafc' }}>
                          <p className="font-black text-slate-900 text-lg leading-tight uppercase tracking-tight">{formData.mainMessage || 'CORE_MESSAGE_MANIFEST'}</p>
                          {formData.subMessage && <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase tracking-wider">{formData.subMessage}</p>}
                        </div>

                        <div className="p-6 bg-white space-y-3">
                          {formData.styling?.showRetryButton && (
                            <div className="w-full h-12 flex items-center justify-center font-black text-[11px] uppercase tracking-[0.2em] text-white rounded-2xl shadow-xl shadow-emerald-500/10" style={{ backgroundColor: formData.styling?.primaryColor || '#10b981' }}>
                              {formData.styling?.retryButtonText || 'RETRY_SIGNAL'}
                            </div>
                          )}
                          {formData.styling?.showContactButton && (
                            <div className="w-full h-12 flex items-center justify-center font-black text-[11px] uppercase tracking-[0.2em] text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                              {formData.styling?.contactButtonText || 'SUPPORT_LINK'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="h-4 bg-white" />
                    </div>

                    {/* Background Glimmer */}
                    <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-500/10 blur-[100px] rounded-full" />
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-500/10 blur-[100px] rounded-full" />
                  </div>

                  <Card className="p-6 bg-emerald-900/5 border-emerald-500/10 rounded-[2.5rem] flex items-start gap-4">
                    <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center text-white text-xl flex-shrink-0 shadow-lg shadow-emerald-500/20">💡</div>
                    <p className="text-xs font-bold text-emerald-900/40 uppercase tracking-widest leading-relaxed pt-1">The real-time simulator mimics the exact visual hierarchy presented to the authorized end-user upon protocol trigger.</p>
                  </Card>
                </div>

              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 opacity-30 bg-white/20 backdrop-blur-3xl rounded-[4rem] border-4 border-dashed border-slate-200">
                <div className="text-8xl mb-8">🛠️</div>
                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-[0.2em] mb-4">Protocol Core Standby</h4>
                <p className="text-xs font-bold text-center max-w-xs leading-relaxed uppercase tracking-widest">Select an automated response event from the manifest to begin neuro-logic recalibration.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.1); border-radius: 10px; }
        @keyframes float { 
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}</style>
    </DashboardLayout>
  );
}
