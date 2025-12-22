'use client';

import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi } from '@/lib/api';
import { Package } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading, CardSkeleton } from '@/components/ui/Loading';
import { Input, TextArea } from '@/components/ui/Input';

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

  // ป้องกันการกดซ้ำ
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
      console.error('Error fetching packages:', error);
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

    if (!formData.name.trim()) {
      errors.name = 'กรุณากรอกชื่อแพ็คเกจ';
    } else if (formData.name.length > 50) {
      errors.name = 'ชื่อแพ็คเกจต้องไม่เกิน 50 ตัวอักษร';
    }

    if (formData.price < 0) {
      errors.price = 'ราคาต้องไม่ติดลบ';
    } else if (formData.price > 1000000) {
      errors.price = 'ราคาต้องไม่เกิน 1,000,000 บาท';
    }

    if (formData.slipQuota < 0) {
      errors.slipQuota = 'โควต้าต้องไม่ติดลบ';
    } else if (formData.slipQuota > 10000000) {
      errors.slipQuota = 'โควต้าต้องไม่เกิน 10,000,000';
    }

    if (formData.durationDays < 1) {
      errors.durationDays = 'ระยะเวลาต้องอย่างน้อย 1 วัน';
    } else if (formData.durationDays > 365) {
      errors.durationDays = 'ระยะเวลาต้องไม่เกิน 365 วัน';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ป้องกันการกดซ้ำ
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
        toast.success('อัปเดตแพ็คเกจสำเร็จ', { icon: '✅' });
      } else {
        await packagesApi.create(data);
        toast.success('สร้างแพ็คเกจสำเร็จ', { icon: '🎉' });
      }
      setShowModal(false);
      resetForm();
      fetchPackages();
    } catch (error: any) {
      const message = error.response?.data?.message || 'เกิดข้อผิดพลาด';
      toast.error(message);
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
      toast.success('ปิดใช้งานแพ็คเกจสำเร็จ', { icon: '🔒' });
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
      toast.success('เปิดใช้งานแพ็คเกจสำเร็จ', { icon: '🔓' });
      fetchPackages();
    } catch (error) {
      toast.error('ไม่สามารถเปิดใช้งานแพ็คเกจได้');
    }
  };

  const activeCount = packages.filter(p => p.isActive).length;
  const inactiveCount = packages.filter(p => !p.isActive).length;

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading message="กำลังโหลดข้อมูลแพ็คเกจ..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">แพ็คเกจ</h1>
            <p className="page-subtitle">จัดการแพ็คเกจและราคา</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="success">{activeCount} ใช้งาน</Badge>
              <Badge variant="secondary">{inactiveCount} ปิดใช้งาน</Badge>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              สร้างแพ็คเกจใหม่
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setIsLoading(true); fetchPackages(); }}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* Packages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.length === 0 ? (
            <div className="col-span-full">
              <Card className="py-12">
                <EmptyState
                  icon={
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  }
                  title="ยังไม่มีแพ็คเกจ"
                  description="สร้างแพ็คเกจแรกเพื่อเริ่มต้นใช้งาน"
                  action={
                    <Button onClick={() => { resetForm(); setShowModal(true); }}>
                      สร้างแพ็คเกจใหม่
                    </Button>
                  }
                />
              </Card>
            </div>
          ) : (
            packages.map((pkg) => (
              <Card
                key={pkg._id}
                className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  !pkg.isActive ? 'opacity-60 bg-gray-50' : ''
                }`}
              >
                {/* Status Ribbon */}
                {!pkg.isActive && (
                  <div className="absolute top-4 right-4">
                    <Badge variant="secondary">ปิดใช้งาน</Badge>
                  </div>
                )}

                {/* Package Header */}
                <div className="mb-4">
                  <h3 className="font-bold text-xl text-gray-900">{pkg.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{pkg.description || 'ไม่มีคำอธิบาย'}</p>
                </div>

                {/* Price */}
                <div className="mb-6 p-4 bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl">
                  <p className="text-4xl font-bold text-primary-600">
                    ฿{pkg.price.toLocaleString()}
                  </p>
                  {(pkg.priceUsdt ?? 0) > 0 && (
                    <p className="text-sm text-primary-500 mt-1">
                      หรือ ${pkg.priceUsdt} USDT
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-gray-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-gray-900">{pkg.slipQuota.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">สลิป</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl text-center">
                    <p className="text-2xl font-bold text-gray-900">{pkg.durationDays}</p>
                    <p className="text-xs text-gray-500">วัน</p>
                  </div>
                </div>

                {/* Features */}
                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-2 mb-6">
                    {pkg.features.slice(0, 4).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="truncate">{feature}</span>
                      </li>
                    ))}
                    {pkg.features.length > 4 && (
                      <li className="text-sm text-gray-400">+{pkg.features.length - 4} คุณสมบัติเพิ่มเติม</li>
                    )}
                  </ul>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => handleEdit(pkg)}
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    แก้ไข
                  </Button>
                  {pkg.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(pkg)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleActivate(pkg)}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Package Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => !isSubmitting && setShowModal(false)}
        title={editPackage ? 'แก้ไขแพ็คเกจ' : 'สร้างแพ็คเกจใหม่'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="ชื่อแพ็คเกจ"
            placeholder="เช่น Basic, Pro, Enterprise"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            required
            disabled={isSubmitting}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="ราคา (บาท)"
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
              error={formErrors.price}
              min={0}
              required
              disabled={isSubmitting}
            />
            <Input
              label="ราคา USDT"
              type="number"
              value={formData.priceUsdt}
              onChange={(e) => setFormData({ ...formData, priceUsdt: Number(e.target.value) })}
              min={0}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="โควต้าสลิป"
              type="number"
              value={formData.slipQuota}
              onChange={(e) => setFormData({ ...formData, slipQuota: Number(e.target.value) })}
              error={formErrors.slipQuota}
              min={0}
              required
              disabled={isSubmitting}
            />
            <Input
              label="ระยะเวลา (วัน)"
              type="number"
              value={formData.durationDays}
              onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
              error={formErrors.durationDays}
              min={1}
              required
              disabled={isSubmitting}
            />
          </div>

          <Input
            label="คำอธิบาย"
            placeholder="รายละเอียดแพ็คเกจ"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={isSubmitting}
          />

          <TextArea
            label="คุณสมบัติ (บรรทัดละ 1 รายการ)"
            placeholder="ตรวจสอบสลิปอัตโนมัติ&#10;AI ตอบข้อความ&#10;รองรับหลายบัญชี"
            value={formData.features}
            onChange={(e) => setFormData({ ...formData, features: e.target.value })}
            rows={4}
            disabled={isSubmitting}
          />

          <Input
            label="ลำดับการแสดง"
            type="number"
            value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
            min={0}
            disabled={isSubmitting}
            hint="ยิ่งน้อยยิ่งแสดงก่อน"
          />

          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => { setShowModal(false); resetForm(); }}
              disabled={isSubmitting}
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              loadingText="กำลังบันทึก..."
            >
              {editPackage ? 'บันทึกการแก้ไข' : 'สร้างแพ็คเกจ'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="ปิดใช้งานแพ็คเกจ"
        message={`คุณต้องการปิดใช้งานแพ็คเกจ "${packageToDelete?.name}" หรือไม่? ผู้ใช้จะไม่สามารถซื้อแพ็คเกจนี้ได้จนกว่าจะเปิดใช้งานอีกครั้ง`}
        confirmText="ปิดใช้งาน"
        cancelText="ยกเลิก"
        type="warning"
        isLoading={isSubmitting}
      />
    </DashboardLayout>
  );
}
