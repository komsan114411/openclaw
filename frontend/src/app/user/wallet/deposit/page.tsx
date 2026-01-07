'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi, systemSettingsApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export default function DepositPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPaymentInfo = async () => {
      try {
        const res = await systemSettingsApi.getPaymentInfo();
        setBankAccounts(res.data.bankAccounts || []);
      } catch (error) {
        console.error('Error fetching payment info:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPaymentInfo();
  }, []);

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
          <p className="text-slate-400 mt-2">โอนเงินแล้วอัปโหลดสลิปเพื่อเติมเครดิต</p>
        </div>

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

        <Card className="mt-6 border border-yellow-500/20 bg-yellow-500/5" variant="glass">
          <div className="p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-yellow-400">หมายเหตุ</p>
              <ul className="text-sm text-slate-300 mt-2 space-y-1">
                <li>• โอนเงินก่อน แล้วจึงอัปโหลดสลิป</li>
                <li>• เครดิตจะถูกเติมหลังจากตรวจสอบสลิปสำเร็จ</li>
                <li>• สลิปปลอมหรือซ้ำจะถูกปฏิเสธ</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
