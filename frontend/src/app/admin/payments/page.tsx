'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { paymentsApi } from '@/lib/api';
import { Payment } from '@/types';
import toast from 'react-hot-toast';

interface ExtendedPayment extends Payment {
  user?: {
    username: string;
    email?: string;
  };
  package?: {
    name: string;
    slipQuota: number;
  };
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<ExtendedPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [selectedPayment, setSelectedPayment] = useState<ExtendedPayment | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
      setShowDetailModal(false);
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
      setShowDetailModal(false);
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
      cancelled: 'bg-gray-100 text-gray-600',
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

  const openDetailModal = (payment: ExtendedPayment) => {
    setSelectedPayment(payment);
    setShowDetailModal(true);
  };

  const pendingCount = payments.filter(p => p.status === 'pending').length;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">การชำระเงิน</h1>
            <p className="text-gray-500">ตรวจสอบและอนุมัติการชำระเงิน</p>
          </div>
          <div className="flex items-center gap-4">
            {filter === 'pending' && pendingCount > 0 && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                {pendingCount} รายการรอตรวจสอบ
              </span>
            )}
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
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card bg-yellow-50 border border-yellow-200">
            <p className="text-yellow-800 text-sm">รอตรวจสอบ</p>
            <p className="text-2xl font-bold text-yellow-900">
              {payments.filter(p => p.status === 'pending').length}
            </p>
          </div>
          <div className="card bg-green-50 border border-green-200">
            <p className="text-green-800 text-sm">อนุมัติแล้ว</p>
            <p className="text-2xl font-bold text-green-900">
              {payments.filter(p => p.status === 'verified').length}
            </p>
          </div>
          <div className="card bg-red-50 border border-red-200">
            <p className="text-red-800 text-sm">ปฏิเสธ</p>
            <p className="text-2xl font-bold text-red-900">
              {payments.filter(p => p.status === 'rejected').length}
            </p>
          </div>
          <div className="card bg-blue-50 border border-blue-200">
            <p className="text-blue-800 text-sm">ยอดรวม (อนุมัติ)</p>
            <p className="text-2xl font-bold text-blue-900">
              ฿{payments.filter(p => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้ใช้</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">แพ็คเกจ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ประเภท</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวนเงิน</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(payment.createdAt).toLocaleDateString('th-TH')}
                      <br />
                      <span className="text-xs">
                        {new Date(payment.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{payment.user?.username || '-'}</p>
                      <p className="text-sm text-gray-500">{payment.user?.email || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{payment.package?.name || '-'}</p>
                      <p className="text-xs text-gray-500">{payment.package?.slipQuota?.toLocaleString() || '-'} สลิป</p>
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
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openDetailModal(payment)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          ดูรายละเอียด
                        </button>
                        {payment.status === 'pending' && (
                          <>
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
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Detail Modal */}
      {showDetailModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">รายละเอียดการชำระเงิน</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">วันที่</p>
                  <p className="font-medium">{new Date(selectedPayment.createdAt).toLocaleString('th-TH')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">สถานะ</p>
                  <div className="mt-1">{getStatusBadge(selectedPayment.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">ผู้ใช้</p>
                  <p className="font-medium">{selectedPayment.user?.username || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">อีเมล</p>
                  <p className="font-medium">{selectedPayment.user?.email || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">แพ็คเกจ</p>
                  <p className="font-medium">{selectedPayment.package?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">โควต้า</p>
                  <p className="font-medium">{selectedPayment.package?.slipQuota?.toLocaleString() || '-'} สลิป</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">ประเภทการชำระ</p>
                  <p className="font-medium">{selectedPayment.paymentType === 'usdt' ? 'USDT' : 'โอนเงิน'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">จำนวนเงิน</p>
                  <p className="font-medium text-lg">฿{selectedPayment.amount.toLocaleString()}</p>
                </div>
              </div>

              {selectedPayment.transRef && (
                <div>
                  <p className="text-sm text-gray-500">Transaction Ref</p>
                  <p className="font-mono text-sm bg-gray-100 p-2 rounded break-all">{selectedPayment.transRef}</p>
                </div>
              )}

              {selectedPayment.verificationResult && (
                <div>
                  <p className="text-sm text-gray-500">ผลการตรวจสอบสลิป</p>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedPayment.verificationResult, null, 2)}
                  </pre>
                </div>
              )}

              {selectedPayment.adminNotes && (
                <div>
                  <p className="text-sm text-gray-500">หมายเหตุ Admin</p>
                  <p className="text-sm bg-gray-100 p-2 rounded">{selectedPayment.adminNotes}</p>
                </div>
              )}

              {selectedPayment.verifiedAt && (
                <div>
                  <p className="text-sm text-gray-500">วันที่ตรวจสอบ</p>
                  <p className="font-medium">{new Date(selectedPayment.verifiedAt).toLocaleString('th-TH')}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-6 mt-4 border-t border-gray-200">
              <button onClick={() => setShowDetailModal(false)} className="btn btn-secondary flex-1">
                ปิด
              </button>
              {selectedPayment.status === 'pending' && (
                <>
                  <button onClick={() => handleReject(selectedPayment._id)} className="btn bg-red-600 text-white hover:bg-red-700 flex-1">
                    ปฏิเสธ
                  </button>
                  <button onClick={() => handleApprove(selectedPayment._id)} className="btn btn-primary flex-1">
                    อนุมัติ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
