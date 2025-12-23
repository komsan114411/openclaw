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

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Subscription Packages</h1>
            <p className="text-slate-500 font-medium text-lg">จัดการแผนการใช้งานและราคาสำหรับลูกค้า</p>
          </div>
          <Button
            size="lg"
            variant="primary"
            onClick={() => { resetForm(); setShowModal(true); }}
            className="shadow-emerald-200/50"
            leftIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Create New Package
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="แพ็คเกจทั้งหมด"
            value={packages.length}
            icon="💎"
            color="indigo"
            variant="glass"
          />
          <StatCard
            title="เปิดใช้งาน"
            value={packages.filter(p => p.isActive).length}
            icon="🟢"
            color="emerald"
            variant="glass"
          />
          <StatCard
            title="ยอดนิยม"
            value={packages.length > 0 ? "Premium" : "-"}
            icon="🔥"
            color="amber"
            variant="glass"
          />
        </div>

        {/* Packages Display */}
        {packages.length === 0 ? (
          <EmptyState
            icon="💎"
            title="No Packages Found"
            description="Start by creating a subscription package for your users."
            action={<Button onClick={() => setShowModal(true)}>Create Package</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 pt-4">
            {packages.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((pkg) => (
              <motion.div
                key={pkg._id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group relative overflow-hidden transition-all duration-500 flex flex-col h-full",
                  !pkg.isActive && "opacity-60 grayscale-[0.8]"
                )}
              >
                <Card
                  className={cn(
                    "relative flex-1 flex flex-col p-8 border-none shadow-premium-sm transition-all duration-500 hover:shadow-premium group-hover:-translate-y-2 rounded-[2.5rem]",
                    pkg.isActive ? "bg-white/80 backdrop-blur-xl" : "bg-slate-50/50"
                  )}
                  padding="none"
                >
                  {/* Decorative Gradient Background */}
                  <div className={cn(
                    "absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br transition-all duration-700 opacity-[0.03] group-hover:opacity-[0.08] blur-3xl rounded-full",
                    pkg.isActive ? "from-emerald-500 to-teal-500" : "from-slate-500 to-slate-800"
                  )} />

                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight uppercase">{pkg.name}</h3>
                        <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">{pkg.durationDays} Days Plan</p>
                      </div>
                      <StatusBadge status={pkg.isActive ? 'active' : 'inactive'} />
                    </div>

                    <div className="mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-slate-900">฿{pkg.price.toLocaleString()}</span>
                        <span className="text-slate-400 font-bold text-sm tracking-tight">/ {pkg.durationDays} days</span>
                      </div>
                      {(pkg.priceUsdt ?? 0) > 0 && (
                        <p className="text-emerald-600 font-black text-xs uppercase tracking-widest mt-1 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px]">💰</span>
                          Equivalent to ${pkg.priceUsdt} USDT
                        </p>
                      )}
                    </div>

                    <Card className="bg-slate-50/50 border-none p-6 mb-8 rounded-[2rem] flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Slip Quota</p>
                        <p className="text-xl font-black text-slate-900 leading-none">{pkg.slipQuota.toLocaleString()}</p>
                      </div>
                      <div className="h-8 w-px bg-slate-200 mx-4" />
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost / Slip</p>
                        <p className="text-sm font-black text-emerald-600 leading-none">฿{(pkg.price / pkg.slipQuota).toFixed(2)}</p>
                      </div>
                    </Card>

                    <div className="space-y-4 mb-10 flex-1">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Included Features</p>
                      <ul className="space-y-3">
                        {pkg.features?.map((feature, i) => (
                          <li key={i} className="flex items-center gap-3 text-slate-600">
                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="text-sm font-semibold tracking-tight">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex gap-3 pt-6 border-t border-dashed border-slate-100">
                      <Button variant="ghost" fullWidth onClick={() => handleEdit(pkg)} className="font-bold text-slate-500">
                        Edit Package
                      </Button>
                      <Button
                        variant={pkg.isActive ? "outline" : "primary"}
                        fullWidth
                        onClick={() => pkg.isActive ? handleDeleteClick(pkg) : handleActivate(pkg)}
                        className={cn("font-bold", pkg.isActive ? "text-rose-500 border-rose-100 hover:bg-rose-50" : "")}
                      >
                        {pkg.isActive ? 'Deactivate' : 'Activate Plan'}
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
        title={editPackage ? 'Edit Package plan' : 'Deploy New Subscription'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="p-1 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Input
                label="Plan Name"
                placeholder="e.g. Professional Plan"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={formErrors.name}
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Price (THB)"
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                  error={formErrors.price}
                  min={0}
                  required
                />
                <Input
                  label="Price (USDT)"
                  type="number"
                  value={formData.priceUsdt}
                  onChange={(e) => setFormData({ ...formData, priceUsdt: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Quota (Slips)"
                  type="number"
                  value={formData.slipQuota}
                  onChange={(e) => setFormData({ ...formData, slipQuota: Number(e.target.value) })}
                  error={formErrors.slipQuota}
                  min={0}
                  required
                />
                <Input
                  label="Duration (Days)"
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                  error={formErrors.durationDays}
                  min={1}
                  required
                />
              </div>
              <Input
                label="Display Order"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                min={0}
                hint="Lower values show first in list"
              />
            </div>

            <div className="space-y-6">
              <TextArea
                label="Brief Description"
                placeholder="Marketing tagline for this plan..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
              <TextArea
                label="Detailed Features (One per line)"
                placeholder="⚡ Real-time Verification&#10;👑 Priority Support&#10;📈 Analytics Pro"
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                rows={8}
                className="font-medium"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 font-bold text-slate-500 h-14"
              onClick={() => { setShowModal(false); resetForm(); }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-[2] font-black text-lg h-14 shadow-premium shadow-emerald-500/10"
              isLoading={isSubmitting}
            >
              {editPackage ? 'Save Changes' : 'Launch Package'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Deactivate Package"
        message={`Are you sure you want to hide "${packageToDelete?.name}"? New users will not be able to subscribe to this plan.`}
        confirmText="Confirm Deactivation"
        type="warning"
        isLoading={isSubmitting}
      />
    </DashboardLayout>
  );
}
