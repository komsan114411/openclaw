'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi } from '@/lib/api';
import { Card, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Transaction {
  _id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await walletApi.getTransactions(50, 0);
      setTransactions(res.data || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const getTypeConfig = (type: string) => {
    const c: Record<string, { icon: string; label: string; color: string }> = {
      deposit: { icon: '💰', label: 'เติมเงิน', color: 'text-green-400' },
      purchase: { icon: '🛒', label: 'ซื้อแพ็คเกจ', color: 'text-red-400' },
      bonus: { icon: '🎁', label: 'โบนัส', color: 'text-green-400' },
      deduction: { icon: '➖', label: 'หักเครดิต', color: 'text-red-400' },
    };
    return c[type] || { icon: '💳', label: type, color: 'text-slate-400' };
  };

  const getStatusBadge = (status: string) => {
    const c: Record<string, { label: string; cls: string }> = {
      completed: { label: 'สำเร็จ', cls: 'bg-green-500/20 text-green-400' },
      pending: { label: 'รอดำเนินการ', cls: 'bg-yellow-500/20 text-yellow-400' },
      rejected: { label: 'ปฏิเสธ', cls: 'bg-red-500/20 text-red-400' },
    };
    const { label, cls } = c[status] || c.pending;
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded ${cls}`}>{label}</span>;
  };

  if (isLoading) return <DashboardLayout><PageLoading message="กำลังโหลด..." /></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <Link href="/user/wallet" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">← กลับ</Link>
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              ประวัติธุรกรรม <span className="text-[#06C755]">(Transactions)</span>
            </h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={fetchTransactions} className="h-10 px-4 border-white/20">🔄 รีเฟรช</Button>
            <Link href="/user/wallet/deposit">
              <Button variant="primary" className="h-10 px-4 bg-[#06C755]">💰 เติมเงิน</Button>
            </Link>
          </div>
        </div>

        {transactions.length === 0 ? (
          <Card variant="glass" className="border border-white/10">
            <EmptyState icon="💳" title="ยังไม่มีประวัติธุรกรรม" description="เมื่อคุณทำรายการ รายการจะปรากฏที่นี่" variant="glass"
              action={<Link href="/user/wallet/deposit"><Button variant="primary" className="h-11 px-6 bg-[#06C755]">เติมเงินเลย</Button></Link>}
            />
          </Card>
        ) : (
          <>
            <Card className="hidden md:block p-0 overflow-hidden border border-white/10" variant="glass">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">วันที่</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">ประเภท</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400">รายละเอียด</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400">จำนวนเงิน</th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-400">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactions.map((tx) => {
                    const cfg = getTypeConfig(tx.type);
                    const pos = tx.type === 'deposit' || tx.type === 'bonus';
                    return (
                      <tr key={tx._id} className="hover:bg-white/5">
                        <td className="px-6 py-4 text-sm text-white">{formatDate(tx.createdAt)}</td>
                        <td className="px-6 py-4"><span>{cfg.icon}</span> <span className="text-sm text-white">{cfg.label}</span></td>
                        <td className="px-6 py-4 text-sm text-slate-400 max-w-xs truncate">{tx.description || '-'}</td>
                        <td className={cn("px-6 py-4 text-right font-bold", cfg.color)}>{pos ? '+' : '-'}฿{Math.abs(tx.amount).toLocaleString()}</td>
                        <td className="px-6 py-4 text-center">{getStatusBadge(tx.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <div className="md:hidden space-y-4">
              {transactions.map((tx) => {
                const cfg = getTypeConfig(tx.type);
                const pos = tx.type === 'deposit' || tx.type === 'bonus';
                return (
                  <Card key={tx._id} variant="glass" className="p-4 border border-white/10">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{cfg.icon}</span>
                        <div>
                          <p className="font-semibold text-white">{cfg.label}</p>
                          <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
                        </div>
                      </div>
                      {getStatusBadge(tx.status)}
                    </div>
                    {tx.description && <p className="text-sm text-slate-400 mb-3">{tx.description}</p>}
                    <p className={cn("text-lg font-bold text-right", cfg.color)}>{pos ? '+' : '-'}฿{Math.abs(tx.amount).toLocaleString()}</p>
                  </Card>
                );
              })}
            </div>
            <p className="mt-4 text-center text-sm text-slate-500">แสดง {transactions.length} รายการ</p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
