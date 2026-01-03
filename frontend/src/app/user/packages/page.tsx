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
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
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
        const bankAccounts = settingsResponse.data?.bankAccounts || [];

        // Pick the FIRST active bank account from the array
        if (bankAccounts.length > 0) {
          const firstBank = bankAccounts[0];
          setBankAccount({
            bankName: firstBank.bankName || firstBank.bank?.nameTh || firstBank.bank?.name || '',
            accountName: firstBank.accountName || '',
            accountNumber: firstBank.accountNumber || '',
            bankCode: firstBank.bankCode,
            bank: firstBank.bank,
          });
        } else {
          setBankAccount(null);
        }

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

  const handleCopyAccountNumber = () => {
    if (bankAccount?.accountNumber) {
      navigator.clipboard.writeText(bankAccount.accountNumber);
      toast.success('คัดลอกเลขบัญชีแล้ว!', { icon: '📋' });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)');
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
            เลือกแพ็กเกจ <span className="text-[#06C755]">(Select Package)</span>
          </h1>
          <p className="text-slate-400">เลือกแพ็คเกจที่เหมาะกับความต้องการของคุณ</p>
        </div>

        {/* Packages Grid - Responsive: 1 col mobile, 3 col tablet+ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg, index) => (
            <Card
              key={pkg._id}
              variant="glass"
              className={`relative p-6 border border-white/10 rounded-2xl transition-all duration-300 hover:border-[#06C755]/50 hover:shadow-lg hover:shadow-[#06C755]/10 ${
                index === 1 ? 'ring-2 ring-[#06C755] scale-[1.02]' : ''
              }`}
            >
              {/* Best Value Badge */}
              {index === 1 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 bg-[#06C755] text-white text-xs font-bold rounded-full">
                    แนะนำ
                  </span>
                </div>
              )}

              {/* Package Name - Bold */}
              <h2 className="text-2xl font-black text-white mb-2 mt-2">
                {pkg.name}
              </h2>

              <p className="text-slate-400 text-sm mb-6">
                {pkg.description || 'แพ็คเกจสำหรับตรวจสอบสลิป'}
              </p>

              {/* Price - Large Text */}
              <div className="mb-6">
                <span className="text-4xl sm:text-5xl font-black text-white">
                  ฿{pkg.price.toLocaleString()}
                </span>
                <span className="text-slate-400 text-sm ml-2">
                  / {pkg.durationDays} วัน
                </span>
              </div>

              {/* Quota */}
              <div className="bg-white/5 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#06C755]/20 rounded-lg flex items-center justify-center">
                    <span className="text-[#06C755] text-xl">📄</span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">
                      {pkg.slipQuota.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400">สลิปที่ตรวจสอบได้</p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-[#06C755]">✓</span> ตรวจสอบสลิปแบบเรียลไทม์
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-[#06C755]">✓</span> รองรับทุกธนาคาร
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-[#06C755]">✓</span> แจ้งเตือนอัตโนมัติ
                </li>
              </ul>

              {/* Buy Button */}
              <Button
                variant={index === 1 ? 'primary' : 'outline'}
                fullWidth
                onClick={() => handleBuyClick(pkg)}
                className={`h-14 rounded-xl font-bold text-base ${
                  index === 1
                    ? 'bg-[#06C755] hover:bg-[#05a347] text-white shadow-lg shadow-[#06C755]/30'
                    : 'border-white/20 hover:bg-[#06C755] hover:text-white hover:border-[#06C755]'
                }`}
              >
                {index === 1 ? '💎 เลือกแพ็กเกจนี้ (Select)' : 'เลือกแพ็กเกจนี้'}
              </Button>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {packages.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-400 text-lg">ไม่พบแพ็คเกจ</p>
          </div>
        )}
      </div>

      {/* ===== PAYMENT MODAL ===== */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title="ชำระเงิน"
        size="lg"
      >
        {selectedPackage && (
          <div className="space-y-6 p-2">
            {/* Selected Package Info */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-sm text-slate-400 mb-1">แพ็คเกจที่เลือก</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xl font-bold text-white">{selectedPackage.name}</p>
                  <p className="text-sm text-slate-400">
                    {selectedPackage.slipQuota.toLocaleString()} สลิป / {selectedPackage.durationDays} วัน
                  </p>
                </div>
                <p className="text-3xl font-black text-[#06C755]">
                  ฿{selectedPackage.price.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Bank Information - CRITICAL SECTION */}
            {bankAccount?.accountNumber ? (
              <div className="bg-slate-900 rounded-xl p-6 border border-[#06C755]/30">
                <p className="text-sm text-slate-400 mb-4">ข้อมูลบัญชีธนาคาร</p>

                {/* Bank Name with Logo */}
                <div className="mb-4 flex items-center gap-3">
                  {bankAccount.bank?.logoBase64 ? (
                    <img
                      src={bankAccount.bank.logoBase64}
                      alt={bankAccount.bankName}
                      className="w-10 h-10 rounded-lg object-contain bg-white p-1"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#06C755]/20 flex items-center justify-center text-xl">
                      🏦
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500 mb-1">ธนาคาร</p>
                    <p className="text-lg font-bold text-white">{bankAccount.bankName}</p>
                  </div>
                </div>

                {/* Account Name */}
                <div className="mb-4">
                  <p className="text-xs text-slate-500 mb-1">ชื่อบัญชี</p>
                  <p className="text-lg font-bold text-white">{bankAccount.accountName}</p>
                </div>

                {/* Account Number - LARGE & BOLD with Copy Button */}
                <div className="bg-black/50 rounded-xl p-4 border border-white/10">
                  <p className="text-xs text-slate-500 mb-2">เลขบัญชี</p>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white font-mono tracking-wider break-all">
                      {bankAccount.accountNumber}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyAccountNumber}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#06C755] hover:bg-[#05a347] text-white rounded-lg font-semibold text-sm transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      คัดลอก
                    </button>
                  </div>
                </div>

                {/* Amount to Pay */}
                <div className="mt-4 p-3 bg-[#06C755]/10 rounded-lg border border-[#06C755]/20">
                  <p className="text-xs text-[#06C755] mb-1">จำนวนเงินที่ต้องโอน</p>
                  <p className="text-2xl font-black text-[#06C755]">
                    ฿{selectedPackage.price.toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-red-500/10 rounded-xl p-6 border border-red-500/30 text-center">
                <p className="text-red-400 font-medium">ไม่พบข้อมูลบัญชีธนาคาร</p>
                <p className="text-red-400/70 text-sm mt-1">กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มบัญชีรับเงิน</p>
              </div>
            )}

            {/* Slip Upload */}
            <div>
              <p className="text-sm text-slate-400 mb-3">อัปโหลดสลิปการโอนเงิน</p>
              <div className="relative">
                <input
                  type="file"
                  id="slip-upload"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isSubmitting}
                />
                <label
                  htmlFor="slip-upload"
                  className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    slipPreview
                      ? 'border-[#06C755] bg-[#06C755]/5'
                      : 'border-white/20 hover:border-white/40 bg-white/5'
                  }`}
                >
                  {slipPreview ? (
                    <div className="relative w-full h-full p-2">
                      <img
                        src={slipPreview}
                        alt="Slip Preview"
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
                      <svg className="w-10 h-10 text-slate-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-slate-400">คลิกเพื่ออัปโหลดสลิป</p>
                      <p className="text-xs text-slate-500 mt-1">JPG, PNG (สูงสุด 10MB)</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="ghost"
                fullWidth
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="h-12"
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleSubmitPayment}
                disabled={isSubmitting || !slipFile}
                className="h-12 bg-[#06C755] hover:bg-[#05a347]"
              >
                {isSubmitting ? 'กำลังส่ง...' : 'ยืนยันการชำระเงิน'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
