'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Select } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

interface WalletTransaction {
  _id: string;
  userId: {
    _id: string;
    username: string;
    email?: string;
    fullName?: string;
  };
  type: 'deposit' | 'purchase' | 'bonus' | 'adjustment' | 'refund';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled';
  transRef?: string;
  hasSlipImage?: boolean;
  metadata?: {
    network?: string;
    txHash?: string;
    usdtAmount?: number;
    walletAddress?: string;
  };
  verificationResult?: any;
  adminNotes?: string;
  processedBy?: {
    username: string;
  };
  createdAt: string;
  completedAt?: string;
}

export default function AdminWalletTransactionsPage() {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('deposit');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [loadingSlip, setLoadingSlip] = useState(false);

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await walletApi.getAllTransactions({
        limit: 100,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setTransactions(response.data.transactions || []);
    } catch (error: any) {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchTransactions();
  }, [fetchTransactions]);

  const openDetailModal = async (tx: WalletTransaction) => {
    setSelectedTransaction(tx);
    setSlipImage(null);
    setShowDetailModal(true);

    // Load slip image if available
    if (tx.hasSlipImage && tx.type === 'deposit') {
      setLoadingSlip(true);
      try {
        const response = await walletApi.getTransactionById(tx._id);
        if (response.data.transaction?.slipImageData) {
          setSlipImage(response.data.transaction.slipImageData);
        }
      } catch (error) {
        console.error('Failed to load slip image:', error);
      } finally {
        setLoadingSlip(false);
      }
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      deposit: 'เติมเครดิต',
      purchase: 'ซื้อแพ็คเกจ',
      bonus: 'โบนัส',
      adjustment: 'ปรับยอด',
      refund: 'คืนเงิน',
    };
    return labels[type] || type;
  };

  const getTypeVariant = (type: string): 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'slate' => {
    const variants: Record<string, 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'slate'> = {
      deposit: 'emerald',
      purchase: 'blue',
      bonus: 'amber',
      adjustment: 'purple',
      refund: 'rose',
    };
    return variants[type] || 'slate';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'รอดำเนินการ',
      completed: 'สำเร็จ',
      rejected: 'ปฏิเสธ',
      cancelled: 'ยกเลิก',
    };
    return labels[status] || status;
  };

  const getStatusType = (status: string): 'pending' | 'success' | 'rejected' | 'cancelled' => {
    const statusMap: Record<string, 'pending' | 'success' | 'rejected' | 'cancelled'> = {
      pending: 'pending',
      completed: 'success',
      rejected: 'rejected',
      cancelled: 'cancelled',
    };
    return statusMap[status] || 'cancelled';
  };

  // Statistics
  const depositCount = transactions.filter(t => t.type === 'deposit').length;
  const completedCount = transactions.filter(t => t.status === 'completed').length;
  const pendingCount = transactions.filter(t => t.status === 'pending').length;
  const totalAmount = transactions
    .filter(t => t.status === 'completed' && t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);

  // Map status for StatusBadge
  const mapStatusForBadge = (status: string): 'pending' | 'success' | 'rejected' | 'cancelled' => {
    if (status === 'completed') return 'success';
    if (status === 'pending') return 'pending';
    if (status === 'rejected') return 'rejected';
    return 'cancelled';
  };

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
        {/* Header */}
        <div className="page-header relative z-10 flex-col lg:flex-row items-start lg:items-end">
          <div className="space-y-1 sm:space-y-2 text-left">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              รายการ<span className="text-[#06C755]">เติมเครดิต</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              ประวัติการเติมเงินของผู้ใช้ทั้งหมด (สลิป & USDT)
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#0F1A14] p-2 rounded-full border border-emerald-500/10 w-full lg:w-auto mt-6 lg:mt-0">
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 sm:min-w-[140px] border-none shadow-none bg-transparent font-semibold text-xs focus:ring-0 cursor-pointer text-white rounded-full px-4"
            >
              <option value="" className="bg-[#0A0F0D]">ทุกประเภท</option>
              <option value="deposit" className="bg-[#0A0F0D]">เติมเครดิต</option>
              <option value="purchase" className="bg-[#0A0F0D]">ซื้อแพ็คเกจ</option>
              <option value="bonus" className="bg-[#0A0F0D]">โบนัส</option>
              <option value="adjustment" className="bg-[#0A0F0D]">ปรับยอด</option>
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:min-w-[140px] border-none shadow-none bg-transparent font-semibold text-xs focus:ring-0 cursor-pointer text-white rounded-full px-4"
            >
              <option value="" className="bg-[#0A0F0D]">ทุกสถานะ</option>
              <option value="pending" className="bg-[#0A0F0D]">รอดำเนินการ</option>
              <option value="completed" className="bg-[#0A0F0D]">สำเร็จ</option>
              <option value="rejected" className="bg-[#0A0F0D]">ปฏิเสธ</option>
            </Select>
            <IconButton
              variant="ghost"
              size="md"
              onClick={fetchTransactions}
              className="rounded-full w-10 h-10 bg-emerald-500/10 text-[#06C755] hover:bg-emerald-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Stats */}
        <div className="grid-stats">
          <StatCard title="รายการเติมเงิน" value={depositCount} icon="💳" color="emerald" variant="glass" />
          <StatCard title="สำเร็จ" value={completedCount} icon="✅" color="blue" variant="glass" />
          <StatCard title="รอดำเนินการ" value={pendingCount} icon="⏳" color="amber" variant="glass" />
          <StatCard title="ยอดรวม" value={`฿${totalAmount.toLocaleString()}`} icon="💰" color="violet" variant="glass" />
        </div>

        {/* Table */}
        <Card className="overflow-hidden" variant="glass" padding="none">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/5">
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-slate-400 uppercase">วันที่</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-slate-400 uppercase">ผู้ใช้</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-slate-400 uppercase">ประเภท</th>
                  <th className="px-6 py-4 text-left text-[10px] font-semibold text-slate-400 uppercase">รายละเอียด</th>
                  <th className="px-6 py-4 text-right text-[10px] font-semibold text-slate-400 uppercase">จำนวนเงิน</th>
                  <th className="px-6 py-4 text-center text-[10px] font-semibold text-slate-400 uppercase">สถานะ</th>
                  <th className="px-6 py-4 text-center text-[10px] font-semibold text-slate-400 uppercase">ดูรายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                <AnimatePresence mode="popLayout">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-10 py-20 text-center">
                        <div className="flex flex-col items-center justify-center opacity-30">
                          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-3xl mb-4">📭</div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em]">ไม่พบรายการ</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <motion.tr
                        key={tx._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-white/[0.01] transition-all duration-300"
                      >
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">
                              {new Date(tx.createdAt).toLocaleDateString('th-TH', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {new Date(tx.createdAt).toLocaleTimeString('th-TH', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">
                              {tx.userId?.username || 'Unknown'}
                            </p>
                            {tx.userId?.email && (
                              <p className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                {tx.userId.email}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={getTypeVariant(tx.type)}>
                            {getTypeLabel(tx.type)}
                          </Badge>
                          {tx.metadata?.network && (
                            <p className="text-[9px] text-slate-500 mt-1">
                              {tx.metadata.network}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-slate-300 max-w-[200px] truncate">
                            {tx.description}
                          </p>
                          {tx.transRef && (
                            <p className="text-[9px] text-slate-500 font-mono mt-1">
                              Ref: {tx.transRef}
                            </p>
                          )}
                          {tx.metadata?.txHash && (
                            <p className="text-[9px] text-slate-500 font-mono mt-1 truncate max-w-[150px]">
                              TxHash: {tx.metadata.txHash.slice(0, 10)}...
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className={`text-sm font-bold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()} ฿
                          </p>
                          {tx.metadata?.usdtAmount && (
                            <p className="text-[9px] text-slate-500">
                              ({tx.metadata.usdtAmount} USDT)
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={mapStatusForBadge(tx.status)} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetailModal(tx)}
                            className="text-slate-400 hover:text-white"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </IconButton>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Detail Modal */}
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title="รายละเอียดธุรกรรม"
          size="lg"
        >
          {selectedTransaction && (
            <div className="space-y-6">
              {/* User Info */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">ข้อมูลผู้ใช้</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-500">ชื่อผู้ใช้</p>
                    <p className="text-sm font-semibold text-white">{selectedTransaction.userId?.username || 'Unknown'}</p>
                  </div>
                  {selectedTransaction.userId?.email && (
                    <div>
                      <p className="text-[10px] text-slate-500">อีเมล</p>
                      <p className="text-sm text-white">{selectedTransaction.userId.email}</p>
                    </div>
                  )}
                  {selectedTransaction.userId?.fullName && (
                    <div>
                      <p className="text-[10px] text-slate-500">ชื่อ-นามสกุล</p>
                      <p className="text-sm text-white">{selectedTransaction.userId.fullName}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Transaction Info */}
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">ข้อมูลธุรกรรม</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-500">ประเภท</p>
                    <Badge variant={getTypeVariant(selectedTransaction.type)}>
                      {getTypeLabel(selectedTransaction.type)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">สถานะ</p>
                    <StatusBadge status={mapStatusForBadge(selectedTransaction.status)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">จำนวนเงิน</p>
                    <p className={`text-lg font-bold ${selectedTransaction.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedTransaction.amount >= 0 ? '+' : ''}{selectedTransaction.amount.toLocaleString()} ฿
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">ยอดคงเหลือหลังทำรายการ</p>
                    <p className="text-sm text-white">{selectedTransaction.balanceAfter?.toLocaleString() || 0} ฿</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">วันที่ทำรายการ</p>
                    <p className="text-sm text-white">
                      {new Date(selectedTransaction.createdAt).toLocaleString('th-TH')}
                    </p>
                  </div>
                  {selectedTransaction.completedAt && (
                    <div>
                      <p className="text-[10px] text-slate-500">วันที่สำเร็จ</p>
                      <p className="text-sm text-white">
                        {new Date(selectedTransaction.completedAt).toLocaleString('th-TH')}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-[10px] text-slate-500">รายละเอียด</p>
                  <p className="text-sm text-white">{selectedTransaction.description}</p>
                </div>
              </div>

              {/* USDT Info */}
              {selectedTransaction.metadata?.network && (
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">ข้อมูล USDT</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500">Network</p>
                      <p className="text-sm text-white">{selectedTransaction.metadata.network}</p>
                    </div>
                    {selectedTransaction.metadata.usdtAmount && (
                      <div>
                        <p className="text-[10px] text-slate-500">จำนวน USDT</p>
                        <p className="text-sm text-white">{selectedTransaction.metadata.usdtAmount} USDT</p>
                      </div>
                    )}
                    {selectedTransaction.metadata.walletAddress && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-slate-500">กระเป๋าปลายทาง</p>
                        <p className="text-xs text-white font-mono break-all">{selectedTransaction.metadata.walletAddress}</p>
                      </div>
                    )}
                    {selectedTransaction.metadata.txHash && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-slate-500">Transaction Hash</p>
                        <p className="text-xs text-white font-mono break-all">{selectedTransaction.metadata.txHash}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Slip Reference */}
              {selectedTransaction.transRef && (
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">ข้อมูลสลิป</h3>
                  <div>
                    <p className="text-[10px] text-slate-500">เลขอ้างอิง</p>
                    <p className="text-sm text-white font-mono">{selectedTransaction.transRef}</p>
                  </div>
                </div>
              )}

              {/* Slip Image */}
              {selectedTransaction.hasSlipImage && (
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">รูปสลิป</h3>
                  {loadingSlip ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                    </div>
                  ) : slipImage ? (
                    <img
                      src={`data:image/jpeg;base64,${slipImage}`}
                      alt="Slip"
                      className="max-w-full max-h-[400px] rounded-lg mx-auto"
                    />
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">ไม่สามารถโหลดรูปสลิปได้</p>
                  )}
                </div>
              )}

              {/* Admin Notes */}
              {selectedTransaction.adminNotes && (
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">หมายเหตุ Admin</h3>
                  <p className="text-sm text-white">{selectedTransaction.adminNotes}</p>
                </div>
              )}

              {/* Processed By */}
              {selectedTransaction.processedBy && (
                <div className="bg-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">ดำเนินการโดย</h3>
                  <p className="text-sm text-white">{selectedTransaction.processedBy.username}</p>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
