'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi, paymentsApi, subscriptionsApi, systemSettingsApi } from '@/lib/api';
import { Package, Subscription } from '@/types';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageLoading, LoadingCard, Spinner } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

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
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // ป้องกันการกดซ้ำ
  const isSubmittingRef = useRef(false);
  const lastSubmitTimeRef = useRef(0);

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
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) เท่านั้น');
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

  const validatePayment = (): boolean => {
    if (!selectedPackage) {
      toast.error('กรุณาเลือกแพ็คเกจ');
      return false;
    }

    if (paymentMethod === 'bank') {
      if (!slipFile) {
        toast.error('กรุณาอัปโหลดสลิปการโอนเงิน');
        return false;
      }
    }

    if (paymentMethod === 'usdt') {
      if (!transactionHash.trim()) {
        toast.error('กรุณากรอก Transaction Hash');
        return false;
      }
      // Basic transaction hash validation (at least 10 chars, alphanumeric)
      if (transactionHash.length < 10 || !/^[a-zA-Z0-9]+$/.test(transactionHash)) {
        toast.error('Transaction Hash ไม่ถูกต้อง');
        return false;
      }
    }

    return true;
  };

  const handleConfirmPayment = () => {
    if (!validatePayment()) return;
    setShowConfirmModal(true);
  };

  const handlePayment = async () => {
    // ป้องกันการกดซ้ำ
    const now = Date.now();
    if (isSubmittingRef.current || now - lastSubmitTimeRef.current < 3000) {
      toast.error('กรุณารอสักครู่ก่อนทำรายการใหม่');
      return;
    }

    if (!selectedPackage) return;

    isSubmittingRef.current = true;
    lastSubmitTimeRef.current = now;
    setIsProcessing(true);
    setShowConfirmModal(false);

    try {
      if (paymentMethod === 'bank') {
        const response = await paymentsApi.submitSlip({
          packageId: selectedPackage._id,
          slipFile: slipFile!,
        });

        if (response.data.success) {
          toast.success('ตรวจสอบสลิปสำเร็จ! ระบบเติมแพ็คเกจให้อัตโนมัติ', {
            duration: 5000,
            icon: '🎉',
          });
        } else {
          toast.success(response.data.message || 'อัปโหลดสลิปสำเร็จ รอการตรวจสอบจากผู้ดูแลระบบ', {
            duration: 5000,
          });
        }
        closeModal();
        fetchData();
      } else {
        await paymentsApi.submitUsdt(selectedPackage._id, transactionHash);
        toast.success('รับข้อมูลการชำระเงินแล้ว รอการตรวจสอบ', {
          duration: 5000,
        });
        closeModal();
        fetchData();
      }
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.message;

      if (status === 429) {
        toast.error('คำขอมากเกินไป กรุณารอ 1 นาทีแล้วลองใหม่', { duration: 6000 });
      } else if (status === 400 && message?.includes('duplicate')) {
        toast.error('สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปใหม่', { duration: 6000 });
      } else if (status === 400 && message?.includes('already')) {
        toast.error('มีรายการชำระเงินที่รอดำเนินการอยู่แล้ว', { duration: 6000 });
      } else {
        toast.error(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsProcessing(false);
      isSubmittingRef.current = false;
    }
  };

  const closeModal = () => {
    if (isProcessing) return; // ป้องกันการปิด modal ขณะกำลังประมวลผล
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

  // คำนวณเปอร์เซ็นต์โควต้าที่เหลือ
  const quotaPercentage = subscription
    ? Math.round(((subscription.remainingQuota ?? 0) / (subscription.quota ?? 1)) * 100)
    : 0;

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดแพ็คเกจ..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">แพ็คเกจ</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium">เลือกแพ็คเกจที่เหมาะกับธุรกิจของคุณ</p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 md:p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-red-100 rounded-lg">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium text-sm">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* Current Subscription */}
        {subscription && (
          <Card className="bg-gradient-to-br from-green-500 via-green-600 to-emerald-600 text-white border-0 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 md:w-64 h-40 md:h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-20 md:w-32 h-20 md:h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
                <div>
                  <p className="text-green-100 text-xs md:text-sm font-medium">แพ็คเกจปัจจุบัน</p>
                  <h3 className="text-xl md:text-2xl font-bold mt-1">{subscription.packageName || 'Standard'}</h3>
                  <Badge variant="success" size="sm" className="mt-2 bg-white/20 border-white/30 text-white">
                    ใช้งานอยู่
                  </Badge>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-green-100 text-xs md:text-sm font-medium">โควต้าคงเหลือ</p>
                  <p className="text-2xl md:text-3xl font-bold mt-1">
                    {subscription.remainingQuota?.toLocaleString() || 0}
                    <span className="text-base md:text-lg text-green-200"> / {subscription.quota?.toLocaleString() || 0}</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-green-100">การใช้งาน</span>
                  <span className="font-medium">{quotaPercentage}% คงเหลือ</span>
                </div>
                <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${quotaPercentage > 50 ? 'bg-white' : quotaPercentage > 20 ? 'bg-yellow-300' : 'bg-red-400'
                      }`}
                    style={{ width: `${quotaPercentage}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/20 flex flex-col sm:flex-row justify-between gap-2 text-sm">
                <div>
                  <span className="text-green-100">หมดอายุ: </span>
                  <span className="font-medium">
                    {subscription.expiresAt
                      ? new Date(subscription.expiresAt).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                      : '-'}
                  </span>
                </div>
                {quotaPercentage < 20 && (
                  <span className="text-yellow-200 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    โควต้าใกล้หมด
                  </span>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Bank Account Quick View - For Easy Copy */}
        {paymentInfo?.bankName && (
          <Card className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-blue-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-stretch">
              <div className="flex items-center gap-4 p-4 sm:p-5 flex-1">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-2xl shadow-lg shadow-blue-500/30 flex-shrink-0">
                  🏦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">บัญชีสำหรับโอนเงิน</p>
                  <p className="text-lg sm:text-xl font-black text-slate-900 font-mono tracking-wider truncate">
                    {paymentInfo.bankAccountNumber}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-slate-600 font-medium">{paymentInfo.bankName}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-600 font-medium">{paymentInfo.bankAccountName}</span>
                  </div>
                </div>
              </div>
              <div className="flex sm:flex-col items-center justify-center gap-2 p-3 sm:p-4 bg-white/50 border-t sm:border-t-0 sm:border-l border-blue-200">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentInfo.bankAccountNumber);
                    toast.success('คัดลอกเลขบัญชีแล้ว', { icon: '📋' });
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all shadow-lg shadow-blue-500/30 font-bold text-sm whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  คัดลอก
                </button>
                <button
                  onClick={() => {
                    const info = `${paymentInfo.bankName}\n${paymentInfo.bankAccountNumber}\n${paymentInfo.bankAccountName}`;
                    navigator.clipboard.writeText(info);
                    toast.success('คัดลอกข้อมูลทั้งหมดแล้ว', { icon: '✅' });
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold whitespace-nowrap"
                >
                  คัดลอกทั้งหมด
                </button>
              </div>
            </div>
          </Card>
        )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 pt-4">
            {packages.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((pkg, index) => (
              <Card
                key={pkg._id}
                hover
                className={`relative transition-all duration-500 rounded-[3rem] border-none shadow-premium-lg flex flex-col h-full overflow-hidden group ${
                  index === 1 ? 'ring-4 ring-emerald-500/20 scale-[1.02] z-10' : 'bg-white/80'
                }`}
                padding="none"
              >
                {/* Popular Badge */}
                {index === 1 && (
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500" />
                )}
                {index === 1 && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
                    <span className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-emerald-500/30 ring-4 ring-white">
                      ⭐ Most Popular
                    </span>
                  </div>
                )}

                <div className="p-10 flex flex-col h-full relative">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none group-hover:bg-emerald-500/10 transition-colors duration-700" />
                  
                  <div className="mb-8 mt-4 relative z-10">
                    <h3 className="font-black text-3xl text-slate-900 uppercase tracking-tight">{pkg.name}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-8 h-[2px] bg-slate-200" />
                      {pkg.description || 'Verified Protocol'}
                    </p>
                  </div>

                  <div className="mb-10 relative z-10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-6xl font-black text-slate-900 tracking-tighter">฿{pkg.price.toLocaleString()}</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">/ {pkg.durationDays} Days</span>
                    </div>
                    {pkg.priceUsdt && pkg.priceUsdt > 0 && (
                      <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                          ${pkg.priceUsdt} USDT Accepted
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 mb-10 flex-1 relative z-10">
                    <div className="flex items-center gap-4 p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/50 group-hover:bg-emerald-50 transition-colors">
                      <div className="p-3 bg-white rounded-xl shadow-sm">
                        <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-emerald-700 leading-none">{pkg.slipQuota.toLocaleString()}</p>
                        <p className="text-[9px] font-bold text-emerald-600/60 uppercase tracking-widest mt-1">Verification Credits</p>
                      </div>
                    </div>

                    <div className="space-y-3 pl-2">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <span className="text-xs font-bold text-slate-600">Real-time Slip Verification</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <span className="text-xs font-bold text-slate-600">All Thai Banks Supported</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <span className="text-xs font-bold text-slate-600">Instant LINE Notification</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant={index === 1 ? 'primary' : 'outline'}
                    fullWidth
                    onClick={() => handleSelectPackage(pkg)}
                    disabled={isProcessing}
                    className={cn(
                      "h-16 rounded-2xl font-black uppercase tracking-widest text-xs relative z-10",
                      index === 1 ? "shadow-emerald-500/20 shadow-2xl hover:translate-y-[-2px]" : "border-2 hover:bg-slate-50"
                    )}
                  >
                    Select Protocol
                  </Button>
                </div>
              </Card>
            ))}
          </div>
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={closeModal}
        title={`ซื้อแพ็คเกจ ${selectedPackage?.name || ''}`}
        size="lg"
      >
        {selectedPackage && (
          <div className="space-y-6">
            {/* Package Summary */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-900">{selectedPackage.name}</p>
                  <p className="text-sm text-gray-500">{selectedPackage.slipQuota.toLocaleString()} สลิป / {selectedPackage.durationDays} วัน</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-600">฿{selectedPackage.price.toLocaleString()}</p>
                  {selectedPackage.priceUsdt && selectedPackage.priceUsdt > 0 && (
                    <p className="text-sm text-gray-500">${selectedPackage.priceUsdt} USDT</p>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div>
              <label className="label">วิธีการชำระเงิน</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-4 rounded-xl border-2 transition-all ${paymentMethod === 'bank'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="text-2xl mb-2">🏦</div>
                  <p className="font-medium text-gray-900">โอนเงิน</p>
                  <p className="text-xs text-gray-500">ธนาคาร</p>
                </button>
                {selectedPackage.priceUsdt && selectedPackage.priceUsdt > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usdt')}
                    className={`p-4 rounded-xl border-2 transition-all ${paymentMethod === 'usdt'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <div className="text-2xl mb-2">💵</div>
                    <p className="font-medium text-gray-900">USDT</p>
                    <p className="text-xs text-gray-500">Crypto</p>
                  </button>
                )}
              </div>
            </div>

            {/* Bank Transfer */}
            {paymentMethod === 'bank' && (
              <div className="space-y-4">
                {/* Bank Info - Always Visible */}
                {paymentInfo?.bankName && paymentInfo?.bankAccountNumber ? (
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border-2 border-emerald-200 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-2xl shadow-lg shadow-emerald-500/30">
                        🏦
                      </div>
                      <div>
                        <p className="font-bold text-emerald-900 text-lg">โอนเงินมาที่บัญชีนี้</p>
                        <p className="text-sm text-emerald-600 font-medium">{paymentInfo.bankName}</p>
                      </div>
                    </div>

                    {/* Account Number - Large & Prominent */}
                    <div className="bg-white rounded-xl p-4 border-2 border-emerald-300 mb-4 shadow-inner">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider mb-1">เลขบัญชี</p>
                          <p className="text-2xl font-black text-slate-900 font-mono tracking-wider">
                            {paymentInfo.bankAccountNumber}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(paymentInfo.bankAccountNumber);
                            toast.success('คัดลอกเลขบัญชีแล้ว', { icon: '📋' });
                          }}
                          className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/30 font-bold text-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          คัดลอก
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg p-3 border border-emerald-100">
                        <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider mb-1">ชื่อบัญชี</p>
                        <p className="text-sm font-bold text-slate-900">{paymentInfo.bankAccountName}</p>
                      </div>
                      <div className="bg-emerald-100 rounded-lg p-3 border border-emerald-200">
                        <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-wider mb-1">ยอดที่ต้องโอน</p>
                        <p className="text-xl font-black text-emerald-700">฿{selectedPackage.price.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Quick Copy All Info */}
                    <button
                      type="button"
                      onClick={() => {
                        const info = `ธนาคาร: ${paymentInfo.bankName}\nเลขบัญชี: ${paymentInfo.bankAccountNumber}\nชื่อบัญชี: ${paymentInfo.bankAccountName}\nยอดโอน: ฿${selectedPackage.price.toLocaleString()}`;
                        navigator.clipboard.writeText(info);
                        toast.success('คัดลอกข้อมูลทั้งหมดแล้ว', { icon: '✅' });
                      }}
                      className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 rounded-xl transition-colors font-bold border border-emerald-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      คัดลอกข้อมูลทั้งหมด
                    </button>
                  </div>
                ) : (
                  /* No Bank Info Warning */
                  <div className="bg-amber-50 rounded-2xl p-5 border-2 border-amber-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl">
                        ⚠️
                      </div>
                      <div>
                        <p className="font-bold text-amber-900">ยังไม่มีข้อมูลบัญชีธนาคาร</p>
                        <p className="text-sm text-amber-700">กรุณาติดต่อผู้ดูแลระบบ</p>
                      </div>
                    </div>
                    <p className="text-xs text-amber-600 bg-amber-100 rounded-lg p-3">
                      💡 ผู้ดูแลระบบต้องตั้งค่าข้อมูลบัญชีธนาคารในหน้า ตั้งค่าระบบ ก่อนจึงจะสามารถรับชำระเงินได้
                    </p>
                  </div>
                )}

                {/* Slip Upload */}
                <div>
                  <label className="label">อัปโหลดสลิปการโอนเงิน</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="slip-upload"
                      disabled={isProcessing}
                    />
                    <label
                      htmlFor="slip-upload"
                      className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all ${slipPreview
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {slipPreview ? (
                        <div className="relative w-full h-full p-2">
                          <img
                            src={slipPreview}
                            alt="Slip preview"
                            className="w-full h-full object-contain rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setSlipFile(null);
                              setSlipPreview(null);
                            }}
                            className="absolute top-4 right-4 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm text-gray-600">คลิกเพื่ออัปโหลดสลิป</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP (สูงสุด 10MB)</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* USDT */}
            {paymentMethod === 'usdt' && (
              <div className="space-y-4">
                {paymentInfo?.usdtAddress && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
                    <p className="text-sm font-medium text-yellow-800 mb-2">ข้อมูลการชำระเงิน USDT</p>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-yellow-600">Network:</span> {paymentInfo.usdtNetwork || 'TRC20'}</p>
                      <p className="break-all"><span className="text-yellow-600">Address:</span> {paymentInfo.usdtAddress}</p>
                      <p className="font-bold text-yellow-900 mt-2">
                        ยอดโอน: ${selectedPackage.priceUsdt} USDT
                      </p>
                    </div>
                  </div>
                )}

                <Input
                  label="Transaction Hash"
                  placeholder="กรอก Transaction Hash"
                  value={transactionHash}
                  onChange={(e) => setTransactionHash(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="secondary"
                fullWidth
                onClick={closeModal}
                disabled={isProcessing}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleConfirmPayment}
                isLoading={isProcessing}
                loadingText="กำลังดำเนินการ..."
                disabled={isProcessing || (paymentMethod === 'bank' && !slipFile) || (paymentMethod === 'usdt' && !transactionHash)}
              >
                ยืนยันการชำระเงิน
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handlePayment}
        title="ยืนยันการชำระเงิน"
        message={`คุณต้องการซื้อแพ็คเกจ "${selectedPackage?.name}" ในราคา ${paymentMethod === 'bank'
            ? `฿${selectedPackage?.price.toLocaleString()}`
            : `$${selectedPackage?.priceUsdt} USDT`
          } หรือไม่?`}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        type="warning"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
