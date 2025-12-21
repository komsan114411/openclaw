'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi } from '@/lib/api';
import { Payment } from '@/types';
import toast from 'react-hot-toast';

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    fetchPayments();
  }, [filter]);

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const response = await paymentsApi.getAll(filter || undefined);
      setPayments(response.data.payments || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('ต้องการอนุมัติการชำระเงินนี้หรือไม่?')) return;
    try {
      await paymentsApi.approve(id);
      toast.success('อนุมัติสำเร็จ');
      fetchPayments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleReject = async (id: string) => {
    const notes = prompt('ระบุเหตุผลในการปฏิเสธ (ไม่บังคับ):');
    if (notes === null) return;
    try {
      await paymentsApi.reject(id, notes || undefined);
      toast.success('ปฏิเสธสำเร็จ');
      fetchPayments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      failed: 'bg-gray-100 text-gray-700',
    };
    const labels: Record<string, string> = {
      pending: 'รอตรวจสอบ',
      verified: 'อนุมัติแล้ว',
      rejected: 'ปฏิเสธ',
      failed: 'ล้มเหลว',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">การชำระเงิน</h1>
            <p className="text-gray-500">ตรวจสอบและอนุมัติการชำระเงิน</p>
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">ทั้งหมด</option>
            <option value="pending">รอตรวจสอบ</option>
            <option value="verified">อนุมัติแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ประเภท</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวนเงิน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">หมายเหตุ</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    ไม่พบข้อมูล
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
                      ฿{payment.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {payment.adminNotes || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {payment.status === 'pending' && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleApprove(payment._id)}
                            className="text-green-600 hover:text-green-800 text-sm"
                          >
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => handleReject(payment._id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            ปฏิเสธ
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
