'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi, systemSettingsApi } from '@/lib/api';
import { useWalletStore } from '@/store/wallet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { WalletBalance, WalletTransaction, BankAccount, UsdtSettings } from '@/types';
import {
  Building2,
  Gem,
  X,
  Loader2,
  Camera,
  Check,
  Copy,
  AlertTriangle,
  Coins,
  Wallet,
  ClipboardList,
  Banknote,
  ShoppingCart,
  Gift,
  Undo2,
  Settings,
} from 'lucide-react';

export default function WalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [usdtSettings, setUsdtSettings] = useState<UsdtSettings | null>(null);

  const [activeTab, setActiveTab] = useState<'bank' | 'crypto'>('bank');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [usdtRate, setUsdtRate] = useState<number | null>(null);
  const [thbCredits, setThbCredits] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

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
        walletApi.getTransactions(10).catch(() => ({ data: [] })),
        systemSettingsApi.getPaymentInfo().catch(() => ({ data: { bankAccounts: [] } })),
      ]);
      setBalance(balanceRes.data);
      setTransactions(txRes.data?.transactions || txRes.data || []);
      setUsdtSettings(settingsRes.data?.usdtWallet || null);

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
    fetchUsdtRate();
  }, []);

  const fetchUsdtRate = async () => {
    setRateLoading(true);
    try {
      const res = await walletApi.getUsdtRate();
      if (res.data.success) {
        setUsdtRate(res.data.rate);
      }
    } catch (err) {
      console.error('Failed to fetch USDT rate:', err);
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    if (usdtAmount && Number(usdtAmount) > 0 && usdtRate) {
      setThbCredits(Math.floor(Number(usdtAmount) * usdtRate));
    } else {
      setThbCredits(null);
    }
  }, [usdtAmount, usdtRate]);

  const handleCopyAccount = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(text);
    toast.success('คัดลอกแล้ว');
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)');
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
          useWalletStore.getState().refreshBalance();
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
        useWalletStore.getState().refreshBalance();
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
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeIcon = (type: string) => {
    const iconClass = "w-4 h-4 sm:w-5 sm:h-5";
    switch (type) {
      case 'deposit':
        return <Banknote className={cn(iconClass, "text-emerald-400")} />;
      case 'purchase':
        return <ShoppingCart className={cn(iconClass, "text-blue-400")} />;
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
        return <Badge variant="warning" size="sm">รอ</Badge>;
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
      <div className="p-3 sm:p-4 lg:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              กระเป๋าเงิน <span className="text-[#06C755]">(Wallet)</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">เติมเครดิตเพื่อซื้อแพ็คเกจ</p>
          </div>
          <Link href="/user/packages">
            <Button variant="primary" size="sm" className="bg-[#06C755] hover:bg-[#05a347] h-9 sm:h-10 px-4">
              <Gem className="w-4 h-4" /> ซื้อแพ็คเกจ
            </Button>
          </Link>
        </div>

        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-emerald-900/40 via-slate-900 to-slate-950 border border-emerald-500/20 overflow-hidden relative" variant="glass">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] -mr-24 -mt-24" />
          <div className="p-4 sm:p-6 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1">ยอดเครดิตคงเหลือ</p>
                <h2 className="text-3xl sm:text-4xl font-black text-white">
                  ฿{balance?.balance?.toLocaleString() || 0}
                </h2>
                <div className="flex gap-4 sm:gap-6 mt-3">
                  <div>
                    <p className="text-xs text-slate-400">เติมสะสม</p>
                    <p className="text-sm font-bold text-emerald-400">฿{balance?.totalDeposited?.toLocaleString() || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">ใช้ไป</p>
                    <p className="text-sm font-bold text-rose-400">฿{balance?.totalSpent?.toLocaleString() || 0}</p>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                className="h-9 px-4 border-white/20 text-xs self-start sm:self-center"
              >
                🔄 รีเฟรช
              </Button>
            </div>
          </div>
        </Card>

        {/* Payment Method Tabs */}
        <div className="flex justify-center">
          <div className="bg-white/5 border border-white/10 rounded-xl p-1 flex gap-1 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('bank')}
              className={cn(
                "flex-1 sm:flex-none px-3 sm:px-4 md:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 min-h-[44px]",
                activeTab === 'bank'
                  ? "bg-[#06C755] text-white shadow-lg"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Building2 className="w-4 h-4" /> <span className="hidden xs:inline">โอนเงิน</span><span className="xs:hidden">ธนาคาร</span><span className="hidden sm:inline xs:hidden">ธนาคาร</span>
            </button>
            <button
              onClick={() => setActiveTab('crypto')}
              className={cn(
                "flex-1 sm:flex-none px-3 sm:px-4 md:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 min-h-[44px]",
                activeTab === 'crypto'
                  ? "bg-[#06C755] text-white shadow-lg"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Gem className="w-4 h-4" /> USDT
            </button>
          </div>
        </div>

        {error && (
          <Card className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3" variant="glass">
            <div className="flex items-center gap-2 text-sm">
              <X className="w-4 h-4 text-rose-400" />
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={fetchData} className="ml-auto text-xs">ลองใหม่</Button>
            </div>
          </Card>
        )}

        {/* Bank Transfer Section */}
        {activeTab === 'bank' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bank Accounts */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-4 sm:p-5">
                <h3 className="text-base sm:text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">1</span>
                  บัญชีสำหรับโอนเงิน
                </h3>

                {bankAccounts.length > 0 ? (
                  <div className="space-y-3">
                    {bankAccounts.map((account, index) => (
                      <div
                        key={index}
                        className="bg-slate-900/60 rounded-xl p-3 sm:p-4 border border-white/5"
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          {account.bank?.logoBase64 ? (
                            <img
                              src={account.bank.logoBase64}
                              alt={account.bankName}
                              className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg object-contain bg-white p-1 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm text-slate-400 truncate">{account.bankName}</p>
                            <p className="text-xs sm:text-xs text-slate-500 truncate">{account.accountName}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <p className="text-base sm:text-lg md:text-xl font-black text-white font-mono tracking-wider flex-1 break-all">
                            {account.accountNumber}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleCopyAccount(account.accountNumber)}
                            className={cn(
                              "px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center",
                              copiedAccount === account.accountNumber
                                ? "bg-emerald-500 text-white"
                                : "bg-white/10 text-white hover:bg-emerald-500"
                            )}
                          >
                            {copiedAccount === account.accountNumber ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-400 text-sm">ไม่พบข้อมูลบัญชีธนาคาร</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Upload Slip */}
            <Card className="border border-emerald-500/20" variant="glass">
              <div className="p-4 sm:p-5">
                <h3 className="text-base sm:text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">2</span>
                  อัปโหลดสลิป
                </h3>

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
                    "flex flex-col items-center justify-center w-full h-32 sm:h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                    isDepositing
                      ? "border-slate-600 bg-slate-800/50 cursor-not-allowed"
                      : "border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10"
                  )}
                >
                  {isDepositing ? (
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">กำลังตรวจสอบ...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Camera className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-emerald-400 font-bold text-sm">คลิกเพื่ออัปโหลดสลิป</p>
                      <p className="text-xs text-slate-300 mt-1">JPG, PNG (สูงสุด 5MB)</p>
                    </div>
                  )}
                </label>

                {depositResult && (
                  <div className={cn(
                    "mt-4 p-3 rounded-xl border text-sm",
                    depositResult.success
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  )}>
                    <div className="flex items-center gap-2">
                      {depositResult.success ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                      <span className="font-medium">{depositResult.message}</span>
                    </div>
                  </div>
                )}

                {/* Steps */}
                <div className="mt-4 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                  <p className="text-xs text-slate-400 mb-2">ขั้นตอน:</p>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="text-emerald-400">1.</span> โอนเงิน →
                    <span className="text-emerald-400">2.</span> อัปโหลดสลิป →
                    <span className="text-emerald-400">3.</span> รับเครดิต
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* USDT Section */}
        {activeTab === 'crypto' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Wallet Info */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-4 sm:p-5 flex flex-col items-center text-center">
                {!usdtSettings?.enabled ? (
                  <div className="py-8">
                    <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-white mb-2">ปิดปรับปรุงชั่วคราว</h3>
                    <p className="text-slate-400 text-sm">{usdtSettings?.disabledMessage || 'งดรับชำระด้วย USDT ชั่วคราว'}</p>
                  </div>
                ) : (
                  <>
                    <Badge variant="warning" className="mb-3 text-xs">NETWORK: {usdtSettings?.network || 'TRC20'}</Badge>
                    <h3 className="text-base sm:text-lg font-bold text-white">USDT Wallet Address</h3>
                    <p className="text-slate-400 text-xs mt-1">สแกน QR Code หรือคัดลอกที่อยู่</p>

                    {usdtSettings?.qrImage ? (
                      <div className="w-40 h-40 sm:w-48 sm:h-48 bg-white p-2 rounded-xl shadow-2xl mt-4">
                        <img src={usdtSettings.qrImage} alt="USDT QR Code" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-40 h-40 sm:w-48 sm:h-48 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center mt-4">
                        <Coins className="w-16 h-16 text-amber-400" />
                      </div>
                    )}

                    <div className="w-full mt-4 relative">
                      <div className="bg-[#0A0F0D] border border-white/10 rounded-xl p-3 pr-10 break-all text-xs sm:text-xs font-mono text-emerald-400">
                        {usdtSettings?.address || 'Loading...'}
                      </div>
                      <button
                        onClick={() => handleCopyAccount(usdtSettings?.address || '')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        {copiedAccount === usdtSettings?.address ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">*ตรวจสอบ Network ให้ถูกต้อง ({usdtSettings?.network})</p>
                  </>
                )}
              </div>
            </Card>

            {/* Submit Form */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-4 sm:p-5">
                <h3 className="text-base sm:text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">2</span>
                  แจ้งโอนเงิน
                </h3>

                <div className="space-y-4">
                  {/* Rate Display */}
                  <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">อัตราแลกเปลี่ยน</span>
                      <button
                        onClick={fetchUsdtRate}
                        disabled={rateLoading}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        {rateLoading ? '🔄' : '↻'} รีเฟรช
                      </button>
                    </div>
                    <div className="text-lg sm:text-xl font-bold text-white mt-1">
                      {rateLoading ? (
                        <span className="text-slate-400 animate-pulse text-sm">กำลังโหลด...</span>
                      ) : usdtRate ? (
                        <>1 USDT = <span className="text-emerald-400">{usdtRate.toFixed(2)}</span> บาท</>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">จำนวน USDT</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={usdtAmount}
                      onChange={(e) => setUsdtAmount(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-10"
                    />
                    {thbCredits !== null && (
                      <div className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <Wallet className="w-4 h-4 text-emerald-400" />
                        <div>
                          <p className="text-xs text-slate-300">เครดิตที่จะได้รับ</p>
                          <p className="text-base font-bold text-emerald-400">{thbCredits.toLocaleString()} บาท</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Transaction Hash</label>
                    <Input
                      placeholder="วาง TxID ที่นี่..."
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-mono text-xs h-10"
                    />
                  </div>

                  <Button
                    variant="primary"
                    className="w-full h-10 sm:h-11 bg-[#06C755] hover:bg-[#05B048] font-bold"
                    onClick={handleUsdtDeposit}
                    isLoading={isDepositing}
                    disabled={!usdtSettings?.enabled || isDepositing || !usdtAmount || !txHash}
                  >
                    แจ้งโอนเงิน
                  </Button>

                  {depositResult && (
                    <div className={cn(
                      "p-3 rounded-lg text-center text-sm font-bold",
                      depositResult.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {depositResult.message}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Transaction History */}
        <Card className="border border-white/10" variant="glass">
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base sm:text-lg font-bold text-white">📜 ประวัติธุรกรรมล่าสุด</h3>
              <Link href="/user/payments" className="text-xs text-emerald-400 hover:text-emerald-300">
                ดูทั้งหมด →
              </Link>
            </div>

            {transactions.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx._id}
                    className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5"
                  >
                    <div className={cn(
                      "w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                      tx.amount > 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                    )}>
                      {getTypeIcon(tx.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-white text-sm truncate">{getTypeLabel(tx.type)}</p>
                        {getStatusBadge(tx.status)}
                      </div>
                      <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        "font-bold text-sm",
                        tx.amount > 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {tx.amount > 0 ? '+' : ''}฿{Math.abs(tx.amount).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <ClipboardList className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-400 text-sm">ยังไม่มีประวัติธุรกรรม</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
