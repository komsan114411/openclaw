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

        {/* Neural Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 md:gap-8 mb-4">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-white tracking-[-0.04em] uppercase">
              Financial <span className="text-emerald-400">Ledger</span>
            </h1>
            <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] md:tracking-[0.3em] flex items-center gap-2">
              <span className="w-6 md:w-8 h-[2px] bg-emerald-500/30"></span>
              <span className="hidden sm:inline">Transactional Audit & Monetary Validation</span>
              <span className="sm:hidden">Transaction Audit</span>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white/60 backdrop-blur-2xl p-2.5 rounded-2xl sm:rounded-[2rem] border border-white shadow-premium w-full md:w-auto">
            <div className="hidden sm:flex pl-6 pr-2 py-2 items-center gap-2 border-r border-slate-100/50 mr-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Identity Filter</span>
            </div>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 sm:min-w-[200px] border-none shadow-none bg-transparent font-black uppercase text-[11px] tracking-wider focus:ring-0 cursor-pointer"
            >
              <option value="">ALL PROTOCOLS</option>
              <option value="pending">PENDING AUDIT</option>
              <option value="verified">VERIFIED TRANSACTION</option>
              <option value="rejected">REJECTED PAYLOAD</option>
            </Select>
            <IconButton
              variant="glass"
              size="md"
              onClick={fetchPayments}
              className="rounded-xl sm:rounded-2xl shadow-premium-sm w-full sm:w-12 h-12 bg-white/50 border-white hover:bg-white"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Financial Protocol Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <StatCard
            title="Awaiting Audit"
            value={pendingCount}
            icon={<span className="text-xl md:text-2xl">⏳</span>}
            color="amber"
            className="rounded-2xl md:rounded-[2.5rem] p-4 md:p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Verified Access"
            value={verifiedCount}
            icon={<span className="text-xl md:text-2xl">✅</span>}
            color="emerald"
            className="rounded-2xl md:rounded-[2.5rem] p-4 md:p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Rejected Signals"
            value={rejectedCount}
            icon={<span className="text-xl md:text-2xl">❌</span>}
            color="rose"
            className="rounded-2xl md:rounded-[2.5rem] p-4 md:p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
          <StatCard
            title="Gross Velocity"
            value={`฿${totalVerifiedAmount.toLocaleString()}`}
            icon={<span className="text-xl md:text-2xl">💰</span>}
            color="blue"
            className="rounded-2xl md:rounded-[2.5rem] p-4 md:p-8 border-none bg-white/60 backdrop-blur-3xl shadow-premium"
          />
        </div>

        {/* Neural Financial Ledger - Desktop Table */}
        <Card className="hidden md:block overflow-hidden p-0 border-none shadow-premium bg-white/60 backdrop-blur-3xl rounded-[3.5rem]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50/30 border-b border-slate-100/50">
                  <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Temporal Index</th>
                  <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Identity Matrix</th>
                  <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Protocol Layer</th>
                  <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Valuation</th>
                  <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Audit Status</th>
                  <th className="px-10 py-8 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/30">
                <AnimatePresence mode="popLayout">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-10 py-32 text-center">
                        <div className="flex flex-col items-center justify-center opacity-30">
                          <div className="w-20 h-20 rounded-[2rem] bg-slate-100 flex items-center justify-center text-4xl mb-6">📉</div>
                          <p className="text-[10px] font-black uppercase tracking-[0.5em]">Zero Transactions Logged</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <motion.tr
                        key={payment._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-white/40 transition-all duration-500 cursor-pointer"
                        onClick={() => openDetailModal(payment)}
                      >
                        <td className="px-10 py-8">
                          <div className="space-y-1.5">
                            <p className="text-sm font-black text-slate-900 tracking-tight">
                              {new Date(payment.createdAt).toLocaleDateString('en-US', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </p>
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/20" />
                              <p className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest opacity-60">
                                {new Date(payment.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-100 to-white flex items-center justify-center text-slate-400 font-black shadow-inner border border-slate-50 group-hover:scale-110 group-hover:shadow-lg transition-all duration-500">
                              {payment.user?.username?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <p className="text-[13px] font-black text-slate-900 uppercase tracking-tight mb-1">{payment.user?.username || '-'}</p>
                              <p className="text-[10px] font-bold text-slate-400 tracking-wider lowercase opacity-60">{payment.user?.email || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="space-y-2">
                            <p className="text-[11px] font-black text-slate-900 leading-none uppercase tracking-widest">{payment.package?.name || '-'}</p>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="indigo" size="xs" className="bg-indigo-50/50 text-indigo-600 border-none font-black text-[9px] px-2 py-0.5 tracking-widest uppercase">
                                {payment.package?.slipQuota?.toLocaleString() || '-'} PAYLOAD
                              </Badge>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="space-y-1">
                            <p className="text-xl font-black text-slate-900 tracking-tighter">฿{payment.amount.toLocaleString()}</p>
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", payment.paymentType === 'usdt' ? "bg-emerald-500" : "bg-indigo-500")} />
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-60">
                                {payment.paymentType === 'usdt' ? 'USDT MATRIX' : 'FIAT GATEWAY'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className={cn(
                            "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border w-fit shadow-sm",
                            payment.status === 'verified' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              payment.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                "bg-rose-50 text-rose-600 border-rose-100"
                          )}>
                            {payment.status === 'verified' ? 'Authorized' :
                              payment.status === 'pending' ? 'Verification' : 'Rejected'}
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
                                  className="w-11 h-11 rounded-2xl shadow-emerald-500/20 shadow-lg"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                </IconButton>
                                <IconButton
                                  variant="outline"
                                  size="md"
                                  onClick={() => handleRejectClick(payment)}
                                  className="w-11 h-11 rounded-2xl text-rose-500 border-rose-100 hover:bg-rose-50"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </IconButton>
                              </div>
                            ) : (
                              <IconButton
                                variant="glass"
                                size="md"
                                onClick={() => openDetailModal(payment)}
                                className="w-11 h-11 rounded-2xl bg-white/50 border-white text-slate-400 hover:text-slate-900"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <Card className="p-10 text-center border-none bg-white/60 backdrop-blur-3xl rounded-3xl">
              <div className="flex flex-col items-center gap-4 opacity-40">
                <span className="text-4xl">📉</span>
                <p className="text-xs font-black uppercase tracking-widest">No Transactions</p>
              </div>
            </Card>
          ) : (
            payments.map((payment) => (
              <Card
                key={payment._id}
                className="p-5 border-none bg-white/60 backdrop-blur-3xl rounded-3xl"
                onClick={() => openDetailModal(payment)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-slate-100 to-white flex items-center justify-center text-slate-500 font-black shadow-inner border border-slate-50">
                      {payment.user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{payment.user?.username || '-'}</p>
                      <p className="text-[10px] font-bold text-slate-400">{payment.package?.name || '-'}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest",
                    payment.status === 'verified' ? "bg-emerald-50 text-emerald-600" :
                      payment.status === 'pending' ? "bg-amber-50 text-amber-600" :
                        "bg-rose-50 text-rose-600"
                  )}>
                    {payment.status}
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-slate-100/50">
                  <div>
                    <p className="text-xl font-black text-slate-900 tracking-tighter">฿{payment.amount.toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {new Date(payment.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  {payment.status === 'pending' && (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        variant="primary"
                        size="md"
                        onClick={() => handleApproveClick(payment)}
                        className="w-11 h-11 rounded-xl shadow-emerald-500/20 shadow-lg"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </IconButton>
                      <IconButton
                        variant="outline"
                        size="md"
                        onClick={() => handleRejectClick(payment)}
                        className="w-11 h-11 rounded-xl text-rose-500 border-rose-100 hover:bg-rose-50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                      </IconButton>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="TRANSACTION INTELLIGENCE"
        size="lg"
      >
        {selectedPayment && (
          <div className="space-y-12 p-2">

            {/* Neural Summary Header */}
            <div className="flex flex-col md:flex-row items-center justify-between p-10 bg-slate-900 rounded-[3.5rem] relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full" />
              <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-3">Verification Payload</p>
                <p className="text-5xl font-black text-white tracking-tighter">฿{selectedPayment.amount.toLocaleString()}</p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-6">
                  <div className="px-4 py-1.5 rounded-full bg-white/10 text-white font-black text-[9px] uppercase tracking-widest border border-white/10 border-dashed">
                    {selectedPayment.paymentType} Protocol
                  </div>
                  <div className={cn(
                    "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-xl shadow-black/20",
                    selectedPayment.status === 'verified' ? "bg-emerald-500 text-white border-emerald-400" :
                      selectedPayment.status === 'pending' ? "bg-amber-500 text-white border-amber-400" :
                        "bg-rose-500 text-white border-rose-400"
                  )}>
                    {selectedPayment.status === 'verified' ? 'Authorization Confirmed' :
                      selectedPayment.status === 'pending' ? 'Audit in Progress' : 'Access Denied'}
                  </div>
                </div>
              </div>

              {selectedPayment.slipImageUrl && (
                <div
                  className="relative group cursor-zoom-in group/slip"
                  onClick={() => window.open(selectedPayment.slipImageUrl, '_blank')}
                >
                  <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <img
                    src={selectedPayment.slipImageUrl}
                    alt="Slip thumbnail"
                    className="w-28 h-40 object-cover rounded-[1.5rem] shadow-2xl relative z-10 border-2 border-white/20 -rotate-6 group-hover:rotate-0 transition-all duration-700"
                  />
                  <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-500 rounded-[1.5rem] flex items-center justify-center backdrop-blur-sm -rotate-6 group-hover:rotate-0">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10 px-4">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Identity Matrix</p>
                <p className="text-xl font-black text-slate-900 tracking-tight uppercase">{selectedPayment.user?.username || 'Unknown Operator'}</p>
                <p className="text-xs text-slate-400 font-bold tracking-wider">{selectedPayment.user?.email || 'No registry email'}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Protocol Layer</p>
                <p className="text-xl font-black text-slate-900 tracking-tight uppercase">{selectedPayment.package?.name || 'Manual Index'}</p>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">{selectedPayment.package?.slipQuota?.toLocaleString() || '-'} Credits Applied</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Manifest Reference</p>
                <p className="text-xs font-mono font-black text-slate-400 break-all select-all hover:text-emerald-600 transition-colors uppercase">{selectedPayment._id}</p>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Temporal Marker (UTC)</p>
                <p className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {new Date(selectedPayment.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              </div>
            </div>

            {selectedPayment.slipImageUrl && (
              <div className="space-y-6 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] text-center">Receipt Metadata Visualization</p>
                <div className="p-1.5 bg-slate-900 rounded-[3.5rem] shadow-2xl border-[12px] border-slate-900">
                  <div className="overflow-hidden rounded-[2.8rem] bg-slate-800">
                    <img
                      src={selectedPayment.slipImageUrl}
                      alt="Payment slip"
                      className="w-full max-h-[600px] object-contain hover:scale-105 transition-transform duration-1000"
                      onClick={() => window.open(selectedPayment.slipImageUrl, '_blank')}
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedPayment.status === 'pending' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                <Button
                  variant="primary"
                  size="lg"
                  className="h-20 rounded-[2rem] font-black text-lg uppercase tracking-widest shadow-emerald-500/20 shadow-2xl flex flex-col items-center justify-center gap-1"
                  onClick={() => handleApproveClick(selectedPayment)}
                >
                  Confirm Protocol
                  <span className="text-[9px] opacity-40 font-bold uppercase tracking-[0.3em]">Authorize Entry</span>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-20 rounded-[2rem] font-black text-lg uppercase tracking-widest text-rose-500 border-rose-100 hover:bg-rose-50 hover:border-rose-300 flex flex-col items-center justify-center gap-1"
                  onClick={() => handleRejectClick(selectedPayment)}
                >
                  Deny Protocol
                  <span className="text-[9px] opacity-40 font-bold uppercase tracking-[0.3em]">Reject Access</span>
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
        title="AUTHORIZE CREDIT INJECTION"
        message={`Authorize immediate transmission of ${selectedPayment?.package?.slipQuota?.toLocaleString()} credits to index "${selectedPayment?.user?.username}"? This protocol is irreversible.`}
        confirmText="Authorize Transmission"
        type="success"
        isLoading={isProcessing}
      />

      <Modal
        isOpen={showRejectModal}
        onClose={() => !isProcessing && setShowRejectModal(false)}
        title="TRANSACTION DENIAL PROTOCOL"
        size="md"
      >
        <div className="space-y-10 p-2">
          <div className="p-8 bg-rose-50/50 rounded-[2.5rem] border border-rose-100/50 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-3xl rounded-full" />
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em] mb-3">Impacted Identity Matrix</p>
            <p className="text-2xl font-black text-rose-900 tracking-tight uppercase">
              {selectedPayment?.user?.username} <span className="text-[14px] opacity-40 ml-1">฿{selectedPayment?.amount.toLocaleString()}</span>
            </p>
          </div>

          <TextArea
            label="DENIAL RATIONALE & FEEDBACK"
            placeholder="e.g. VISUAL RESOLUTION INSUFFICIENT, METADATA MISMATCH DETECTED..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={5}
            disabled={isProcessing}
            className="rounded-[2rem] bg-slate-50 border-none shadow-inner font-black text-[11px] p-6 leading-relaxed uppercase"
          />

          <div className="flex gap-4 pt-4 border-t border-slate-50">
            <Button
              variant="ghost"
              className="flex-1 h-14 rounded-2xl font-black text-[11px] uppercase tracking-widest text-slate-400 hover:bg-slate-50"
              onClick={() => setShowRejectModal(false)}
              disabled={isProcessing}
            >
              Abort
            </Button>
            <Button
              variant="danger"
              className="flex-[2] h-14 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-rose-500/10 shadow-2xl"
              onClick={handleReject}
              isLoading={isProcessing}
            >
              Execute Denial Protocol
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
