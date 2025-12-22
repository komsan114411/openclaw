'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi } from '@/lib/api';
import { Payment } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { Input, TextArea } from '@/components/ui/Input';

interface ExtendedPayment extends Payment {
  user?: {
    username: string;
    email?: string;
  };
  package?: {
    name: string;
    slipQuota: number;
  };
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<ExtendedPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [selectedPayment, setSelectedPayment] = useState<ExtendedPayment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ป้องกันการกดซ้ำ
  const processingIdsRef = useRef<Set<string>>(new Set());
  const lastActionTimeRef = useRef<number>(0);

  const fetchPayments = useCallback(async () => {
    setError(null);
    try {
      const response = await paymentsApi.getAll(filter || undefined);
      setPayments(response.data.payments || []);
    } catch (error: any) {
      console.error('Error fetching payments:', error);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    fetchPayments();
  }, [fetchPayments]);

  const canPerformAction = (paymentId: string): boolean => {
    const now = Date.now();
    // ป้องกันการกดซ้ำภายใน 2 วินาที
    if (now - lastActionTimeRef.current < 2000) {
      toast.error('กรุณารอสักครู่ก่อนทำรายการใหม่');
      return false;
    }
    // ป้องกันการประมวลผลซ้ำสำหรับ payment เดียวกัน
    if (processingIdsRef.current.has(paymentId)) {
      toast.error('รายการนี้กำลังดำเนินการอยู่');
      return false;
    }
    return true;
  };

  const handleApproveClick = (payment: ExtendedPayment) => {
    if (!canPerformAction(payment._id)) return;
    setSelectedPayment(payment);
    setShowConfirmApprove(true);
  };

  const handleApprove = async () => {
    if (!selectedPayment || !canPerformAction(selectedPayment._id)) return;

    processingIdsRef.current.add(selectedPayment._id);
    lastActionTimeRef.current = Date.now();
    setIsProcessing(true);

    try {
      await paymentsApi.approve(selectedPayment._id);
      toast.success('อนุมัติการชำระเงินสำเร็จ', {
        duration: 4000,
        icon: '✅',
      });
      setShowConfirmApprove(false);
      setShowDetailModal(false);
      fetchPayments();
    } catch (error: any) {
      const message = error.response?.data?.message;
      if (message?.includes('already')) {
        toast.error('รายการนี้ถูกดำเนินการไปแล้ว');
      } else {
        toast.error(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setIsProcessing(false);
      processingIdsRef.current.delete(selectedPayment._id);
    }
  };

  const handleRejectClick = (payment: ExtendedPayment) => {
    if (!canPerformAction(payment._id)) return;
    setSelectedPayment(payment);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleReject = async () => {
    if (!selectedPayment || !canPerformAction(selectedPayment._id)) return;

    processingIdsRef.current.add(selectedPayment._id);
    lastActionTimeRef.current = Date.now();
    setIsProcessing(true);

    try {
      await paymentsApi.reject(selectedPayment._id, rejectReason || undefined);
      toast.success('ปฏิเสธการชำระเงินสำเร็จ', {
        duration: 4000,
        icon: '❌',
      });
      setShowRejectModal(false);
      setShowDetailModal(false);
      fetchPayments();
    } catch (error: any) {
      const message = error.response?.data?.message;
      if (message?.includes('already')) {
        toast.error('รายการนี้ถูกดำเนินการไปแล้ว');
      } else {
        toast.error(message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setIsProcessing(false);
      processingIdsRef.current.delete(selectedPayment._id);
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    fetchPayments();
  };

  const openDetailModal = (payment: ExtendedPayment) => {
    setSelectedPayment(payment);
    setShowDetailModal(true);
  };

  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const verifiedCount = payments.filter(p => p.status === 'verified').length;
  const rejectedCount = payments.filter(p => p.status === 'rejected').length;
  const totalVerifiedAmount = payments.filter(p => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0);

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading message="กำลังโหลดข้อมูลการชำระเงิน..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">การชำระเงิน</h1>
            <p className="page-subtitle">ตรวจสอบและอนุมัติการชำระเงิน</p>
          </div>
          <div className="flex items-center gap-4">
            {pendingCount > 0 && (
              <Badge variant="error" size="md" className="animate-pulse">
                {pendingCount} รอตรวจสอบ
              </Badge>
            )}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="">ทั้งหมด</option>
              <option value="pending">รอตรวจสอบ</option>
              <option value="verified">อนุมัติแล้ว</option>
              <option value="rejected">ปฏิเสธ</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid-stats">
          <StatCard
            title="รอตรวจสอบ"
            value={pendingCount.toString()}
            color="yellow"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="อนุมัติแล้ว"
            value={verifiedCount.toString()}
            color="green"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="ปฏิเสธ"
            value={rejectedCount.toString()}
            color="red"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="ยอดรวม (อนุมัติ)"
            value={`฿${totalVerifiedAmount.toLocaleString()}`}
            color="blue"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Payments Table */}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">วันที่</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ผู้ใช้</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">แพ็คเกจ</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ประเภท</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">จำนวนเงิน</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">สถานะ</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12">
                      <EmptyState
                        icon={
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        }
                        title="ไม่พบข้อมูลการชำระเงิน"
                        description="ยังไม่มีรายการชำระเงินในหมวดหมู่นี้"
                      />
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(payment.createdAt).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(payment.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                            {payment.user?.username?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{payment.user?.username || '-'}</p>
                            <p className="text-xs text-gray-500">{payment.user?.email || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{payment.package?.name || '-'}</p>
                        <p className="text-xs text-gray-500">{payment.package?.slipQuota?.toLocaleString() || '-'} สลิป</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={payment.paymentType === 'usdt' ? 'info' : 'success'} size="sm">
                          {payment.paymentType === 'usdt' ? '💵 USDT' : '🏦 โอนเงิน'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-900">฿{payment.amount.toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            payment.status === 'pending' ? 'warning' :
                            payment.status === 'verified' ? 'success' :
                            payment.status === 'rejected' ? 'error' : 'secondary'
                          }
                        >
                          {payment.status === 'pending' ? '⏳ รอตรวจสอบ' :
                           payment.status === 'verified' ? '✅ อนุมัติแล้ว' :
                           payment.status === 'rejected' ? '❌ ปฏิเสธ' :
                           payment.status === 'failed' ? '⚠️ ล้มเหลว' : payment.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetailModal(payment)}
                          >
                            ดูรายละเอียด
                          </Button>
                          {payment.status === 'pending' && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => handleApproveClick(payment)}
                                disabled={processingIdsRef.current.has(payment._id)}
                              >
                                อนุมัติ
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleRejectClick(payment)}
                                disabled={processingIdsRef.current.has(payment._id)}
                              >
                                ปฏิเสธ
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Payment Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="รายละเอียดการชำระเงิน"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex justify-center">
              <Badge
                variant={
                  selectedPayment.status === 'pending' ? 'warning' :
                  selectedPayment.status === 'verified' ? 'success' :
                  selectedPayment.status === 'rejected' ? 'error' : 'secondary'
                }
                size="lg"
              >
                {selectedPayment.status === 'pending' ? '⏳ รอตรวจสอบ' :
                 selectedPayment.status === 'verified' ? '✅ อนุมัติแล้ว' :
                 selectedPayment.status === 'rejected' ? '❌ ปฏิเสธ' : selectedPayment.status}
              </Badge>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">วันที่</p>
                <p className="font-semibold text-gray-900">
                  {new Date(selectedPayment.createdAt).toLocaleString('th-TH')}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">ประเภท</p>
                <p className="font-semibold text-gray-900">
                  {selectedPayment.paymentType === 'usdt' ? 'USDT' : 'โอนเงิน'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">ผู้ใช้</p>
                <p className="font-semibold text-gray-900">{selectedPayment.user?.username || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">อีเมล</p>
                <p className="font-semibold text-gray-900">{selectedPayment.user?.email || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">แพ็คเกจ</p>
                <p className="font-semibold text-gray-900">{selectedPayment.package?.name || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">โควต้า</p>
                <p className="font-semibold text-gray-900">{selectedPayment.package?.slipQuota?.toLocaleString() || '-'} สลิป</p>
              </div>
            </div>

            {/* Amount */}
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center">
              <p className="text-sm text-green-600 mb-1">จำนวนเงิน</p>
              <p className="text-3xl font-bold text-green-700">฿{selectedPayment.amount.toLocaleString()}</p>
            </div>

            {/* Slip Image */}
            {selectedPayment.slipImageUrl && (
              <div>
                <p className="text-sm text-gray-500 mb-2">หลักฐานการชำระเงิน</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <img
                    src={selectedPayment.slipImageUrl}
                    alt="Payment slip"
                    className="w-full max-h-96 object-contain bg-gray-100"
                  />
                </div>
              </div>
            )}

            {/* Transaction Hash */}
            {selectedPayment.transactionHash && (
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">Transaction Hash</p>
                <p className="font-mono text-sm text-gray-900 break-all">{selectedPayment.transactionHash}</p>
              </div>
            )}

            {/* Notes */}
            {selectedPayment.notes && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                <p className="text-sm text-yellow-600 mb-1">หมายเหตุ</p>
                <p className="text-yellow-800">{selectedPayment.notes}</p>
              </div>
            )}

            {/* Actions */}
            {selectedPayment.status === 'pending' && (
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="success"
                  fullWidth
                  onClick={() => {
                    setShowDetailModal(false);
                    handleApproveClick(selectedPayment);
                  }}
                >
                  ✅ อนุมัติ
                </Button>
                <Button
                  variant="danger"
                  fullWidth
                  onClick={() => {
                    setShowDetailModal(false);
                    handleRejectClick(selectedPayment);
                  }}
                >
                  ❌ ปฏิเสธ
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Approve Modal */}
      <ConfirmModal
        isOpen={showConfirmApprove}
        onClose={() => setShowConfirmApprove(false)}
        onConfirm={handleApprove}
        title="ยืนยันการอนุมัติ"
        message={`คุณต้องการอนุมัติการชำระเงินของ "${selectedPayment?.user?.username}" จำนวน ฿${selectedPayment?.amount.toLocaleString()} สำหรับแพ็คเกจ "${selectedPayment?.package?.name}" หรือไม่?`}
        confirmText="อนุมัติ"
        cancelText="ยกเลิก"
        type="success"
        isLoading={isProcessing}
      />

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => !isProcessing && setShowRejectModal(false)}
        title="ปฏิเสธการชำระเงิน"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 mb-1">รายการที่จะปฏิเสธ</p>
            <p className="font-semibold text-red-800">
              {selectedPayment?.user?.username} - ฿{selectedPayment?.amount.toLocaleString()}
            </p>
          </div>

          <TextArea
            label="เหตุผลในการปฏิเสธ (ไม่บังคับ)"
            placeholder="ระบุเหตุผล เช่น สลิปไม่ชัด, ยอดเงินไม่ตรง..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            disabled={isProcessing}
          />

          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowRejectModal(false)}
              disabled={isProcessing}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={handleReject}
              isLoading={isProcessing}
              loadingText="กำลังดำเนินการ..."
            >
              ปฏิเสธการชำระเงิน
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
