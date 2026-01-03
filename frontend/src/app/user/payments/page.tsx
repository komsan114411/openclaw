'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi } from '@/lib/api';
import { Payment } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';

export default function UserPaymentsPage() {
  // State
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);

  // Fetch payment history
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const paymentsRes = await paymentsApi.getMy();
      setPayments(paymentsRes.data.payments || []);
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

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format currency
  const formatAmount = (amount: number, type: string) => {
    if (type === 'usdt') {
      return `$${amount.toLocaleString()}`;
    }
    return `฿${amount.toLocaleString()}`;
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { label: string; className: string }> = {
      pending: {
        label: 'รอตรวจสอบ',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      },
      verified: {
        label: 'อนุมัติแล้ว',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      },
      approved: {
        label: 'อนุมัติแล้ว',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      },
      rejected: {
        label: 'ปฏิเสธ',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
      },
      failed: {
        label: 'ล้มเหลว',
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
      },
      cancelled: {
        label: 'ยกเลิก',
        className: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      },
    };

    const { label, className } = config[status] || config.pending;

    return (
      <span className={`px-3 py-1 text-xs font-semibold rounded-lg border ${className}`}>
        {label}
      </span>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดประวัติการชำระเงิน..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
              ประวัติการชำระเงิน <span className="text-[#06C755]">(Payment History)</span>
            </h1>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={fetchData}
              className="h-10 px-4 rounded-lg border-white/20"
            >
              🔄 รีเฟรช
            </Button>
            <Link href="/user/packages">
              <Button
                variant="primary"
                className="h-10 px-4 rounded-lg bg-[#06C755] hover:bg-[#05a347]"
              >
                💎 ซื้อแพ็คเกจ
              </Button>
            </Link>
          </div>
        </div>

        {/* Empty State */}
        {payments.length === 0 ? (
          <Card variant="glass" className="border border-white/10">
            <EmptyState
              icon="💸"
              title="ยังไม่มีประวัติการชำระเงิน"
              description="เมื่อคุณทำรายการซื้อแพ็คเกจ รายการจะปรากฏที่นี่"
              variant="glass"
              action={
                <Link href="/user/packages">
                  <Button variant="primary" className="h-11 px-6 rounded-xl bg-[#06C755]">
                    ไปหน้าแพ็คเกจ
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            {/* Desktop Table */}
            <Card className="hidden md:block p-0 overflow-hidden rounded-xl border border-white/10" variant="glass">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        วันที่
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        แพ็คเกจ
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        จำนวนเงิน
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        สถานะ
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        สลิป
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payments.map((payment) => (
                      <tr key={payment._id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm text-white font-medium">
                            {formatDate(payment.createdAt)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-white font-medium">
                            {payment.paymentType === 'usdt' ? 'USDT' : 'โอนเงิน'}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            #{payment._id.slice(-8).toUpperCase()}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-lg font-black text-[#06C755]">
                            {formatAmount(payment.amount, payment.paymentType)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={payment.status} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          {payment.slipImageUrl ? (
                            <button
                              onClick={() => setSelectedSlip(payment.slipImageUrl!)}
                              className="px-3 py-1.5 text-xs font-semibold text-[#06C755] bg-[#06C755]/10 hover:bg-[#06C755]/20 rounded-lg border border-[#06C755]/30 transition-all"
                            >
                              📄 ดูสลิป
                            </button>
                          ) : (
                            <span className="text-slate-500 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {payments.map((payment) => (
                <Card
                  key={payment._id}
                  variant="glass"
                  className="p-4 border border-white/10 rounded-xl"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-lg font-black text-[#06C755]">
                        {formatAmount(payment.amount, payment.paymentType)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDate(payment.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={payment.status} />
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-white/10">
                    <div>
                      <p className="text-sm text-white font-medium">
                        {payment.paymentType === 'usdt' ? 'USDT' : 'โอนเงิน'}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        #{payment._id.slice(-8).toUpperCase()}
                      </p>
                    </div>
                    {payment.slipImageUrl && (
                      <button
                        onClick={() => setSelectedSlip(payment.slipImageUrl!)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#06C755] bg-[#06C755]/10 hover:bg-[#06C755]/20 rounded-lg border border-[#06C755]/30 transition-all"
                      >
                        📄 ดูสลิป
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                แสดง {payments.length} รายการ
              </p>
            </div>
          </>
        )}
      </div>

      {/* Slip Image Modal */}
      <Modal
        isOpen={!!selectedSlip}
        onClose={() => setSelectedSlip(null)}
        title="สลิปการชำระเงิน"
        size="lg"
      >
        <div className="p-4">
          {selectedSlip && (
            <img
              src={selectedSlip}
              alt="Payment Slip"
              className="w-full max-h-[70vh] object-contain rounded-xl"
            />
          )}
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setSelectedSlip(null)}
              className="h-10 px-6 rounded-lg"
            >
              ปิด
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
