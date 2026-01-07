'use client';

import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

interface WalletBalance {
  balance: number;
  totalDeposited: number;
  totalSpent: number;
}

interface Transaction {
  _id: string;
  type: 'deposit' | 'purchase' | 'bonus' | 'refund' | 'adjustment';
  amount: number;
  balanceAfter: number;
  description: string;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled';
  createdAt: string;
}

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositResult, setDepositResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [balanceRes, txRes] = await Promise.all([
        walletApi.getBalance().catch(() => ({ data: { balance: 0, totalDeposited: 0, totalSpent: 0 } })),
        walletApi.getTransactions(20).catch(() => ({ data: [] })),
      ]);
      setBalance(balanceRes.data);
      setTransactions(txRes.data || []);
    } catch (err: any) {
      console.error('Error fetching wallet data:', err);
      setError('ไม่สามารถโหลดข้อมูลกระเป๋าเงินได้');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];

      setIsDepositing(true);
      setDepositResult(null);

      try {
        const res = await walletApi.deposit(base64);
        setDepositResult({
          success: res.data.success,
          message: res.data.message,
        });

        if (res.data.success) {
          fetchData();
        }
      } catch (err: any) {
        setDepositResult({
          success: false,
          message: err.response?.data?.message || 'เกิดข้อผิดพลาดในการเติมเครดิต',
        });
      } finally {
        setIsDepositing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      deposit: '💵',
      purchase: '🛒',
      bonus: '🎁',
      refund: '↩️',
      adjustment: '⚙️',
    };
    return icons[type] || '💰';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      deposit: 'เติมเครดิต',
      purchase: 'ซื้อแพ็คเกจ',
      bonus: 'โบนัส',
      refund: 'คืนเงิน',
      adjustment: 'ปรับยอด',
    };
    return labels[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" size="sm">สำเร็จ</Badge>;
      case 'pending':
        return <Badge variant="warning" size="sm">รอดำเนินการ</Badge>;
      case 'rejected':
        return <Badge variant="error" size="sm">ปฏิเสธ</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" size="sm">ยกเลิก</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดข้อมูลกระเป๋าเงิน..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10 max-w-5xl mx-auto px-4 sm:px-6">
        <SectionHeader
          title="กระเป๋าเงิน"
          highlight="เครดิต"
          subtitle="เติมเครดิต • ประวัติธุรกรรม • ซื้อแพ็คเกจ"
        />

        {error && (
          <Card className="bg-rose-500/10 border border-rose-500/20 text-rose-300 mt-6 p-4" variant="glass">
            <div className="flex items-center gap-2">
              <span>❌</span>
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={fetchData} className="ml-auto">ลองใหม่</Button>
            </div>
          </Card>
        )}

        {/* BALANCE CARD */}
        <Card className="bg-gradient-to-br from-emerald-900/30 to-slate-950 border border-emerald-500/20 shadow-2xl mt-6 overflow-hidden relative" variant="glass">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] -mr-32 -mt-32" />

          <div className="p-6 sm:p-8 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">ยอดเครดิตคงเหลือ</p>
                <h2 className="text-4xl sm:text-5xl font-black text-white">
                  ฿{balance?.balance?.toLocaleString() || 0}
                </h2>
                <div className="flex gap-6 mt-4">
                  <div>
                    <p className="text-[10px] text-slate-400">เติมสะสม</p>
                    <p className="text-sm font-bold text-emerald-400">฿{balance?.totalDeposited?.toLocaleString() || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">ใช้ไป</p>
                    <p className="text-sm font-bold text-rose-400">฿{balance?.totalSpent?.toLocaleString() || 0}</p>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="slip-upload"
                />
                <label htmlFor="slip-upload" className="cursor-pointer">
                  <div className={cn(
                    "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all",
                    isDepositing
                      ? "bg-slate-600 cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-600"
                  )}>
                    {isDepositing ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        กำลังตรวจสอบ...
                      </>
                    ) : (
                      <>💵 เติมเครดิต</>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {depositResult && (
              <div className={cn(
                "mt-4 p-4 rounded-xl border",
                depositResult.success
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-300"
              )}>
                <div className="flex items-center gap-2">
                  <span>{depositResult.success ? '✅' : '❌'}</span>
                  <span>{depositResult.message}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* HOW TO DEPOSIT */}
        <Card className="bg-slate-950 border border-white/5 mt-6" variant="glass">
          <div className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">วิธีเติมเครดิต</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">1️⃣</span>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">โอนเงิน</p>
                  <p className="text-xs text-slate-400">โอนเงินไปยังบัญชีที่กำหนด</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">2️⃣</span>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">อัปโหลดสลิป</p>
                  <p className="text-xs text-slate-400">กดปุ่มเติมเครดิต เลือกรูปสลิป</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">3️⃣</span>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">รับเครดิต</p>
                  <p className="text-xs text-slate-400">ระบบตรวจสอบ เครดิตเข้าทันที</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* TRANSACTION HISTORY */}
        <Card className="bg-slate-950 border border-white/5 mt-6" variant="glass">
          <div className="p-6">
            <h3 className="text-lg font-bold text-white mb-4">ประวัติธุรกรรม</h3>

            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx._id}
                    className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-xl border border-white/5"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                      tx.amount > 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                    )}>
                      <span className="text-lg">{getTypeIcon(tx.type)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white truncate">{tx.description || getTypeLabel(tx.type)}</p>
                        {getStatusBadge(tx.status)}
                      </div>
                      <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-bold",
                        tx.amount > 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {tx.amount > 0 ? '+' : ''}฿{Math.abs(tx.amount).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">
                        คงเหลือ ฿{tx.balanceAfter?.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📋</span>
                </div>
                <p className="text-slate-400">ยังไม่มีประวัติธุรกรรม</p>
                <p className="text-sm text-slate-500 mt-1">เริ่มเติมเครดิตเพื่อใช้ซื้อแพ็คเกจ</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
