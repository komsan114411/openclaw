'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi, walletApi } from '@/lib/api';
import { useWalletStore } from '@/store/wallet';
import { Package } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [packagesRes, balanceRes] = await Promise.all([
          packagesApi.getAll(),
          walletApi.getBalance().catch(() => ({ data: { balance: 0 } })),
        ]);
        setPackages(packagesRes.data.packages || []);
        setBalance(balanceRes.data.balance || 0);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError('ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // ===== HANDLERS =====
  const handleBuyClick = async (pkg: Package) => {
    setSelectedPackage(pkg);
    setPurchaseResult(null);
    setIsLoadingBalance(true);
    setShowModal(true);

    // Fetch fresh balance when opening modal
    await fetchBalance();
    setIsLoadingBalance(false);
  };

  const handleCloseModal = () => {
    if (isPurchasing) return;
    setShowModal(false);
    setSelectedPackage(null);
    setPurchaseResult(null);
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
      const response = await fetch(`/api/packages/${selectedPackage._id}/purchase`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

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
        setTimeout(() => {
          handleCloseModal();
          window.location.reload();
        }, 2000);
      } else {
        setPurchaseResult({ success: false, message: data.message || 'เกิดข้อผิดพลาด' });
        // Refresh balance in case it changed
        await fetchBalance();
      }
    } catch (err: any) {
      setPurchaseResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
      // Refresh balance on error
      await fetchBalance();
    } finally {
      setIsPurchasing(false);
    }
  };


  const hasEnoughBalance = selectedPackage && !isLoadingBalance ? balance >= selectedPackage.price : true;

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
      <div className="p-3 sm:p-4 lg:p-6 max-w-6xl mx-auto">
        {/* Header with Balance */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white mb-1">
              เลือกแพ็กเกจ <span className="text-[#06C755]">(Select Package)</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">ซื้อแพ็คเกจด้วยเครดิตของคุณ</p>
          </div>

          {/* Balance Display */}
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">
              <p className="text-[10px] text-slate-400">เครดิตคงเหลือ</p>
              <p className="text-lg font-black text-emerald-400">฿{balance.toLocaleString()}</p>
            </div>
            <Link href="/user/wallet">
              <Button variant="primary" size="sm" className="bg-emerald-500 hover:bg-emerald-600 h-10">
                💰 เติมเครดิต
              </Button>
            </Link>
          </div>
        </div>

        {/* Packages Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {packages.map((pkg, index) => {
            const canAfford = balance >= pkg.price;

            return (
              <Card
                key={pkg._id}
                variant="glass"
                className={cn(
                  'relative p-3 sm:p-4 border rounded-xl transition-all duration-300 h-full flex flex-col',
                  index === 1 ? 'ring-2 ring-[#06C755] border-[#06C755]/50' : 'border-white/10 hover:border-[#06C755]/50'
                )}
              >
                {/* Best Value Badge */}
                {index === 1 && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-0.5 bg-[#06C755] text-white text-[10px] font-bold rounded-full">
                      แนะนำ
                    </span>
                  </div>
                )}

                {/* Package Name + Price */}
                <div className="flex items-start justify-between gap-2 mb-2 mt-1">
                  <h2 className="text-lg font-black text-white">{pkg.name}</h2>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl sm:text-2xl font-black text-[#06C755]">฿{pkg.price.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">/ {pkg.durationDays} วัน</p>
                  </div>
                </div>

                {/* Quota */}
                <div className="bg-white/5 rounded-lg p-2 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#06C755]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-[#06C755] text-sm">📄</span>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white leading-none">{pkg.slipQuota.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">สลิป</p>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-1 mb-3 flex-1">
                  <li className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-[#06C755] text-[10px]">✓</span> ตรวจสลิปแบบเรียลไทม์
                  </li>
                  <li className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-[#06C755] text-[10px]">✓</span> รองรับทุกธนาคาร
                  </li>
                  <li className="flex items-center gap-1.5 text-xs text-slate-300">
                    <span className="text-[#06C755] text-[10px]">✓</span> แจ้งเตือนอัตโนมัติ
                  </li>
                </ul>

                {/* Buy Button */}
                <Button
                  variant={index === 1 ? 'primary' : 'outline'}
                  fullWidth
                  onClick={() => handleBuyClick(pkg)}
                  className={cn(
                    'h-10 rounded-lg font-bold text-sm mt-auto',
                    index === 1
                      ? 'bg-[#06C755] hover:bg-[#05a347] text-white'
                      : 'border-white/20 hover:bg-[#06C755] hover:text-white hover:border-[#06C755]'
                  )}
                >
                  {index === 1 ? '💎 ซื้อเลย' : 'ซื้อ'}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {packages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-sm">ไม่พบแพ็คเกจ</p>
          </div>
        )}
      </div>

      {/* ===== PURCHASE MODAL ===== */}
      <Modal isOpen={showModal} onClose={handleCloseModal} title="ยืนยันการซื้อ" size="sm">
        {selectedPackage && (
          <div className="space-y-4">
            {/* Package Info */}
            <div className="bg-[#06C755]/10 rounded-lg p-4 border border-[#06C755]/20">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-lg font-bold text-white">{selectedPackage.name}</p>
                  <p className="text-xs text-slate-400">{selectedPackage.slipQuota.toLocaleString()} สลิป / {selectedPackage.durationDays} วัน</p>
                </div>
                <p className="text-2xl font-black text-[#06C755]">฿{selectedPackage.price.toLocaleString()}</p>
              </div>
            </div>

            {/* Balance Info */}
            {isLoadingBalance ? (
              <div className="bg-slate-800/50 rounded-lg p-4 border border-white/10 text-center">
                <div className="animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-32 mx-auto mb-2"></div>
                  <div className="h-6 bg-slate-700 rounded w-20 mx-auto"></div>
                </div>
                <p className="text-xs text-slate-400 mt-2">กำลังโหลดยอดเครดิต...</p>
              </div>
            ) : (
              <div className="bg-slate-800/50 rounded-lg p-4 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-slate-400">เครดิตคงเหลือ</span>
                  <span className={cn(
                    "text-lg font-bold",
                    hasEnoughBalance ? "text-emerald-400" : "text-rose-400"
                  )}>
                    ฿{balance.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">ราคาแพ็คเกจ</span>
                  <span className="text-lg font-bold text-white">-฿{selectedPackage.price.toLocaleString()}</span>
                </div>
                <div className="border-t border-white/10 mt-2 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">คงเหลือหลังซื้อ</span>
                    <span className={cn(
                      "text-lg font-bold",
                      hasEnoughBalance ? "text-emerald-400" : "text-rose-400"
                    )}>
                      ฿{(balance - selectedPackage.price).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Insufficient Balance Warning */}
            {!isLoadingBalance && !hasEnoughBalance && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-rose-300 font-bold mb-1">เครดิตไม่เพียงพอ</p>
                    <p className="text-rose-300/80 text-sm mb-3">
                      ต้องการอีก <span className="font-bold">฿{(selectedPackage.price - balance).toLocaleString()}</span> กรุณาเติมเครดิตก่อนซื้อแพ็คเกจ
                    </p>
                    <Link href="/user/wallet">
                      <Button variant="primary" size="sm" className="bg-emerald-500 hover:bg-emerald-600">
                        💰 เติมเครดิตที่นี่
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Purchase Result */}
            {purchaseResult && (
              <div className={cn(
                "rounded-lg p-4 border",
                purchaseResult.success
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-300"
              )}>
                <div className="flex items-center gap-2">
                  <span>{purchaseResult.success ? '✅' : '❌'}</span>
                  <span className="font-medium">{purchaseResult.message}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                fullWidth
                onClick={handleCloseModal}
                disabled={isPurchasing}
                className="h-10"
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handlePurchase}
                disabled={isPurchasing || isLoadingBalance || !hasEnoughBalance || purchaseResult?.success}
                className={cn(
                  "h-10",
                  hasEnoughBalance && !isLoadingBalance ? "bg-[#06C755] hover:bg-[#05a347]" : "bg-slate-600"
                )}
              >
                {isPurchasing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    กำลังซื้อ...
                  </span>
                ) : isLoadingBalance ? (
                  'กำลังตรวจสอบ...'
                ) : hasEnoughBalance ? (
                  '✅ ยืนยันซื้อ'
                ) : (
                  'เครดิตไม่พอ'
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
