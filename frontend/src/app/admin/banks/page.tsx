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
  const bg = bank.color ? `${bank.color}20` : undefined;

  return (
    <div
      className="relative w-20 h-20 md:w-24 md:h-24 rounded-[2rem] flex items-center justify-center overflow-hidden border border-white/5 shadow-2xl bg-black/40 backdrop-blur-xl group-hover:scale-110 transition-all duration-700"
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {logo ? (
        <img
          src={logo}
          alt={bank.name}
          className="w-12 h-12 md:w-14 md:h-14 object-contain filter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] group-hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/[0.02]">
          <span className="text-slate-400 font-black text-2xl md:text-3xl tracking-tighter uppercase">{initials || '🏦'}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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
      setError(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลธนาคารได้');
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
      setError(err.response?.data?.message || 'ไม่สามารถนำเข้าข้อมูลเริ่มต้นได้');
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
      <div className="section-gap animate-fade pb-10">
        <div className="page-header relative z-10 flex-col md:flex-row items-start md:items-center">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-400 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              จัดการ<span className="text-[#06C755]">ธนาคาร</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              เพิ่มและจัดการรายชื่อธนาคารในระบบ
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              variant="outline"
              size="lg"
              className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs border-emerald-500/20 bg-[#0F1A14] text-slate-400 hover:text-[#06C755] hover:bg-emerald-500/10 w-full md:w-auto"
              onClick={handleSyncFromThunder}
              isLoading={isSyncing}
            >
              ซิงค์ข้อมูล
            </Button>
            <Button
              size="lg"
              variant="primary"
              onClick={() => setShowCreateModal(true)}
              className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 w-full md:w-auto"
            >
              + เพิ่มธนาคาร
            </Button>
          </div>
        </div>

        {/* Quick Stats Node */}
        <div className="grid-stats">
          <StatCard
            title="ธนาคารทั้งหมด"
            value={stats.total}
            color="indigo"
            variant="glass"
            className="rounded-[2.5rem] border border-white/5 shadow-2xl"
          />
          <StatCard
            title="ใช้งานอยู่"
            value={stats.active}
            color="emerald"
            variant="glass"
            className="rounded-[2.5rem] border border-white/5 shadow-2xl"
          />
          <StatCard
            title="ปิดใช้งาน"
            value={stats.inactive}
            color="rose"
            variant="glass"
            className="rounded-[2.5rem] border border-white/5 shadow-2xl"
          />
        </div>

        {/* Filter & List Matrix */}
        <div className="space-y-10">
          <Card className="p-6 border border-white/5 shadow-2xl bg-black/40 backdrop-blur-3xl rounded-[2.5rem] sticky top-8 z-20">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="relative flex-1 w-full group">
                <div className="absolute inset-y-0 left-0 pl-8 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-400 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <Input
                  placeholder="ค้นหาธนาคาร ชื่อ หรือรหัส..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  containerClassName="!mb-0"
                  className="pl-16 h-16 bg-white/[0.02] border-white/5 shadow-inner focus:bg-white/[0.05] rounded-2xl font-semibold text-sm text-white placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-4 w-full lg:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleInitDefaults}
                  className="text-xs font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 px-6 h-12 rounded-xl"
                >
                  รีเซ็ตค่าเริ่มต้น
                </Button>
                <div className="h-10 w-[1px] bg-white/5 hidden lg:block" />
                <div className="px-6 py-3 bg-white/[0.03] border border-white/5 rounded-2xl">
                  <span className="text-xl font-bold text-emerald-400 tracking-tighter">{filteredBanks.length}</span>
                  <span className="text-xs font-medium text-slate-400 ml-3">รายการ</span>
                </div>
              </div>
            </div>
          </Card>

          {filteredBanks.length === 0 ? (
            <EmptyState
              icon="🏢"
              title="ไม่พบธนาคาร"
              description={searchQuery ? `ไม่พบธนาคารที่ตรงกับ "${searchQuery}"` : "ยังไม่มีธนาคารในระบบ"}
              variant="glass"
              className="py-24"
              action={searchQuery ? <Button variant="ghost" onClick={() => setSearchQuery('')} className="rounded-xl font-semibold text-xs text-emerald-400 hover:bg-emerald-500/10">ล้างคำค้นหา</Button> : null}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {filteredBanks.map((bank) => (
                <Card
                  key={bank._id}
                  className={cn(
                    "group relative overflow-hidden transition-all duration-700 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] hover:-translate-y-3 border border-white/5 bg-white/[0.01] p-8 flex flex-col items-center rounded-[3rem]",
                    !bank.isActive && "opacity-40 grayscale hover:opacity-100 hover:grayscale-0"
                  )}
                  padding="none"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors pointer-events-none" />

                  <div className="relative mb-8">
                    <BankLogo bank={bank} />
                    <div className={cn(
                      "absolute top-2 right-2 w-4 h-4 rounded-full border-2 border-black transition-all duration-500",
                      bank.isActive ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] animate-pulse" : "bg-slate-700"
                    )} />
                  </div>

                  <div className="text-center space-y-2 mb-10 w-full px-2">
                    <h3 className="text-[13px] font-black text-white uppercase tracking-tighter truncate group-hover:text-emerald-400 transition-colors">
                      {bank.shortName || bank.code}
                    </h3>
                    <p className="text-xs font-black text-slate-400 truncate uppercase tracking-widest">
                      {bank.nameEn || bank.name}
                    </p>
                    <div className="pt-3">
                      <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg tracking-widest border border-indigo-500/20">
                        {bank.code}
                      </span>
                    </div>
                  </div>

                  <div className="w-full space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="ghost"
                        size="xs"
                        fullWidth
                        onClick={() => setEditingBank(bank)}
                        className="h-10 rounded-xl font-semibold text-xs text-slate-300 hover:text-white hover:bg-white/5 border border-white/5 transition-all"
                      >
                        แก้ไข
                      </Button>
                      <Button
                        variant={bank.isActive ? "outline" : "primary"}
                        size="xs"
                        fullWidth
                        onClick={() => handleToggleActive(bank)}
                        className={cn(
                          "h-10 rounded-xl font-semibold text-xs transition-all",
                          bank.isActive ? "text-rose-400 border-rose-500/20 hover:bg-rose-500/10" : "bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20 shadow-lg text-white"
                        )}
                      >
                        {bank.isActive ? 'ปิด' : 'เปิด'}
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="xs"
                      fullWidth
                      className="h-10 rounded-xl font-semibold text-xs text-slate-300 hover:text-indigo-400 hover:bg-indigo-500/5 group/preview border border-transparent hover:border-indigo-500/20"
                      onClick={() => router.push(`/admin/templates?bankId=${bank._id}`)}
                    >
                      <span>จำลองสลิป</span>
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
      title={bank ? 'แก้ไขธนาคาร' : 'เพิ่มธนาคารใหม่'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-8 p-2 animate-fade">
        {error && (
          <div className="bg-rose-50/50 border border-rose-100 text-rose-600 px-6 py-4 rounded-2xl text-sm font-medium animate-in fade-in slide-in-from-top-2">
            ⚠️ เกิดข้อผิดพลาด: {error}
          </div>
        )}

        {/* Logo Upload Zone */}
        <div className="flex flex-col items-center">
          <p className="text-xs font-semibold text-slate-300 mb-4">โลโก้ธนาคาร</p>
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
                    <span className="text-xs font-semibold text-white">เปลี่ยนรูป</span>
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
                <p className="text-sm font-semibold text-slate-700">อัปโหลดโลโก้</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={saving} />
          </div>
          {logoPreview && !saving && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
              className="mt-4 text-xs font-medium text-rose-400 hover:text-rose-600 transition-colors"
            >
              ลบรูปภาพ
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Input
            label="รหัสธนาคาร"
            placeholder="เช่น KBANK"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            error={formErrors.code}
            required
            disabled={saving || !!bank}
            className="h-14 rounded-2xl bg-slate-50 border-slate-200 shadow-inner font-bold text-sm text-slate-900 placeholder:text-slate-400"
          />
          <Input
            label="ชื่อย่อ"
            placeholder="เช่น K-Connect"
            value={formData.shortName}
            onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
            disabled={saving}
            className="h-14 rounded-2xl bg-slate-50 border-slate-200 shadow-inner font-bold text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div className="space-y-4">
          <Input
            label="ชื่อภาษาไทย"
            placeholder="ธนาคารกสิกรไทย"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            required
            disabled={saving}
            className="h-14 rounded-2xl bg-slate-50 border-slate-200 shadow-inner font-bold text-sm text-slate-900 placeholder:text-slate-400"
          />

          <Input
            label="ชื่อภาษาอังกฤษ"
            placeholder="Kasikorn Bank PCL"
            value={formData.nameEn}
            onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
            disabled={saving}
            className="h-14 rounded-2xl bg-slate-50 border-slate-200 shadow-inner font-bold text-sm text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div className="flex gap-4 pt-8 border-t border-slate-50">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 font-semibold text-sm text-slate-400 h-14 rounded-2xl hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-[2] h-14 rounded-2xl font-semibold text-sm shadow-emerald-500/10 shadow-xl"
            isLoading={saving || uploadingLogo}
          >
            {bank ? 'บันทึกการแก้ไข' : 'เพิ่มธนาคาร'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
