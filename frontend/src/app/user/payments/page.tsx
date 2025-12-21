'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi, systemSettingsApi } from '@/lib/api';
import { Payment } from '@/types';
import toast from 'react-hot-toast';

export default function UserPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [paymentsRes, paymentInfoRes] = await Promise.all([
        paymentsApi.getMy(),
        systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} })),
      ]);
      setPayments(paymentsRes.data.payments || []);
      setPaymentInfo(paymentInfoRes.data || {});
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadSlip = async () => {
    if (!slipFile || !selectedPayment) {
      toast.error('กรุณาเลือกไฟล์สลิป');
      return;
    }

    setIsUploading(true);
    try {
      const response = await paymentsApi.submitSlip({
        packageId: selectedPayment.packageId,
        paymentId: selectedPayment._id,
        slipFile,
      });
      if (response.data.success) {
        toast.success('อัปโหลดสลิปสำเร็จ รอการตรวจสอบ');
      } else {
        toast.success(response.data.message || 'อัปโหลดสลิปสำเร็จ รอการตรวจสอบ');
      }
      setShowUploadModal(false);
      setSelectedPayment(null);
      setSlipFile(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      failed: 'bg-gray-100 text-gray-700',
      cancelled: 'bg-gray-100 text-gray-700',
    };
    const labels: Record<string, string> = {
      pending: 'รอตรวจสอบ',
      verified: 'อนุมัติแล้ว',
      rejected: 'ปฏิเสธ',
      failed: 'ล้มเหลว',
      cancelled: 'ยกเลิก',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ประวัติการชำระเงิน</h1>
          <p className="text-gray-500">ดูประวัติและสถานะการชำระเงินของคุณ</p>
        </div>

        {/* Payment Info Card */}
        {paymentInfo?.bankAccounts?.length > 0 && (
          <div className="card bg-blue-50 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">ข้อมูลสำหรับชำระเงิน</h3>
            <div className="space-y-2">
              {paymentInfo.bankAccounts.map((account: any, index: number) => (
                <div key={index} className="p-3 bg-white rounded-lg">
                  <p className="font-medium text-gray-900">{account.bankName}</p>
                  <p className="text-gray-600">เลขบัญชี: {account.accountNumber}</p>
                  <p className="text-gray-600">ชื่อบัญชี: {account.accountName}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments Table */}
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ประเภท</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวนเงิน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    ยังไม่มีประวัติการชำระเงิน
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(payment.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${payment.paymentType === 'usdt' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {payment.paymentType === 'usdt' ? 'USDT' : 'โอนเงิน'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {payment.paymentType === 'usdt' ? `$${payment.amount}` : `฿${payment.amount.toLocaleString()}`}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {payment.status === 'pending' && payment.paymentType === 'bank_transfer' && (
                        <button
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowUploadModal(true);
                          }}
                          className="text-primary-600 hover:text-primary-800 text-sm"
                        >
                          อัปโหลดสลิป
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Slip Modal */}
      {showUploadModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">อัปโหลดสลิปการโอนเงิน</h2>
            
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">จำนวนเงินที่ต้องชำระ</p>
              <p className="text-2xl font-bold text-primary-600">
                ฿{selectedPayment.amount.toLocaleString()}
              </p>
            </div>

            <div className="mb-4">
              <label className="label">เลือกรูปสลิป</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                className="input"
              />
              {slipFile && (
                <p className="text-sm text-gray-500 mt-1">{slipFile.name}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedPayment(null);
                  setSlipFile(null);
                }}
                className="btn btn-secondary flex-1"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleUploadSlip}
                disabled={!slipFile || isUploading}
                className="btn btn-primary flex-1"
              >
                {isUploading ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
