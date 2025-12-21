'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, usersApi } from '@/lib/api';
import { LineAccount, User } from '@/types';
import toast from 'react-hot-toast';

interface ExtendedLineAccount extends LineAccount {
  owner?: {
    username: string;
    email?: string;
  };
}

export default function AdminLineAccountsPage() {
  const [accounts, setAccounts] = useState<ExtendedLineAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<ExtendedLineAccount | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [accountsRes, usersRes] = await Promise.all([
        lineAccountsApi.getAll(),
        usersApi.getAll(),
      ]);
      
      const usersMap = new Map(usersRes.data.users?.map((u: User) => [u._id, u]) || []);
      
      const accountsWithOwner = (accountsRes.data.accounts || []).map((acc: LineAccount) => ({
        ...acc,
        owner: usersMap.get(acc.ownerId) ? {
          username: (usersMap.get(acc.ownerId) as User).username,
          email: (usersMap.get(acc.ownerId) as User).email,
        } : undefined,
      }));
      
      setAccounts(accountsWithOwner);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบบัญชีนี้หรือไม่? การลบจะไม่สามารถกู้คืนได้')) return;
    try {
      await lineAccountsApi.delete(id);
      toast.success('ลบบัญชีสำเร็จ');
      setShowDetailModal(false);
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถลบบัญชีได้');
    }
  };

  const handleToggleActive = async (account: ExtendedLineAccount) => {
    try {
      await lineAccountsApi.update(account._id, { isActive: !account.isActive });
      toast.success(account.isActive ? 'ปิดใช้งานบัญชีแล้ว' : 'เปิดใช้งานบัญชีแล้ว');
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถเปลี่ยนสถานะได้');
    }
  };

  const filteredAccounts = accounts.filter(acc =>
    acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.channelId.includes(searchTerm) ||
    acc.owner?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMessages = accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);
  const totalSlips = accounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0);
  const activeAccounts = accounts.filter(acc => acc.isActive).length;

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">บัญชี LINE ทั้งหมด</h1>
            <p className="text-gray-500">ดูและจัดการบัญชี LINE OA ในระบบ</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card bg-blue-50 border border-blue-200">
            <p className="text-blue-800 text-sm">บัญชีทั้งหมด</p>
            <p className="text-2xl font-bold text-blue-900">{accounts.length}</p>
          </div>
          <div className="card bg-green-50 border border-green-200">
            <p className="text-green-800 text-sm">ใช้งานอยู่</p>
            <p className="text-2xl font-bold text-green-900">{activeAccounts}</p>
          </div>
          <div className="card bg-purple-50 border border-purple-200">
            <p className="text-purple-800 text-sm">ข้อความทั้งหมด</p>
            <p className="text-2xl font-bold text-purple-900">{totalMessages.toLocaleString()}</p>
          </div>
          <div className="card bg-yellow-50 border border-yellow-200">
            <p className="text-yellow-800 text-sm">สลิปที่ตรวจสอบ</p>
            <p className="text-2xl font-bold text-yellow-900">{totalSlips.toLocaleString()}</p>
          </div>
        </div>

        {/* Search */}
        <div className="card">
          <input
            type="text"
            placeholder="ค้นหาบัญชี LINE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full md:w-80"
          />
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อบัญชี</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เจ้าของ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถิติ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ฟีเจอร์</th>
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
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm ? 'ไม่พบบัญชีที่ค้นหา' : 'ไม่พบข้อมูล'}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => (
                  <tr key={account._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{account.accountName}</p>
                          <p className="text-sm text-gray-500">{account.description || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{account.owner?.username || '-'}</p>
                      <p className="text-sm text-gray-500">{account.owner?.email || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-mono text-sm">{account.channelId}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <p>{(account.statistics?.totalMessages || 0).toLocaleString()} ข้อความ</p>
                        <p>{(account.statistics?.totalSlipsVerified || 0).toLocaleString()} สลิป</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {account.settings?.enableBot && (
                          <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">บอท</span>
                        )}
                        {account.settings?.enableSlipVerification && (
                          <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">สลิป</span>
                        )}
                        {account.settings?.enableAi && (
                          <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">AI</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {account.isActive ? 'ใช้งาน' : 'ปิด'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setSelectedAccount(account);
                            setShowDetailModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          ดู
                        </button>
                        <button
                          onClick={() => handleToggleActive(account)}
                          className="text-yellow-600 hover:text-yellow-800 text-sm"
                        >
                          {account.isActive ? 'ปิด' : 'เปิด'}
                        </button>
                        <button
                          onClick={() => handleDelete(account._id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">รายละเอียดบัญชี LINE</h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedAccount.accountName}</h3>
                  <p className="text-sm text-gray-500">{selectedAccount.description || 'ไม่มีคำอธิบาย'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">เจ้าของ</p>
                  <p className="font-medium">{selectedAccount.owner?.username || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">สถานะ</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${selectedAccount.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedAccount.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Channel ID</p>
                <p className="font-mono text-sm bg-gray-100 p-2 rounded">{selectedAccount.channelId}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">ข้อความทั้งหมด</p>
                  <p className="text-xl font-bold">{(selectedAccount.statistics?.totalMessages || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">สลิปที่ตรวจสอบ</p>
                  <p className="text-xl font-bold">{(selectedAccount.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ผู้ใช้ทั้งหมด</p>
                  <p className="text-xl font-bold">{(selectedAccount.statistics?.totalUsers || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">AI Responses</p>
                  <p className="text-xl font-bold">{(selectedAccount.statistics?.totalAiResponses || 0).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">ฟีเจอร์ที่เปิดใช้งาน</p>
                <div className="flex flex-wrap gap-2">
                  {selectedAccount.settings?.enableBot && (
                    <span className="px-3 py-1 text-sm rounded-full bg-blue-100 text-blue-700">บอท</span>
                  )}
                  {selectedAccount.settings?.enableSlipVerification && (
                    <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-700">ตรวจสอบสลิป</span>
                  )}
                  {selectedAccount.settings?.enableAi && (
                    <span className="px-3 py-1 text-sm rounded-full bg-purple-100 text-purple-700">AI ตอบกลับ</span>
                  )}
                  {!selectedAccount.settings?.enableBot && !selectedAccount.settings?.enableSlipVerification && !selectedAccount.settings?.enableAi && (
                    <span className="text-gray-500">ไม่มีฟีเจอร์ที่เปิดใช้งาน</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">สร้างเมื่อ</p>
                <p className="font-medium">{new Date(selectedAccount.createdAt).toLocaleString('th-TH')}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-6 mt-4 border-t border-gray-200">
              <button onClick={() => setShowDetailModal(false)} className="btn btn-secondary flex-1">
                ปิด
              </button>
              <button
                onClick={() => handleToggleActive(selectedAccount)}
                className="btn bg-yellow-500 text-white hover:bg-yellow-600 flex-1"
              >
                {selectedAccount.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
              </button>
              <button
                onClick={() => handleDelete(selectedAccount._id)}
                className="btn bg-red-600 text-white hover:bg-red-700 flex-1"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
