'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi, paymentsApi, subscriptionsApi, systemSettingsApi } from '@/lib/api';
import { Package, Subscription } from '@/types';
import toast from 'react-hot-toast';

export default function UserPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'usdt'>('bank');
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [transactionHash, setTransactionHash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [packagesRes, subRes, paymentInfoRes] = await Promise.all([
        packagesApi.getAll(),
        subscriptionsApi.getMy(),
        systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} })),
      ]);
      setPackages(packagesRes.data.packages || []);
      setSubscription(subRes.data.subscription);
      setPaymentInfo(paymentInfoRes.data || {});
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectPackage = (pkg: Package) => {
    setSelectedPackage(pkg);
    setPaymentMethod('bank');
    setSlipFile(null);
    setSlipPreview(null);
    setTransactionHash('');
    setShowPaymentModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSlipFile(null);
      setSlipPreview(null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      e.target.value = '';
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)');
      e.target.value = '';
      return;
    }

    setSlipFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setSlipPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePayment = async () => {
    if (!selectedPackage) return;
    
    // Validate inputs
    if (paymentMethod === 'bank' && !slipFile) {
      toast.error('กรุณาอัปโหลดสลิปการโอนเงิน');
      return;
    }
    
    if (paymentMethod === 'usdt') {
      if (!transactionHash) {
        toast.error('กรุณากรอก Transaction Hash');
        return;
      }
      // Basic transaction hash validation
      if (transactionHash.length < 10) {
        toast.error('Transaction Hash ไม่ถูกต้อง');
        return;
      }
    }

    setIsProcessing(true);
    try {
      if (paymentMethod === 'bank') {
        const response = await paymentsApi.submitSlip({
          packageId: selectedPackage._id,
          slipFile: slipFile!,
        });
        
        if (response.data.success) {
          toast.success('ตรวจสอบสลิปสำเร็จ! ระบบเติมแพ็คเกจให้อัตโนมัติ');
          closeModal();
          fetchData();
        } else {
          // Payment created but needs manual review
          toast.success(response.data.message || 'อัปโหลดสลิปสำเร็จ รอการตรวจสอบจากผู้ดูแลระบบ');
          closeModal();
          fetchData();
        }
      } else {
        await paymentsApi.submitUsdt(selectedPackage._id, transactionHash);
        toast.success('รับข้อมูลการชำระเงินแล้ว รอการตรวจสอบ');
        closeModal();
        fetchData();
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
      toast.error(message);
      
      // If it's a rate limit error, show more specific message
      if (error.response?.status === 429) {
        toast.error('คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const closeModal = () => {
    setShowPaymentModal(false);
    setSelectedPackage(null);
    setSlipFile(null);
    setSlipPreview(null);
    setTransactionHash('');
  };

  const handleRetry = () => {
    setIsLoading(true);
    fetchData();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">แพ็คเกจ</h1>
          <p className="text-gray-500">เลือกแพ็คเกจที่เหมาะกับคุณ</p>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-red-700">{error}</span>
            </div>
            <button onClick={handleRetry} className="text-red-600 hover:text-red-800 font-medium">
              ลองใหม่
            </button>
          </div>
        )}

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
            packages.map((pkg, index) => (
              <div 
                key={pkg._id} 
                className={`card hover:shadow-lg transition-all relative ${
                  index === 1 ? 'border-2 border-primary-500 scale-[1.02]' : ''
                }`}
              >
                {/* Popular Badge */}
                {index === 1 && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="px-4 py-1 bg-primary-500 text-white text-xs font-bold rounded-full shadow">
                      ยอดนิยม
                    </span>
                  </div>
                )}

                <div className="mb-4 mt-2">
                  <h3 className="font-bold text-xl text-gray-900">{pkg.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{pkg.description || 'แพ็คเกจตรวจสอบสลิป'}</p>
                </div>

                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-primary-600">฿{pkg.price.toLocaleString()}</span>
                    <span className="text-gray-500 text-sm mb-1">/{pkg.durationDays} วัน</span>
                  </div>
                  {pkg.priceUsdt && pkg.priceUsdt > 0 && (
                    <p className="text-sm text-gray-500 mt-1">หรือ ${pkg.priceUsdt} USDT</p>
                  )}
                  <div className="mt-2 text-sm text-primary-600 font-medium">
                    ≈ ฿{(pkg.price / pkg.slipQuota).toFixed(2)}/สลิป
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-lg">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-primary-700">{pkg.slipQuota.toLocaleString()} สลิป</p>
                      <p className="text-xs text-primary-600">โควต้าตรวจสอบ</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-gray-700">{pkg.durationDays} วัน</p>
                      <p className="text-xs text-gray-500">อายุการใช้งาน</p>
                    </div>
                  </div>
                </div>

                {pkg.features && pkg.features.length > 0 && (
                  <ul className="space-y-2 mb-6">
                    {pkg.features.map((feature, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  onClick={() => handleSelectPackage(pkg)}
                  className={`btn w-full ${index === 1 ? 'btn-primary' : 'btn-secondary hover:bg-primary-600 hover:text-white'}`}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  เลือกแพ็คเกจนี้
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">ชำระเงิน</h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
                disabled={isProcessing}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900">{selectedPackage.name}</h3>
              <p className="text-2xl font-bold text-primary-600 mt-2">
                {paymentMethod === 'usdt'
                  ? `$${selectedPackage.priceUsdt || 0} USDT`
                  : `฿${selectedPackage.price.toLocaleString()}`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                โควต้า: {selectedPackage.slipQuota.toLocaleString()} สลิป | {selectedPackage.durationDays} วัน
              </p>
            </div>

            <div className="mb-4">
              <label className="label">วิธีชำระเงิน</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  disabled={isProcessing}
                  className={`p-3 border rounded-lg text-center transition-colors ${
                    paymentMethod === 'bank' 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-2xl">🏦</span>
                  <p className="text-sm font-medium mt-1">โอนเงิน</p>
                </button>
                {paymentInfo?.usdtWallet?.enabled && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usdt')}
                    disabled={isProcessing}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      paymentMethod === 'usdt' 
                        ? 'border-primary-500 bg-primary-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-2xl">💰</span>
                    <p className="text-sm font-medium mt-1">USDT</p>
                  </button>
                )}
              </div>
            </div>

            {/* Bank Transfer Info */}
            {paymentMethod === 'bank' && (
              <div className="mb-4 space-y-4">
                {paymentInfo?.bankAccounts?.length > 0 ? (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-medium text-blue-900 mb-2">โอนเงินไปยังบัญชี:</p>
                    {paymentInfo.bankAccounts.map((account: any, idx: number) => (
                      <div key={idx} className="text-sm text-blue-800 mb-2 last:mb-0">
                        <p className="font-medium">{account.bankName}</p>
                        <p>เลขบัญชี: <span className="font-mono">{account.accountNumber}</span></p>
                        <p>ชื่อบัญชี: {account.accountName}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-sm">ยังไม่ได้ตั้งค่าบัญชีธนาคาร กรุณาติดต่อผู้ดูแลระบบ</p>
                  </div>
                )}
                
                <div>
                  <label className="label">อัปโหลดสลิปการโอนเงิน *</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                    className="input"
                  />
                  {slipPreview && (
                    <div className="mt-2">
                      <img 
                        src={slipPreview} 
                        alt="Slip preview" 
                        className="max-h-40 rounded-lg border"
                      />
                      <p className="text-sm text-green-600 mt-1">เลือกไฟล์: {slipFile?.name}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* USDT Info */}
            {paymentMethod === 'usdt' && (
              <div className="mb-4 space-y-4">
                {paymentInfo?.usdtWallet?.address ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="font-medium text-yellow-900 mb-2">โอน USDT ไปยัง:</p>
                    <p className="text-sm text-yellow-800">Network: {paymentInfo?.usdtWallet?.network || 'TRC20'}</p>
                    <p className="text-sm text-yellow-800 font-mono break-all mt-1">
                      {paymentInfo?.usdtWallet?.address}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-sm">ยังไม่ได้ตั้งค่า USDT Wallet กรุณาติดต่อผู้ดูแลระบบ</p>
                  </div>
                )}
                
                <div>
                  <label className="label">Transaction Hash *</label>
                  <input
                    type="text"
                    value={transactionHash}
                    onChange={(e) => setTransactionHash(e.target.value.trim())}
                    disabled={isProcessing}
                    className="input font-mono text-sm"
                    placeholder="0x..."
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="btn btn-secondary flex-1"
                disabled={isProcessing}
              >
                ยกเลิก
              </button>
              <button
                onClick={handlePayment}
                className="btn btn-primary flex-1"
                disabled={isProcessing || (paymentMethod === 'bank' && !slipFile) || (paymentMethod === 'usdt' && !transactionHash)}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    กำลังดำเนินการ...
                  </span>
                ) : (
                  'ยืนยันการชำระเงิน'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
