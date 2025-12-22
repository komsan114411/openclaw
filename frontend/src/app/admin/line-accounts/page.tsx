'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, usersApi, systemSettingsApi } from '@/lib/api';
import { LineAccount, User } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { Input, Select, Textarea, Switch } from '@/components/ui/Input';

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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('');

  // Form state for adding/editing LINE account
  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
    ownerId: '',
  });

  // Settings form state
  const [settingsData, setSettingsData] = useState({
    enableBot: false,
    enableAi: false,
    enableSlipVerification: false,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    slipImmediateMessage: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    customQuotaExceededMessage: '',
    customBotDisabledMessage: '',
    customSlipDisabledMessage: '',
    customAiDisabledMessage: '',
    customDuplicateSlipMessage: '',
    customSlipErrorMessage: '',
    customSlipSuccessMessage: '',
    sendMessageWhenBotDisabled: 'default' as string,
    sendMessageWhenSlipDisabled: 'default' as string,
    sendMessageWhenAiDisabled: 'default' as string,
  });

  // ป้องกันการกดซ้ำ
  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchPublicBaseUrl = async () => {
    try {
      const res = await systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} }));
      setPublicBaseUrl(res.data.publicBaseUrl || '');
    } catch {
      setPublicBaseUrl('');
    }
  };

  const getWebhookUrl = (channelId: string) => {
    const base =
      publicBaseUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      '';
    const normalized = base.replace(/\/+$/, '');
    return `${normalized}/api/webhook/line/${channelId}`;
  };

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
    fetchPublicBaseUrl();
  }, [fetchData]);

  const canPerformAction = (accountId: string): boolean => {
    if (processingIdsRef.current.has(accountId)) {
      toast.error('รายการนี้กำลังดำเนินการอยู่');
      return false;
    }
    return true;
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      channelId: '',
      channelSecret: '',
      accessToken: '',
      description: '',
      ownerId: '',
    });
  };

  const handleAddAccount = async () => {
    // Validation
    if (!formData.accountName.trim()) {
      toast.error('กรุณากรอกชื่อบัญชี');
      return;
    }
    if (!formData.channelId.trim()) {
      toast.error('กรุณากรอก Channel ID');
      return;
    }
    if (!formData.channelSecret.trim()) {
      toast.error('กรุณากรอก Channel Secret');
      return;
    }
    if (!formData.accessToken.trim()) {
      toast.error('กรุณากรอก Access Token');
      return;
    }

    setIsProcessing(true);
    try {
      await lineAccountsApi.create({
        ...formData,
        ownerId: formData.ownerId || undefined,
      });
      toast.success('เพิ่มบัญชี LINE สำเร็จ', {
        duration: 4000,
        icon: '✅',
      });
      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.message || 'ไม่สามารถเพิ่มบัญชีได้';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedAccount) return;

    // Validation
    if (!formData.accountName.trim()) {
      toast.error('กรุณากรอกชื่อบัญชี');
      return;
    }

    setIsProcessing(true);
    try {
      await lineAccountsApi.update(selectedAccount._id, formData);
      toast.success('อัปเดตบัญชีสำเร็จ', {
        duration: 4000,
        icon: '✅',
      });
      setShowEditModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.message || 'ไม่สามารถอัปเดตบัญชีได้';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (account: ExtendedLineAccount) => {
    setSelectedAccount(account);
    setFormData({
      accountName: account.accountName,
      channelId: account.channelId,
      channelSecret: account.channelSecret,
      accessToken: account.accessToken,
      description: account.description || '',
      ownerId: account.ownerId || '',
    });
    setShowEditModal(true);
  };

  const openSettingsModal = (account: ExtendedLineAccount) => {
    setSelectedAccount(account);
    const s = account.settings || {};
    // Convert boolean/null to string for frontend select
    const boolToString = (val: boolean | null | undefined): string => {
      if (val === null || val === undefined) return 'default';
      return val ? 'true' : 'false';
    };
    setSettingsData({
      enableBot: s.enableBot ?? false,
      enableAi: s.enableAi ?? false,
      enableSlipVerification: s.enableSlipVerification ?? false,
      aiSystemPrompt: s.aiSystemPrompt || '',
      aiTemperature: s.aiTemperature ?? 0.7,
      aiFallbackMessage: s.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
      slipImmediateMessage: s.slipImmediateMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
      customQuotaExceededMessage: (s as any).customQuotaExceededMessage || '',
      customBotDisabledMessage: (s as any).customBotDisabledMessage || '',
      customSlipDisabledMessage: (s as any).customSlipDisabledMessage || '',
      customAiDisabledMessage: (s as any).customAiDisabledMessage || '',
      customDuplicateSlipMessage: (s as any).customDuplicateSlipMessage || '',
      customSlipErrorMessage: (s as any).customSlipErrorMessage || '',
      customSlipSuccessMessage: (s as any).customSlipSuccessMessage || '',
      sendMessageWhenBotDisabled: boolToString((s as any).sendMessageWhenBotDisabled),
      sendMessageWhenSlipDisabled: boolToString((s as any).sendMessageWhenSlipDisabled),
      sendMessageWhenAiDisabled: boolToString((s as any).sendMessageWhenAiDisabled),
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      // Convert string values back to boolean/null for backend
      const stringToBool = (val: string): boolean | null => {
        if (val === 'default') return null;
        return val === 'true';
      };
      const dataToSave = {
        ...settingsData,
        sendMessageWhenBotDisabled: stringToBool(settingsData.sendMessageWhenBotDisabled),
        sendMessageWhenSlipDisabled: stringToBool(settingsData.sendMessageWhenSlipDisabled),
        sendMessageWhenAiDisabled: stringToBool(settingsData.sendMessageWhenAiDisabled),
      };
      await lineAccountsApi.updateSettings(selectedAccount._id, dataToSave);
      toast.success('บันทึกการตั้งค่าสำเร็จ', { icon: '✅' });
      setShowSettingsModal(false);
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถบันทึกได้');
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

  const handleToggleActive = async (account: ExtendedLineAccount, skipConfirm = false) => {
    if (!canPerformAction(account._id)) return;

    // ถ้าจะปิดใช้งาน ให้แสดง confirm ก่อน
    if (account.isActive && !skipConfirm) {
      setSelectedAccount(account);
      setShowDisableConfirm(true);
      return;
    }

    processingIdsRef.current.add(account._id);
    
    try {
      await lineAccountsApi.update(account._id, { isActive: !account.isActive });
      toast.success(account.isActive ? 'ปิดใช้งานบัญชีแล้ว' : 'เปิดใช้งานบัญชีแล้ว', {
        icon: account.isActive ? '🔴' : '🟢',
      });
      setShowDisableConfirm(false);
      fetchData();
    } catch (error) {
      toast.error('ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      processingIdsRef.current.delete(account._id);
    }
  };

  const copyWebhookUrl = (channelId: string) => {
    const webhookUrl = getWebhookUrl(channelId);
    if (!webhookUrl) {
      toast.error('ไม่พบข้อมูล Webhook URL');
      return;
    }
    navigator.clipboard.writeText(webhookUrl);
    toast.success('คัดลอก Webhook URL แล้ว');
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
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
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
                            variant="secondary"
                            size="sm"
                            onClick={() => openSettingsModal(account)}
                          >
                            ตั้งค่า
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(account)}
                          >
                            แก้ไข
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
            value={formData.accountName}
            onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
            disabled={isProcessing}
          />

          <Input
            label="Channel ID *"
            placeholder="เช่น 1234567890"
            value={formData.channelId}
            onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
            disabled={isProcessing}
          />

          <Input
            label="Channel Secret *"
            placeholder="Channel Secret จาก LINE Developers"
            value={formData.channelSecret}
            onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })}
            type="password"
            disabled={isProcessing}
          />

          <Input
            label="Access Token *"
            placeholder="Channel Access Token จาก LINE Developers"
            value={formData.accessToken}
            onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
            type="password"
            disabled={isProcessing}
          />

          <Textarea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            disabled={isProcessing}
          />

          <Select
            label="เจ้าของบัญชี"
            value={formData.ownerId}
            onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
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

      {/* Edit Account Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !isProcessing && setShowEditModal(false)}
        title="แก้ไขบัญชี LINE OA"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="ชื่อบัญชี *"
            placeholder="เช่น ร้านค้า ABC"
            value={formData.accountName}
            onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
            disabled={isProcessing}
          />

          <Input
            label="Channel ID"
            value={formData.channelId}
            disabled
            hint="Channel ID ไม่สามารถแก้ไขได้"
          />

          <Input
            label="Channel Secret"
            placeholder="Channel Secret จาก LINE Developers"
            value={formData.channelSecret}
            onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })}
            type="password"
            disabled={isProcessing}
            hint="ปล่อยว่างถ้าไม่ต้องการเปลี่ยน"
          />

          <Input
            label="Access Token"
            placeholder="Channel Access Token จาก LINE Developers"
            value={formData.accessToken}
            onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
            type="password"
            disabled={isProcessing}
            hint="ปล่อยว่างถ้าไม่ต้องการเปลี่ยน"
          />

          <Textarea
            label="คำอธิบาย"
            placeholder="คำอธิบายเพิ่มเติม (ไม่บังคับ)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
            disabled={isProcessing}
          />

          <Select
            label="เจ้าของบัญชี"
            value={formData.ownerId}
            onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
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
              onClick={() => setShowEditModal(false)}
              disabled={isProcessing}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleEditAccount}
              isLoading={isProcessing}
              loadingText="กำลังบันทึก..."
            >
              บันทึก
            </Button>
          </div>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => !isProcessing && setShowSettingsModal(false)}
        title={`ตั้งค่าบัญชี: ${selectedAccount?.accountName}`}
        size="xl"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Basic Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 border-b pb-2">ฟีเจอร์หลัก</h3>
            
            <Switch
              checked={settingsData.enableBot}
              onChange={(checked) => setSettingsData({ ...settingsData, enableBot: checked })}
              label="🤖 เปิดใช้งานบอท"
              description="เปิดให้บอทตอบกลับข้อความอัตโนมัติ"
            />

            <Switch
              checked={settingsData.enableSlipVerification}
              onChange={(checked) => setSettingsData({ ...settingsData, enableSlipVerification: checked })}
              label="🧾 เปิดใช้งานตรวจสอบสลิป"
              description="เปิดให้ระบบตรวจสอบสลิปโอนเงินอัตโนมัติ"
            />

            <Switch
              checked={settingsData.enableAi}
              onChange={(checked) => setSettingsData({ ...settingsData, enableAi: checked })}
              label="🧠 เปิดใช้งาน AI ตอบกลับ"
              description="เปิดให้ AI ตอบกลับข้อความที่ไม่ใช่สลิป"
            />
          </div>

          {/* AI Settings */}
          {settingsData.enableAi && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">ตั้งค่า AI</h3>
              
              <Textarea
                label="System Prompt"
                placeholder="คำสั่งสำหรับ AI เช่น คุณเป็นผู้ช่วยร้านค้า..."
                value={settingsData.aiSystemPrompt}
                onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })}
                rows={4}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Temperature: {settingsData.aiTemperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settingsData.aiTemperature}
                  onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ค่าต่ำ = ตอบแม่นยำ, ค่าสูง = ตอบหลากหลาย
                </p>
              </div>

              <Input
                label="ข้อความเมื่อ AI ไม่สามารถตอบได้"
                value={settingsData.aiFallbackMessage}
                onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })}
              />
            </div>
          )}

          {/* Slip Settings */}
          {settingsData.enableSlipVerification && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">ตั้งค่าตรวจสอบสลิป</h3>
              
              <Input
                label="ข้อความขณะตรวจสอบสลิป"
                value={settingsData.slipImmediateMessage}
                onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })}
              />

              <Input
                label="ข้อความเมื่อตรวจสอบสำเร็จ (กำหนดเอง)"
                placeholder="ปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
                value={settingsData.customSlipSuccessMessage}
                onChange={(e) => setSettingsData({ ...settingsData, customSlipSuccessMessage: e.target.value })}
              />

              <Input
                label="ข้อความเมื่อเกิดข้อผิดพลาด (กำหนดเอง)"
                placeholder="ปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
                value={settingsData.customSlipErrorMessage}
                onChange={(e) => setSettingsData({ ...settingsData, customSlipErrorMessage: e.target.value })}
              />

              <Input
                label="ข้อความเมื่อสลิปซ้ำ (กำหนดเอง)"
                placeholder="ปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
                value={settingsData.customDuplicateSlipMessage}
                onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })}
              />
            </div>
          )}

          {/* Custom Messages */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900 border-b pb-2">ข้อความกำหนดเอง</h3>
            
            <Input
              label="ข้อความเมื่อโควต้าหมด (กำหนดเอง)"
              placeholder="ปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
              value={settingsData.customQuotaExceededMessage}
              onChange={(e) => setSettingsData({ ...settingsData, customQuotaExceededMessage: e.target.value })}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="ส่งข้อความเมื่อบอทปิด"
                value={settingsData.sendMessageWhenBotDisabled}
                onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenBotDisabled: e.target.value })}
              >
                <option value="default">ใช้ค่าเริ่มต้นของระบบ</option>
                <option value="true">ส่งข้อความ</option>
                <option value="false">ไม่ส่งข้อความ</option>
              </Select>

              <Select
                label="ส่งข้อความเมื่อสลิปปิด"
                value={settingsData.sendMessageWhenSlipDisabled}
                onChange={(e) => setSettingsData({ ...settingsData, sendMessageWhenSlipDisabled: e.target.value })}
              >
                <option value="default">ใช้ค่าเริ่มต้นของระบบ</option>
                <option value="true">ส่งข้อความ</option>
                <option value="false">ไม่ส่งข้อความ</option>
              </Select>
            </div>

            <Input
              label="ข้อความเมื่อบอทปิด (กำหนดเอง)"
              placeholder="ปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
              value={settingsData.customBotDisabledMessage}
              onChange={(e) => setSettingsData({ ...settingsData, customBotDisabledMessage: e.target.value })}
            />

            <Input
              label="ข้อความเมื่อสลิปปิด (กำหนดเอง)"
              placeholder="ปล่อยว่างเพื่อใช้ค่าเริ่มต้น"
              value={settingsData.customSlipDisabledMessage}
              onChange={(e) => setSettingsData({ ...settingsData, customSlipDisabledMessage: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-4 border-t sticky bottom-0 bg-white">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowSettingsModal(false)}
              disabled={isProcessing}
            >
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleSaveSettings}
              isLoading={isProcessing}
              loadingText="กำลังบันทึก..."
            >
              บันทึกการตั้งค่า
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
              <div className="flex items-center gap-2">
                <code className="text-sm text-yellow-800 break-all flex-1">
                  {getWebhookUrl(selectedAccount.channelId)}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyWebhookUrl(selectedAccount.channelId)}
                >
                  คัดลอก
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setShowDetailModal(false);
                  openSettingsModal(selectedAccount);
                }}
              >
                ⚙️ ตั้งค่า
              </Button>
              <Button
                variant={selectedAccount.isActive ? 'warning' : 'success'}
                fullWidth
                onClick={() => {
                  handleToggleActive(selectedAccount);
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
        title="⚠️ ยืนยันการลบบัญชี"
        message={`คุณต้องการลบบัญชี "${selectedAccount?.accountName}" หรือไม่?\n\n⚠️ คำเตือน: การลบจะไม่สามารถกู้คืนได้ และข้อมูลทั้งหมดจะถูกลบออกจากระบบ รวมถึง:\n• ประวัติการแชท\n• ประวัติการตรวจสอบสลิป\n• การตั้งค่าทั้งหมด`}
        confirmText="ยืนยันลบบัญชี"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isProcessing}
      />

      {/* Disable Confirm Modal */}
      <ConfirmModal
        isOpen={showDisableConfirm}
        onClose={() => setShowDisableConfirm(false)}
        onConfirm={() => selectedAccount && handleToggleActive(selectedAccount, true)}
        title="⚠️ ยืนยันการปิดใช้งาน"
        message={`คุณต้องการปิดใช้งานบัญชี "${selectedAccount?.accountName}" หรือไม่?\n\nเมื่อปิดใช้งาน:\n• บอทจะหยุดตอบกลับข้อความ\n• ระบบตรวจสอบสลิปจะหยุดทำงาน\n• ผู้ใช้จะไม่ได้รับการตอบกลับใดๆ`}
        confirmText="ปิดใช้งาน"
        cancelText="ยกเลิก"
        type="warning"
        isLoading={isProcessing}
      />
    </DashboardLayout>
  );
}
