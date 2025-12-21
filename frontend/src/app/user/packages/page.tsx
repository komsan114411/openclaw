'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi, paymentsApi, subscriptionsApi } from '@/lib/api';
import { Package, Subscription } from '@/types';
import toast from 'react-hot-toast';

export default function UserPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'usdt'>('bank');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [packagesRes, subRes] = await Promise.all([
        packagesApi.getAll(),
        subscriptionsApi.getMy(),
      ]);
      setPackages(packagesRes.data.packages || []);
      setSubscription(subRes.data.subscription);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPackage = (pkg: Package) => {
    setSelectedPackage(pkg);
    setShowPaymentModal(true);
  };

  const handlePayment = async () => {
    if (!selectedPackage) return;
    try {
      const response = await paymentsApi.create({
        packageId: selectedPackage._id,
        paymentType: paymentMethod,
        amount: paymentMethod === 'usdt' ? selectedPackage.priceUsdt || 0 : selectedPackage.price,
      });
      toast.success('สร้างรายการชำระเงินสำเร็จ กรุณาชำระเงินและอัปโหลดสลิป');
      setShowPaymentModal(false);
      setSelectedPackage(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">แพ็คเกจ</h1>
          <p className="text-gray-500">เลือกแพ็คเกจที่เหมาะกับคุณ</p>
        </div>

        {/* Current Subscription */}
        {subscription && (
          <div className="card bg-gradient-to-r from-primary-500 to-primary-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-primary-100 text-sm">แพ็คเกจปัจจุบัน</p>
                <h3 className="text-xl font-bold">{subscription.packageName || 'Standard'}</h3>
              </div>
              <div className="text-right">
                <p className="text-primary-100 text-sm">โควต้าคงเหลือ</p>
                <p className="text-2xl font-bold">
                  {subscription.remainingQuota?.toLocaleString() || 0} / {subscription.quota?.toLocaleString() || 0}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-primary-400">
              <div className="flex justify-between text-sm">
                <span className="text-primary-100">หมดอายุ</span>
                <span className="font-medium">
                  {subscription.expiresAt
                    ? new Date(subscription.expiresAt).toLocaleDateString('th-TH')
                    : '-'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Packages Grid */}
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
              <div key={pkg._id} className="card hover:shadow-lg transition-shadow">
                <div className="mb-4">
                  <h3 className="font-semibold text-lg text-gray-900">{pkg.name}</h3>
                  <p className="text-sm text-gray-500">{pkg.description || '-'}</p>
                </div>

                <div className="mb-4">
                  <p className="text-3xl font-bold text-primary-600">฿{pkg.price.toLocaleString()}</p>
                  {pkg.priceUsdt && (
                    <p className="text-sm text-gray-500">${pkg.priceUsdt} USDT</p>
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">โควต้าสลิป</span>
                    <span className="font-medium">{pkg.slipQuota.toLocaleString()} สลิป</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">ระยะเวลา</span>
                    <span className="font-medium">{pkg.durationDays} วัน</span>
                  </div>
                </div>

                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-1 mb-4">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={() => handleSelectPackage(pkg)}
                  className="btn btn-primary w-full"
                >
                  เลือกแพ็คเกจนี้
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">ชำระเงิน</h2>
            
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900">{selectedPackage.name}</h3>
              <p className="text-2xl font-bold text-primary-600 mt-2">
                {paymentMethod === 'usdt'
                  ? `$${selectedPackage.priceUsdt || 0} USDT`
                  : `฿${selectedPackage.price.toLocaleString()}`}
              </p>
            </div>

            <div className="mb-4">
              <label className="label">วิธีชำระเงิน</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-3 border rounded-lg text-center ${paymentMethod === 'bank' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
                >
                  <span className="text-2xl">🏦</span>
                  <p className="text-sm font-medium mt-1">โอนเงิน</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('usdt')}
                  className={`p-3 border rounded-lg text-center ${paymentMethod === 'usdt' ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
                >
                  <span className="text-2xl">💰</span>
                  <p className="text-sm font-medium mt-1">USDT</p>
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="btn btn-secondary flex-1">
                ยกเลิก
              </button>
              <button onClick={handlePayment} className="btn btn-primary flex-1">
                ดำเนินการชำระเงิน
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
