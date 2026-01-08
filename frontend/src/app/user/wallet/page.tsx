'use client';

import { useEffect, useState, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi, systemSettingsApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { SectionHeader } from '@/components/ui';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

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

interface BankAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  bankCode?: string;
  bank?: {
    code: string;
    name: string;
    nameTh?: string;
    logoUrl?: string;
    logoBase64?: string;
  };
}

interface UsdtSettings {
  enabled: boolean;
  address: string;
  network: string;
  qrImage: string;
  disabledMessage: string;
}

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [usdtSettings, setUsdtSettings] = useState<UsdtSettings | null>(null);

  const [activeTab, setActiveTab] = useState<'bank' | 'crypto'>('bank');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [txHash, setTxHash] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositResult, setDepositResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [balanceRes, txRes, settingsRes] = await Promise.all([
        walletApi.getBalance().catch(() => ({ data: { balance: 0, totalDeposited: 0, totalSpent: 0 } })),
        walletApi.getTransactions(20).catch(() => ({ data: [] })),
        systemSettingsApi.getPaymentInfo().catch(() => ({ data: { bankAccounts: [] } })),
      ]);
      setBalance(balanceRes.data);
      setTransactions(txRes.data || []);
      setUsdtSettings(settingsRes.data?.usdtWallet || null);

      // Map bank accounts
      const accounts = (settingsRes.data?.bankAccounts || []).map((acc: any) => ({
        bankName: acc.bankName || acc.bank?.nameTh || acc.bank?.name || '',
        accountName: acc.accountName || '',
        accountNumber: acc.accountNumber || '',
        bankCode: acc.bankCode,
        bank: acc.bank,
      }));
      setBankAccounts(accounts);
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

  const handleCopyAccount = (accountNumber: string) => {
    navigator.clipboard.writeText(accountNumber);
    setCopiedAccount(accountNumber);
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setDepositResult({ success: false, message: 'กรุณาเลือกไฟล์รูปภาพเท่านั้น' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setDepositResult({ success: false, message: 'ไฟล์ใหญ่เกินไป (สูงสุด 5MB)' });
      return;
    }

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

  const handleUsdtDeposit = async () => {
    if (!usdtAmount || Number(usdtAmount) <= 0) {
      toast.error('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }
    if (!txHash) {
      toast.error('กรุณาระบุ Transaction Hash');
      return;
    }

    setIsDepositing(true);
    setDepositResult(null);

    try {
      const res = await walletApi.depositUsdt(Number(usdtAmount), txHash);
      setDepositResult({
        success: res.data.success,
        message: res.data.message,
      });

      if (res.data.success) {
        toast.success('แจ้งเติมเงินเรียบร้อย');
        setUsdtAmount('');
        setTxHash('');
        fetchData();
      }
    } catch (err: any) {
      setDepositResult({
        success: false,
        message: err.response?.data?.message || 'เกิดข้อผิดพลาดในการเติมเครดิต',
      });
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsDepositing(false);
    }
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
          title="เติมเครดิต"
          highlight="Wallet"
          subtitle="เลือกช่องทางการชำระเงินเพื่อเติมเครดิต"
        />

        {/* Payment Methods - Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-1 flex gap-1">
            <button
              onClick={() => setActiveTab('bank')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'bank'
                  ? "bg-[#06C755] text-white shadow-lg shadow-[#06C755]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <span>🏦</span> โอนเงินธนาคาร
            </button>
            <button
              onClick={() => setActiveTab('crypto')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'crypto'
                  ? "bg-[#06C755] text-white shadow-lg shadow-[#06C755]/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <span>💎</span> Crypto (USDT)
            </button>
          </div>
        </div>

        {activeTab === 'crypto' && (
          /* Crypto Deposit Section */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Left: Wallet Info */}
            <Card variant="glass" className="border border-white/10 p-6 flex flex-col justify-center items-center text-center space-y-6">
              {!usdtSettings?.enabled ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">⚠️</div>
                  <h3 className="text-xl font-bold text-white mb-2">ปิดปรับปรุงชั่วคราว</h3>
                  <p className="text-slate-400">{usdtSettings?.disabledMessage || 'งดรับชำระด้วย USDT ชั่วคราว'}</p>
                </div>
              ) : (
                <>
                  <div>
                    <Badge variant="warning" className="mb-4 text-xs tracking-wider">NETWORK: {usdtSettings?.network || 'TRC20'}</Badge>
                    <h3 className="text-xl font-bold text-white">USDT Wallet Address</h3>
                    <p className="text-slate-400 text-sm mt-1">สแกน QR Code หรือคัดลอกที่อยู่กระเป๋า</p>
                  </div>

                  {usdtSettings?.qrImage ? (
                    <div className="w-56 h-56 bg-white p-2 rounded-xl shadow-2xl">
                      <img src={usdtSettings.qrImage} alt="USDT QR Code" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-56 h-56 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-4xl animate-pulse">
                      🪙
                    </div>
                  )}

                  <div className="w-full relative group">
                    <div className="bg-[#0A0F0D] border border-white/10 rounded-xl p-4 pr-12 break-all text-xs sm:text-sm font-mono text-emerald-400">
                      {usdtSettings?.address || 'Loading...'}
                    </div>
                    <button
                      onClick={() => handleCopyAccount(usdtSettings?.address || '')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                      {copiedAccount === usdtSettings?.address ? '✅' : '📋'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">*กรุณาตรวจสอบ Network ให้ถูกต้องก่อนโอน (รองรับ {usdtSettings?.network})</p>
                </>
              )}
            </Card>

            {/* Right: Submit Form */}
            <Card variant="glass" className="border border-white/10 p-6 flex flex-col">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">2</span>
                แจ้งโอนเงิน (Submit TX)
              </h3>

              <div className="space-y-6 flex-1">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">จำนวน USDT ที่โอน</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={usdtAmount}
                    onChange={(e) => setUsdtAmount(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Transaction Hash (TxID)</label>
                  <Input
                    placeholder="วางเลข TxID ที่นี่..."
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-mono text-sm"
                  />
                </div>

                {/* Instructions */}
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                  <h4 className="text-yellow-400 text-xs font-bold mb-2">⚠️ คำแนะนำ</h4>
                  <ul className="text-[10px] text-yellow-200/70 space-y-1 list-disc list-inside">
                    <li>กรุณาโอนเงินผ่าน Network <b>{usdtSettings?.network}</b> เท่านั้น</li>
                    <li>ยอดเงินจะเข้าบัญชีหลังจาก Admin ตรวจสอบ (15-30 นาที)</li>
                    <li>หากโอนผิด Network สินทรัพย์อาจสูญหาย</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8">
                <Button
                  variant="primary"
                  className="w-full h-12 bg-[#06C755] hover:bg-[#05B048] font-bold shadow-lg shadow-emerald-500/20"
                  onClick={handleUsdtDeposit}
                  isLoading={isDepositing}
                  disabled={!usdtSettings?.enabled || isDepositing || !usdtAmount || !txHash}
                >
                  แจ้งโอนเงิน
                </Button>
                {depositResult && (
                  <div className={cn("mt-4 p-3 rounded-lg text-center text-sm font-bold animate-fade", depositResult.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")}>
                    {depositResult.message}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 animate-fade", activeTab !== 'bank' && "hidden")}>

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
              </div>
            </div>
          </Card>

          {/* BANK ACCOUNTS - เลขบัญชีสำหรับโอนเงิน */}
          <Card className="bg-slate-950 border border-white/5 mt-6" variant="glass">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">📍 บัญชีสำหรับโอนเงิน</h3>

              {bankAccounts.length > 0 ? (
                <div className="space-y-3">
                  {bankAccounts.map((account, index) => (
                    <div
                      key={index}
                      className="bg-slate-900/80 rounded-xl p-4 border border-white/10 flex items-center gap-4"
                    >
                      {/* Bank Logo */}
                      {account.bank?.logoBase64 ? (
                        <img
                          src={account.bank.logoBase64}
                          alt={account.bankName}
                          className="w-12 h-12 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xl flex-shrink-0">
                          🏦
                        </div>
                      )}

                      {/* Bank Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-400 truncate">{account.bankName}</p>
                        <p className="text-xs text-slate-500 truncate">{account.accountName}</p>
                        <p className="text-xl sm:text-2xl font-black text-white font-mono tracking-wider mt-1">
                          {account.accountNumber}
                        </p>
                      </div>

                      {/* Copy Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyAccount(account.accountNumber)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-bold flex-shrink-0 transition-all",
                          copiedAccount === account.accountNumber
                            ? "bg-emerald-500 text-white"
                            : "bg-white/10 text-white hover:bg-emerald-500"
                        )}
                      >
                        {copiedAccount === account.accountNumber ? '✓ คัดลอกแล้ว' : '📋 คัดลอก'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400">ไม่พบข้อมูลบัญชีธนาคาร</p>
                </div>
              )}
            </div>
          </Card>

          {/* UPLOAD SLIP */}
          <Card className="bg-slate-950 border border-emerald-500/20 mt-6" variant="glass">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">📤 อัปโหลดสลิปการโอนเงิน</h3>

              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="slip-upload"
                  disabled={isDepositing}
                />
                <label
                  htmlFor="slip-upload"
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                    isDepositing
                      ? "border-slate-600 bg-slate-800/50 cursor-not-allowed"
                      : "border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10"
                  )}
                >
                  {isDepositing ? (
                    <div className="text-center">
                      <div className="text-4xl mb-2 animate-spin">⏳</div>
                      <p className="text-slate-400">กำลังตรวจสอบสลิป...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-4xl mb-2">📷</div>
                      <p className="text-emerald-400 font-bold">คลิกเพื่ออัปโหลดสลิป</p>
                      <p className="text-xs text-slate-400 mt-1">รองรับ JPG, PNG (สูงสุด 5MB)</p>
                    </div>
                  )}
                </label>
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
                    <span className="font-medium">{depositResult.message}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* HOW IT WORKS */}
          <Card className="bg-slate-950 border border-white/5 mt-6" variant="glass">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">📋 ขั้นตอนการเติมเครดิต</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-emerald-400">1</span>
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">โอนเงิน</p>
                    <p className="text-xs text-slate-400">โอนเงินไปยังบัญชีด้านบน</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-emerald-400">2</span>
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">อัปโหลดสลิป</p>
                    <p className="text-xs text-slate-400">กดคลิกอัปโหลดสลิปการโอนเงิน</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-emerald-400">3</span>
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
              <h3 className="text-lg font-bold text-white mb-4">📜 ประวัติธุรกรรม</h3>

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
      </div>
    </DashboardLayout>
  );
}
