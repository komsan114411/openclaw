'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface Bank {
  _id: string;
  code: string;
  name: string;
  nameTh?: string;
  nameEn?: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  logoBase64?: string;
  isActive: boolean;
  sortOrder: number;
}

function BankLogo({ bank }: { bank: Bank }) {
  const [failed, setFailed] = useState(false);
  const logo = failed ? null : (bank.logoBase64 || bank.logoUrl || null);
  const initials = (bank.shortName || bank.code || bank.name || '').toString().slice(0, 2).toUpperCase();
  const bg = bank.color ? `${bank.color}12` : undefined;

  return (
    <div
      className="relative w-16 h-16 md:w-20 md:h-20 rounded-[1.5rem] flex items-center justify-center overflow-hidden border border-white/40 shadow-premium-sm bg-white backdrop-blur-md group-hover:scale-110 transition-transform duration-500"
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {logo ? (
        <img
          src={logo}
          alt={bank.name}
          className="w-10 h-10 md:w-12 md:h-12 object-contain drop-shadow-md group-hover:drop-shadow-xl transition-all"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          <span className="text-slate-300 font-black text-xl md:text-2xl tracking-tighter">{initials || '🏦'}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export default function BanksManagementPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchBanks = useCallback(async () => {
    try {
      const response = await api.get('/admin/banks');
      if (response.data.success) {
        setBanks(response.data.banks);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load banks');
      toast.error('ไม่สามารถโหลดข้อมูลธนาคารได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const handleInitDefaults = async () => {
    try {
      setLoading(true);
      const response = await api.post('/admin/banks/init-defaults');
      if (response.data.success) {
        await fetchBanks();
        toast.success(response.data.message || 'นำเข้าธนาคารเริ่มต้นสำเร็จ', { icon: '🏦' });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initialize banks');
      toast.error('ไม่สามารถนำเข้าธนาคารเริ่มต้นได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromThunder = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const response = await api.post('/admin/banks/sync-from-thunder');
      if (response.data.success) {
        await fetchBanks();
        toast.success(response.data.message || 'ซิงค์ธนาคารจาก Thunder API สำเร็จ', { icon: '⚡' });
      } else {
        toast.error(response.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถซิงค์ธนาคารได้');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleActive = async (bank: Bank) => {
    if (processingIdsRef.current.has(bank._id)) {
      toast.error('กำลังดำเนินการอยู่');
      return;
    }

    processingIdsRef.current.add(bank._id);

    try {
      await api.put(`/admin/banks/${bank._id}`, {
        isActive: !bank.isActive,
      });
      toast.success(
        bank.isActive ? 'ปิดใช้งานธนาคารสำเร็จ' : 'เปิดใช้งานธนาคารสำเร็จ',
        { icon: bank.isActive ? '🔴' : '🟢' }
      );
      await fetchBanks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      processingIdsRef.current.delete(bank._id);
    }
  };

  const filteredBanks = banks.filter(
    (bank) =>
      bank.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bank.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bank.shortName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const stats = {
    total: banks.length,
    active: banks.filter(b => b.isActive).length,
    inactive: banks.filter(b => !b.isActive).length
  };

  if (loading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-8 animate-fade max-w-[1600px] mx-auto pb-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-4">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-[-0.04em] uppercase">
              Bank <span className="text-emerald-500">Identity</span>
            </h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 h-[2px] bg-emerald-500/30"></span>
              Identity Management & Protocol Registry
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            <Button
              variant="outline"
              size="lg"
              className="bg-white/60 backdrop-blur-xl border-slate-100 shadow-premium-sm text-[10px] font-black uppercase tracking-widest h-14 px-8 hover:bg-emerald-50 hover:text-emerald-600 transition-all w-full sm:w-auto"
              onClick={handleSyncFromThunder}
              isLoading={isSyncing}
              leftIcon={
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 mr-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              }
            >
              Sync Matrix
            </Button>
            <Button
              size="lg"
              variant="primary"
              onClick={() => setShowCreateModal(true)}
              className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-emerald-500/20 shadow-2xl w-full sm:w-auto"
            >
              + Deployment
            </Button>
          </div>
        </div>

        {/* Quick Stats Node */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Entities"
            value={stats.total}
            icon={<span className="text-2xl">🏦</span>}
            color="indigo"
            className="rounded-[2.5rem] p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Active Layers"
            value={stats.active}
            icon={<span className="text-2xl">🟢</span>}
            color="emerald"
            className="rounded-[2.5rem] p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Idle Profiles"
            value={stats.inactive}
            icon={<span className="text-2xl">🔴</span>}
            color="rose"
            className="rounded-[2.5rem] p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
        </div>

        {/* Filter & List Matrix */}
        <div className="space-y-8">
          <Card className="p-6 border-none shadow-premium bg-white/60 backdrop-blur-3xl rounded-[2.5rem] sticky top-8 z-20">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="relative flex-1 w-full group">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <Input
                  placeholder="Query Registry: Search by Name, Code, or Alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  containerClassName="!mb-0"
                  className="pl-14 h-16 bg-white/50 border-white shadow-inner focus:bg-white rounded-[1.5rem] font-bold text-sm"
                />
              </div>
              <div className="flex items-center gap-4 w-full lg:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleInitDefaults}
                  className="text-[10px] font-black text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/50 uppercase tracking-[0.2em] px-6 h-12 rounded-xl"
                >
                  Factory Defaults
                </Button>
                <div className="h-10 w-[1px] bg-slate-200/50 hidden lg:block" />
                <Badge className="bg-slate-900 text-white border-none px-6 py-3 font-black uppercase tracking-[0.2em] text-[10px] rounded-full shadow-emerald-500/10 shadow-lg">
                  {filteredBanks.length} REGISTRIES
                </Badge>
              </div>
            </div>
          </Card>

          {filteredBanks.length === 0 ? (
            <EmptyState
              icon={
                <div className="w-24 h-24 rounded-full bg-slate-100/50 flex items-center justify-center text-slate-300">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              }
              title="NO IDENTITY FOUND"
              description={searchQuery ? `Registry query for "${searchQuery}" returned zero matches.` : "The protocol registry is currently empty."}
              action={searchQuery ? <Button variant="outline" onClick={() => setSearchQuery('')} className="rounded-xl font-black uppercase tracking-widest text-[10px]">Clear Filter</Button> : null}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {filteredBanks.map((bank) => (
                <Card
                  key={bank._id}
                  className={cn(
                    "group relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 border-none bg-white p-6 flex flex-col items-center rounded-[2.5rem]",
                    !bank.isActive && "opacity-60 grayscale scale-95 hover:scale-100 hover:grayscale-0"
                  )}
                  padding="none"
                >
                  {/* Neural Background Decor */}
                  <div className="absolute -top-12 -right-12 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />

                  {/* Bank Identity Node */}
                  <div className="relative mb-6">
                    <BankLogo bank={bank} />
                    <div className={cn(
                      "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-colors",
                      bank.isActive ? "bg-emerald-500" : "bg-slate-300"
                    )} />
                  </div>

                  {/* Identity Label */}
                  <div className="text-center space-y-1 mb-8 w-full px-2">
                    <h3 className="text-[12px] font-black text-slate-900 uppercase tracking-widest truncate">
                      {bank.shortName || bank.code}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 truncate opacity-70">
                      {bank.nameTh || bank.name}
                    </p>
                    <div className="pt-2">
                      <span className="text-[9px] font-black text-indigo-500 bg-indigo-50/50 px-2 py-0.5 rounded-lg tracking-widest border border-indigo-100/50">
                        {bank.code}
                      </span>
                    </div>
                  </div>

                  {/* Operational Matrix */}
                  <div className="w-full space-y-3">
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="xs"
                        fullWidth
                        onClick={() => setEditingBank(bank)}
                        className="h-10 rounded-xl font-black uppercase tracking-widest text-[9px] text-slate-400 hover:text-slate-900 hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all"
                      >
                        Modify
                      </Button>
                      <Button
                        variant={bank.isActive ? "outline" : "primary"}
                        size="xs"
                        fullWidth
                        onClick={() => handleToggleActive(bank)}
                        className={cn(
                          "h-10 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all",
                          bank.isActive ? "text-rose-500 border-rose-100 hover:bg-rose-50" : "shadow-emerald-500/10 shadow-lg"
                        )}
                      >
                        {bank.isActive ? 'Suspend' : 'Resume'}
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="xs"
                      fullWidth
                      className="h-10 rounded-xl font-black uppercase tracking-widest text-[8px] text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 group/preview"
                      onClick={() => router.push(`/admin/templates?bankId=${bank._id}`)}
                    >
                      <span className="group-hover/preview:scale-110 transition-transform">Preview Simulator</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modals */}
      {showCreateModal && (
        <BankModal
          bank={null}
          onClose={() => setShowCreateModal(false)}
          onSave={() => {
            setShowCreateModal(false);
            fetchBanks();
          }}
        />
      )}

      {editingBank && (
        <BankModal
          bank={editingBank}
          onClose={() => setEditingBank(null)}
          onSave={() => {
            setEditingBank(null);
            fetchBanks();
          }}
        />
      )}
    </DashboardLayout>
  );
}

interface BankModalProps {
  bank: Bank | null;
  onClose: () => void;
  onSave: () => void;
}

function BankModal({ bank, onClose, onSave }: BankModalProps) {
  const [formData, setFormData] = useState({
    code: bank?.code || '',
    name: bank?.name || '',
    nameTh: bank?.nameTh || '',
    nameEn: bank?.nameEn || '',
    shortName: bank?.shortName || '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    bank?.logoBase64 || bank?.logoUrl || null
  );
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastSubmitTimeRef = useRef<number>(0);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.code.trim()) {
      errors.code = 'กรุณากรอกรหัสธนาคาร';
    } else if (!/^[A-Z0-9]+$/.test(formData.code)) {
      errors.code = 'รหัสธนาคารต้องเป็นตัวพิมพ์ใหญ่และตัวเลขเท่านั้น';
    }
    if (!formData.name.trim()) {
      errors.name = 'กรุณากรอกชื่อธนาคาร';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('ไฟล์ต้องมีขนาดไม่เกิน 2MB');
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < 2000) {
      toast.error('กรุณารอสักครู่ก่อนทำรายการใหม่');
      return;
    }
    if (!validateForm()) {
      toast.error('กรุณาตรวจสอบข้อมูลให้ถูกต้อง');
      return;
    }
    lastSubmitTimeRef.current = now;
    setSaving(true);
    setError('');

    try {
      let bankId = bank?._id;
      if (bank) {
        await api.put(`/admin/banks/${bank._id}`, formData);
      } else {
        const response = await api.post('/admin/banks', formData);
        bankId = response.data.bank._id;
      }

      if (logoFile && bankId) {
        setUploadingLogo(true);
        const logoFormData = new FormData();
        logoFormData.append('logo', logoFile);
        await api.post(`/admin/banks/${bankId}/logo`, logoFormData);
      }

      toast.success(bank ? 'อัปเดตธนาคารสำเร็จ' : 'เพิ่มธนาคารสำเร็จ', { icon: '✅' });
      onSave();
    } catch (err: any) {
      const message = err.response?.data?.message || 'เกิดข้อผิดพลาด';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => !saving && onClose()}
      title={bank ? 'IDENTITY MODIFICATION' : 'NEW PROTOCOL REGISTRY'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-8 p-2 animate-fade">
        {error && (
          <div className="bg-rose-50/50 border border-rose-100 text-rose-600 px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
            ⚠️ SYSTEM ERROR: {error}
          </div>
        )}

        {/* Logo Upload Zone */}
        <div className="flex flex-col items-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Identity Visualization</p>
          <div
            className={cn(
              "relative group cursor-pointer rounded-[2.5rem] border-4 border-dashed transition-all duration-500 overflow-hidden w-40 h-40 flex flex-col items-center justify-center",
              logoPreview ? "border-emerald-500 bg-white shadow-premium" : "border-slate-100 bg-slate-50/50 hover:border-emerald-300 hover:bg-white"
            )}
            onClick={() => !saving && fileInputRef.current?.click()}
          >
            {logoPreview ? (
              <>
                <img src={logoPreview} alt="Preview" className="w-24 h-24 object-contain group-hover:scale-110 transition-transform duration-500" />
                {!saving && (
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Update Image</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 mb-3 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Deploy Logo</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={saving} />
          </div>
          {logoPreview && !saving && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
              className="mt-4 text-[9px] font-black text-rose-400 hover:text-rose-600 uppercase tracking-[0.2em] transition-colors"
            >
              Purge Image
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Input
            label="PROTOCOL CODE"
            placeholder="e.g., KBANK"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            error={formErrors.code}
            required
            disabled={saving || !!bank}
            className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-xs"
          />
          <Input
            label="IDENTITY ALIAS"
            placeholder="e.g., K-Connect"
            value={formData.shortName}
            onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
            disabled={saving}
            className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-xs"
          />
        </div>

        <div className="space-y-4">
          <Input
            label="NATIVE NOMENCLATURE (TH)"
            placeholder="ธนาคารกสิกรไทย"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            required
            disabled={saving}
            className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-xs"
          />

          <Input
            label="GLOBAL NOMENCLATURE (EN)"
            placeholder="Kasikorn Bank PCL"
            value={formData.nameEn}
            onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
            disabled={saving}
            className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-xs opacity-70 focus:opacity-100"
          />
        </div>

        <div className="flex gap-4 pt-8 border-t border-slate-50">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 font-black text-[10px] uppercase tracking-widest text-slate-400 h-14 rounded-2xl hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Abort
          </Button>
          <Button
            type="submit"
            className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-emerald-500/10 shadow-xl"
            isLoading={saving || uploadingLogo}
          >
            {bank ? 'Commit Changes' : 'Initialize Registry'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
