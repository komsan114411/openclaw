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
      <div className="section-gap animate-fade pb-10">

        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-end">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-400 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              ประวัติ<span className="text-[#06C755]">การชำระเงิน</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              ศูนย์ตรวจสอบและอนุมัติธุรกรรมการเงิน
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#0F1A14] p-2 rounded-full border border-emerald-500/10 w-full lg:w-auto mt-6 lg:mt-0">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 sm:min-w-[180px] border-none shadow-none bg-transparent font-semibold text-xs focus:ring-0 cursor-pointer text-white rounded-full px-4"
            >
              <option value="" className="bg-[#0A0F0D]">ทั้งหมด</option>
              <option value="pending" className="bg-[#0A0F0D]">รอตรวจสอบ</option>
              <option value="verified" className="bg-[#0A0F0D]">อนุมัติแล้ว</option>
              <option value="rejected" className="bg-[#0A0F0D]">ปฏิเสธ</option>
            </Select>
            <IconButton
              variant="ghost"
              size="md"
              onClick={fetchPayments}
              className="rounded-full w-10 h-10 bg-emerald-500/10 text-[#06C755] hover:bg-emerald-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </IconButton>
          </div>
        </div>

        <div className="grid-stats">
          <StatCard title="รอตรวจสอบ" value={pendingCount} icon="⏳" color="amber" variant="glass" />
          <StatCard title="อนุมัติแล้ว" value={verifiedCount} icon="✅" color="emerald" variant="glass" />
          <StatCard title="ปฏิเสธ" value={rejectedCount} icon="❌" color="rose" variant="glass" />
          <StatCard title="ยอดรวม" value={`฿${totalVerifiedAmount.toLocaleString()}`} icon="💰" color="blue" variant="glass" />
        </div>

        <Card className="hidden lg:block overflow-hidden" variant="glass" padding="none">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/5">
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-left text-[10px] sm:text-xs font-semibold text-slate-300">วันที่</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-left text-[10px] sm:text-xs font-semibold text-slate-300">ผู้ใช้งาน</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-left text-[10px] sm:text-xs font-semibold text-slate-300">ประเภท</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-left text-[10px] sm:text-xs font-semibold text-slate-300">จำนวนเงิน</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-left text-[10px] sm:text-xs font-semibold text-slate-300">สถานะ</th>
                  <th className="px-6 sm:px-8 py-5 sm:py-6 text-right text-[10px] sm:text-xs font-semibold text-slate-300">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                <AnimatePresence mode="popLayout">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-10 py-32 text-center">
                        <div className="flex flex-col items-center justify-center opacity-30">
                          <div className="w-20 h-20 rounded-[2rem] bg-slate-100 flex items-center justify-center text-4xl mb-6">📉</div>
                          <p className="text-[10px] font-black uppercase tracking-[0.5em]">ไม่พบประวัติการชำระเงิน</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <motion.tr
                        key={payment._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-white/[0.01] transition-all duration-300 cursor-pointer"
                        onClick={() => openDetailModal(payment)}
                      >
                        <td className="px-10 py-8">
                          <div className="space-y-1.5">
                            <p className="text-sm font-black text-white tracking-tight">
                              {new Date(payment.createdAt).toLocaleDateString('en-US', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/30" />
                              <p className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest leading-none">
                                {new Date(payment.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center text-slate-500 font-black shadow-inner group-hover:scale-110 group-hover:text-emerald-400 transition-all duration-500">
                              {payment.user?.username?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-white uppercase tracking-tight mb-1">{payment.user?.username || '-'}</p>
                              <p className="text-[10px] font-bold text-slate-400 tracking-wider lowercase">{payment.user?.email || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="space-y-2">
                            <p className="text-[11px] font-black text-white leading-none uppercase tracking-widest">{payment.package?.name || '-'}</p>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" size="xs" className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-black text-[8px] px-2 py-0.5 tracking-widest uppercase rounded-lg">
                                {payment.package?.slipQuota?.toLocaleString() || '-'} รายการ
                              </Badge>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="space-y-1">
                            <p className="text-xl font-black text-white tracking-tighter">฿{payment.amount.toLocaleString()}</p>
                            <div className="flex items-center gap-2">
                              <div className={cn("w-1.5 h-1.5 rounded-full", payment.paymentType === 'usdt' ? "bg-emerald-500" : "bg-indigo-500")} />
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                {payment.paymentType === 'usdt' ? 'โอนผ่าน USDT' : 'โอนผ่านธนาคาร'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className={cn(
                            "px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] border w-fit shadow-lg",
                            payment.status === 'verified' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              payment.status === 'pending' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          )}>
                            {payment.status === 'verified' ? 'อนุมัติแล้ว' :
                              payment.status === 'pending' ? 'รอตรวจสอบ' : 'ปฏิเสธ'}
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-3 justify-end items-center">
                            {payment.status === 'pending' ? (
                              <div className="flex gap-2">
                                <IconButton
                                  variant="primary"
                                  size="md"
                                  onClick={() => handleApproveClick(payment)}
                                  className="w-10 h-10 rounded-xl shadow-emerald-500/20 shadow-lg"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                </IconButton>
                                <IconButton
                                  variant="ghost"
                                  size="md"
                                  onClick={() => handleRejectClick(payment)}
                                  className="w-10 h-10 rounded-xl text-rose-400 bg-white/5 border border-white/5 hover:bg-rose-500 hover:text-white"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </IconButton>
                              </div>
                            ) : (
                              <IconButton
                                variant="ghost"
                                size="md"
                                onClick={() => openDetailModal(payment)}
                                className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 text-slate-500 hover:text-white hover:bg-white/10"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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

        {/* Mobile Card Layout */}
        <div className="md:hidden space-y-4">
          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center opacity-30 py-20">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl mb-4">📉</div>
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white">No Transactions</p>
            </div>
          ) : (
            payments.map((payment) => (
              <Card
                key={payment._id}
                variant="glass"
                className="p-6 relative overflow-hidden group"
                onClick={() => openDetailModal(payment)}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-center text-slate-400 font-black shadow-inner group-hover:text-emerald-400 transition-all">
                      {payment.user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-white uppercase tracking-tight leading-none mb-1">{payment.user?.username || '-'}</p>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{payment.package?.name || '-'}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                    payment.status === 'verified' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      payment.status === 'pending' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  )}>
                    {payment.status}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-5 border-t border-white/5">
                  <div>
                    <p className="text-2xl font-black text-white tracking-tighter leading-none mb-1">฿{payment.amount.toLocaleString()}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">
                      {new Date(payment.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {payment.status === 'pending' && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        variant="primary"
                        size="sm"
                        onClick={() => handleApproveClick(payment)}
                        className="w-10 h-10 rounded-xl shadow-emerald-500/20 shadow-lg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRejectClick(payment)}
                        className="w-10 h-10 rounded-xl text-rose-400 bg-white/5 border border-white/5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                      </IconButton>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div >

      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="ข้อมูลการชำระเงิน"
        subtitle="รายละเอียดการตรวจสอบและยืนยันการชำระเงิน"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-12 p-2">

            {/* Neural Summary Header */}
            <div className="flex flex-col lg:flex-row items-center justify-between p-8 sm:p-12 bg-slate-950 rounded-[2.5rem] sm:rounded-[3.5rem] relative overflow-hidden border border-white/5">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/[0.03] blur-[120px] rounded-full" />
              <div className="relative z-10 text-center lg:text-left mb-8 lg:mb-0">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] mb-4">ยอดเงินที่ตรวจสอบ</p>
                <p className="text-4xl sm:text-6xl font-black text-white tracking-tighter leading-none">฿{selectedPayment.amount.toLocaleString()}</p>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mt-8">
                  <div className="px-4 py-2 rounded-xl bg-white/[0.03] text-white/40 font-black text-[8px] uppercase tracking-widest border border-white/10">
                    โหมด {selectedPayment.paymentType}
                  </div>
                  <div className={cn(
                    "px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border shadow-2xl",
                    selectedPayment.status === 'verified' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      selectedPayment.status === 'pending' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  )}>
                    {selectedPayment.status === 'verified' ? 'อนุมัติการเข้าถึง' :
                      selectedPayment.status === 'pending' ? 'รอการตรวจสอบ' : 'การเชื่อมต่อถูกปฏิเสธ'}
                  </div>
                </div>
              </div>

              {selectedPayment.slipImageUrl && (
                <div
                  className="relative group cursor-zoom-in"
                  onClick={() => window.open(selectedPayment.slipImageUrl, '_blank')}
                >
                  <div className="absolute inset-0 bg-emerald-500/10 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <img
                    src={selectedPayment.slipImageUrl}
                    alt="Slip thumbnail"
                    className="w-32 h-44 sm:w-40 sm:h-56 object-cover rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10 border border-white/10 transform lg:-rotate-6 hover:rotate-0 transition-all duration-700"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10 px-4 sm:px-8">
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">ข้อมูลผู้ใช้</p>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center font-black text-emerald-400 border border-white/5">
                    {selectedPayment.user?.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-black text-white tracking-tight uppercase leading-none mb-1">{selectedPayment.user?.username || 'Unknown'}</p>
                    <p className="text-[10px] text-slate-400 font-bold tracking-wider lowercase leading-none">{selectedPayment.user?.email || '-'}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">ข้อมูลแพ็คเกจ</p>
                <p className="text-base font-black text-white tracking-tight uppercase">{selectedPayment.package?.name || 'Manual Index'}</p>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">{selectedPayment.package?.slipQuota?.toLocaleString() || '-'} เครดิต (เพิ่มเข้าสู่ระบบ)</p>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">วันและเวลา (UTC)</p>
                <p className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {new Date(selectedPayment.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">เลขอ้างอิงรายการ</p>
                <p className="text-[10px] font-mono font-bold text-slate-400 break-all select-all hover:text-emerald-400 transition-colors uppercase">{selectedPayment._id}</p>
              </div>
            </div>

            {selectedPayment.slipImageUrl && (
              <div className="space-y-6 pt-8">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] text-center">หลักฐานสลิปการโอนเงิน</p>
                <div className="p-2 sm:p-4 bg-slate-950 rounded-3xl sm:rounded-[4rem] border border-white/5 relative group">
                  <div className="overflow-hidden rounded-2xl sm:rounded-[3.2rem]">
                    <img
                      src={selectedPayment.slipImageUrl}
                      alt="Payment slip"
                      className="w-full max-h-[700px] object-contain group-hover:scale-105 transition-transform duration-1000"
                      onClick={() => window.open(selectedPayment.slipImageUrl, '_blank')}
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedPayment.status === 'pending' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-10">
                <Button
                  variant="primary"
                  size="lg"
                  className="h-16 sm:h-20 rounded-2xl sm:rounded-3xl font-black text-base sm:text-lg uppercase tracking-widest shadow-emerald-500/20 shadow-2xl flex flex-col items-center justify-center gap-0.5"
                  onClick={() => handleApproveClick(selectedPayment)}
                >
                  ยืนยันรายการ
                  <span className="text-[8px] opacity-40 font-bold uppercase tracking-[0.3em]">อนุมัติโควต้า</span>
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="h-16 sm:h-20 rounded-2xl sm:rounded-3xl font-black text-base sm:text-lg uppercase tracking-widest text-rose-500 bg-white/[0.04] border border-white/5 hover:bg-rose-500 hover:text-white transition-all flex flex-col items-center justify-center gap-0.5"
                  onClick={() => handleRejectClick(selectedPayment)}
                >
                  ปฏิเสธรายการ
                  <span className="text-[8px] opacity-40 font-bold uppercase tracking-[0.3em]">ระงับรายการนี้</span>
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
        title="ยืนยันการอนุมัติโควต้า"
        message={`ต้องการอนุมัติ ${selectedPayment?.package?.slipQuota?.toLocaleString()} เครดิต ให้แก่ผู้ใช้ "${selectedPayment?.user?.username}" หรือไม่? การดำเนินการนี้ไม่สามารถยกเลิกได้`}
        confirmText="ยืนยันการอนุมัติ"
        type="success"
        isLoading={isProcessing}
      />

      <Modal
        isOpen={showRejectModal}
        onClose={() => !isProcessing && setShowRejectModal(false)}
        title="ยืนยันการปฏิเสธรายการ"
        subtitle="ระบุเหตุผลที่ปฏิเสธรายการชำระเงินนี้"
        size="md"
      >
        <div className="space-y-8 p-2">
          <div className="p-8 bg-rose-500/[0.03] rounded-3xl border border-rose-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.02] to-transparent" />
            <p className="text-[10px] font-black text-rose-400/60 uppercase tracking-[0.4em] mb-4">ข้อมูลผู้ใช้</p>
            <p className="text-2xl font-black text-white tracking-tight uppercase leading-none">
              {selectedPayment?.user?.username}
            </p>
            <p className="text-[13px] font-black text-rose-500 mt-2 tracking-widest">฿{selectedPayment?.amount.toLocaleString()}</p>
          </div>

          <TextArea
            label="เหตุผลในการปฏิเสธรายการ"
            placeholder="เช่น สลิปไม่ชัดเจน, ยอดเงินไม่ตรง, หรือข้อมูลไม่ถูกต้อง..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            disabled={isProcessing}
            className="rounded-2xl bg-white/[0.03] border-white/10 text-white font-black text-[10px] p-6 leading-relaxed uppercase placeholder:text-slate-700"
          />

          <div className="flex gap-4 pt-6">
            <Button
              variant="ghost"
              className="flex-1 h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-white/[0.05]"
              onClick={() => setShowRejectModal(false)}
              disabled={isProcessing}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              className="flex-[2] h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-rose-500/20 shadow-2xl"
              onClick={handleReject}
              isLoading={isProcessing}
            >
              ยืนยันการปฏิเสธ
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout >
  );
}
