'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi, systemSettingsApi } from '@/lib/api';
import { useWalletStore } from '@/store/wallet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { BankAccount, UsdtSettings } from '@/types';

type DepositMethod = 'bank' | 'usdt';

export default function DepositPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('bank');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [usdtSettings, setUsdtSettings] = useState<UsdtSettings | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [txHash, setTxHash] = useState('');
  const [usdtAmount, setUsdtAmount] = useState('');
  const [usdtRate, setUsdtRate] = useState<{ rate: number; source: string } | null>(null);
  const [calculatedCredits, setCalculatedCredits] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [paymentRes, rateRes] = await Promise.all([
          systemSettingsApi.getPaymentInfo(),
          walletApi.getUsdtRate().catch(() => ({ data: null })),
        ]);
        setBankAccounts(paymentRes.data.bankAccounts || []);
        // USDT settings come from payment-info endpoint
        if (paymentRes.data.usdtWallet?.enabled) {
          setUsdtSettings({
            enabled: paymentRes.data.usdtWallet.enabled,
            network: paymentRes.data.usdtWallet.network,
            walletAddress: paymentRes.data.usdtWallet.address,
            qrCodeUrl: paymentRes.data.usdtWallet.qrImage,
            autoVerify: false,
          });
        }
        if (rateRes.data?.success) {
          setUsdtRate({ rate: rateRes.data.rate, source: rateRes.data.source });
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (usdtAmount && usdtRate) {
      const amount = parseFloat(usdtAmount);
      if (!isNaN(amount) && amount > 0) {
        setCalculatedCredits(Math.floor(amount * usdtRate.rate));
      } else {
        setCalculatedCredits(null);
      }
    } else {
      setCalculatedCredits(null);
    }
  }, [usdtAmount, usdtRate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('ไฟล์ใหญ่เกินไป (สูงสุด 5MB)');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error('กรุณาเลือกรูปสลิป');
      return;
    }

    setIsSubmitting(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await walletApi.deposit(base64);
        if (res.data.success) {
          toast.success('ส่งสลิปสำเร็จ รอตรวจสอบ');
          // Refresh wallet balance in global store
          useWalletStore.getState().refreshBalance();
          router.push('/user/wallet');
        } else {
          toast.error(res.data.message || 'เกิดข้อผิดพลาด');
        }
      };
      reader.readAsDataURL(selectedFile);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUsdtSubmit = async () => {
    if (!txHash.trim()) {
      toast.error('กรุณากรอก Transaction Hash');
      return;
    }
    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      toast.error('กรุณากรอกจำนวน USDT');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await walletApi.depositUsdt(parseFloat(usdtAmount), txHash.trim());
      if (res.data.success) {
        // Show different message based on status
        if (res.data.status === 'approved') {
          toast.success(res.data.message || 'เติมเงินสำเร็จ!');
        } else {
          toast.success('ส่งข้อมูลสำเร็จ รอตรวจสอบ (ประมาณ 5-15 นาที)');
        }
        // Refresh wallet balance in global store
        useWalletStore.getState().refreshBalance();
        router.push('/user/wallet');
      } else {
        // Show specific error message from backend
        toast.error(res.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('คัดลอกแล้ว');
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/user/wallet" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
            ← กลับ
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            เติมเงิน <span className="text-[#06C755]">(Deposit)</span>
          </h1>
          <p className="text-slate-400 mt-2">เลือกวิธีเติมเงินที่ต้องการ</p>
        </div>

        {/* Deposit Method Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setDepositMethod('bank')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              depositMethod === 'bank'
                ? 'bg-[#06C755] text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            🏦 โอนธนาคาร
          </button>
          {usdtSettings?.enabled && (
            <button
              onClick={() => setDepositMethod('usdt')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                depositMethod === 'usdt'
                  ? 'bg-[#06C755] text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              💎 USDT ({usdtSettings.network})
            </button>
          )}
        </div>

        {depositMethod === 'bank' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bank Account Info */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">ข้อมูลบัญชีรับโอน</h3>
                {isLoading ? (
                  <p className="text-slate-400">กำลังโหลด...</p>
                ) : bankAccounts.length > 0 ? (
                  <div className="space-y-4">
                    {bankAccounts.map((bank, idx) => (
                      <div key={idx} className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                        <p className="text-sm text-slate-400">ธนาคาร</p>
                        <p className="text-lg font-bold text-white">{bank.bankName}</p>
                        <p className="text-sm text-slate-400 mt-2">เลขบัญชี</p>
                        <p className="text-lg font-mono text-[#06C755]">{bank.accountNumber}</p>
                        <p className="text-sm text-slate-400 mt-2">ชื่อบัญชี</p>
                        <p className="text-white">{bank.accountName}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">ไม่พบข้อมูลบัญชี กรุณาติดต่อแอดมิน</p>
                )}
              </div>
            </Card>

            {/* Upload Slip */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">อัปโหลดสลิป</h3>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {!previewUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-[#06C755]/50 transition-colors"
                  >
                    <div className="text-4xl mb-4">📤</div>
                    <p className="text-white font-semibold mb-2">คลิกเพื่อเลือกรูปสลิป</p>
                    <p className="text-sm text-slate-400">PNG, JPG ขนาดไม่เกิน 5MB</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative rounded-xl overflow-hidden">
                      <img src={previewUrl} alt="Slip" className="w-full max-h-64 object-contain bg-black/20" />
                      <button
                        onClick={clearFile}
                        className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-sm text-slate-400 text-center">{selectedFile?.name}</p>
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  <Button
                    variant="primary"
                    className="w-full h-12 bg-[#06C755] hover:bg-[#05a347]"
                    onClick={handleSubmit}
                    disabled={!selectedFile || isSubmitting}
                  >
                    {isSubmitting ? 'กำลังส่ง...' : '💰 ส่งสลิปเติมเงิน'}
                  </Button>
                  <Link href="/user/wallet" className="block">
                    <Button variant="outline" className="w-full h-12 border-white/20">
                      ยกเลิก
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* USDT Wallet Info */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">
                  💎 ข้อมูลกระเป๋า USDT ({usdtSettings?.network})
                </h3>

                {usdtSettings?.qrCodeUrl && (
                  <div className="flex justify-center mb-4">
                    <div className="p-4 bg-white rounded-xl">
                      <img src={usdtSettings.qrCodeUrl} alt="QR Code" className="w-48 h-48 object-contain" />
                    </div>
                  </div>
                )}

                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <p className="text-sm text-slate-400 mb-2">Wallet Address ({usdtSettings?.network})</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono text-[#06C755] break-all flex-1">
                      {usdtSettings?.walletAddress}
                    </p>
                    <button
                      onClick={() => copyToClipboard(usdtSettings?.walletAddress || '')}
                      className="px-3 py-1 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20 transition-colors"
                    >
                      📋 คัดลอก
                    </button>
                  </div>
                </div>

                {usdtRate && (
                  <div className="mt-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <p className="text-sm text-blue-400">อัตราแลกเปลี่ยนปัจจุบัน</p>
                    <p className="text-2xl font-bold text-white mt-1">
                      1 USDT = {usdtRate.rate.toLocaleString()} บาท
                    </p>
                    <p className="text-xs text-slate-400 mt-1">ข้อมูลจาก {usdtRate.source}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* USDT Transaction Form */}
            <Card className="border border-white/10" variant="glass">
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">กรอกข้อมูลการโอน</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">จำนวน USDT ที่โอน</label>
                    <input
                      type="number"
                      value={usdtAmount}
                      onChange={(e) => setUsdtAmount(e.target.value)}
                      placeholder="เช่น 100"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#06C755]"
                    />
                    {calculatedCredits !== null && (
                      <p className="text-sm text-[#06C755] mt-2">
                        ≈ {calculatedCredits.toLocaleString()} เครดิต
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Transaction Hash (TxID)</label>
                    <input
                      type="text"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder="กรอก Transaction Hash หลังโอนเสร็จ"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#06C755] font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      คัดลอก Transaction Hash จากกระเป๋าหรือ Exchange ที่คุณใช้โอน
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <Button
                    variant="primary"
                    className="w-full h-12 bg-[#06C755] hover:bg-[#05a347]"
                    onClick={handleUsdtSubmit}
                    disabled={!txHash.trim() || !usdtAmount || isSubmitting}
                  >
                    {isSubmitting ? 'กำลังส่ง...' : '💎 ส่งข้อมูล USDT'}
                  </Button>
                  <Link href="/user/wallet" className="block">
                    <Button variant="outline" className="w-full h-12 border-white/20">
                      ยกเลิก
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        )}

        <Card className="mt-6 border border-yellow-500/20 bg-yellow-500/5" variant="glass">
          <div className="p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-yellow-400">หมายเหตุ</p>
              <ul className="text-sm text-slate-300 mt-2 space-y-1">
                {depositMethod === 'bank' ? (
                  <>
                    <li>• โอนเงินก่อน แล้วจึงอัปโหลดสลิป</li>
                    <li>• เครดิตจะถูกเติมหลังจากตรวจสอบสลิปสำเร็จ</li>
                    <li>• สลิปปลอมหรือซ้ำจะถูกปฏิเสธ</li>
                  </>
                ) : (
                  <>
                    <li>• โอน USDT ไปยัง Wallet Address ด้านบนก่อน</li>
                    <li>• ตรวจสอบ Network ให้ถูกต้อง ({usdtSettings?.network})</li>
                    <li>• คัดลอก Transaction Hash มากรอกหลังโอนสำเร็จ</li>
                    <li>• เครดิตจะถูกเติมหลังตรวจสอบบน Blockchain</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
