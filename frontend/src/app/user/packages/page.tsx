'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { packagesApi, paymentsApi, systemSettingsApi } from '@/lib/api';
import { Package } from '@/types';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/Loading';

// Types for Bank Account from API
interface BankAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  bankCode?: string;
  bank?: {
    code: string;
    name: string;
    nameTh?: string;
    logoUrl?: string;
    logoBase64?: string;
  };
}

export default function UserPackagesPage() {
  // ===== STATE MANAGEMENT =====
  const [packages, setPackages] = useState<Package[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);

  // Upload State
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ===== FETCH REAL DATA FROM API =====
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch packages from /packages API
        const packagesResponse = await packagesApi.getAll();
        const packagesData = packagesResponse.data.packages || [];
        setPackages(packagesData);

        // Fetch bank info from /system-settings/payment-info API
        // Response: { bankAccounts: [...], usdtWallet: {...} }
        const settingsResponse = await systemSettingsApi.getPaymentInfo();
        const bankAccountsData = settingsResponse.data?.bankAccounts || [];

        // Store ALL bank accounts (not just the first one)
        const mappedAccounts: BankAccount[] = bankAccountsData.map((acc: any) => ({
          bankName: acc.bankName || acc.bank?.nameTh || acc.bank?.name || '',
          accountName: acc.accountName || '',
          accountNumber: acc.accountNumber || '',
          bankCode: acc.bankCode,
          bank: acc.bank,
        }));
        setBankAccounts(mappedAccounts);

      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // ===== HANDLERS =====
  const handleBuyClick = (pkg: Package) => {
    setSelectedPackage(pkg);
    setSlipFile(null);
    setSlipPreview(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setSelectedPackage(null);
    setSlipFile(null);
    setSlipPreview(null);
  };

  const handleCopyAccountNumber = (accountNumber: string) => {
    navigator.clipboard.writeText(accountNumber);
    toast.success('คัดลอกเลขบัญชีแล้ว!', { icon: '📋' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    // Validate file size (max 5MB per security spec)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)');
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

  const handleSubmitPayment = async () => {
    if (!selectedPackage || !slipFile) {
      toast.error('กรุณาอัปโหลดสลิปการโอนเงิน');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await paymentsApi.submitSlip({
        packageId: selectedPackage._id,
        slipFile: slipFile,
      });

      if (response.data.success) {
        toast.success('ส่งสลิปสำเร็จ! รอการตรวจสอบ', { icon: '🎉', duration: 5000 });
      } else {
        toast.success(response.data.message || 'ส่งสลิปสำเร็จ รอตรวจสอบ');
      }

      handleCloseModal();
    } catch (err: any) {
      const message = err.response?.data?.message || 'เกิดข้อผิดพลาด';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===== LOADING STATE =====
  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดแพ็คเกจ..." />
      </DashboardLayout>
    );
  }

  // ===== ERROR STATE =====
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

  // ===== MAIN RENDER =====
  return (
    <DashboardLayout>
      <div className="p-3 sm:p-4 lg:p-6 max-w-6xl mx-auto">
        {/* Page Header - Compact */}
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-black text-white mb-1">
            เลือกแพ็กเกจ <span className="text-[#06C755]">(Select Package)</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">เลือกแพ็คเกจที่เหมาะกับความต้องการของคุณ</p>
        </div>

        {/* Packages Grid - Compact: 1 col mobile, 3 col tablet+ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {packages.map((pkg, index) => (
            <Card
              key={pkg._id}
              variant="glass"
              className={`relative p-3 sm:p-4 border border-white/10 rounded-xl transition-all duration-300 hover:border-[#06C755]/50 h-full flex flex-col ${
                index === 1 ? 'ring-2 ring-[#06C755]' : ''
              }`}
            >
              {/* Best Value Badge */}
              {index === 1 && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-0.5 bg-[#06C755] text-white text-[10px] font-bold rounded-full">
                    แนะนำ
                  </span>
                </div>
              )}

              {/* Package Name + Price Row */}
              <div className="flex items-start justify-between gap-2 mb-2 mt-1">
                <h2 className="text-lg font-black text-white">{pkg.name}</h2>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl sm:text-2xl font-black text-[#06C755]">฿{pkg.price.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500">/ {pkg.durationDays} วัน</p>
                </div>
              </div>

              {/* Quota - Compact */}
              <div className="bg-white/5 rounded-lg p-2 mb-3 flex items-center gap-2">
                <div className="w-8 h-8 bg-[#06C755]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-[#06C755] text-sm">📄</span>
                </div>
                <div>
                  <p className="text-lg font-black text-white leading-none">{pkg.slipQuota.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400">สลิป</p>
                </div>
              </div>

              {/* Features - Compact */}
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

              {/* Buy Button - Compact */}
              <Button
                variant={index === 1 ? 'primary' : 'outline'}
                fullWidth
                onClick={() => handleBuyClick(pkg)}
                className={`h-10 rounded-lg font-bold text-sm mt-auto ${
                  index === 1
                    ? 'bg-[#06C755] hover:bg-[#05a347] text-white'
                    : 'border-white/20 hover:bg-[#06C755] hover:text-white hover:border-[#06C755]'
                }`}
              >
                {index === 1 ? '💎 เลือก' : 'เลือก'}
              </Button>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {packages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-sm">ไม่พบแพ็คเกจ</p>
          </div>
        )}
      </div>

      {/* ===== PAYMENT MODAL - COMPACT SINGLE-SCREEN ===== */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title="ชำระเงิน"
        size="md"
      >
        {selectedPackage && (
          <div className="flex flex-col h-full max-h-[80vh]">
            {/* Header - Package Info + Amount */}
            <div className="bg-[#06C755]/10 rounded-lg p-3 border border-[#06C755]/20 mb-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-white">{selectedPackage.name}</p>
                  <p className="text-[10px] text-slate-400">{selectedPackage.slipQuota.toLocaleString()} สลิป / {selectedPackage.durationDays} วัน</p>
                </div>
                <p className="text-2xl font-black text-[#06C755]">฿{selectedPackage.price.toLocaleString()}</p>
              </div>
            </div>

            {/* Bank List - Condensed with internal scroll */}
            {bankAccounts.length > 0 ? (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-2">โอนเงินไปที่บัญชี ({bankAccounts.length})</p>
                <div className="max-h-[180px] overflow-y-auto space-y-2 pr-1">
                  {bankAccounts.map((account, index) => (
                    <div
                      key={index}
                      className="bg-slate-900/80 rounded-lg p-2 border border-white/10 flex items-center gap-2"
                    >
                      {/* Bank Logo - Small */}
                      {account.bank?.logoBase64 ? (
                        <img src={account.bank.logoBase64} alt={account.bankName} className="w-8 h-8 rounded object-contain bg-white p-0.5 flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-[#06C755]/20 flex items-center justify-center text-sm flex-shrink-0">🏦</div>
                      )}
                      {/* Bank Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-400 truncate">{account.bankName} • {account.accountName}</p>
                        <p className="text-base sm:text-lg font-black text-white font-mono tracking-wide">{account.accountNumber}</p>
                      </div>
                      {/* Copy Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyAccountNumber(account.accountNumber)}
                        className="px-2 py-1 bg-[#06C755] hover:bg-[#05a347] text-white rounded text-[10px] font-semibold flex-shrink-0"
                      >
                        คัดลอก
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30 text-center mb-3">
                <p className="text-red-400 text-sm font-medium">ไม่พบบัญชีธนาคาร</p>
              </div>
            )}

            {/* Upload Section - Fixed at bottom */}
            <div className="mt-auto pt-2 border-t border-white/10">
              <p className="text-xs text-slate-400 mb-2">อัปโหลดสลิป</p>
              <div className="relative">
                <input type="file" id="slip-upload" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isSubmitting} />
                <label
                  htmlFor="slip-upload"
                  className={`flex items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                    slipPreview ? 'border-[#06C755] bg-[#06C755]/5' : 'border-white/20 hover:border-white/40 bg-white/5'
                  }`}
                >
                  {slipPreview ? (
                    <div className="relative w-full h-full p-1">
                      <img src={slipPreview} alt="Slip" className="w-full h-full object-contain rounded" />
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setSlipFile(null); setSlipPreview(null); }}
                        className="absolute top-2 right-2 p-0.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <svg className="w-6 h-6 text-slate-500 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-xs text-slate-400">คลิกอัปโหลดสลิป (JPG, PNG)</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Action Buttons - Side by Side */}
              <div className="flex gap-2 mt-3">
                <Button variant="ghost" fullWidth onClick={handleCloseModal} disabled={isSubmitting} className="h-10 text-sm">
                  ยกเลิก
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleSubmitPayment}
                  disabled={isSubmitting || !slipFile}
                  className="h-10 text-sm bg-[#06C755] hover:bg-[#05a347]"
                >
                  {isSubmitting ? 'กำลังส่ง...' : 'ยืนยัน'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
