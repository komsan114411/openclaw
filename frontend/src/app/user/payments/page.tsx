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
        <div className="page-header relative z-10 flex-col sm:flex-row items-start sm:items-center">
          <div className="space-y-1 sm:space-y-2 text-left">
            <h1 className="page-title-responsive">
              Settlement <span className="text-emerald-400">Ledger</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Financial Registry & Transaction Verification Matrix
            </p>
          </div>
          <Button
            variant="ghost"
            size="lg"
            onClick={fetchData}
            className="w-full sm:w-auto h-11 sm:h-14 px-8 rounded-2xl bg-white/[0.03] border border-white/5 text-slate-500 hover:text-white hover:bg-white/10 transition-all font-black uppercase tracking-widest text-[10px]"
          >
            Refresh Logs
          </Button>
        </div>

        {/* Payment Info */}
        {paymentInfo?.bankAccounts?.length > 0 && (
          <Card variant="glass" className="border border-white/5 p-8 sm:p-10 rounded-[2.5rem] relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -mr-32 -mt-32" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 relative z-10">
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white tracking-tight uppercase">Financial Endpoints</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest opacity-60">Settlement Destination Protocols</p>
              </div>
              <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{paymentInfo.bankAccounts.length} Active Nodes</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
              {(paymentInfo.bankAccounts as BankAccount[]).map((account, index: number) => {
                const logo = account.bank?.logoBase64 || account.bank?.logoUrl || null;
                const title = account.bank?.nameTh || account.bank?.name || account.bankName;
                const subtitle = account.bank?.shortName || account.bankCode || '';

                return (
                  <div key={index} className="p-6 bg-white/[0.02] hover:bg-white/[0.04] rounded-3xl border border-white/5 flex items-center gap-5 transition-all duration-500 group">
                    <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                      {logo ? (
                        <img src={logo} alt={subtitle || title} className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="text-xs font-black text-slate-500 uppercase">
                          {(subtitle || title || 'BK').slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white uppercase tracking-tight truncate group-hover:text-emerald-400 transition-colors">
                        {title}{subtitle ? <span className="text-slate-600 font-black ml-2 opacity-50">• {subtitle}</span> : null}
                      </p>
                      <p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-2">
                        Serial: <span className="text-white font-mono">{account.accountNumber}</span>
                      </p>
                      <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest truncate mt-1">
                        Holder: {account.accountName}
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
          <EmptyState
            icon="💸"
            title="ยังไม่มีประวัติการชำระเงิน"
            description="เมื่อคุณทำรายการซื้อแพ็คเกจ รายการจะปรากฏที่นี่"
            variant="glass"
            action={
              <Button variant="primary" onClick={() => window.location.assign('/user/packages')}>
                ไปหน้าแพ็คเกจ
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden md:block p-0 overflow-hidden rounded-[2.5rem] border border-white/5" variant="glass">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Timestamp</th>
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Protocol</th>
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Asset Volume</th>
                      <th className="px-8 py-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Validation Status</th>
                      <th className="px-8 py-6 text-right text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payments.map((payment) => {
                      const type = paymentTypeLabel(payment.paymentType);
                      return (
                        <tr key={payment._id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-8 py-6 text-sm text-slate-400 font-bold font-mono">
                            {new Date(payment.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                          </td>
                          <td className="px-8 py-6">
                            <span className={cn(
                              "text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest border",
                              type.badge === 'success' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/10' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/10'
                            )}>
                              {type.label}
                            </span>
                          </td>
                          <td className="px-8 py-6 font-black text-white text-xl tracking-tighter">
                            {payment.paymentType === 'usdt'
                              ? `$${payment.amount}`
                              : `฿${payment.amount.toLocaleString()}`}
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <StatusBadge status={statusToBadge(payment.status)} />
                              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{statusLabelTh(payment.status)}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-right">
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
                                className="h-10 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 text-[10px] font-black uppercase tracking-widest"
                              >
                                Upload Slip
                              </Button>
                            ) : (
                              <span className="text-[10px] text-slate-700 font-black tracking-widest">---</span>
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
            <div className="md:hidden space-y-4">
              {payments.map((payment) => {
                const type = paymentTypeLabel(payment.paymentType);
                return (
                  <Card key={payment._id} variant="glass" className="p-8 border border-white/5 shadow-2xl rounded-[2rem]">
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div className="space-y-1">
                        <p className="text-2xl font-black text-white tracking-tighter">
                          {payment.paymentType === 'usdt'
                            ? `$${payment.amount}`
                            : `฿${payment.amount.toLocaleString()}`}
                        </p>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] font-mono">
                          {new Date(payment.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                        <span className={cn(
                          "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest border",
                          type.badge === 'success' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/10' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/10'
                        )}>
                          {type.label}
                        </span>
                        <StatusBadge status={statusToBadge(payment.status)} />
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{statusLabelTh(payment.status)}</span>
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
                          className="px-6 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/20 text-[10px] font-black uppercase tracking-widest"
                        >
                          Upload Slip
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-800 font-black">---</span>
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
        title="TRANSACTION_VALIDATION_MATRIX"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-8 p-2">
            <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 flex items-center justify-between gap-4 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16" />
              <div className="relative z-10">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Payload Volume</p>
                <p className="text-4xl font-black text-white tracking-tighter">฿{selectedPayment.amount.toLocaleString()}</p>
              </div>
              <StatusBadge status="pending" />
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Audit Telemetry (Slip Upload)</p>
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

              <div className="flex gap-4 pt-4">
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={resetUpload}
                  disabled={isUploading}
                  className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-500 hover:text-white"
                >
                  Abort
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleUploadSlip}
                  isLoading={isUploading}
                  disabled={!slipFile || isUploading}
                  className="h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
                >
                  Confirm Upload
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
