'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api, { packagesApi, walletApi, paymentsApi } from '@/lib/api';
import { useWalletStore } from '@/store/wallet';
import { Package } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import {
  Wallet,
  Gem,
  FileText,
  Bot,
  Ban,
  AlertTriangle,
  Check,
  X,
  ClipboardList,
  Loader2,
  Sparkles,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';

export default function UserPackagesPage() {
  // ===== STATE =====
  const [packages, setPackages] = useState<Package[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<{ success: boolean; message: string } | null>(null);

  // Purchase eligibility
  const [eligibility, setEligibility] = useState<{
    canPurchase: boolean;
    purchaseCount: number;
    maxPurchases: number | null;
    remainingPurchases: number | null;
  } | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);

  // ===== FETCH DATA =====
  const fetchBalance = async () => {
    try {
      const balanceRes = await walletApi.getBalance();
      setBalance(balanceRes.data.balance || 0);
      return balanceRes.data.balance || 0;
    } catch {
      return balance;
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [packagesRes, balanceRes] = await Promise.all([
        packagesApi.getAll(),
        walletApi.getBalance().catch(() => ({ data: { balance: 0 } })),
      ]);

      const allPackages: Package[] = packagesRes.data.packages || [];
      setBalance(balanceRes.data.balance || 0);

      // Filter out packages that user has already purchased max times
      const limitedPackages = allPackages.filter(
        (pkg) => pkg.maxPurchasesPerUser && pkg.maxPurchasesPerUser > 0
      );

      if (limitedPackages.length > 0) {
        const eligibilityResults = await Promise.all(
          limitedPackages.map((pkg) =>
            paymentsApi.checkEligibility(pkg._id).catch(() => ({
              data: { canPurchase: true, purchaseCount: 0, maxPurchases: null, remainingPurchases: null },
            }))
          )
        );

        const exhaustedIds = new Set<string>();
        limitedPackages.forEach((pkg, index) => {
          if (!eligibilityResults[index].data.canPurchase) {
            exhaustedIds.add(pkg._id);
          }
        });

        setPackages(allPackages.filter((pkg) => !exhaustedIds.has(pkg._id)));
      } else {
        setPackages(allPackages);
      }
    } catch (err: unknown) {
      console.error('Error fetching data:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Refetch when page is restored from bfcache (browser back/forward)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        fetchData();
      }
    };

    // Refetch when tab regains focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ===== HANDLERS =====
  const handleBuyClick = async (pkg: Package) => {
    setSelectedPackage(pkg);
    setPurchaseResult(null);
    setEligibility(null);
    setIsLoadingBalance(true);
    setIsCheckingEligibility(true);
    setShowModal(true);

    // Fetch fresh balance and check eligibility when opening modal
    const [_, eligibilityRes] = await Promise.all([
      fetchBalance(),
      paymentsApi.checkEligibility(pkg._id).catch(() => ({ data: { canPurchase: true, purchaseCount: 0, maxPurchases: null, remainingPurchases: null } })),
    ]);

    setEligibility(eligibilityRes.data);
    setIsLoadingBalance(false);
    setIsCheckingEligibility(false);
  };

  const handleCloseModal = () => {
    if (isPurchasing) return;
    setShowModal(false);
    setSelectedPackage(null);
    setPurchaseResult(null);
    setEligibility(null);
  };

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    setIsPurchasing(true);
    setPurchaseResult(null);

    // Fetch fresh balance before purchase to prevent race condition
    const freshBalance = await fetchBalance();
    if (freshBalance < selectedPackage.price) {
      setPurchaseResult({
        success: false,
        message: `เครดิตไม่เพียงพอ (มี ฿${freshBalance.toLocaleString()} ต้องการ ฿${selectedPackage.price.toLocaleString()})`
      });
      setIsPurchasing(false);
      return;
    }

    try {
      const response = await api.post(`/packages/${selectedPackage._id}/purchase`);
      const data = response.data;

      if (data.success) {
        setPurchaseResult({ success: true, message: data.message || 'ซื้อแพ็คเกจสำเร็จ!' });
        // ALWAYS use balance from API response - it's the source of truth
        if (typeof data.balance === 'number') {
          setBalance(data.balance);
        } else {
          // If API didn't return balance, fetch fresh balance
          await fetchBalance();
        }
        // Refresh wallet balance in global store
        useWalletStore.getState().fetchBalance(true);

        // Remove package from list if it's now exhausted
        if (selectedPackage.maxPurchasesPerUser && selectedPackage.maxPurchasesPerUser > 0) {
          try {
            const eligRes = await paymentsApi.checkEligibility(selectedPackage._id);
            if (!eligRes.data.canPurchase) {
              setPackages((prev) => prev.filter((p) => p._id !== selectedPackage._id));
            }
          } catch {
            // Safety: still remove if we can't verify (err on the side of hiding)
          }
        }

      } else {
        setPurchaseResult({ success: false, message: data.message || 'เกิดข้อผิดพลาด' });
        // Refresh balance in case it changed
        await fetchBalance();
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      const message = axiosError.response?.data?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      setPurchaseResult({ success: false, message });
      // Refresh balance on error
      await fetchBalance();
    } finally {
      setIsPurchasing(false);
    }
  };


  const hasEnoughBalance = selectedPackage && !isLoadingBalance ? balance >= selectedPackage.price : true;
  const canPurchase = eligibility?.canPurchase ?? true;
  const isEligibilityLoading = isCheckingEligibility || isLoadingBalance;

  // ===== LOADING =====
  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดแพ็คเกจ..." />
      </DashboardLayout>
    );
  }

  // ===== ERROR =====
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p className="text-red-500 text-lg">{error}</p>
          <Button onClick={() => window.location.reload()}>ลองใหม่</Button>
        </div>
      </DashboardLayout>
    );
  }

  // ===== MAIN =====
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
                เลือกแพ็กเกจ
              </h1>
              <p className="text-slate-400 text-sm">เลือกแพ็คเกจที่เหมาะกับการใช้งานของคุณ</p>
            </div>

            {/* Balance Card */}
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl px-5 py-3 backdrop-blur-sm">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">เครดิตคงเหลือ</p>
                <p className="text-2xl font-black text-emerald-400">฿{balance.toLocaleString()}</p>
              </div>
              <Link href="/user/wallet">
                <Button variant="primary" size="sm" className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 h-12 px-5 rounded-xl gap-2 shadow-lg shadow-emerald-500/20">
                  <Wallet className="w-4 h-4" /> เติมเครดิต
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Packages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {packages.map((pkg) => {
            const canAfford = balance >= pkg.price;
            const isRecommended = pkg.isRecommended;

            return (
              <div
                key={pkg._id}
                className={cn(
                  'relative group rounded-2xl transition-all duration-500 hover:-translate-y-1',
                  isRecommended && 'lg:scale-[1.02]'
                )}
              >
                {/* Glow Effect for Recommended */}
                {isRecommended && (
                  <div className="absolute -inset-[2px] bg-gradient-to-r from-[#06C755] via-emerald-400 to-[#06C755] rounded-2xl opacity-75 blur-sm group-hover:opacity-100 transition-opacity" />
                )}

                <div
                  className={cn(
                    'relative h-full flex flex-col bg-[#0D1117] border rounded-2xl overflow-hidden transition-all duration-300',
                    isRecommended
                      ? 'border-[#06C755]/50'
                      : 'border-white/10 hover:border-white/20'
                  )}
                >
                  {/* Header with Badges */}
                  <div className={cn(
                    'px-5 py-4 border-b',
                    isRecommended
                      ? 'bg-gradient-to-r from-[#06C755]/20 via-emerald-500/10 to-[#06C755]/20 border-[#06C755]/20'
                      : 'bg-white/[0.02] border-white/5'
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h2 className="text-xl font-black text-white truncate">{pkg.name}</h2>
                          {isRecommended && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#06C755] text-white text-xs font-bold rounded-full shadow-lg shadow-[#06C755]/30">
                              <Sparkles className="w-3 h-3" />
                              แนะนำ
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {pkg.durationDays} วัน
                          </span>
                          {pkg.maxPurchasesPerUser && pkg.maxPurchasesPerUser > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
                              <Zap className="w-3 h-3" />
                              จำกัด {pkg.maxPurchasesPerUser} ครั้ง
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Price Section */}
                  <div className="px-5 py-5">
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-3xl sm:text-4xl font-black text-white">฿{pkg.price.toLocaleString()}</span>
                    </div>
                    {pkg.slipQuota > 0 && (
                      <p className="text-xs text-slate-400">
                        เฉลี่ย <span className="text-[#06C755] font-bold">฿{(pkg.price / pkg.slipQuota).toFixed(2)}</span> ต่อสลิป
                      </p>
                    )}
                  </div>

                  {/* Quota Section */}
                  <div className="px-5 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Slip Quota */}
                      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/10 rounded-xl p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-xl font-black text-white leading-none">{pkg.slipQuota.toLocaleString()}</p>
                            <p className="text-xs text-slate-400 mt-0.5">สลิป</p>
                          </div>
                        </div>
                      </div>
                      {/* AI Quota */}
                      <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/10 rounded-xl p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Bot className="w-5 h-5 text-violet-400" />
                          </div>
                          <div>
                            <p className="text-xl font-black text-violet-300 leading-none">{(pkg.aiQuota || 0).toLocaleString()}</p>
                            <p className="text-xs text-slate-400 mt-0.5">AI ตอบกลับ</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="px-5 pb-5 flex-1">
                    <ul className="space-y-2">
                      {pkg.features && pkg.features.length > 0 ? (
                        pkg.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-[#06C755] flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))
                      ) : (
                        <>
                          <li className="flex items-start gap-2 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-[#06C755] flex-shrink-0 mt-0.5" />
                            <span>ตรวจสลิปแบบเรียลไทม์</span>
                          </li>
                          <li className="flex items-start gap-2 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-[#06C755] flex-shrink-0 mt-0.5" />
                            <span>รองรับทุกธนาคาร</span>
                          </li>
                          {(pkg.aiQuota || 0) > 0 && (
                            <li className="flex items-start gap-2 text-sm text-slate-300">
                              <Check className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                              <span>AI ตอบกลับอัตโนมัติ</span>
                            </li>
                          )}
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Buy Button */}
                  <div className="px-5 pb-5 mt-auto">
                    <Button
                      variant={isRecommended ? 'primary' : 'outline'}
                      fullWidth
                      onClick={() => handleBuyClick(pkg)}
                      className={cn(
                        'h-12 rounded-xl font-bold text-sm transition-all duration-300',
                        isRecommended
                          ? 'bg-gradient-to-r from-[#06C755] to-emerald-500 hover:from-[#05a347] hover:to-emerald-600 text-white shadow-lg shadow-[#06C755]/30 hover:shadow-[#06C755]/50'
                          : 'border-white/20 hover:bg-[#06C755] hover:text-white hover:border-[#06C755] hover:shadow-lg hover:shadow-[#06C755]/20'
                      )}
                    >
                      {isRecommended ? (
                        <>
                          <Gem className="w-4 h-4 mr-2" />
                          ซื้อเลย
                        </>
                      ) : (
                        'เลือกแพ็คเกจนี้'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {packages.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Gem className="w-10 h-10 text-slate-600" />
            </div>
            <p className="text-slate-400 text-lg font-medium">ไม่พบแพ็คเกจ</p>
            <p className="text-slate-400 text-sm mt-1">กรุณาติดต่อผู้ดูแลระบบ</p>
          </div>
        )}
      </div>

      {/* ===== PURCHASE MODAL ===== */}
      <Modal isOpen={showModal} onClose={handleCloseModal} title={isPurchasing ? 'กำลังดำเนินการ' : purchaseResult ? (purchaseResult.success ? 'สำเร็จ' : 'ไม่สำเร็จ') : 'ยืนยันการซื้อ'} size="sm">
        {selectedPackage && (
          <div className="space-y-4">

            {/* ========== STATE: กำลังซื้อ (Processing) ========== */}
            {isPurchasing && (
              <div className="flex flex-col items-center justify-center py-8 animate-fade">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full border-4 border-[#06C755]/20 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-[#06C755] animate-spin" />
                  </div>
                  <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-[#06C755] animate-spin" style={{ animationDuration: '1.5s' }} />
                </div>
                <p className="text-lg font-bold text-white mb-1">กำลังดำเนินการซื้อ</p>
                <p className="text-sm text-slate-400">กรุณารอสักครู่...</p>
                <div className="mt-4 bg-slate-800/50 rounded-xl px-4 py-2.5 border border-white/5">
                  <p className="text-xs text-slate-400 text-center">
                    {selectedPackage.name} — <span className="text-[#06C755] font-bold">฿{selectedPackage.price.toLocaleString()}</span>
                  </p>
                </div>
              </div>
            )}

            {/* ========== STATE: ซื้อสำเร็จ ========== */}
            {!isPurchasing && purchaseResult?.success && (
              <div className="flex flex-col items-center justify-center py-6 animate-fade">
                <div className="w-20 h-20 rounded-full bg-[#06C755]/10 flex items-center justify-center mb-5 animate-scale-in">
                  <CheckCircle2 className="w-12 h-12 text-[#06C755]" />
                </div>
                <p className="text-xl font-bold text-white mb-1">ซื้อแพ็คเกจสำเร็จ!</p>
                <p className="text-sm text-slate-400 mb-5">{selectedPackage.name}</p>

                <div className="w-full bg-slate-800/50 rounded-xl p-4 border border-white/10 space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">จำนวนที่ชำระ</span>
                    <span className="text-sm font-bold text-white">-฿{selectedPackage.price.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-white/5 pt-3 flex justify-between items-center">
                    <span className="text-sm text-slate-400">เครดิตคงเหลือ</span>
                    <span className="text-lg font-bold text-emerald-400">฿{balance.toLocaleString()}</span>
                  </div>
                </div>

                <div className="w-full bg-[#06C755]/5 rounded-xl p-3 border border-[#06C755]/10">
                  <div className="flex items-center gap-2 justify-center">
                    <Check className="w-4 h-4 text-[#06C755]" />
                    <p className="text-sm text-[#06C755] font-medium">โควต้าถูกเพิ่มเข้าบัญชีของคุณแล้ว</p>
                  </div>
                </div>

                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleCloseModal}
                  className="mt-5 h-11 rounded-xl bg-[#06C755] hover:bg-[#05a347]"
                >
                  เสร็จสิ้น
                </Button>
              </div>
            )}

            {/* ========== STATE: ซื้อไม่สำเร็จ ========== */}
            {!isPurchasing && purchaseResult && !purchaseResult.success && (
              <div className="flex flex-col items-center justify-center py-6 animate-fade">
                <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center mb-5 animate-scale-in">
                  <XCircle className="w-12 h-12 text-rose-400" />
                </div>
                <p className="text-xl font-bold text-white mb-2">ไม่สามารถซื้อได้</p>
                <p className="text-sm text-slate-400 text-center mb-5 max-w-[280px]">{purchaseResult.message}</p>

                <div className="w-full bg-slate-800/50 rounded-xl p-4 border border-white/10 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">เครดิตคงเหลือ</span>
                    <span className="text-lg font-bold text-emerald-400">฿{balance.toLocaleString()}</span>
                  </div>
                </div>

                <div className="w-full flex gap-3">
                  <Button
                    variant="ghost"
                    fullWidth
                    onClick={handleCloseModal}
                    className="h-11 rounded-xl"
                  >
                    ปิด
                  </Button>
                  {hasEnoughBalance && canPurchase && (
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() => { setPurchaseResult(null); handlePurchase(); }}
                      className="h-11 rounded-xl bg-[#06C755] hover:bg-[#05a347]"
                    >
                      ลองอีกครั้ง
                    </Button>
                  )}
                  {!hasEnoughBalance && (
                    <Link href="/user/wallet" className="flex-1">
                      <Button variant="primary" fullWidth className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 gap-2">
                        <Wallet className="w-4 h-4" /> เติมเครดิต
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* ========== STATE: ยังไม่ซื้อ (Confirm) ========== */}
            {!isPurchasing && !purchaseResult && (
              <>
                {/* Package Info */}
                <div className="bg-gradient-to-r from-[#06C755]/10 to-emerald-500/5 rounded-xl p-4 border border-[#06C755]/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-lg font-bold text-white">{selectedPackage.name}</p>
                        {selectedPackage.isRecommended && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#06C755] text-white text-xs font-bold rounded-full">
                            <Sparkles className="w-2.5 h-2.5" />
                            แนะนำ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{selectedPackage.durationDays} วัน</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full">
                          <FileText className="w-3 h-3" /> {selectedPackage.slipQuota.toLocaleString()} สลิป
                        </span>
                        {(selectedPackage.aiQuota || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs bg-violet-500/20 text-violet-300 px-2.5 py-1 rounded-full">
                            <Bot className="w-3 h-3" /> {(selectedPackage.aiQuota || 0).toLocaleString()} AI
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-[#06C755]">฿{selectedPackage.price.toLocaleString()}</p>
                      {selectedPackage.slipQuota > 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          เฉลี่ย <span className="text-emerald-400 font-bold">฿{(selectedPackage.price / selectedPackage.slipQuota).toFixed(2)}</span> / สลิป
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Balance Info */}
                {isLoadingBalance ? (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-white/10 text-center">
                    <div className="animate-pulse">
                      <div className="h-4 bg-slate-700 rounded w-32 mx-auto mb-2"></div>
                      <div className="h-6 bg-slate-700 rounded w-20 mx-auto"></div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">กำลังโหลดยอดเครดิต...</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-white/10">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">เครดิตคงเหลือ</span>
                      <span className={cn(
                        "text-lg font-bold transition-colors duration-300",
                        hasEnoughBalance ? "text-emerald-400" : "text-rose-400"
                      )}>
                        ฿{balance.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">ราคาแพ็คเกจ</span>
                      <span className="text-lg font-bold text-white">-฿{selectedPackage.price.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-white/10 mt-3 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400 flex items-center gap-1">
                          คงเหลือหลังซื้อ <ArrowRight className="w-3 h-3" />
                        </span>
                        <span className={cn(
                          "text-lg font-bold transition-colors duration-300",
                          hasEnoughBalance ? "text-emerald-400" : "text-rose-400"
                        )}>
                          ฿{(balance - selectedPackage.price).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Purchase Limit Info */}
                {!isEligibilityLoading && eligibility?.maxPurchases && (
                  <div className={cn(
                    "rounded-xl p-3 border transition-all duration-300",
                    eligibility.canPurchase
                      ? "bg-amber-500/10 border-amber-500/20"
                      : "bg-rose-500/10 border-rose-500/20"
                  )}>
                    <div className="flex items-center gap-2">
                      {eligibility.canPurchase ? <ClipboardList className="w-5 h-5 text-amber-400" /> : <Ban className="w-5 h-5 text-rose-400" />}
                      <div>
                        <p className={cn(
                          "text-sm font-bold",
                          eligibility.canPurchase ? "text-amber-300" : "text-rose-300"
                        )}>
                          {eligibility.canPurchase
                            ? `ซื้อได้อีก ${eligibility.remainingPurchases} ครั้ง`
                            : `ซื้อครบ ${eligibility.maxPurchases} ครั้งแล้ว`
                          }
                        </p>
                        <p className="text-xs text-slate-400">
                          คุณซื้อแพ็คเกจนี้ไปแล้ว {eligibility.purchaseCount}/{eligibility.maxPurchases} ครั้ง
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Purchase Limit Exceeded Warning */}
                {!isEligibilityLoading && !canPurchase && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 animate-fade">
                    <div className="flex items-start gap-3">
                      <Ban className="w-6 h-6 text-rose-400 flex-shrink-0" />
                      <div>
                        <p className="text-rose-300 font-bold mb-1">ไม่สามารถซื้อได้</p>
                        <p className="text-rose-300/80 text-sm">
                          คุณได้ซื้อแพ็คเกจนี้ครบจำนวนครั้งที่กำหนดแล้ว ({eligibility?.maxPurchases} ครั้ง)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Insufficient Balance Warning */}
                {!isLoadingBalance && !hasEnoughBalance && canPurchase && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 animate-fade">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="text-rose-300 font-bold mb-1">เครดิตไม่เพียงพอ</p>
                        <p className="text-rose-300/80 text-sm mb-3">
                          ต้องการอีก <span className="font-bold">฿{(selectedPackage.price - balance).toLocaleString()}</span> กรุณาเติมเครดิตก่อนซื้อแพ็คเกจ
                        </p>
                        <Link href="/user/wallet">
                          <Button variant="primary" size="sm" className="bg-emerald-500 hover:bg-emerald-600 gap-2">
                            <Wallet className="w-4 h-4" /> เติมเครดิตที่นี่
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    fullWidth
                    onClick={handleCloseModal}
                    className="h-11 rounded-xl"
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={handlePurchase}
                    disabled={isEligibilityLoading || !hasEnoughBalance || !canPurchase}
                    className={cn(
                      "h-11 rounded-xl transition-all duration-300",
                      hasEnoughBalance && canPurchase && !isEligibilityLoading
                        ? "bg-[#06C755] hover:bg-[#05a347] shadow-lg shadow-[#06C755]/20 hover:shadow-[#06C755]/40"
                        : "bg-slate-600"
                    )}
                  >
                    {isEligibilityLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        กำลังตรวจสอบ...
                      </span>
                    ) : !canPurchase ? (
                      <><Ban className="w-4 h-4 mr-1" /> ซื้อครบแล้ว</>
                    ) : hasEnoughBalance ? (
                      <><Check className="w-4 h-4 mr-1" /> ยืนยันซื้อ</>
                    ) : (
                      'เครดิตไม่พอ'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
