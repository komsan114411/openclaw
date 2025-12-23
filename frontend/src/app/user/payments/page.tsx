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
      <div className="space-y-8 max-w-[1600px] mx-auto animate-fade">
        <div className="page-header">
          <div>
            <h1 className="page-title">ประวัติการชำระเงิน</h1>
            <p className="page-subtitle">ตรวจสอบสถานะ และอัปโหลดสลิปสำหรับรายการที่รอตรวจสอบ</p>
          </div>
          <Button variant="outline" onClick={fetchData}>
            รีเฟรช
          </Button>
        </div>

        {/* Payment Info */}
        {paymentInfo?.bankAccounts?.length > 0 && (
          <Card variant="glass" className="border-none">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">ข้อมูลสำหรับชำระเงิน</h3>
                <p className="text-sm text-slate-500 font-medium">โอนตามบัญชีด้านล่าง แล้วอัปโหลดสลิปในรายการที่รอตรวจสอบ</p>
              </div>
              <Badge variant="blue" dot>
                {paymentInfo.bankAccounts.length} บัญชี
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(paymentInfo.bankAccounts as BankAccount[]).map((account, index: number) => {
                const logo = account.bank?.logoBase64 || account.bank?.logoUrl || null;
                const title = account.bank?.nameTh || account.bank?.name || account.bankName;
                const subtitle = account.bank?.shortName || account.bankCode || '';

                return (
                  <div key={index} className="p-4 bg-white/70 rounded-2xl border border-white/60 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                      {logo ? (
                        <img src={logo} alt={subtitle || title} className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="text-xs font-black text-slate-400">
                          {(subtitle || title || 'BK').slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        {title}{subtitle ? <span className="text-slate-400 font-medium"> • {subtitle}</span> : null}
                      </p>
                      <p className="text-sm text-slate-600 font-medium">เลขบัญชี: <span className="font-mono">{account.accountNumber}</span></p>
                      <p className="text-sm text-slate-600 font-medium">ชื่อบัญชี: {account.accountName}</p>
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
            action={
              <Button variant="primary" onClick={() => window.location.assign('/user/packages')}>
                ไปหน้าแพ็คเกจ
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden md:block p-0 overflow-hidden" variant="glass">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-white/40 border-b border-white/40">
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">วันที่</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">ประเภท</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">จำนวนเงิน</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">สถานะ</th>
                      <th className="px-8 py-5 text-right text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {payments.map((payment) => {
                      const type = paymentTypeLabel(payment.paymentType);
                      return (
                        <tr key={payment._id} className="hover:bg-white/50 transition-colors">
                          <td className="px-8 py-5 text-sm text-slate-600 font-medium">
                            {new Date(payment.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-8 py-5">
                            <Badge variant={type.badge} size="sm">
                              {type.label}
                            </Badge>
                          </td>
                          <td className="px-8 py-5 font-black text-slate-900">
                            {payment.paymentType === 'usdt'
                              ? `$${payment.amount}`
                              : `฿${payment.amount.toLocaleString()}`}
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <StatusBadge status={statusToBadge(payment.status)} />
                              <span className="text-xs text-slate-400 font-bold">{statusLabelTh(payment.status)}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right">
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
                              >
                                อัปโหลดสลิป
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400 font-bold">—</span>
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
            <div className="md:hidden grid grid-cols-1 gap-4">
              {payments.map((payment) => {
                const type = paymentTypeLabel(payment.paymentType);
                return (
                  <Card key={payment._id} variant="glass" className="border-none">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">
                          {payment.paymentType === 'usdt'
                            ? `$${payment.amount}`
                            : `฿${payment.amount.toLocaleString()}`}
                        </p>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          {new Date(payment.createdAt).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={type.badge} size="xs">{type.label}</Badge>
                        <StatusBadge status={statusToBadge(payment.status)} />
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/40 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-bold">{statusLabelTh(payment.status)}</span>
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
                        >
                          อัปโหลดสลิป
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400 font-bold">—</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Upload Slip Modal */}
      <Modal
        isOpen={showUploadModal && !!selectedPayment}
        onClose={() => !isUploading && resetUpload()}
        title="อัปโหลดสลิปการโอนเงิน"
        subtitle="รองรับ JPG, PNG, WEBP, GIF (สูงสุด 10MB)"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดที่ต้องชำระ</p>
                <p className="text-3xl font-black text-slate-900">฿{selectedPayment.amount.toLocaleString()}</p>
              </div>
              <StatusBadge status="pending" />
            </div>

            <div className="space-y-2">
              <label className="label">ไฟล์สลิป</label>
              <input
                type="file"
                accept="image/*"
                className="input"
                disabled={isUploading}
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
              {slipFile && (
                <p className="text-xs text-slate-500 font-medium px-1">ไฟล์: {slipFile.name}</p>
              )}
            </div>

            {slipPreview && (
              <div className="p-4 bg-slate-900 rounded-3xl shadow-premium">
                <img
                  src={slipPreview}
                  alt="Slip preview"
                  className="w-full max-h-[420px] object-contain rounded-2xl bg-black/10"
                />
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <Button variant="ghost" fullWidth onClick={resetUpload} disabled={isUploading}>
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleUploadSlip}
                isLoading={isUploading}
                disabled={!slipFile || isUploading}
              >
                อัปโหลด
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
