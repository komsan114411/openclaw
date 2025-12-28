'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi, systemSettingsApi } from '@/lib/api';
import { Payment, BankAccount } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

export default function UserPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [paymentsRes, paymentInfoRes] = await Promise.all([
        paymentsApi.getMy(),
        systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} })),
      ]);
      setPayments(paymentsRes.data.payments || []);
      setPaymentInfo(paymentInfoRes.data || {});
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetUpload = () => {
    setSlipFile(null);
    setSlipPreview(null);
    setSelectedPayment(null);
    setShowUploadModal(false);
  };

  const handleFileChange = (file?: File | null) => {
    if (!file) {
      setSlipFile(null);
      setSlipPreview(null);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) เท่านั้น');
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)');
      return;
    }

    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setSlipPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadSlip = async () => {
    if (!slipFile || !selectedPayment) {
      toast.error('กรุณาเลือกไฟล์สลิป');
      return;
    }

    setIsUploading(true);
    try {
      const response = await paymentsApi.submitSlip({
        packageId: selectedPayment.packageId,
        paymentId: selectedPayment._id,
        slipFile,
      });
      if (response.data.success) {
        toast.success('อัปโหลดสลิปสำเร็จ รอการตรวจสอบ');
      } else {
        toast.success(response.data.message || 'อัปโหลดสลิปสำเร็จ รอการตรวจสอบ');
      }
      resetUpload();
      await fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsUploading(false);
    }
  };

  const paymentTypeLabel = (paymentType: string) => {
    if (paymentType === 'usdt') return { label: 'USDT', badge: 'info' as const };
    if (paymentType === 'bank_transfer') return { label: 'โอนเงิน', badge: 'success' as const };
    return { label: paymentType, badge: 'default' as const };
  };

  const statusLabelTh = (status: string) => {
    const map: Record<string, string> = {
      pending: 'รอตรวจสอบ',
      verified: 'อนุมัติแล้ว',
      approved: 'อนุมัติแล้ว',
      rejected: 'ปฏิเสธ',
      failed: 'ล้มเหลว',
      cancelled: 'ยกเลิก',
    };
    return map[status] || status;
  };

  const statusToBadge = (status: string) => {
    // StatusBadge supports: pending/verified/approved/rejected/failed/cancelled
    if (status === 'verified') return 'verified' as const;
    if (status === 'approved') return 'approved' as const;
    if (status === 'pending') return 'pending' as const;
    if (status === 'rejected') return 'rejected' as const;
    if (status === 'failed') return 'failed' as const;
    if (status === 'cancelled') return 'cancelled' as const;
    return 'pending' as const;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดประวัติการชำระเงิน..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10">
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2 text-left flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              ประวัติการ<span className="text-[#06C755]">ชำระเงิน</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              ตรวจสอบและจัดการการชำระเงินทั้งหมดของคุณ
            </p>
            <p className="text-[10px] font-semibold text-slate-500 mt-2">อัปเดตล่าสุด: เมื่อสักครู่</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Button
              variant="outline"
              size="lg"
              onClick={fetchData}
              className="flex-1 sm:flex-none h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all"
            >
              🔄 รีเฟรช
            </Button>
            <Link href="/user/packages" className="flex-1 sm:flex-none">
              <Button
                variant="primary"
                className="w-full sm:w-auto h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048] transition-all"
              >
                💎 ซื้อแพ็คเกจ
              </Button>
            </Link>
          </div>
        </div>

        {/* Payment Info */}
        {paymentInfo?.bankAccounts?.length > 0 && (
          <Card variant="glass" className="border border-white/5 p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl relative overflow-hidden shadow-2xl mb-4 sm:mb-6">
            <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-[#06C755]/5 rounded-full blur-[60px] sm:blur-[80px] -mr-24 sm:-mr-32 -mt-24 sm:-mt-32" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8 relative z-10">
              <div className="space-y-1">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">บัญชีธนาคาร</h3>
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">บัญชีสำหรับรับการชำระเงิน</p>
              </div>
              <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#06C755]/10 border border-[#06C755]/20 rounded-lg sm:rounded-xl">
                <span className="text-[9px] sm:text-[10px] font-semibold text-[#06C755]">{paymentInfo.bankAccounts.length} บัญชีที่ใช้งาน</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 relative z-10">
              {(paymentInfo.bankAccounts as BankAccount[]).map((account, index: number) => {
                const logo = account.bank?.logoBase64 || account.bank?.logoUrl || null;
                const title = account.bank?.nameTh || account.bank?.name || account.bankName;
                const subtitle = account.bank?.shortName || account.bankCode || '';

                return (
                  <div key={index} className="p-4 sm:p-6 bg-white/[0.02] hover:bg-white/[0.04] rounded-xl sm:rounded-2xl border border-white/5 flex items-center gap-3 sm:gap-4 lg:gap-5 transition-all duration-500 group">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                      {logo ? (
                        <img src={logo} alt={subtitle || title} className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
                      ) : (
                        <span className="text-xs font-black text-slate-500 uppercase">
                          {(subtitle || title || 'BK').slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-sm sm:text-base truncate group-hover:text-[#06C755] transition-colors">
                        {title}{subtitle ? <span className="text-slate-500 font-semibold ml-2 text-xs">• {subtitle}</span> : null}
                      </p>
                      <p className="text-xs sm:text-sm text-slate-400 font-semibold mt-1.5 sm:mt-2">
                        เลขบัญชี: <span className="text-white font-mono">{account.accountNumber}</span>
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-slate-500 font-semibold truncate mt-1">
                        ชื่อบัญชี: {account.accountName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Payments */}
        {payments.length === 0 ? (
          <Card variant="glass" className="mt-4 sm:mt-6">
            <EmptyState
              icon="💸"
              title="ยังไม่มีประวัติการชำระเงิน"
              description="เมื่อคุณทำรายการซื้อแพ็คเกจ รายการจะปรากฏที่นี่"
              variant="glass"
              action={
                <Button variant="primary" onClick={() => window.location.assign('/user/packages')} className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl font-semibold text-xs sm:text-sm">
                  ไปหน้าแพ็คเกจ
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden md:block p-0 overflow-hidden rounded-xl sm:rounded-2xl border border-white/5" variant="glass">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">วันที่</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">ประเภท</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">จำนวนเงิน</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-left text-[9px] sm:text-[10px] font-semibold text-slate-400">สถานะ</th>
                      <th className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-right text-[9px] sm:text-[10px] font-semibold text-slate-400">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payments.map((payment) => {
                      const type = paymentTypeLabel(payment.paymentType);
                      return (
                        <tr key={payment._id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-xs sm:text-sm text-slate-400 font-semibold">
                            {new Date(payment.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6">
                            <span className={cn(
                              "text-[9px] sm:text-[10px] font-semibold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border",
                              type.badge === 'success' ? 'text-[#06C755] bg-[#06C755]/10 border-[#06C755]/10' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/10'
                            )}>
                              {type.label}
                            </span>
                          </td>
                          <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 font-black text-white text-lg sm:text-xl">
                            {payment.paymentType === 'usdt'
                              ? `$${payment.amount}`
                              : `฿${payment.amount.toLocaleString()}`}
                          </td>
                          <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <StatusBadge status={statusToBadge(payment.status)} className="text-[8px] sm:text-[9px]" />
                              <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold">{statusLabelTh(payment.status)}</span>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6 text-right">
                            {payment.status === 'pending' && payment.paymentType === 'bank_transfer' ? (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  setSelectedPayment(payment);
                                  setSlipFile(null);
                                  setSlipPreview(null);
                                  setShowUploadModal(true);
                                }}
                                className="h-9 sm:h-10 px-4 sm:px-6 rounded-lg sm:rounded-xl bg-[#06C755] hover:bg-[#05B048] shadow-lg shadow-[#06C755]/20 text-[9px] sm:text-[10px] font-semibold transition-all"
                              >
                                อัปโหลดสลิป
                              </Button>
                            ) : (
                              <span className="text-[9px] sm:text-[10px] text-slate-500 font-semibold">---</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3 sm:space-y-4">
              {payments.map((payment) => {
                const type = paymentTypeLabel(payment.paymentType);
                return (
                  <Card key={payment._id} variant="glass" className="p-4 sm:p-6 border border-white/5 shadow-2xl rounded-xl sm:rounded-2xl">
                    <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-xl sm:text-2xl font-black text-white">
                          {payment.paymentType === 'usdt'
                            ? `$${payment.amount}`
                            : `฿${payment.amount.toLocaleString()}`}
                        </p>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 font-semibold">
                          {new Date(payment.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 sm:gap-3 flex-shrink-0">
                        <span className={cn(
                          "text-[8px] sm:text-[9px] font-semibold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border",
                          type.badge === 'success' ? 'text-[#06C755] bg-[#06C755]/10 border-[#06C755]/10' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/10'
                        )}>
                          {type.label}
                        </span>
                        <StatusBadge status={statusToBadge(payment.status)} className="text-[8px] sm:text-[9px]" />
                      </div>
                    </div>

                    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                      <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold">{statusLabelTh(payment.status)}</span>
                      {payment.status === 'pending' && payment.paymentType === 'bank_transfer' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setSlipFile(null);
                            setSlipPreview(null);
                            setShowUploadModal(true);
                          }}
                          className="w-full sm:w-auto px-4 sm:px-6 rounded-lg sm:rounded-xl bg-[#06C755] shadow-lg shadow-[#06C755]/20 text-[9px] sm:text-[10px] font-semibold transition-all"
                        >
                          อัปโหลดสลิป
                        </Button>
                      ) : (
                        <span className="text-[9px] sm:text-[10px] text-slate-500 font-semibold">---</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={showUploadModal && !!selectedPayment}
        onClose={() => !isUploading && resetUpload()}
        title="อัปโหลดสลิปการชำระเงิน"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-8 p-2">
            <div className="p-4 sm:p-6 lg:p-8 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-[#06C755]/5 rounded-full blur-xl sm:blur-2xl -mr-12 sm:-mr-16 -mt-12 sm:-mt-16" />
              <div className="relative z-10">
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1 sm:mb-2">จำนวนเงิน</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white">฿{selectedPayment.amount.toLocaleString()}</p>
              </div>
              <StatusBadge status="pending" className="text-[8px] sm:text-[9px]" />
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div>
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-3 sm:mb-4">อัปโหลดสลิปการชำระเงิน</p>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e.target.files?.[0])}
                    className="hidden"
                    id="slip-upload-manual"
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="slip-upload-manual"
                    className={cn(
                      "flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-[2.5rem] cursor-pointer transition-all duration-500 relative overflow-hidden",
                      slipPreview
                        ? 'border-emerald-500/50 bg-emerald-500/5'
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

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={resetUpload}
                  disabled={isUploading}
                  className="h-11 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm text-slate-400 hover:text-white transition-all"
                >
                  ยกเลิก
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleUploadSlip}
                  isLoading={isUploading}
                  disabled={!slipFile || isUploading}
                  className="h-11 sm:h-12 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm bg-[#06C755] hover:bg-[#05B048] shadow-lg shadow-[#06C755]/20 transition-all"
                >
                  ยืนยันอัปโหลด
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
