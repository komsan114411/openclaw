'use client';

import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi } from '@/lib/api';
import { Package } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Input, TextArea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPackage, setEditPackage] = useState<Package | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<Package | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const lastSubmitTimeRef = useRef<number>(0);

  const [formData, setFormData] = useState({
    name: '',
    price: 0,
    priceUsdt: 0,
    slipQuota: 0,
    durationDays: 30,
    description: '',
    features: '',
    sortOrder: 0,
  });

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    setError(null);
    try {
      const response = await packagesApi.getAll(true);
      setPackages(response.data.packages || []);
    } catch (error) {
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: 0,
      priceUsdt: 0,
      slipQuota: 0,
      durationDays: 30,
      description: '',
      features: '',
      sortOrder: 0,
    });
    setEditPackage(null);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'กรุณากรอกชื่อแพ็คเกจ';
    if (formData.price < 0) errors.price = 'ราคาต้องไม่ติดลบ';
    if (formData.slipQuota < 0) errors.slipQuota = 'โควต้าต้องไม่ติดลบ';
    if (formData.durationDays < 1) errors.durationDays = 'ระยะเวลาต้องอย่างน้อย 1 วัน';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
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
    setIsSubmitting(true);

    const data = {
      ...formData,
      features: formData.features.split('\n').filter(f => f.trim()),
    };

    try {
      if (editPackage) {
        await packagesApi.update(editPackage._id, data);
        toast.success('อัปเดตแพ็คเกจสำเร็จ');
      } else {
        await packagesApi.create(data);
        toast.success('สร้างแพ็คเกจสำเร็จ');
      }
      setShowModal(false);
      resetForm();
      fetchPackages();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (pkg: Package) => {
    setEditPackage(pkg);
    setFormData({
      name: pkg.name,
      price: pkg.price,
      priceUsdt: pkg.priceUsdt || 0,
      slipQuota: pkg.slipQuota,
      durationDays: pkg.durationDays,
      description: pkg.description || '',
      features: pkg.features?.join('\n') || '',
      sortOrder: pkg.sortOrder || 0,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleDeleteClick = (pkg: Package) => {
    setPackageToDelete(pkg);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!packageToDelete) return;
    setIsSubmitting(true);
    try {
      await packagesApi.delete(packageToDelete._id);
      toast.success('ปิดใช้งานแพ็คเกจสำเร็จ');
      setShowDeleteConfirm(false);
      fetchPackages();
    } catch (error) {
      toast.error('ไม่สามารถปิดใช้งานแพ็คเกจได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (pkg: Package) => {
    try {
      await packagesApi.activate(pkg._id);
      toast.success('เปิดใช้งานแพ็คเกจสำเร็จ');
      fetchPackages();
    } catch (error) {
      toast.error('ไม่สามารถเปิดใช้งานแพ็คเกจได้');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-10 animate-fade max-w-[1600px] mx-auto pb-10">

        {/* Neural Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-4">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-[-0.04em] uppercase">
              Subscription <span className="text-emerald-500">Matrix</span>
            </h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 h-[2px] bg-emerald-500/30"></span>
              Plan Logistics & Monetary Protocol
            </p>
          </div>
          <Button
            size="lg"
            variant="primary"
            onClick={() => { resetForm(); setShowModal(true); }}
            className="h-16 px-10 rounded-[2rem] font-black uppercase tracking-widest text-[12px] shadow-emerald-500/20 shadow-2xl flex-1 md:flex-none"
            leftIcon={
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center mr-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            }
          >
            Deploy New Plan
          </Button>
        </div>

        {/* Neural Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Indices"
            value={packages.length}
            icon={<span className="text-2xl">💎</span>}
            color="indigo"
            className="rounded-[2.5rem] p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Active Layers"
            value={packages.filter(p => p.isActive).length}
            icon={<span className="text-2xl">🟢</span>}
            color="emerald"
            className="rounded-[2.5rem] p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Peak Demand"
            value={packages.length > 0 ? "PREMIUM" : "N/A"}
            icon={<span className="text-2xl">🔥</span>}
            color="amber"
            className="rounded-[2.5rem] p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
        </div>

        {/* Packages Grid Matrix */}
        {packages.length === 0 ? (
          <EmptyState
            icon={
              <div className="w-24 h-24 rounded-full bg-slate-100/50 flex items-center justify-center text-slate-300">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            }
            title="ZERO INDICES FOUND"
            description="The monetary protocol registry is currently empty. Initialize a new plan subscription to begin operations."
            action={<Button variant="primary" onClick={() => setShowModal(true)} className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px]">Initialize Protocol</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 pt-4">
            {packages.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((pkg) => (
              <motion.div
                key={pkg._id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "group relative overflow-hidden transition-all duration-500 flex flex-col h-full",
                  !pkg.isActive && "opacity-60 grayscale-[0.8] scale-95"
                )}
              >
                <Card
                  className={cn(
                    "relative flex-1 flex flex-col p-10 border-none shadow-premium transition-all duration-500 group-hover:shadow-2xl group-hover:-translate-y-2 rounded-[3.5rem]",
                    pkg.isActive ? "bg-white/90 backdrop-blur-3xl" : "bg-white/40 shadow-inner"
                  )}
                  padding="none"
                >
                  {/* Neural Background Decor */}
                  <div className={cn(
                    "absolute -top-32 -right-32 w-80 h-80 bg-gradient-to-br transition-all duration-1000 opacity-5 group-hover:opacity-10 blur-3xl rounded-full",
                    pkg.isActive ? "from-emerald-400 to-indigo-500" : "from-slate-400 to-slate-600"
                  )} />

                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-8">
                      <div className="space-y-1">
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-tight uppercase group-hover:text-emerald-600 transition-colors">{pkg.name}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                          <span className="w-5 h-[1px] bg-slate-200"></span>
                          {pkg.durationDays} Day Cycle
                        </p>
                      </div>
                      <div className={cn(
                        "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-100 shadow-sm",
                        pkg.isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400"
                      )}>
                        {pkg.isActive ? 'Protocol Active' : 'Index Halted'}
                      </div>
                    </div>

                    <div className="mb-10">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-slate-900 tracking-tighter">฿{pkg.price.toLocaleString()}</span>
                        <span className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest opacity-60">/ {pkg.durationDays}D Protocol</span>
                      </div>
                      {(pkg.priceUsdt ?? 0) > 0 && (
                        <div className="mt-3 flex items-center gap-2 bg-emerald-50 w-fit px-3 py-1 rounded-full border border-emerald-100/50">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                          <p className="text-emerald-600 font-black font-mono text-[9px] uppercase tracking-widest">
                            {pkg.priceUsdt} USDT Matrix Access
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50/50 border border-slate-100/50 backdrop-blur-md p-8 mb-10 rounded-[2.5rem] flex items-center justify-between shadow-inner">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Protocol Quota</p>
                        <p className="text-2xl font-black text-slate-900 leading-none tracking-tight">{pkg.slipQuota.toLocaleString()}<span className="text-sm ml-1 opacity-20">SLIPS</span></p>
                      </div>
                      <div className="h-10 w-[1px] bg-slate-200/50 mx-6" />
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Unit Logistics</p>
                        <p className="text-lg font-black text-emerald-600 leading-none tracking-tight">฿{(pkg.price / pkg.slipQuota).toFixed(2)}<span className="text-[9px] ml-1 opacity-40">/UNIT</span></p>
                      </div>
                    </div>

                    <div className="space-y-5 mb-12 flex-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                        <span className="w-4 h-[1px] bg-slate-200"></span>
                        Neural Capabilities
                      </p>
                      <ul className="space-y-4">
                        {pkg.features?.map((feature, i) => (
                          <li key={i} className="flex items-start gap-4 text-slate-600 group/feature">
                            <div className="w-6 h-6 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0 group-hover/feature:bg-emerald-500 group-hover/feature:text-white transition-all duration-300">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="text-[13px] font-bold tracking-tight text-slate-700 leading-tight pt-0.5">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-8 border-t border-slate-50">
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => handleEdit(pkg)}
                        className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                      >
                        Modify Plan
                      </Button>
                      <Button
                        variant={pkg.isActive ? "outline" : "primary"}
                        fullWidth
                        onClick={() => pkg.isActive ? handleDeleteClick(pkg) : handleActivate(pkg)}
                        className={cn(
                          "h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all",
                          pkg.isActive ? "text-rose-500 border-rose-100 hover:bg-rose-50 hover:border-rose-200" : "shadow-emerald-500/10 shadow-xl"
                        )}
                      >
                        {pkg.isActive ? 'Halt Protocol' : 'Deploy Index'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal
        isOpen={showModal}
        onClose={() => !isSubmitting && setShowModal(false)}
        title={editPackage ? 'PROTOCOL MODIFICATION' : 'NEW MATRIX DEPLOYMENT'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-2 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <Input
                label="MATRIX INDEX NAME"
                placeholder="e.g. PROFESSIONAL PROTOCOL"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={formErrors.name}
                required
                className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-xs"
              />
              <div className="grid grid-cols-2 gap-5">
                <Input
                  label="VALUATION (THB)"
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  error={formErrors.price}
                  min={0}
                  required
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-xs"
                />
                <Input
                  label="VALUATION (USDT)"
                  type="number"
                  value={formData.priceUsdt}
                  onChange={(e) => setFormData({ ...formData, priceUsdt: Number(e.target.value) })}
                  min={0}
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-xs opacity-70 focus:opacity-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <Input
                  label="QUOTA PAYLOAD"
                  type="number"
                  value={formData.slipQuota}
                  onChange={(e) => setFormData({ ...formData, slipQuota: Number(e.target.value) })}
                  error={formErrors.slipQuota}
                  min={0}
                  required
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-xs"
                />
                <Input
                  label="CYCLE DURATION"
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                  error={formErrors.durationDays}
                  min={1}
                  required
                  className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-xs"
                />
              </div>
              <Input
                label="REGISTRY SORT ORDER"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                min={0}
                hint="Priority hierarchy in the public manifest."
                className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-black text-[10px]"
              />
            </div>

            <div className="space-y-8">
              <TextArea
                label="CLIENT NOMENCLATURE"
                placeholder="Marketing tagline for this protocol..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="rounded-2xl bg-slate-50 border-none shadow-inner font-bold text-xs p-5"
              />
              <TextArea
                label="CAPABILITY MATRIX (ONE PER LINE)"
                placeholder="⚡ REAL-TIME VERIFICATION&#10;👑 PRIORITY UPLINK&#10;📈 ANALYTICS ENGINE"
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                rows={8}
                className="rounded-3xl bg-slate-50 border-none shadow-inner font-black text-[11px] p-6 leading-relaxed uppercase"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-50">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 font-black text-[11px] uppercase tracking-widest text-slate-400 h-16 rounded-2xl hover:bg-slate-50"
              onClick={() => { setShowModal(false); resetForm(); }}
              disabled={isSubmitting}
            >
              Abort
            </Button>
            <Button
              type="submit"
              className="flex-[2] h-16 rounded-2xl font-black uppercase tracking-widest text-[12px] shadow-emerald-500/10 shadow-2xl"
              isLoading={isSubmitting}
            >
              {editPackage ? 'Commit Protocol' : 'Execute Deployment'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="PROTOCOL HALT"
        message={`Confirm deactivation of "${packageToDelete?.name}" matrix? Future subscriptions to this index will be restricted.`}
        confirmText="Halt Protocol"
        type="warning"
        isLoading={isSubmitting}
      />
    </DashboardLayout>
  );
}
