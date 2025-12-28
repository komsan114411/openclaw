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
import { Input } from '@/components/ui/Input';
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
      <div className="section-gap animate-fade pb-10">
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              แพ็คเกจ<span className="text-[#06C755]">ของฉัน</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              เลือกแพ็คเกจที่เหมาะกับความต้องการของคุณ
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Link href="/user/payments" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all">
                ✅ ตรวจสลิป
              </Button>
            </Link>
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
          <Card className="bg-slate-950 border border-[#06C755]/20 shadow-2xl overflow-hidden relative p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl mb-4 sm:mb-6" variant="glass">
            <div className="absolute top-0 right-0 w-48 sm:w-80 h-48 sm:h-80 bg-[#06C755]/5 rounded-full blur-[60px] sm:blur-[100px] -mr-24 sm:-mr-40 -mt-24 sm:-mt-40" />

            <div className="relative z-10">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 lg:gap-8">
                <div className="space-y-2 sm:space-y-4">
                  <p className="text-slate-400 text-[9px] sm:text-[10px] font-semibold">แพ็คเกจที่ใช้งานอยู่</p>
                  <div>
                    <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight">{subscription.packageName || 'แพ็คเกจมาตรฐาน'}</h3>
                    <div className="flex items-center gap-2 sm:gap-3 mt-2 sm:mt-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#06C755] animate-pulse" />
                      <span className="text-[9px] sm:text-[10px] font-semibold text-[#06C755]">ระบบทำงานปกติ</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 lg:gap-8">
                  <div className="space-y-1 sm:space-y-2">
                    <p className="text-slate-400 text-[9px] sm:text-[10px] font-semibold text-left sm:text-right">โควต้าคงเหลือ</p>
                    <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white text-left sm:text-right">
                      {subscription.remainingQuota?.toLocaleString() || 0}
                      <span className="text-lg sm:text-xl md:text-2xl text-slate-500 font-semibold ml-2">/ {subscription.quota?.toLocaleString() || 0}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 sm:mt-8 lg:mt-12 space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 sm:gap-0">
                  <div className="space-y-1">
                    <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400">การใช้งาน</span>
                    <p className="text-base sm:text-lg font-black text-white">{quotaPercentage}% <span className="text-slate-500 text-sm font-semibold">คงเหลือ</span></p>
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400">สถานะ</span>
                </div>
                <div className="h-3 sm:h-4 bg-white/[0.03] rounded-full overflow-hidden border border-white/5 p-0.5 sm:p-1">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      quotaPercentage > 50 ? 'bg-[#06C755] shadow-[0_0_15px_rgba(6,199,85,0.3)]' : quotaPercentage > 20 ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'
                    )}
                    style={{ width: `${quotaPercentage}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 lg:gap-8">
                  <div className="flex flex-col">
                    <span className="text-[8px] sm:text-[9px] font-semibold text-slate-400 mb-1">วันหมดอายุ</span>
                    <span className="text-xs sm:text-sm font-black text-white">
                      {subscription.expiresAt
                        ? new Date(subscription.expiresAt).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                        : 'ไม่มีกำหนด'}
                    </span>
                  </div>
                  {quotaPercentage < 20 && (
                    <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg sm:rounded-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span className="text-[9px] sm:text-[10px] font-semibold text-rose-500">โควต้าใกล้หมด</span>
                    </div>
                  )}
                </div>
                <div className="text-[8px] sm:text-[9px] font-semibold text-slate-500 font-mono">
                  ID: {subscription?._id?.toString().slice(-12).toUpperCase() || '---'}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Bank Account Quick View - For Easy Copy */}
        {paymentInfo?.bankAccountNumber && (
          <Card className="bg-slate-950 border border-white/5 overflow-hidden rounded-xl sm:rounded-2xl shadow-2xl mb-4 sm:mb-6" variant="glass">
            <div className="flex flex-col lg:flex-row items-stretch">
              <div className="flex items-center gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8 flex-1 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-24 sm:w-32 h-24 sm:h-32 bg-indigo-500/5 rounded-full blur-2xl sm:blur-3xl -ml-12 sm:-ml-16 -mt-12 sm:-mt-16" />
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white text-2xl sm:text-3xl shadow-lg flex-shrink-0 group-hover:scale-110 transition-transform">
                  🏦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-semibold mb-1 sm:mb-2">บัญชีรับเงิน</p>
                  <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white font-mono tracking-wider truncate">
                    {paymentInfo.bankAccountNumber}
                  </p>
                  <div className="flex items-center gap-2 sm:gap-3 mt-2 sm:mt-3 flex-wrap">
                    <span className="text-xs text-slate-400 font-semibold">{paymentInfo.bankName}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400 font-semibold truncate">{paymentInfo.bankAccountName}</span>
                  </div>
                </div>
              </div>
              <div className="flex lg:flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 bg-black/40 border-t lg:border-t-0 lg:border-l border-white/5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentInfo.bankAccountNumber);
                    toast.success('คัดลอกเลขบัญชีแล้ว', { icon: '📋' });
                  }}
                  className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-[#06C755] hover:bg-[#05B048] text-white rounded-xl sm:rounded-2xl transition-all shadow-lg shadow-[#06C755]/20 font-semibold text-xs sm:text-sm whitespace-nowrap"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  คัดลอกเลขบัญชี
                </button>
                <button
                  onClick={() => {
                    const info = `${paymentInfo.bankName}\n${paymentInfo.bankAccountNumber}\n${paymentInfo.bankAccountName}`;
                    navigator.clipboard.writeText(info);
                    toast.success('คัดลอกข้อมูลทั้งหมดแล้ว', { icon: '✅' });
                  }}
                  className="text-[8px] sm:text-[9px] font-semibold text-slate-400 hover:text-white transition-colors p-1.5 sm:p-2"
                >
                  คัดลอกทั้งหมด
                </button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 pt-4 sm:pt-6">
          {packages.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((pkg, index) => (
            <Card
              key={pkg._id}
              variant="glass"
              className={cn(
                "relative transition-all duration-700 rounded-xl sm:rounded-2xl border border-white/5 shadow-2xl flex flex-col h-full overflow-hidden group",
                index === 1 ? 'ring-2 sm:ring-4 ring-[#06C755]/20 scale-[1.01] sm:scale-[1.02] z-10' : ''
              )}
              padding="md"
            >
              {/* Popular Indicator */}
              {index === 1 && (
                <div className="absolute top-0 inset-x-0 h-1 sm:h-1.5 bg-gradient-to-r from-[#06C755] via-teal-500 to-indigo-600" />
              )}
              {index === 1 && (
                <div className="absolute -top-2 sm:-top-3 left-1/2 transform -translate-x-1/2 z-20">
                  <span className="px-4 sm:px-6 py-1 sm:py-2 bg-gradient-to-r from-[#06C755] to-teal-600 text-white text-[9px] sm:text-[10px] font-semibold rounded-full shadow-lg shadow-[#06C755]/20 ring-2 sm:ring-4 ring-slate-950">
                    แนะนำ
                  </span>
                </div>
              )}

              <div className="p-4 sm:p-6 lg:p-8 flex flex-col h-full relative">
                <div className="absolute top-0 right-0 w-32 sm:w-48 md:w-64 h-32 sm:h-48 md:h-64 bg-[#06C755]/5 rounded-full blur-[60px] sm:blur-[80px] -mr-16 sm:-mr-32 -mt-16 sm:-mt-32 pointer-events-none group-hover:scale-150 transition-transform duration-1000" />

                <div className="mb-6 sm:mb-8 lg:mb-10 mt-2 sm:mt-4 relative z-10">
                  <h3 className="font-black text-2xl sm:text-3xl md:text-4xl text-white tracking-tight leading-none group-hover:text-[#06C755] transition-colors">{pkg.name}</h3>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mt-2 sm:mt-4 flex items-center gap-2 sm:gap-3">
                    <span className="w-8 sm:w-10 h-0.5 bg-[#06C755]/20 group-hover:w-12 sm:group-hover:w-16 transition-all duration-500" />
                    {pkg.description || 'แพ็คเกจมาตรฐาน'}
                  </p>
                </div>

                <div className="mb-6 sm:mb-8 lg:mb-12 relative z-10">
                  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                    <span className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight">฿{pkg.price.toLocaleString()}</span>
                    <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500">/ {pkg.durationDays} วัน</span>
                  </div>
                  {pkg.priceUsdt && pkg.priceUsdt > 0 && (
                    <div className="mt-3 sm:mt-4 inline-flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 bg-[#06C755]/5 rounded-lg sm:rounded-xl border border-[#06C755]/10">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#06C755] animate-pulse" />
                      <p className="text-[9px] sm:text-[10px] font-semibold text-[#06C755]">
                        {pkg.priceUsdt} USDT
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8 lg:mb-12 flex-1 relative z-10">
                  <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 lg:p-5 bg-white/[0.02] rounded-xl sm:rounded-2xl border border-white/5 group-hover:bg-white/[0.04] transition-all duration-500">
                    <div className="p-2.5 sm:p-3.5 bg-slate-950 rounded-lg sm:rounded-xl border border-white/5 shadow-lg flex-shrink-0">
                      <svg className="w-5 h-5 sm:w-6 lg:w-7 text-[#06C755]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-2xl sm:text-3xl font-black text-white leading-none tracking-tight">{pkg.slipQuota.toLocaleString()}</p>
                      <p className="text-[8px] sm:text-[9px] font-semibold text-slate-400 mt-1 sm:mt-2">สลิปที่ตรวจสอบได้</p>
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-3 pl-1 sm:pl-2 pt-2 sm:pt-4">
                    <div className="flex items-center gap-3 sm:gap-4 group/item">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center text-[#06C755] border border-[#06C755]/20 group-hover/item:scale-110 transition-transform flex-shrink-0">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 group-hover/item:text-white transition-colors">ตรวจสอบสลิปแบบเรียลไทม์</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 group/item">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center text-[#06C755] border border-[#06C755]/20 group-hover/item:scale-110 transition-transform flex-shrink-0">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 group-hover/item:text-white transition-colors">รองรับธนาคารทั่วโลก</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 group/item">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg sm:rounded-xl bg-[#06C755]/10 flex items-center justify-center text-[#06C755] border border-[#06C755]/20 group-hover/item:scale-110 transition-transform flex-shrink-0">
                        <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 group-hover/item:text-white transition-colors">แจ้งเตือนอัตโนมัติ</span>
                    </div>
                  </div>
                </div>

                <Button
                  variant={index === 1 ? 'primary' : 'outline'}
                  fullWidth
                  onClick={() => handleSelectPackage(pkg)}
                  disabled={isProcessing}
                  className={cn(
                    "h-12 sm:h-14 lg:h-16 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm relative z-10 transition-all duration-500",
                    index === 1
                      ? "shadow-[#06C755]/20 shadow-lg sm:shadow-2xl hover:translate-y-[-2px] sm:hover:translate-y-[-4px] bg-[#06C755] hover:bg-[#05B048] text-white"
                      : "border-white/10 hover:border-[#06C755]/50 hover:bg-[#06C755] hover:text-white bg-white/[0.02]"
                  )}
                >
                  {index === 1 ? '💎 เลือกแพ็คเกจนี้' : 'เลือกแพ็คเกจ'}
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
        title="ชำระเงิน"
        size="lg"
      >
        {selectedPackage && (
          <div className="space-y-8 p-2">
            <div>
              <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-3 sm:mb-4">แพ็คเกจที่เลือก</p>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-[#06C755]/5 rounded-full blur-xl sm:blur-2xl -mr-12 sm:-mr-16 -mt-12 sm:-mt-16 group-hover:bg-[#06C755]/10 transition-colors" />
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 relative z-10">
                  <div>
                    <p className="text-lg sm:text-xl font-black text-white tracking-tight">{selectedPackage.name}</p>
                    <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mt-1">
                      {selectedPackage.slipQuota.toLocaleString()} สลิป / {selectedPackage.durationDays} วัน
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-2xl sm:text-3xl font-black text-[#06C755]">฿{selectedPackage.price.toLocaleString()}</p>
                    {selectedPackage.priceUsdt && selectedPackage.priceUsdt > 0 && (
                      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mt-1">${selectedPackage.priceUsdt} USDT</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-3 sm:mb-4">ช่องทางการชำระเงิน</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={cn(
                    "p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-500 text-left group relative overflow-hidden",
                    paymentMethod === 'bank'
                      ? 'border-[#06C755]/50 bg-[#06C755]/10'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                  )}
                >
                  <div className="text-2xl sm:text-3xl mb-3 sm:mb-4 group-hover:scale-110 transition-transform">🏦</div>
                  <p className="font-black text-white text-sm sm:text-base">โอนเงินผ่านธนาคาร</p>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mt-1">โอนเงินตรง</p>
                  {paymentMethod === 'bank' && (
                    <div className="absolute top-3 sm:top-4 right-3 sm:right-4 w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-[#06C755] shadow-[0_0_10px_rgba(6,199,85,0.5)]" />
                  )}
                </button>
                {selectedPackage.priceUsdt && selectedPackage.priceUsdt > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usdt')}
                    className={cn(
                      "p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-500 text-left group relative overflow-hidden",
                      paymentMethod === 'usdt'
                        ? 'border-[#06C755]/50 bg-[#06C755]/10'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                    )}
                  >
                    <div className="text-2xl sm:text-3xl mb-3 sm:mb-4 group-hover:scale-110 transition-transform">💵</div>
                    <p className="font-black text-white text-sm sm:text-base">USDT</p>
                    <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mt-1">สกุลเงินดิจิทัล</p>
                    {paymentMethod === 'usdt' && (
                      <div className="absolute top-3 sm:top-4 right-3 sm:right-4 w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-[#06C755] shadow-[0_0_10px_rgba(6,199,85,0.5)]" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Bank Transfer */}
            {paymentMethod === 'bank' && (
              <div className="space-y-4 sm:space-y-6">
                {paymentInfo?.bankAccountNumber ? (
                  <div className="bg-slate-950 border border-[#06C755]/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-[#06C755]/5 rounded-full blur-xl sm:blur-2xl -mr-12 sm:-mr-16 -mt-12 sm:-mt-16" />

                    <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 mb-4 sm:mb-6 lg:mb-8">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white text-xl sm:text-2xl shadow-lg flex-shrink-0">
                        🏦
                      </div>
                      <div>
                        <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">บัญชีรับเงิน</p>
                        <p className="text-base sm:text-lg font-black text-white">{paymentInfo.bankName}</p>
                      </div>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 shadow-inner relative group">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] sm:text-[9px] text-slate-400 font-semibold mb-1 sm:mb-2">เลขบัญชี</p>
                          <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white font-mono tracking-wider break-all">
                            {paymentInfo.bankAccountNumber}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(paymentInfo.bankAccountNumber);
                            toast.success('คัดลอกเลขบัญชีแล้ว');
                          }}
                          className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-3 bg-[#06C755] hover:bg-[#05B048] text-white rounded-lg sm:rounded-xl transition-all shadow-lg shadow-[#06C755]/20 font-semibold text-xs sm:text-sm w-full sm:w-auto justify-center"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          คัดลอก
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl sm:rounded-2xl p-4 sm:p-5">
                        <p className="text-[8px] sm:text-[9px] text-slate-400 font-semibold mb-1 sm:mb-2">ชื่อบัญชี</p>
                        <p className="text-xs sm:text-sm font-black text-white truncate">{paymentInfo.bankAccountName}</p>
                      </div>
                      <div className="bg-[#06C755]/10 border border-[#06C755]/20 rounded-xl sm:rounded-2xl p-4 sm:p-5">
                        <p className="text-[8px] sm:text-[9px] text-[#06C755] font-semibold mb-1 sm:mb-2">จำนวนเงิน</p>
                        <p className="text-xl sm:text-2xl font-black text-[#06C755]">฿{selectedPackage.price.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-rose-500/10 flex items-center justify-center text-white text-2xl sm:text-3xl mx-auto mb-3 sm:mb-4">
                      ⚠️
                    </div>
                    <p className="font-black text-white text-sm sm:text-base mb-1 sm:mb-2">ไม่พบข้อมูลบัญชี</p>
                    <p className="text-xs sm:text-sm text-slate-400">กรุณาติดต่อผู้ดูแลระบบ</p>
                  </div>
                )}

                <div>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-3 sm:mb-4">อัปโหลดสลิปการชำระเงิน</p>
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
                      className={cn(
                        "flex flex-col items-center justify-center w-full h-48 sm:h-64 border-2 border-dashed rounded-xl sm:rounded-2xl cursor-pointer transition-all duration-500 relative overflow-hidden",
                        slipPreview
                          ? 'border-[#06C755]/50 bg-[#06C755]/5'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                      )}
                    >
                      {slipPreview ? (
                        <div className="relative w-full h-full p-3 sm:p-4 animate-in fade-in zoom-in duration-500">
                          <img
                            src={slipPreview}
                            alt="Slip preview"
                            className="w-full h-full object-contain rounded-xl sm:rounded-2xl shadow-2xl"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setSlipFile(null);
                              setSlipPreview(null);
                            }}
                            className="absolute top-3 sm:top-6 right-3 sm:right-6 p-1.5 sm:p-2 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow-lg transform hover:scale-110 transition-all z-20"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center p-6 sm:p-8">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/[0.03] rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 border border-white/5 shadow-lg">
                            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">คลิกเพื่อเลือกรูปภาพ</p>
                          <p className="text-[8px] sm:text-[9px] text-slate-500 mt-1 sm:mt-2">ขนาดสูงสุด: 10MB (JPG/PNG)</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'usdt' && (
              <div className="space-y-4 sm:space-y-6">
                {paymentInfo?.usdtAddress && (
                  <div className="bg-slate-950 border border-[#06C755]/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-[#06C755]/5 rounded-full blur-xl sm:blur-2xl -mr-12 sm:-mr-16 -mt-12 sm:-mt-16" />
                    <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-3 sm:mb-4">ช่องทาง USDT</p>
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex justify-between items-center text-xs sm:text-sm font-semibold">
                        <span className="text-slate-400">เครือข่าย</span>
                        <span className="text-[#06C755]">{paymentInfo.usdtNetwork || 'TRC20'}</span>
                      </div>
                      <div className="p-3 sm:p-4 bg-black/40 border border-white/5 rounded-xl sm:rounded-2xl break-all">
                        <p className="text-[8px] sm:text-[9px] text-slate-400 font-semibold mb-1 sm:mb-2">ที่อยู่ USDT</p>
                        <p className="text-xs sm:text-sm font-black text-white font-mono break-all">{paymentInfo.usdtAddress}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400">จำนวนเงิน</span>
                        <span className="text-lg sm:text-xl font-black text-[#06C755]">${selectedPackage.priceUsdt} USDT</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2 sm:space-y-3">
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">Transaction Hash</p>
                  <Input
                    placeholder="กรอก Transaction Hash"
                    value={transactionHash}
                    onChange={(e) => setTransactionHash(e.target.value)}
                    disabled={isProcessing}
                    className="h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-white/[0.03] border-white/10 text-white text-sm font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
              <Button
                variant="ghost"
                fullWidth
                onClick={closeModal}
                disabled={isProcessing}
                className="h-11 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm text-slate-400 hover:text-white transition-all"
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleConfirmPayment}
                isLoading={isProcessing}
                disabled={isProcessing || (paymentMethod === 'bank' && !slipFile) || (paymentMethod === 'usdt' && !transactionHash)}
                className="h-11 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm bg-[#06C755] hover:bg-[#05B048] shadow-lg shadow-[#06C755]/20 transition-all"
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
        message={`คุณต้องการชำระเงินสำหรับแพ็คเกจ "${selectedPackage?.name}" จำนวน ${paymentMethod === 'bank'
          ? `฿${selectedPackage?.price.toLocaleString()}`
          : `$${selectedPackage?.priceUsdt} USDT`
          } ใช่หรือไม่?`}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        type="warning"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
