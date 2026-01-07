'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface WalletBalance {
  balance: number;
  pendingDeposits: number;
}

interface Transaction {
  _id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  createdAt: string;
}

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [balanceRes, txRes] = await Promise.all([
          walletApi.getBalance(),
          walletApi.getTransactions(5),
        ]);
        setBalance(balanceRes.data);
        setRecentTransactions(txRes.data || []);
      } catch (error) {
        console.error('Error fetching wallet data:', error);
        toast.error('Failed to load wallet');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = { deposit: '💰', purchase: '🛒', bonus: '🎁', deduction: '➖' };
    return icons[type] || '💳';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = { deposit: 'เติมเงิน', purchase: 'ซื้อแพ็คเกจ', bonus: 'โบนัส', deduction: 'หักเครดิต' };
    return labels[type] || type;
  };

  if (isLoading) {
    return <DashboardLayout><PageLoading message="กำลังโหลด..." /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
              กระเป๋าเงิน <span className="text-[#06C755]">(Wallet)</span>
            </h1>
            <p className="text-slate-400">จัดการเครดิตและธุรกรรมของคุณ</p>
          </div>
          <div className="flex gap-3">
            <Link href="/user/wallet/transactions">
              <Button variant="outline" className="h-10 px-4 rounded-lg border-white/20">📋 ประวัติ</Button>
            </Link>
            <Link href="/user/wallet/deposit">
              <Button variant="primary" className="h-10 px-4 rounded-lg bg-[#06C755]">💰 เติมเงิน</Button>
            </Link>
          </div>
        </div>

        <Card className="bg-gradient-to-br from-[#06C755]/20 to-slate-950 border border-[#06C755]/30 mb-6" variant="glass">
          <div className="p-6 sm:p-8">
            <p className="text-sm text-slate-400 mb-2">ยอดเครดิตคงเหลือ</p>
            <h2 className="text-4xl sm:text-5xl font-black text-white">
              ฿{(balance?.balance || 0).toLocaleString()}
            </h2>
            {(balance?.pendingDeposits || 0) > 0 && (
              <p className="text-sm text-yellow-400 mt-2">รอดำเนินการ: ฿{balance?.pendingDeposits.toLocaleString()}</p>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { href: '/user/wallet/deposit', icon: '💰', label: 'เติมเงิน' },
            { href: '/user/wallet/transactions', icon: '📋', label: 'ประวัติ' },
            { href: '/user/packages', icon: '📦', label: 'ซื้อแพ็คเกจ' },
            { href: '/user/dashboard', icon: '📊', label: 'แดชบอร์ด' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="p-4 hover:bg-white/[0.04] cursor-pointer border border-white/10" variant="glass">
                <div className="text-center">
                  <span className="text-3xl block mb-2">{item.icon}</span>
                  <span className="text-sm font-semibold text-white">{item.label}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="border border-white/10" variant="glass">
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">ธุรกรรมล่าสุด</h3>
              <Link href="/user/wallet/transactions">
                <Button variant="ghost" size="sm" className="text-slate-400">ดูทั้งหมด →</Button>
              </Link>
            </div>

            {recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {recentTransactions.map((tx) => (
                  <div key={tx._id} className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                      tx.type === 'deposit' || tx.type === 'bonus' ? 'bg-green-500/10' : 'bg-red-500/10')}>
                      <span className="text-lg">{getTypeIcon(tx.type)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{getTypeLabel(tx.type)}</p>
                      <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
                    </div>
                    <p className={cn("font-bold", tx.type === 'deposit' || tx.type === 'bonus' ? 'text-green-400' : 'text-red-400')}>
                      {tx.type === 'deposit' || tx.type === 'bonus' ? '+' : '-'}฿{Math.abs(tx.amount).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">ยังไม่มีธุรกรรม</p>
                <Link href="/user/wallet/deposit">
                  <Button variant="primary" size="sm" className="bg-[#06C755]">เติมเงินเลย</Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
