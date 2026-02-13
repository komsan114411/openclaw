'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi, walletApi } from '@/lib/api';
import { Payment, WalletTransaction, UnifiedTransaction } from '@/types';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import {
  Banknote,
  Package,
  Gift,
  Undo2,
  Settings,
  Wallet,
  FileText,
  RefreshCw,
} from 'lucide-react';

export default function UserPaymentsPage() {
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'deposit' | 'purchase'>('all');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [paymentsRes, walletRes] = await Promise.all([
        paymentsApi.getMy().catch(() => ({ data: { payments: [] } })),
        walletApi.getTransactions(50).catch(() => ({ data: { transactions: [] } })),
      ]);

      // Convert payments to unified format
      const packagePayments: UnifiedTransaction[] = (paymentsRes.data.payments || []).map((p: Payment) => ({
        _id: p._id,
        type: 'package' as const,
        amount: p.amount,
        status: p.status,
        description: p.paymentType === 'usdt' ? 'ซื้อแพ็คเกจ (USDT)' : 'ซื้อแพ็คเกจ (โอนเงิน)',
        createdAt: p.createdAt,
        slipImageUrl: p.slipImageUrl,
        paymentType: p.paymentType,
        source: 'payment' as const,
      }));

      // Convert wallet transactions to unified format
      const walletTransactions: UnifiedTransaction[] = (walletRes.data.transactions || walletRes.data || []).map((t: WalletTransaction) => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        status: t.status,
        description: t.description || getTypeLabel(t.type),
        createdAt: t.createdAt,
        slipImageUrl: t.slipImage,
        source: 'wallet' as const,
      }));

      // Combine and sort by date (newest first)
      const combined = [...packagePayments, ...walletTransactions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setTransactions(combined);
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

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      deposit: 'เติมเครดิต',
      purchase: 'ซื้อแพ็คเกจ',
      package: 'ซื้อแพ็คเกจ',
      bonus: 'โบนัส',
      refund: 'คืนเงิน',
      adjustment: 'ปรับยอด',
    };
    return labels[type] || type;
  };

  const getTypeIcon = (type: string) => {
    const iconClass = "w-4 h-4 sm:w-5 sm:h-5";
    switch (type) {
      case 'deposit':
        return <Banknote className={cn(iconClass, "text-emerald-400")} />;
      case 'purchase':
        return <Package className={cn(iconClass, "text-blue-400")} />;
      case 'package':
        return <Package className={cn(iconClass, "text-blue-400")} />;
      case 'bonus':
        return <Gift className={cn(iconClass, "text-amber-400")} />;
      case 'refund':
        return <Undo2 className={cn(iconClass, "text-violet-400")} />;
      case 'adjustment':
        return <Settings className={cn(iconClass, "text-slate-400")} />;
      default:
        return <Wallet className={cn(iconClass, "text-emerald-400")} />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number, isPositive: boolean = true) => {
    const prefix = isPositive ? '+' : '';
    return `${prefix}฿${Math.abs(amount).toLocaleString()}`;
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { label: string; className: string }> = {
      pending: {
        label: 'รอตรวจสอบ',
        className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      },
      verified: {
        label: 'สำเร็จ',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      },
      approved: {
        label: 'สำเร็จ',
        className: 'bg-green-500/20 text-green-400 border-green-500/30',
      },
      completed: {
        label: 'สำเร็จ',
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
      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border ${className}`}>
        {label}
      </span>
    );
  };

  // Filter transactions
  const filteredTransactions = transactions.filter((t) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'deposit') return t.type === 'deposit' || t.type === 'bonus';
    if (activeFilter === 'purchase') return t.type === 'package' || t.type === 'purchase';
    return true;
  });

  // Calculate stats
  const totalDeposits = transactions
    .filter((t) => t.type === 'deposit' && (t.status === 'completed' || t.status === 'verified'))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPurchases = transactions
    .filter((t) => (t.type === 'package' || t.type === 'purchase') && (t.status === 'completed' || t.status === 'verified' || t.status === 'approved'))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const pendingCount = transactions.filter((t) => t.status === 'pending').length;

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดประวัติธุรกรรม..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              ประวัติ<span className="text-[#06C755]">ธุรกรรม</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">รายการเติมเครดิตและซื้อแพ็คเกจ</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchData}
              className="h-10 px-4 rounded-lg border-white/20"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Link href="/user/wallet">
              <Button
                variant="primary"
                className="h-10 px-4 rounded-lg bg-[#06C755] hover:bg-[#05a347] gap-2"
              >
                <Banknote className="w-4 h-4" /> เติมเครดิต
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Card variant="glass" className="p-3 sm:p-4 border border-white/10 text-center">
            <p className="text-[10px] text-slate-400 font-semibold mb-1">เติมสะสม</p>
            <p className="text-base sm:text-lg md:text-xl font-black text-emerald-400">฿{totalDeposits.toLocaleString()}</p>
          </Card>
          <Card variant="glass" className="p-3 sm:p-4 border border-white/10 text-center">
            <p className="text-[10px] text-slate-400 font-semibold mb-1">ใช้ไป</p>
            <p className="text-base sm:text-lg md:text-xl font-black text-rose-400">฿{totalPurchases.toLocaleString()}</p>
          </Card>
          <Card variant="glass" className="p-3 sm:p-4 border border-white/10 text-center">
            <p className="text-[10px] text-slate-400 font-semibold mb-1">รอดำเนินการ</p>
            <p className="text-base sm:text-lg md:text-xl font-black text-yellow-400">{pendingCount}</p>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 p-1 bg-white/5 border border-white/10 rounded-xl w-full sm:w-fit overflow-x-auto">
          {[
            { key: 'all', label: 'ทั้งหมด', icon: null },
            { key: 'deposit', label: 'เติมเครดิต', icon: <Banknote className="w-3 h-3" /> },
            { key: 'purchase', label: 'ซื้อแพ็คเกจ', icon: <Package className="w-3 h-3" /> },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key as any)}
              className={cn(
                "px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap min-h-[44px]",
                activeFilter === filter.key
                  ? "bg-[#06C755] text-white shadow-lg"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              {filter.icon} <span className="hidden xs:inline">{filter.label}</span><span className="xs:hidden">{filter.key === 'all' ? 'ทั้งหมด' : filter.key === 'deposit' ? 'เติม' : 'แพ็คเกจ'}</span>
            </button>
          ))}
        </div>

        {/* Transactions List */}
        {filteredTransactions.length === 0 ? (
          <Card variant="glass" className="border border-white/10">
            <EmptyState
              icon="💸"
              title="ยังไม่มีรายการ"
              description="เมื่อคุณทำรายการเติมเครดิตหรือซื้อแพ็คเกจ จะปรากฏที่นี่"
              variant="glass"
              action={
                <Link href="/user/wallet">
                  <Button variant="primary" className="h-11 px-6 rounded-xl bg-[#06C755]">
                    ไปหน้าเติมเครดิต
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((tx) => {
              const isPositive = tx.type === 'deposit' || tx.type === 'bonus' || tx.type === 'refund';

              return (
                <Card
                  key={`${tx.source}-${tx._id}`}
                  variant="glass"
                  className="p-4 border border-white/10 rounded-xl hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    {/* Icon */}
                    <div className={cn(
                      "w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0",
                      isPositive ? "bg-emerald-500/10" : "bg-slate-500/10"
                    )}>
                      {getTypeIcon(tx.type)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">{tx.description}</p>
                        <StatusBadge status={tx.status} />
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-500">{formatDate(tx.createdAt)}</p>
                    </div>

                    {/* Amount & Actions */}
                    <div className="text-right flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3 flex-shrink-0">
                      <p className={cn(
                        "text-sm sm:text-lg font-black",
                        isPositive ? "text-emerald-400" : "text-white"
                      )}>
                        {formatAmount(tx.amount, isPositive)}
                      </p>
                      {tx.slipImageUrl && (
                        <button
                          onClick={() => setSelectedSlip(tx.slipImageUrl!)}
                          className="p-2 text-slate-400 hover:text-[#06C755] hover:bg-[#06C755]/10 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="ดูสลิป"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Summary */}
            <div className="mt-4 text-center">
              <p className="text-xs text-slate-500">
                แสดง {filteredTransactions.length} รายการ
              </p>
            </div>
          </div>
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
