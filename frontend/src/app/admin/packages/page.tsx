'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi } from '@/lib/api';
import { Package } from '@/types';
import toast from 'react-hot-toast';

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPackage, setEditPackage] = useState<Package | null>(null);
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
    try {
      const response = await packagesApi.getAll(true);
      setPackages(response.data.packages || []);
    } catch (error) {
      console.error('Error fetching packages:', error);
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการปิดใช้งานแพ็คเกจนี้หรือไม่?')) return;
    try {
      await packagesApi.delete(id);
      toast.success('ปิดใช้งานแพ็คเกจสำเร็จ');
      fetchPackages();
    } catch (error) {
      toast.error('ไม่สามารถปิดใช้งานแพ็คเกจได้');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await packagesApi.activate(id);
      toast.success('เปิดใช้งานแพ็คเกจสำเร็จ');
      fetchPackages();
    } catch (error) {
      toast.error('ไม่สามารถเปิดใช้งานแพ็คเกจได้');
    }
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">แพ็คเกจ</h1>
            <p className="text-gray-500">จัดการแพ็คเกจและราคา</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            + สร้างแพ็คเกจใหม่
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-48 bg-gray-200 rounded"></div>
              </div>
            ))
          ) : packages.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              ยังไม่มีแพ็คเกจ
            </div>
          ) : (
            packages.map((pkg) => (
              <div
                key={pkg._id}
                className={`card ${!pkg.isActive ? 'opacity-60 bg-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900">{pkg.name}</h3>
                    <p className="text-sm text-gray-500">{pkg.description || '-'}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${pkg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {pkg.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>

                <div className="mb-4">
                  <p className="text-3xl font-bold text-primary-600">฿{pkg.price.toLocaleString()}</p>
                  {pkg.priceUsdt && (
                    <p className="text-sm text-gray-500">${pkg.priceUsdt} USDT</p>
                  )}
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">โควต้าสลิป</span>
                    <span className="font-medium">{pkg.slipQuota.toLocaleString()} สลิป</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ระยะเวลา</span>
                    <span className="font-medium">{pkg.durationDays} วัน</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ลำดับ</span>
                    <span className="font-medium">{pkg.sortOrder || 0}</span>
                  </div>
                </div>

                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-1 mb-4 text-sm">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="text-gray-600 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <button onClick={() => handleEdit(pkg)} className="btn btn-secondary flex-1 text-sm">
                    แก้ไข
                  </button>
                  {pkg.isActive ? (
                    <button onClick={() => handleDelete(pkg._id)} className="text-red-600 hover:text-red-800 px-3">
                      ปิดใช้งาน
                    </button>
                  ) : (
                    <button onClick={() => handleActivate(pkg._id)} className="text-green-600 hover:text-green-800 px-3">
                      เปิดใช้งาน
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Package Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editPackage ? 'แก้ไขแพ็คเกจ' : 'สร้างแพ็คเกจใหม่'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">ชื่อแพ็คเกจ *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                  placeholder="เช่น Basic, Pro, Enterprise"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ราคา (บาท) *</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="input"
                    required
                    min="0"
                  />
                </div>
                <div>
                  <label className="label">ราคา USDT</label>
                  <input
                    type="number"
                    value={formData.priceUsdt}
                    onChange={(e) => setFormData({ ...formData, priceUsdt: Number(e.target.value) })}
                    className="input"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">โควต้าสลิป *</label>
                  <input
                    type="number"
                    value={formData.slipQuota}
                    onChange={(e) => setFormData({ ...formData, slipQuota: Number(e.target.value) })}
                    className="input"
                    required
                    min="0"
                  />
                </div>
                <div>
                  <label className="label">ระยะเวลา (วัน) *</label>
                  <input
                    type="number"
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                    className="input"
                    required
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="label">คำอธิบาย</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder="รายละเอียดแพ็คเกจ"
                />
              </div>

              <div>
                <label className="label">คุณสมบัติ (บรรทัดละ 1 รายการ)</label>
                <textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  className="input"
                  rows={4}
                  placeholder="ตรวจสอบสลิปอัตโนมัติ&#10;AI ตอบข้อความ&#10;รองรับหลายบัญชี"
                />
              </div>

              <div>
                <label className="label">ลำดับการแสดง</label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                  className="input"
                  min="0"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="btn btn-secondary flex-1"
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editPackage ? 'บันทึก' : 'สร้างแพ็คเกจ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
