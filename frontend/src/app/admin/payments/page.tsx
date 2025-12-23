'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi } from '@/lib/api';
import { Payment } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Input, TextArea, Select } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

  const processingIdsRef = useRef<Set<string>>(new Set());
  const lastActionTimeRef = useRef<number>(0);

  const fetchPayments = useCallback(async () => {
    setError(null);
    try {
      const response = await paymentsApi.getAll(filter || undefined);
      setPayments(response.data.payments || []);
    } catch (error: any) {
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
    if (now - lastActionTimeRef.current < 2000) {
      toast.error('กรุณารอสักครู่ก่อนทำรายการใหม่');
      return false;
    }
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
      toast.success('อนุมัติการชำระเงินสำเร็จ');
      setShowConfirmApprove(false);
      setShowDetailModal(false);
      fetchPayments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
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
      toast.success('ปฏิเสธการชำระเงินสำเร็จ');
      setShowRejectModal(false);
      setShowDetailModal(false);
      fetchPayments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setIsProcessing(false);
      processingIdsRef.current.delete(selectedPayment._id);
    }
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
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-10 animate-fade max-w-[1600px] mx-auto pb-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Financial Transactions</h1>
            <p className="text-slate-500 font-medium text-lg">ตรวจสอบและจัดการรายการชำระเงินจากลูกค้า</p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="min-w-[180px] bg-white/50 backdrop-blur-md"
            >
              <option value="">ทั้งหมด</option>
              <option value="pending">รอตรวจสอบ</option>
              <option value="verified">อนุมัติแล้ว</option>
              <option value="rejected">ปฏิเสธ</option>
            </Select>
            <IconButton
              variant="outline"
              onClick={fetchPayments}
              className="bg-white/50 backdrop-blur-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="รอตรวจสอบ"
            value={pendingCount}
            icon="⏳"
            color="amber"
            variant="glass"
          />
          <StatCard
            title="อนุมัติแล้ว"
            value={verifiedCount}
            icon="✅"
            color="emerald"
            variant="glass"
          />
          <StatCard
            title="ปฏิเสธ"
            value={rejectedCount}
            icon="❌"
            color="rose"
            variant="glass"
          />
          <StatCard
            title="รายได้รวม"
            value={`฿${totalVerifiedAmount.toLocaleString()}`}
            icon="💰"
            color="blue"
            variant="glass"
          />
        </div>

        {/* Payments Table/List */}
        <Card className="overflow-hidden p-0 border-none shadow-premium-sm bg-white/60 backdrop-blur-xl rounded-[2.5rem]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Transaction Date</th>
                  <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">User Account</th>
                  <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selected Package</th>
                  <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Amount</th>
                  <th className="px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                  <th className="px-8 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50">
                <AnimatePresence mode="popLayout">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-20 text-center">
                        <EmptyState
                          icon="💸"
                          title="No transactions found"
                          description="รายการชำระเงินจะแสดงที่นี่เมื่อลูกค้าเริ่มทำรายการสั่งซื้อ"
                        />
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <motion.tr
                        key={payment._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                        onClick={() => openDetailModal(payment)}
                      >
                        <td className="px-8 py-6">
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-900">
                              {new Date(payment.createdAt).toLocaleDateString('th-TH', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </p>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                              {new Date(payment.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-black shadow-sm group-hover:scale-110 transition-transform">
                              {payment.user?.username?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 leading-tight">{payment.user?.username || '-'}</p>
                              <p className="text-xs text-slate-400 font-medium leading-tight">{payment.user?.email || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-900 leading-tight uppercase tracking-tight">{payment.package?.name || '-'}</p>
                            <Badge variant="indigo" size="xs" className="font-black">{payment.package?.slipQuota?.toLocaleString() || '-'} SLIPS</Badge>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="space-y-0.5">
                            <p className="text-lg font-black text-slate-900 leading-tight">฿{payment.amount.toLocaleString()}</p>
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                              {payment.paymentType === 'usdt' ? 'USDT' : 'BANK TRANSFER'}
                            </p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <StatusBadge status={payment.status === 'verified' ? 'approved' : payment.status as any} />
                        </td>
                        <td className="px-8 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2 justify-end">
                            {payment.status === 'pending' ? (
                              <>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleApproveClick(payment)}
                                  className="h-9 px-4 rounded-xl shadow-emerald-200/50"
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRejectClick(payment)}
                                  className="h-9 px-4 rounded-xl text-rose-500 border-rose-100 hover:bg-rose-50"
                                >
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <IconButton
                                variant="ghost"
                                size="sm"
                                onClick={() => openDetailModal(payment)}
                                className="text-slate-400 hover:text-slate-900"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </IconButton>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                    ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Transaction Intelligence"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-10 p-2">

            {/* Payment Summary Header */}
            <div className="flex items-center justify-between p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
              <div className="relative z-10">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Amount to Verify</p>
                <p className="text-4xl font-black text-slate-900 tracking-tight">฿{selectedPayment.amount.toLocaleString()}</p>
                <div className="flex gap-2 mt-3">
                  <Badge variant="indigo" size="xs" className="font-black uppercase tracking-widest">{selectedPayment.paymentType}</Badge>
                  <StatusBadge status={selectedPayment.status === 'verified' ? 'approved' : selectedPayment.status as any} />
                </div>
              </div>
              {selectedPayment.slipImageUrl && (
                <div className="relative group cursor-zoom-in">
                  <img src={selectedPayment.slipImageUrl} className="w-20 h-28 object-cover rounded-2xl shadow-lg rotate-3 group-hover:rotate-0 transition-transform" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Account</p>
                <p className="text-sm font-bold text-slate-900">{selectedPayment.user?.username || 'Unknown'}</p>
                <p className="text-xs text-slate-400 font-medium">{selectedPayment.user?.email || 'No email provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Purchase Target</p>
                <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">{selectedPayment.package?.name || 'Manual Adjustment'}</p>
                <p className="text-xs text-emerald-600 font-black uppercase tracking-widest">{selectedPayment.package?.slipQuota?.toLocaleString() || '-'} Slips Added</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reference ID</p>
                <p className="text-xs font-mono font-bold text-slate-600 truncate">{selectedPayment._id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Completion Date</p>
                <p className="text-sm font-bold text-slate-900">
                  {new Date(selectedPayment.createdAt).toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            {selectedPayment.slipImageUrl && (
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Digital Receipt Preview</p>
                <div className="p-4 bg-slate-900 rounded-[2.5rem] shadow-2xl">
                  <img
                    src={selectedPayment.slipImageUrl}
                    alt="Payment slip"
                    className="w-full max-h-[500px] object-contain rounded-[2rem]"
                    onClick={() => window.open(selectedPayment.slipImageUrl, '_blank')}
                  />
                </div>
              </div>
            )}

            {selectedPayment.status === 'pending' && (
              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button variant="primary" size="lg" className="h-16 font-black text-lg shadow-premium shadow-emerald-500/20" onClick={() => handleApproveClick(selectedPayment)}>
                  Verify & Approve
                </Button>
                <Button variant="outline" size="lg" className="h-16 font-black text-lg text-rose-500 border-rose-100" onClick={() => handleRejectClick(selectedPayment)}>
                  Decline Request
                </Button>
              </div>
            )}

          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={showConfirmApprove}
        onClose={() => setShowConfirmApprove(false)}
        onConfirm={handleApprove}
        title="Authorize Credit Injection"
        message={`Confirming this will immediately add ${selectedPayment?.package?.slipQuota?.toLocaleString()} slips to "${selectedPayment?.user?.username}"'s account. This action is irreversible.`}
        confirmText="Confirm Authorization"
        type="success"
        isLoading={isProcessing}
      />

      <Modal
        isOpen={showRejectModal}
        onClose={() => !isProcessing && setShowRejectModal(false)}
        title="Transaction Denial"
        size="md"
      >
        <div className="space-y-8 p-1">
          <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-100">
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Impacted Account</p>
            <p className="text-xl font-black text-rose-900">
              {selectedPayment?.user?.username} (฿{selectedPayment?.amount.toLocaleString()})
            </p>
          </div>

          <TextArea
            label="Denial Rationale"
            placeholder="e.g. Image resolution insufficient, Transaction ID mismatch..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            disabled={isProcessing}
            className="font-medium"
          />

          <div className="flex gap-4 pt-4 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 h-14 font-bold text-slate-500" onClick={() => setShowRejectModal(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-[2] h-14 font-black text-lg shadow-premium shadow-rose-500/20" onClick={handleReject} isLoading={isProcessing}>
              Reject Transaction
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
