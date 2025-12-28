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
        <div className="page-header relative z-10">
          <div className="space-y-1 sm:space-y-2">
            <h1 className="page-title-responsive">
              Subscription <span className="text-emerald-400">Matrix</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Scale Your Operational Capacity via Autonomous Protocols
            </p>
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
          <Card className="bg-slate-950 border border-emerald-500/20 shadow-2xl overflow-hidden relative p-8 sm:p-12 rounded-[3rem]" variant="glass">
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] -mr-40 -mt-40 animate-pulse-slow" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] -ml-32 -mb-32 animate-pulse" />

            <div className="relative z-10">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 md:gap-12">
                <div className="space-y-4">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Operational Protocol Active</p>
                  <div>
                    <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase">{subscription.packageName || 'STANDARD_CORE'}</h3>
                    <div className="flex items-center gap-3 mt-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">System Operational</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8 lg:gap-16">
                  <div className="space-y-2">
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest text-left sm:text-right">Telemetric Quota Remaining</p>
                    <p className="text-4xl md:text-6xl font-black text-white tracking-tighter text-left sm:text-right">
                      {subscription.remainingQuota?.toLocaleString() || 0}
                      <span className="text-xl md:text-2xl text-slate-700 font-black ml-2 uppercase">/ {subscription.quota?.toLocaleString() || 0}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-12 space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Utilization</span>
                    <p className="text-lg font-black text-white">{quotaPercentage}% <span className="text-slate-700 tracking-tighter">EFFICIENCY_RESERVE</span></p>
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Health Status</span>
                </div>
                <div className="h-4 bg-white/[0.03] rounded-full overflow-hidden border border-white/5 p-1">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      quotaPercentage > 50 ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : quotaPercentage > 20 ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'
                    )}
                    style={{ width: `${quotaPercentage}%` }}
                  />
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-8">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Expiration Matrix</span>
                    <span className="text-sm font-black text-white tracking-tight">
                      {subscription.expiresAt
                        ? new Date(subscription.expiresAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }).toUpperCase()
                        : 'NEVER_EXPIRES'}
                    </span>
                  </div>
                  {quotaPercentage < 20 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Critically Low Quota</span>
                    </div>
                  )}
                </div>
                <div className="text-[9px] font-black text-slate-700 uppercase tracking-[0.4em] font-mono">
                  MATRIX_ID: {subscription?._id?.toString().slice(-12).toUpperCase() || 'CORE_NULL'}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Bank Account Quick View - For Easy Copy */}
        {paymentInfo?.bankAccountNumber && (
          <Card className="bg-slate-950 border border-white/5 overflow-hidden rounded-[2.5rem] shadow-2xl" variant="glass">
            <div className="flex flex-col lg:flex-row items-stretch">
              <div className="flex items-center gap-6 p-8 sm:p-10 flex-1 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -ml-16 -mt-16" />
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white text-3xl shadow-2xl flex-shrink-0 group-hover:scale-110 transition-transform">
                  🏦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em] mb-2">Settlement Endpoint</p>
                  <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-widest truncate">
                    {paymentInfo.bankAccountNumber}
                  </p>
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="text-xs text-slate-400 font-black uppercase tracking-widest">{paymentInfo.bankName}</span>
                    <span className="text-slate-800">•</span>
                    <span className="text-xs text-slate-400 font-black uppercase tracking-widest">{paymentInfo.bankAccountName}</span>
                  </div>
                </div>
              </div>
              <div className="flex lg:flex-col items-center justify-center gap-3 p-6 sm:p-8 bg-black/40 border-t lg:border-t-0 lg:border-l border-white/5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(paymentInfo.bankAccountNumber);
                    toast.success('DEPOS_MATRIX_COPIED', { icon: '📋' });
                  }}
                  className="flex items-center gap-3 px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl transition-all shadow-lg shadow-emerald-500/20 font-black text-[10px] uppercase tracking-widest whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Serial
                </button>
                <button
                  onClick={() => {
                    const info = `${paymentInfo.bankName}\n${paymentInfo.bankAccountNumber}\n${paymentInfo.bankAccountName}`;
                    navigator.clipboard.writeText(info);
                    toast.success('FULL_LEDGER_COPIED', { icon: '✅' });
                  }}
                  className="text-[9px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors p-2"
                >
                  Copy All Metrics
                </button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 pt-10">
          {packages.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((pkg, index) => (
            <Card
              key={pkg._id}
              variant="glass"
              className={`relative transition-all duration-700 rounded-[3rem] border border-white/5 shadow-2xl flex flex-col h-full overflow-hidden group p-1 ${index === 1 ? 'ring-4 ring-emerald-500/10 scale-[1.02] z-10' : ''
                }`}
              padding="none"
            >
              {/* Popular Indicator */}
              {index === 1 && (
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-indigo-600 animate-gradient-x" />
              )}
              {index === 1 && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
                  <span className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-full shadow-2xl shadow-emerald-500/20 ring-4 ring-slate-950">
                    Standard Issue
                  </span>
                </div>
              )}

              <div className="p-10 flex flex-col h-full relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none group-hover:scale-150 transition-transform duration-1000" />

                <div className="mb-10 mt-4 relative z-10">
                  <h3 className="font-black text-3xl md:text-4xl text-white uppercase tracking-tighter leading-none group-hover:text-emerald-400 transition-colors">{pkg.name}</h3>
                  <p className="text-[10px] font-black text-slate-500 mt-4 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span className="w-10 h-0.5 bg-emerald-500/20 group-hover:w-16 transition-all duration-500" />
                    {pkg.description || 'Verified Core'}
                  </p>
                </div>

                <div className="mb-12 relative z-10">
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black text-white tracking-tighter">฿{pkg.price.toLocaleString()}</span>
                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">/ {pkg.durationDays} Days</span>
                  </div>
                  {pkg.priceUsdt && pkg.priceUsdt > 0 && (
                    <div className="mt-4 inline-flex items-center gap-2.5 px-4 py-1.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 backdrop-blur-md">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                        {pkg.priceUsdt} USDT Accepted
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 mb-12 flex-1 relative z-10">
                  <div className="flex items-center gap-5 p-5 bg-white/[0.02] rounded-3xl border border-white/5 group-hover:bg-white/[0.04] transition-all duration-500 shadow-inner">
                    <div className="p-3.5 bg-slate-950 rounded-2xl border border-white/5 shadow-2xl">
                      <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-3xl font-black text-white leading-none tracking-tighter">{pkg.slipQuota.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-2">Audit Credits</p>
                    </div>
                  </div>

                  <div className="space-y-4 pl-2 pt-4">
                    <div className="flex items-center gap-4 group/item">
                      <div className="w-6 h-6 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover/item:scale-110 transition-transform">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover/item:text-white transition-colors">Real-time Slip Audit</span>
                    </div>
                    <div className="flex items-center gap-4 group/item">
                      <div className="w-6 h-6 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover/item:scale-110 transition-transform">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover/item:text-white transition-colors">Global Bank Gateway</span>
                    </div>
                    <div className="flex items-center gap-4 group/item">
                      <div className="w-6 h-6 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover/item:scale-110 transition-transform">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover/item:text-white transition-colors">Neural Notifications</span>
                    </div>
                  </div>
                </div>

                <Button
                  variant={index === 1 ? 'primary' : 'outline'}
                  fullWidth
                  onClick={() => handleSelectPackage(pkg)}
                  disabled={isProcessing}
                  className={cn(
                    "h-16 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] relative z-10 transition-all duration-500",
                    index === 1
                      ? "shadow-emerald-500/20 shadow-2xl hover:translate-y-[-4px] bg-emerald-500 hover:bg-emerald-400 text-white"
                      : "border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500 hover:text-white bg-white/[0.02]"
                  )}
                >
                  DEPLOY PROTOCOL
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
        title="PROTOCOL DEPLOYMENT: SETTLEMENT"
        size="lg"
      >
        {selectedPackage && (
          <div className="space-y-8 p-2">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Selected Module</p>
              <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
                <div className="flex justify-between items-center relative z-10">
                  <div>
                    <p className="text-xl font-black text-white tracking-tight uppercase">{selectedPackage.name}</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                      {selectedPackage.slipQuota.toLocaleString()} CREDITS / {selectedPackage.durationDays} DAYS
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-emerald-400 tracking-tighter">฿{selectedPackage.price.toLocaleString()}</p>
                    {selectedPackage.priceUsdt && selectedPackage.priceUsdt > 0 && (
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">${selectedPackage.priceUsdt} USDT</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Transmission Channel</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={cn(
                    "p-6 rounded-[2rem] border-2 transition-all duration-500 text-left group relative overflow-hidden",
                    paymentMethod === 'bank'
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                  )}
                >
                  <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">🏦</div>
                  <p className="font-black text-white uppercase tracking-tighter">Bank Ledger</p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Direct Transfer</p>
                  {paymentMethod === 'bank' && (
                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                  )}
                </button>
                {selectedPackage.priceUsdt && selectedPackage.priceUsdt > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usdt')}
                    className={cn(
                      "p-6 rounded-[2rem] border-2 transition-all duration-500 text-left group relative overflow-hidden",
                      paymentMethod === 'usdt'
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                    )}
                  >
                    <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">💵</div>
                    <p className="font-black text-white uppercase tracking-tighter">USDT Node</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Digital Asset</p>
                    {paymentMethod === 'usdt' && (
                      <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Bank Transfer */}
            {paymentMethod === 'bank' && (
              <div className="space-y-6">
                {paymentInfo?.bankAccountNumber ? (
                  <div className="bg-slate-950 border border-emerald-500/20 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16" />

                    <div className="flex items-center gap-5 mb-8">
                      <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white text-2xl shadow-2xl">
                        🏦
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Destination Protocol</p>
                        <p className="text-lg font-black text-white uppercase tracking-tight">{paymentInfo.bankName}</p>
                      </div>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-2xl p-6 mb-6 shadow-inner relative group">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em] mb-2">Account Serial Matrix</p>
                          <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-[0.2em]">
                            {paymentInfo.bankAccountNumber}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(paymentInfo.bankAccountNumber);
                            toast.success('DEPOS_MATRIX_COPIED');
                          }}
                          className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/20 font-black text-[10px] uppercase tracking-widest"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                        <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em] mb-2">Legal Holder</p>
                        <p className="text-xs font-black text-white uppercase tracking-tight">{paymentInfo.bankAccountName}</p>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                        <p className="text-[9px] text-emerald-500 uppercase font-black tracking-[0.2em] mb-1">Required Asset</p>
                        <p className="text-2xl font-black text-emerald-400 tracking-tighter">฿{selectedPackage.price.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-[2rem] p-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-white text-3xl mx-auto mb-4">
                      ⚠️
                    </div>
                    <p className="font-black text-white uppercase tracking-tight">Endpoint Not Initialized</p>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-2">Contact System Administrator for settlement parameters.</p>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Audit Telemetry (Slip Upload)</p>
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
                        "flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-[2.5rem] cursor-pointer transition-all duration-500 relative overflow-hidden",
                        slipPreview
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                      )}
                    >
                      {slipPreview ? (
                        <div className="relative w-full h-full p-4 animate-in fade-in zoom-in duration-500">
                          <img
                            src={slipPreview}
                            alt="Slip preview"
                            className="w-full h-full object-contain rounded-2xl shadow-2xl"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setSlipFile(null);
                              setSlipPreview(null);
                            }}
                            className="absolute top-6 right-6 p-2 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow-lg transform hover:scale-110 transition-all z-20"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center p-8">
                          <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5 shadow-2xl">
                            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Initialize Upload</p>
                          <p className="text-[9px] text-slate-600 uppercase tracking-widest mt-2">Maximum Payload: 10MB (JPG/PNG)</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'usdt' && (
              <div className="space-y-6">
                {paymentInfo?.usdtAddress && (
                  <div className="bg-slate-950 border border-emerald-500/20 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Digital Asset Protocol</p>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-600">Network Architecture</span>
                        <span className="text-emerald-400">{paymentInfo.usdtNetwork || 'TRC20'}</span>
                      </div>
                      <div className="p-4 bg-black/40 border border-white/5 rounded-2xl break-all">
                        <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em] mb-2">Node Encryption Address</p>
                        <p className="text-sm font-black text-white font-mono">{paymentInfo.usdtAddress}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Required Asset</span>
                        <span className="text-xl font-black text-emerald-400 tracking-tighter">${selectedPackage.priceUsdt} USDT</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Hash Verification Matrix</p>
                  <Input
                    placeholder="ENTER_TRANSACTION_HASH_SERIAL"
                    value={transactionHash}
                    onChange={(e) => setTransactionHash(e.target.value)}
                    disabled={isProcessing}
                    className="h-14 rounded-2xl bg-white/[0.03] border-white/10 text-white font-black font-mono"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <Button
                variant="ghost"
                fullWidth
                onClick={closeModal}
                disabled={isProcessing}
                className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-500 hover:text-white"
              >
                Abort
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleConfirmPayment}
                isLoading={isProcessing}
                disabled={isProcessing || (paymentMethod === 'bank' && !slipFile) || (paymentMethod === 'usdt' && !transactionHash)}
                className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
              >
                Authorize Deployment
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
        title="LEGACY_PROTOCOL_AUTHORIZATION"
        message={`AUTHORIZE_DEPLOYMENT: "${selectedPackage?.name?.toUpperCase()}" AT COST ${paymentMethod === 'bank'
          ? `฿${selectedPackage?.price.toLocaleString()}`
          : `$${selectedPackage?.priceUsdt} USDT`
          }?`}
        confirmText="AUTHORIZE"
        cancelText="ABORT"
        type="warning"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
