'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

export default function BanksManagementPage() {
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

  const getBankLogo = (bank: Bank) => bank.logoBase64 || bank.logoUrl || null;

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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">จัดการธนาคาร</h1>
            <p className="text-slate-500 font-medium">จัดการรายชื่อธนาคารและโลโก้ในระบบ</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Button
              variant="outline"
              size="lg"
              className="bg-white/50 backdrop-blur-sm border-slate-200 flex-1 md:flex-none"
              onClick={handleSyncFromThunder}
              isLoading={isSyncing}
              leftIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            >
              Sync Thunder
            </Button>
            <Button
              size="lg"
              variant="primary"
              onClick={() => setShowCreateModal(true)}
              className="shadow-emerald-200/50 flex-1 md:flex-none"
            >
              + เพิ่มธนาคาร
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 md:gap-6">
          <StatCard
            title="ธนาคารทั้งหมด"
            value={stats.total}
            icon="🏦"
            color="indigo"
            variant="glass"
          />
          <StatCard
            title="เปิดใช้งาน"
            value={stats.active}
            icon="🟢"
            color="emerald"
            variant="glass"
          />
          <StatCard
            title="ปิดใช้งาน"
            value={stats.inactive}
            icon="🔴"
            color="rose"
            variant="glass"
          />
        </div>

        {/* Filter & List Section */}
        <div className="space-y-6">
          <Card className="p-4 border-none shadow-premium-sm bg-white/60 backdrop-blur-md sticky top-0 z-20">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative flex-1 w-full">
                <Input
                  placeholder="ค้นหาชื่อธนาคาร, รหัส หรือชื่อย่อ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  containerClassName="!mb-0"
                  leftIcon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  }
                  className="bg-white/80 border-slate-200 focus:bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleInitDefaults} className="text-slate-500 hover:text-slate-900">
                  นำเข้าค่าเริ่มต้น
                </Button>
                <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block" />
                <Badge variant="indigo" className="px-4 py-1.5 font-bold uppercase tracking-widest text-[10px]">
                  {filteredBanks.length} Banks
                </Badge>
              </div>
            </div>
          </Card>

          {filteredBanks.length === 0 ? (
            <EmptyState
              icon={
                <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              }
              title="ไม่พบข้อมูลธนาคาร"
              description={searchQuery ? `ไม่พบธนาคารที่ตรงกับ "${searchQuery}"` : "ยังไม่มีข้อมูลธนาคารในระบบ"}
              action={searchQuery ? <Button variant="outline" onClick={() => setSearchQuery('')}>ล้างการค้นหา</Button> : null}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {filteredBanks.map((bank) => (
                <Card
                  key={bank._id}
                  className={cn(
                    "group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-none bg-white text-center",
                    !bank.isActive && "opacity-60 grayscale"
                  )}
                  padding="none"
                >
                  <div className="p-4 flex flex-col items-center">
                    {/* Bank Logo */}
                    <div
                      className={cn(
                        "w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 overflow-hidden border-2 border-white bg-slate-50",
                        !getBankLogo(bank) && "bg-slate-100"
                      )}
                    >
                      {getBankLogo(bank) ? (
                        <img
                          src={getBankLogo(bank)!}
                          alt={bank.name}
                          className="w-12 h-12 md:w-16 md:h-16 object-contain"
                        />
                      ) : (
                        <span className="text-slate-400 font-black text-xl md:text-2xl">{bank.shortName?.substring(0, 2) || bank.code.substring(0, 2)}</span>
                      )}
                    </div>

                    {/* Bank Name & Status */}
                    <h3 className="mt-3 text-sm md:text-base font-bold text-slate-900 truncate w-full px-1">{bank.shortName || bank.code}</h3>
                    <p className="text-[10px] md:text-xs text-slate-400 truncate w-full px-1">{bank.name}</p>

                    {/* Status Badge */}
                    <div className="mt-2">
                      <div className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                        bank.isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                      )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", bank.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                        {bank.isActive ? 'ใช้งาน' : 'ปิด'}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 mt-4 w-full">
                      <Button
                        variant="ghost"
                        size="xs"
                        fullWidth
                        onClick={() => setEditingBank(bank)}
                        className="font-bold text-slate-500 hover:bg-slate-50"
                      >
                        แก้ไข
                      </Button>
                      <Button
                        variant={bank.isActive ? "outline" : "primary"}
                        size="xs"
                        fullWidth
                        onClick={() => handleToggleActive(bank)}
                        className={cn("font-bold", bank.isActive ? "text-rose-500 border-rose-100 hover:bg-rose-50" : "")}
                      >
                        {bank.isActive ? 'ปิด' : 'เปิด'}
                      </Button>
                    </div>
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
      title={bank ? 'แก้ไขธนาคาร' : 'เพิ่มธนาคาร'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6 p-1">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-5 py-4 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2">
            ⚠️ {error}
          </div>
        )}

        {/* Logo Upload */}
        <div className="flex flex-col items-center">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">โลโก้ธนาคาร</label>
          <div
            className={cn(
              "relative group cursor-pointer rounded-3xl border-4 border-dashed transition-all duration-300 overflow-hidden w-32 h-32 flex flex-col items-center justify-center",
              logoPreview ? "border-emerald-100 bg-emerald-50/20" : "border-slate-200 bg-slate-50 hover:border-emerald-300"
            )}
            onClick={() => !saving && fileInputRef.current?.click()}
          >
            {logoPreview ? (
              <img src={logoPreview} alt="Preview" className="w-20 h-20 object-contain" />
            ) : (
              <div className="flex flex-col items-center p-4 text-center">
                <span className="text-4xl mb-2">📸</span>
                <p className="text-[9px] font-bold text-slate-400 uppercase">อัปโหลด</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={saving} />
          </div>
          {logoPreview && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
              disabled={saving}
              className="mt-2 text-[10px] font-bold text-rose-500 hover:text-rose-700 transition-colors"
            >
              ลบรูปภาพ
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="รหัสธนาคาร"
            placeholder="KBANK, SCB"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            error={formErrors.code}
            required
            disabled={saving || !!bank}
          />
          <Input
            label="ชื่อย่อ"
            placeholder="KBANK"
            value={formData.shortName}
            onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
            disabled={saving}
          />
        </div>

        <Input
          label="ชื่อธนาคาร (ไทย)"
          placeholder="ธนาคารกสิกรไทย"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={formErrors.name}
          required
          disabled={saving}
        />

        <Input
          label="ชื่อธนาคาร (อังกฤษ)"
          placeholder="Kasikorn Bank"
          value={formData.nameEn}
          onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
          disabled={saving}
        />

        <div className="flex gap-4 pt-4 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 font-bold text-slate-500 h-12"
            onClick={onClose}
            disabled={saving}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-[2] font-black h-12 shadow-premium shadow-emerald-500/10"
            isLoading={saving || uploadingLogo}
          >
            {bank ? 'บันทึก' : 'เพิ่มธนาคาร'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
