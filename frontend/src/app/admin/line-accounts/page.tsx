'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, usersApi } from '@/lib/api';
import { LineAccount, User } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { Input, Select, TextArea } from '@/components/ui/Input';

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for adding new LINE account
  const [newAccount, setNewAccount] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
    ownerId: '',
  });

  // ป้องกันการกดซ้ำ
  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setError(null);
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
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canPerformAction = (accountId: string): boolean => {
    if (processingIdsRef.current.has(accountId)) {
      toast.error('รายการนี้กำลังดำเนินการอยู่');
      return false;
    }
    return true;
  };

  const handleAddAccount = async () => {
    // Validation
    if (!newAccount.accountName.trim()) {
      toast.error('กรุณากรอกชื่อบัญชี');
      return;
    }
    if (!newAccount.channelId.trim()) {
      toast.error('กรุณากรอก Channel ID');
      return;
    }
    if (!newAccount.channelSecret.trim()) {
      toast.error('กรุณากรอก Channel Secret');
      return;
    }
    if (!newAccount.accessToken.trim()) {
      toast.error('กรุณากรอก Access Token');
      return;
    }

    setIsProcessing(true);
    try {
      await lineAccountsApi.create({
        ...newAccount,
        ownerId: newAccount.ownerId || undefined,
      });
      toast.success('เพิ่มบัญชี LINE สำเร็จ', {
        duration: 4000,
        icon: '✅',
      });
      setShowAddModal(false);
      setNewAccount({
        accountName: '',
        channelId: '',
        channelSecret: '',
        accessToken: '',
        description: '',
        ownerId: '',
      });
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.message || 'ไม่สามารถเพิ่มบัญชีได้';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount || !canPerformAction(selectedAccount._id)) return;

    processingIdsRef.current.add(selectedAccount._id);
    setIsProcessing(true);

    try {
      await lineAccountsApi.delete(selectedAccount._id);
      toast.success('ลบบัญชีสำเร็จ', {
        duration: 4000,
        icon: '🗑️',
      });
      setShowDeleteConfirm(false);
      setShowDetailModal(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถลบบัญชีได้');
    } finally {
      setIsProcessing(false);
      processingIdsRef.current.delete(selectedAccount._id);
    }
  };

  const handleToggleActive = async (account: ExtendedLineAccount) => {
    if (!canPerformAction(account._id)) return;

    processingIdsRef.current.add(account._id);
    
    try {
      await lineAccountsApi.update(account._id, { isActive: !account.isActive });
      toast.success(account.isActive ? 'ปิดใช้งานบัญชีแล้ว' : 'เปิดใช้งานบัญชีแล้ว', {
        icon: account.isActive ? '🔴' : '🟢',
      });
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      processingIdsRef.current.delete(account._id);
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

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading message="กำลังโหลดข้อมูลบัญชี LINE..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">บัญชี LINE ทั้งหมด</h1>
            <p className="page-subtitle">ดูและจัดการบัญชี LINE OA ในระบบ</p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowAddModal(true)}
            leftIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            เพิ่มบัญชี LINE
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setIsLoading(true); fetchData(); }}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid-stats">
          <StatCard
            title="บัญชีทั้งหมด"
            value={accounts.length.toString()}
            color="blue"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
          />
          <StatCard
            title="ใช้งานอยู่"
            value={activeAccounts.toString()}
            color="green"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            title="ข้อความทั้งหมด"
            value={totalMessages.toLocaleString()}
            color="purple"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            }
          />
          <StatCard
            title="สลิปที่ตรวจสอบ"
            value={totalSlips.toLocaleString()}
            color="yellow"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
        </div>

        {/* Search */}
        <Card className="p-4">
          <Input
            placeholder="ค้นหาบัญชี LINE..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </Card>

        {/* Accounts Table */}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ชื่อบัญชี</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">เจ้าของ</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Channel ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">สถิติ</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ฟีเจอร์</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">สถานะ</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12">
                      <EmptyState
                        icon={
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        }
                        title={searchTerm ? 'ไม่พบบัญชีที่ค้นหา' : 'ยังไม่มีบัญชี LINE'}
                        description={searchTerm ? 'ลองค้นหาด้วยคำอื่น' : 'เพิ่มบัญชี LINE เพื่อเริ่มต้นใช้งาน'}
                        action={
                          !searchTerm && (
                            <Button variant="primary" onClick={() => setShowAddModal(true)}>
                              เพิ่มบัญชี LINE
                            </Button>
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => (
                    <tr key={account._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <p className="font-medium text-gray-900">{account.owner?.username || 'Admin'}</p>
                        <p className="text-sm text-gray-500">{account.owner?.email || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">{account.channelId}</code>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm space-y-1">
                          <p className="flex items-center gap-1">
                            <span className="text-gray-500">💬</span>
                            <span className="font-medium">{(account.statistics?.totalMessages || 0).toLocaleString()}</span>
                            <span className="text-gray-400">ข้อความ</span>
                          </p>
                          <p className="flex items-center gap-1">
                            <span className="text-gray-500">🧾</span>
                            <span className="font-medium">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</span>
                            <span className="text-gray-400">สลิป</span>
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {account.settings?.enableBot && (
                            <Badge variant="info" size="sm">🤖 บอท</Badge>
                          )}
                          {account.settings?.enableSlipVerification && (
                            <Badge variant="success" size="sm">🧾 สลิป</Badge>
                          )}
                          {account.settings?.enableAi && (
                            <Badge variant="secondary" size="sm">🧠 AI</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={account.isActive ? 'success' : 'secondary'}>
                          {account.isActive ? '🟢 ใช้งาน' : '🔴 ปิด'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedAccount(account);
                              setShowDetailModal(true);
                            }}
                          >
                            ดู
                          </Button>
                          <Button
                            variant={account.isActive ? 'warning' : 'success'}
                            size="sm"
                            onClick={() => handleToggleActive(account)}
                            disabled={processingIdsRef.current.has(account._id)}
                          >
                            {account.isActive ? 'ปิด' : 'เปิด'}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelectedAccount(account);
                              setShowDeleteConfirm(true);
                            }}
                            disabled={processingIdsRef.current.has(account._id)}
                          >
                            ลบ
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Add Account Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => !isProcessing && setShowAddModal(false)}
        title="เพิ่มบัญชี LINE OA"
        size="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm text-blue-700">
              <strong>💡 วิธีรับข้อมูล:</strong> ไปที่ LINE Developers Console → เลือก Channel → ดูข้อมูล Channel ID, Channel Secret และ Access Token
            </p>
          </div>

          <Input
            label="ชื่อบัญชี *"
            placeholder="เช่น ร้านค้า ABC"
            value={newAccount.accountName}
            onChange={(e) => setNewAccount({ ...newAccount, accountName: e.target.value })}
            disabled={isProcessing}
          />

          <Input
            label="Channel ID *"
            placeholder="เช่น 1234567890"
            value={newAccount.channelId}
            onChange={(e) => setNewAccount({ ...newAccount, channelId: e.target.value })}
            disabled={isProcessing}
          />

          <Input
            label="Channel Secret *"
            placeholder="Channel Secret จาก LINE Developers"
            value={newAccount.channelSecret}
            onChange={(e) => setNewAccount({ ...newAccount, channelSecret: e.target.value })}
            type="password"
            disabled={isProcessing}
          />

          <Input
            label="Access Token *"
            placeholder="Channel Access Token จาก LINE Developers"
            value={newAccount.accessToken}
            onChange={(e) => setNewAccount({ ...newAccount, accessToken: e.target.value })}
            type="password"
            disabled={isProcessing}
          />

          <TextArea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
            value={newAccount.description}
            onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
            rows={2}
            disabled={isProcessing}
          />

          <Select
            label="เจ้าของบัญชี"
            value={newAccount.ownerId}
            onChange={(e) => setNewAccount({ ...newAccount, ownerId: e.target.value })}
            disabled={isProcessing}
          >
            <option value="">-- Admin (ไม่ระบุเจ้าของ) --</option>
            {users.filter(u => u.role === 'user').map((user) => (
              <option key={user._id} value={user._id}>
                {user.username} ({user.email})
              </option>
            ))}
          </Select>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowAddModal(false)}
              disabled={isProcessing}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleAddAccount}
              isLoading={isProcessing}
              loadingText="กำลังเพิ่ม..."
            >
              เพิ่มบัญชี
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="รายละเอียดบัญชี LINE"
        size="lg"
      >
        {selectedAccount && (
          <div className="space-y-6">
            {/* Account Info */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedAccount.accountName}</h3>
                <p className="text-gray-500">{selectedAccount.description || 'ไม่มีคำอธิบาย'}</p>
                <Badge variant={selectedAccount.isActive ? 'success' : 'secondary'} className="mt-2">
                  {selectedAccount.isActive ? '🟢 ใช้งานอยู่' : '🔴 ปิดใช้งาน'}
                </Badge>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">Channel ID</p>
                <code className="font-mono text-gray-900">{selectedAccount.channelId}</code>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">เจ้าของ</p>
                <p className="font-semibold text-gray-900">{selectedAccount.owner?.username || 'Admin'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">ข้อความทั้งหมด</p>
                <p className="font-semibold text-gray-900">{(selectedAccount.statistics?.totalMessages || 0).toLocaleString()}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">สลิปที่ตรวจสอบ</p>
                <p className="font-semibold text-gray-900">{(selectedAccount.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Features */}
            <div>
              <p className="text-sm text-gray-500 mb-2">ฟีเจอร์ที่เปิดใช้งาน</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={selectedAccount.settings?.enableBot ? 'info' : 'secondary'}>
                  {selectedAccount.settings?.enableBot ? '✅' : '❌'} บอทตอบกลับ
                </Badge>
                <Badge variant={selectedAccount.settings?.enableSlipVerification ? 'success' : 'secondary'}>
                  {selectedAccount.settings?.enableSlipVerification ? '✅' : '❌'} ตรวจสอบสลิป
                </Badge>
                <Badge variant={selectedAccount.settings?.enableAi ? 'info' : 'secondary'}>
                  {selectedAccount.settings?.enableAi ? '✅' : '❌'} AI ตอบกลับ
                </Badge>
              </div>
            </div>

            {/* Webhook URL */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-sm text-yellow-600 mb-2">🔗 Webhook URL (ใช้ตั้งค่าใน LINE Developers)</p>
              <code className="text-sm text-yellow-800 break-all">
                {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/${selectedAccount.channelId}` : `/api/webhook/${selectedAccount.channelId}`}
              </code>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant={selectedAccount.isActive ? 'warning' : 'success'}
                fullWidth
                onClick={() => {
                  handleToggleActive(selectedAccount);
                  setShowDetailModal(false);
                }}
              >
                {selectedAccount.isActive ? '🔴 ปิดใช้งาน' : '🟢 เปิดใช้งาน'}
              </Button>
              <Button
                variant="danger"
                fullWidth
                onClick={() => {
                  setShowDetailModal(false);
                  setShowDeleteConfirm(true);
                }}
              >
                🗑️ ลบบัญชี
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="ยืนยันการลบบัญชี"
        message={`คุณต้องการลบบัญชี "${selectedAccount?.accountName}" หรือไม่? การลบจะไม่สามารถกู้คืนได้ และข้อมูลทั้งหมดจะถูกลบออกจากระบบ`}
        confirmText="ลบบัญชี"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
