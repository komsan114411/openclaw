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
      <div className="section-gap animate-fade pb-10">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              จัดการ<span className="text-[#06C755]">แพ็คเกจ</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              ตั้งค่าแพ็คเกจและราคาบริการ
            </p>
          </div>
          <Button
            size="lg"
            variant="primary"
            onClick={() => { resetForm(); setShowModal(true); }}
            className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 mt-4 lg:mt-0"
          >
            + สร้างแพ็คเกจใหม่
          </Button>
        </div>

        <div className="grid-stats">
          <StatCard
            title="แพ็คเกจทั้งหมด"
            value={packages.length}
            icon="💎"
            color="indigo"
            variant="glass"
          />
          <StatCard
            title="ใช้งานอยู่"
            value={packages.filter(p => p.isActive).length}
            icon="🟢"
            color="emerald"
            variant="glass"
          />
          <StatCard
            title="ยอดนิยม"
            value={packages.length > 0 ? "PREMIUM" : "N/A"}
            icon="🔥"
            color="amber"
            variant="glass"
          />
        </div>

        {packages.length === 0 ? (
          <EmptyState
            icon="💎"
            title="ยังไม่มีแพ็คเกจ"
            description="กรุณาสร้างแพ็คเกจใหม่เพื่อเริ่มต้นใช้งาน"
            action={<Button variant="primary" onClick={() => setShowModal(true)} className="h-12 px-8 rounded-xl font-semibold text-xs">สร้างแพ็คเกจใหม่</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10 pt-4">
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
                  variant="glass"
                  className={cn(
                    "relative flex-1 flex flex-col p-8 sm:p-10 border-none transition-all duration-500 group-hover:-translate-y-2 rounded-[2.5rem] lg:rounded-[3.5rem]",
                    !pkg.isActive && "bg-white/[0.02]"
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
                        <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight uppercase group-hover:text-emerald-400 transition-colors">{pkg.name}</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                          {pkg.durationDays} วัน
                        </p>
                      </div>
                      <div className={cn(
                        "px-3 sm:px-4 py-1.5 rounded-full text-[8px] sm:text-[9px] font-semibold border border-white/5 shadow-lg",
                        pkg.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/20"
                      )}>
                        {pkg.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                      </div>
                    </div>

                    <div className="mb-10">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl sm:text-5xl font-black text-white tracking-tighter">฿{pkg.price.toLocaleString()}</span>
                        <span className="text-[10px] font-black font-mono text-slate-600 uppercase tracking-widest opacity-60">/ ระบบ {pkg.durationDays} วัน</span>
                      </div>
                      {(pkg.priceUsdt ?? 0) > 0 && (
                        <div className="mt-3 flex items-center gap-2 bg-emerald-500/5 w-fit px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border border-emerald-500/10">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                          <p className="text-emerald-400 font-bold font-mono text-[9px]">
                            {pkg.priceUsdt} USDT
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 backdrop-blur-md p-6 sm:p-8 mb-10 rounded-[2rem] sm:rounded-[2.5rem] flex items-center justify-between shadow-inner">
                      <div>
                        <p className="text-[9px] font-semibold text-slate-500 mb-2 text-center">โควต้าสลิป</p>
                        <p className="text-xl sm:text-2xl font-bold text-white leading-none tracking-tight text-center">{pkg.slipQuota.toLocaleString()}<span className="text-sm ml-1 opacity-40">รายการ</span></p>
                      </div>
                      <div className="h-10 w-[1px] bg-white/5 mx-6" />
                      <div className="text-center">
                        <p className="text-[9px] font-semibold text-slate-500 mb-2">ราคาต่อสลิป</p>
                        <p className="text-lg font-bold text-emerald-400 leading-none tracking-tight">฿{(pkg.price / pkg.slipQuota).toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="space-y-5 mb-12 flex-1">
                      <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-3 justify-center">
                        <span className="w-4 h-[1px] bg-white/10"></span>
                        คุณสมบัติ
                        <span className="w-4 h-[1px] bg-white/10"></span>
                      </p>
                      <ul className="space-y-4">
                        {pkg.features?.map((feature, i) => (
                          <li key={i} className="flex items-start gap-4 text-slate-400 group/feature">
                            <div className="w-6 h-6 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 group-hover/feature:bg-emerald-400 group-hover/feature:text-white transition-all duration-300">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="text-[13px] font-bold tracking-tight text-white/60 leading-tight pt-0.5">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-8 border-t border-white/5">
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => handleEdit(pkg)}
                        className="h-12 sm:h-14 rounded-xl sm:rounded-2xl font-semibold text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                      >
                        แก้ไข
                      </Button>
                      <Button
                        variant={pkg.isActive ? "outline" : "primary"}
                        fullWidth
                        onClick={() => pkg.isActive ? handleDeleteClick(pkg) : handleActivate(pkg)}
                        className={cn(
                          "h-12 sm:h-14 rounded-xl sm:rounded-2xl font-semibold text-xs transition-all",
                          pkg.isActive ? "text-rose-400 border-rose-500/20 hover:bg-rose-500/10" : "shadow-emerald-500/20 shadow-xl"
                        )}
                      >
                        {pkg.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => !isSubmitting && setShowModal(false)}
        title={editPackage ? 'แก้ไขแพ็คเกจ' : 'สร้างแพ็คเกจใหม่'}
        subtitle="กำหนดรายละเอียดแพ็คเกจและราคา"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-2 space-y-10 focus-within:animate-pulse-slow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <Input
                label="ชื่อแพ็คเกจ"
                placeholder="เช่น PREMIUM, STARTER, ENTERPRISE"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={formErrors.name}
                required
                className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-sm"
              />
              <div className="grid grid-cols-2 gap-5">
                <Input
                  label="ราคา (บาท)"
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  error={formErrors.price}
                  min={0}
                  required
                  className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-sm"
                />
                <Input
                  label="ราคา (USDT)"
                  type="number"
                  value={formData.priceUsdt}
                  onChange={(e) => setFormData({ ...formData, priceUsdt: Number(e.target.value) })}
                  min={0}
                  className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-sm opacity-70 focus:opacity-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <Input
                  label="โควต้าสลิป"
                  type="number"
                  value={formData.slipQuota}
                  onChange={(e) => setFormData({ ...formData, slipQuota: Number(e.target.value) })}
                  error={formErrors.slipQuota}
                  min={0}
                  required
                  className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-sm"
                />
                <Input
                  label="ระยะเวลา (วัน)"
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                  error={formErrors.durationDays}
                  min={1}
                  required
                  className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-sm"
                />
              </div>
              <Input
                label="ลำดับการแสดงผล"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                min={0}
                hint="ลำดับการเรียงแพ็คเกจในรายการ (0 = แสดงก่อน)"
                className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-bold text-sm"
              />
            </div>

            <div className="space-y-8">
              <TextArea
                label="คำอธิบาย"
                placeholder="รายละเอียดแพ็คเกจ..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-medium text-sm p-5"
              />
              <TextArea
                label="คุณสมบัติ (บรรทัดละ 1 รายการ)"
                placeholder="✅ ตรวจสอบสลิปอัตโนมัติ&#10;📈 รายงานวิเคราะห์&#10;💬 ตอบกลับอัตโนมัติ"
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                rows={8}
                className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-medium text-sm p-5 leading-relaxed"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-8">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 font-semibold text-sm text-slate-400 h-14 rounded-2xl hover:bg-white/5"
              onClick={() => { setShowModal(false); resetForm(); }}
              disabled={isSubmitting}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              className="flex-[2] h-14 rounded-2xl font-semibold text-sm shadow-emerald-500/20 shadow-xl"
              isLoading={isSubmitting}
            >
              {editPackage ? 'บันทึกการแก้ไข' : 'สร้างแพ็คเกจ'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="ปิดใช้งานแพ็คเกจ"
        message={`ยืนยันการปิดใช้งานแพ็คเกจ "${packageToDelete?.name}" หรือไม่? ผู้ใช้ใหม่จะไม่สามารถสมัครแพ็คเกจนี้ได้`}
        confirmText="ปิดใช้งาน"
        type="warning"
        isLoading={isSubmitting}
      />
    </DashboardLayout>
  );
}
