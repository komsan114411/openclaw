'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
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
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: 'Completion Success', color: 'emerald', icon: '✅', description: 'Standard successful verification' },
  { value: 'duplicate', label: 'Redundant Slip', color: 'amber', icon: '⚠️', description: 'Already processed transactions' },
  { value: 'error', label: 'System Exception', color: 'rose', icon: '❌', description: 'Internal processing errors' },
  { value: 'not_found', label: 'Null Record', color: 'slate', icon: '🔍', description: 'No matching transaction found' },
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

  const templatesByType = templates.reduce((acc, template) => {
    if (!acc[template.type]) {
      acc[template.type] = [];
    }
    acc[template.type].push(template);
    return acc;
  }, {} as Record<string, SlipTemplate[]>);

  const PreviewComponent = ({ config, type }: { config: typeof DEFAULT_FORM_DATA, type?: 'success' | 'duplicate' }) => {
    const isDuplicate = type === 'duplicate' || config.type === 'duplicate';
    const mainColor = isDuplicate ? '#f59e0b' : config.primaryColor;

    return (
      <div className="bg-slate-900/5 backdrop-blur-3xl rounded-[2.5rem] p-6 border border-white max-w-[340px] w-full mx-auto shadow-premium-lg">
        {/* Header */}
        <div
          className="rounded-[2rem] p-4 mb-4 flex items-center gap-3 overflow-hidden relative group"
          style={{ backgroundColor: `${mainColor}15` }}
        >
          <div className="absolute inset-0 bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-lg relative z-10"
            style={{ backgroundColor: mainColor }}
          >
            {isDuplicate ? '!' : '✓'}
          </div>
          <div className="relative z-10">
            <p className="text-[10px] uppercase tracking-[0.2em] font-black opacity-40 leading-none mb-1">Status Verification</p>
            <span className="font-extrabold text-sm" style={{ color: mainColor }}>{config.headerText || (isDuplicate ? 'Duplicate Detected' : 'Verified OK')}</span>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-sm border border-white/50 space-y-5">
          {/* Amount */}
          {config.showAmount && (
            <div className="text-center relative py-2">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-100 rounded-full" />
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-300 mb-1">Transaction Value</p>
              <p className="text-3xl font-black tracking-tighter" style={{ color: mainColor }}>฿1,250.00</p>
              {(config.showDate || config.showTime) && (
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                  24 Dec, 2025 • 09:41
                </p>
              )}
            </div>
          )}

          {/* Parties */}
          <div className="space-y-3">
            {config.showSender && (
              <div className="flex items-center gap-4 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
                {config.showBankLogo && <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-lg shadow-inner">🏦</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-300 leading-none mb-1">Originator</p>
                  <p className="text-xs font-black text-slate-900 truncate uppercase">Jonathan Doe</p>
                  <p className="text-[10px] font-bold text-slate-400">xxx-x-x1234-x</p>
                </div>
              </div>
            )}
            {config.showReceiver && (
              <div className="flex items-center gap-4 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
                {config.showBankLogo && <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-lg shadow-inner">🏦</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-300 leading-none mb-1">Beneficiary</p>
                  <p className="text-xs font-black text-slate-900 truncate uppercase">Nexus Corp Ltd.</p>
                  <p className="text-[10px] font-bold text-slate-400">xxx-x-x5678-x</p>
                </div>
              </div>
            )}
          </div>

          {/* Trans Ref */}
          {config.showTransRef && (
            <div className="flex justify-between items-center p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
              <span className="text-[9px] uppercase tracking-widest font-black opacity-50">Reference ID</span>
              <span className="text-xs font-mono font-black tracking-wider">RX-084-2219</span>
            </div>
          )}

          {/* Footer Warning (Duplicate) */}
          {isDuplicate && (
            <div className="p-4 bg-amber-500 rounded-2xl text-center shadow-lg shadow-amber-500/20 border-t border-white/20">
              <p className="text-xs text-white font-black uppercase tracking-widest mb-1">Security Alert</p>
              <p className="text-[10px] text-amber-50/80 font-bold leading-tight">
                This transaction was previously recorded. {config.showDelayWarning ? `Processed ${config.delayWarningMinutes} min delay alert.` : ''}
              </p>
            </div>
          )}

          {/* Footer Text */}
          {(config.footerText || config.footerLink) && (
            <div className="pt-2 text-center">
              {config.footerText && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{config.footerText}</p>}
              {config.footerLink && config.footerLinkText && (
                <p className="text-[10px] text-indigo-500 font-black mt-2 underline cursor-pointer">{config.footerLinkText}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const TemplateFormModal = ({ isOpen, onClose, onSubmit, title, submitText }: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    title: string;
    submitText: string;
  }) => (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Settings Side */}
        <div className="lg:col-span-7 space-y-8 pr-2">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <Input
                label="Interface Identity"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Premium Success"
              />
              <Select
                label="Operational Context"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            <Textarea
              label="Internal Annotation"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Briefly describe the use case for this template..."
              rows={2}
            />

            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between gap-10">
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Theme Chromatic</h4>
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Brand signature color</p>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded-xl border-none cursor-pointer bg-transparent"
                />
                <span className="font-mono text-xs font-black text-slate-500 px-2">{formData.primaryColor}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Headline Typography"
                value={formData.headerText}
                onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
                placeholder="e.g. ✅ TRANSACTION OK"
              />
              <Input
                label="Endnote Content"
                value={formData.footerText}
                onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                placeholder="e.g. Thank you for choosing us"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Call to Action (URL)"
                value={formData.footerLink}
                onChange={(e) => setFormData({ ...formData, footerLink: e.target.value })}
                placeholder="https://..."
              />
              <Input
                label="CTA Anchor Text"
                value={formData.footerLinkText}
                onChange={(e) => setFormData({ ...formData, footerLinkText: e.target.value })}
                placeholder="Open Details"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4">
              {[
                { label: 'Amount', key: 'showAmount', icon: '💰' },
                { label: 'Sender', key: 'showSender', icon: '👤' },
                { label: 'Receiver', key: 'showReceiver', icon: '🏦' },
                { label: 'Date', key: 'showDate', icon: '📅' },
                { label: 'Time', key: 'showTime', icon: '🕐' },
                { label: 'Ref ID', key: 'showTransRef', icon: '🔢' },
                { label: 'Logos', key: 'showBankLogo', icon: '🖼️' },
              ].map((item) => (
                <div key={item.key} className="flex flex-col gap-2 p-4 bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{item.icon}</span>
                    <Switch
                      checked={(formData as any)[item.key]}
                      onChange={(checked) => setFormData({ ...formData, [item.key]: checked })}
                    />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                </div>
              ))}
            </div>

            {formData.type === 'duplicate' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="p-6 bg-amber-50 rounded-[2rem] border border-amber-100 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Latency Alert System</h4>
                  <Switch
                    checked={formData.showDelayWarning}
                    onChange={(checked) => setFormData({ ...formData, showDelayWarning: checked })}
                  />
                </div>
                {formData.showDelayWarning && (
                  <Input
                    label="Detection Radius (Minutes)"
                    type="number"
                    value={formData.delayWarningMinutes}
                    onChange={(e) => setFormData({ ...formData, delayWarningMinutes: parseInt(e.target.value) || 5 })}
                    className="bg-white/50"
                  />
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* Preview Side */}
        <div className="lg:col-span-5 bg-slate-50/50 rounded-[3rem] p-8 border border-slate-100 flex flex-col items-center justify-center sticky top-0 h-fit">
          <div className="mb-6 text-center">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Live Manifestation</h4>
            <p className="text-xs text-slate-300 font-medium italic">What your clients will experience</p>
          </div>

          <PreviewComponent config={formData} />

          <div className="mt-10 w-full space-y-4">
            <Button
              variant="primary"
              fullWidth
              size="lg"
              className="rounded-2xl h-14 font-black tracking-widest uppercase shadow-emerald-500/20 shadow-premium"
              onClick={onSubmit}
              isLoading={isProcessing}
            >
              {submitText}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              className="text-slate-400 font-bold"
              onClick={onClose}
            >
              Discard Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-12 animate-fade max-w-[1600px] mx-auto pb-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none">Global Blueprints</h1>
              <Badge variant="indigo" className="uppercase tracking-[0.2em] px-2 font-black text-[10px]">Master Assets</Badge>
            </div>
            <p className="text-slate-500 font-medium text-lg">Orchestrate high-fidelity slip templates across the entire operational ecosystem.</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" className="rounded-2xl font-black uppercase tracking-widest" onClick={handleInitDefaults} isLoading={isProcessing}>
              Reset Defaults
            </Button>
            <Button variant="primary" className="rounded-2xl font-black uppercase tracking-widest shadow-emerald-500/10 shadow-xl" onClick={openCreateModal}>
              + New Blueprint
            </Button>
          </div>
        </div>

        {/* Dynamic Aggregates */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Total Blueprints" value={templates.length} icon="🎨" color="indigo" variant="glass" />
          <StatCard title="Active Success" value={templates.filter(t => t.type === 'success').length} icon="✅" color="emerald" variant="glass" />
          <StatCard title="Redundant Triggers" value={templates.filter(t => t.type === 'duplicate').length} icon="⚠️" color="amber" variant="glass" />
          <StatCard title="System Defaults" value={templates.filter(t => t.isDefault).length} icon="⭐️" color="blue" variant="glass" />
        </div>

        {loading ? (
          <PageLoading />
        ) : (
          <div className="space-y-16">
            {TYPE_OPTIONS.map((typeOption) => {
              const typeTemplates = templatesByType[typeOption.value] || [];
              if (typeTemplates.length === 0) return null;

              return (
                <section key={typeOption.value} className="space-y-8">
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 bg-${typeOption.color}-500/10 rounded-2xl flex items-center justify-center text-2xl shadow-inner`}>
                      {typeOption.icon}
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-tight">{typeOption.label}</h2>
                      <p className="text-slate-400 font-medium text-sm">{typeOption.description}</p>
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent ml-4" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {typeTemplates.map((template) => (
                      <Card key={template._id} className="p-0 bg-white/60 backdrop-blur-2xl border-none shadow-premium-sm rounded-[3rem] overflow-hidden group hover:shadow-premium-lg transition-all duration-500">
                        {/* Mini Perspective Preview */}
                        <div className="relative h-64 bg-slate-50 flex items-center justify-center p-8 overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/50" />
                          <div className="relative z-10 transform scale-75 group-hover:scale-[0.8] transition-transform duration-700 ease-out origin-center">
                            <PreviewComponent config={{ ...DEFAULT_FORM_DATA, ...template }} type={template.type as any} />
                          </div>

                          {/* Overlay Actions */}
                          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4">
                            <IconButton variant="glass" size="lg" className="rounded-2xl" onClick={() => openEditModal(template)}>
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </IconButton>
                            {!template.isDefault && (
                              <IconButton variant="glass" size="lg" className="rounded-2xl text-rose-500 hover:bg-rose-500 hover:text-white" onClick={() => { setSelectedTemplate(template); setShowDeleteConfirm(true); }}>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </IconButton>
                            )}
                          </div>
                        </div>

                        <div className="p-8 space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none group-hover:text-emerald-600 transition-colors">{template.name}</h3>
                              <p className="text-xs text-slate-400 font-medium truncate max-w-[200px]">{template.description || 'No supplementary annotation'}</p>
                            </div>
                            {template.isDefault && (
                              <Badge variant="emerald" size="sm" className="font-black uppercase tracking-[0.2em]">Master</Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {['showAmount', 'showSender', 'showReceiver', 'showDate', 'showTime', 'showTransRef', 'showBankLogo'].map((key) => {
                              if (!(template as any)[key]) return null;
                              const label = key.replace('show', '');
                              return (
                                <span key={key} className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-slate-100 text-slate-500 rounded-lg">
                                  {label}
                                </span>
                              );
                            })}
                          </div>

                          {!template.isDefault && (
                            <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-emerald-500 px-0"
                                onClick={() => handleSetDefault(template._id)}
                              >
                                Elevate to Default
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
              <div className="flex flex-col items-center justify-center min-h-[400px] bg-white/40 backdrop-blur-xl rounded-[4rem] border-4 border-dashed border-slate-200">
                <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-4xl mb-6">🏜️</div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Ocean of Emptiness</h3>
                <p className="text-slate-400 font-medium max-w-sm text-center mb-8">No global blueprints have been orchestrated yet. Initialize the master defaults to begin.</p>
                <div className="flex gap-4">
                  <Button variant="outline" size="lg" className="rounded-2xl" onClick={handleInitDefaults}>Initialize Defaults</Button>
                  <Button variant="primary" size="lg" className="rounded-2xl shadow-emerald-500/10 shadow-lg" onClick={openCreateModal}>Orchestrate New</Button>
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
        title="Orchestrating New Blueprint"
        submitText="Deploy Blueprint"
      />

      <TemplateFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdate}
        title="Refining Blueprint Logic"
        submitText="Commit Changes"
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Decommission Binary Blueprint?"
        message={`Warning: This action will permanently delist the "${selectedTemplate?.name}" master asset and impact all downstream consumers. This cannot be undone.`}
        confirmText="Execute Deletion"
        cancelText="Abort Operation"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
