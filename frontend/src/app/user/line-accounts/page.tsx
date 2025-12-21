'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';

export default function UserLineAccountsPage() {
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editAccount, setEditAccount] = useState<LineAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<LineAccount | null>(null);
  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
  });
  const [settingsData, setSettingsData] = useState({
    enableBot: false,
    enableAi: false,
    enableSlipVerification: false,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    slipImmediateMessage: 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await lineAccountsApi.getMyAccounts();
      setAccounts(response.data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      accountName: '',
      channelId: '',
      channelSecret: '',
      accessToken: '',
      description: '',
    });
    setEditAccount(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editAccount) {
        await lineAccountsApi.update(editAccount._id, formData);
        toast.success('อัปเดตบัญชีสำเร็จ');
      } else {
        await lineAccountsApi.create(formData);
        toast.success('เพิ่มบัญชีสำเร็จ');
      }
      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (account: LineAccount) => {
    setEditAccount(account);
    setFormData({
      accountName: account.accountName,
      channelId: account.channelId,
      channelSecret: account.channelSecret,
      accessToken: account.accessToken,
      description: account.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบบัญชีนี้หรือไม่?')) return;
    try {
      await lineAccountsApi.delete(id);
      toast.success('ลบบัญชีสำเร็จ');
      fetchAccounts();
    } catch (error) {
      toast.error('ไม่สามารถลบบัญชีได้');
    }
  };

  const handleUpdateSettings = async (id: string, settings: Partial<LineAccount['settings']>) => {
    try {
      await lineAccountsApi.updateSettings(id, settings);
      toast.success('อัปเดตการตั้งค่าสำเร็จ');
      fetchAccounts();
    } catch (error) {
      toast.error('ไม่สามารถอัปเดตได้');
    }
  };

  const openSettingsModal = (account: LineAccount) => {
    setSelectedAccount(account);
    setSettingsData({
      enableBot: account.settings?.enableBot ?? false,
      enableAi: account.settings?.enableAi ?? false,
      enableSlipVerification: account.settings?.enableSlipVerification ?? false,
      aiSystemPrompt: account.settings?.aiSystemPrompt || '',
      aiTemperature: account.settings?.aiTemperature ?? 0.7,
      aiFallbackMessage: account.settings?.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
      slipImmediateMessage: account.settings?.slipImmediateMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedAccount) return;
    try {
      await lineAccountsApi.updateSettings(selectedAccount._id, settingsData);
      toast.success('บันทึกการตั้งค่าสำเร็จ');
      setShowSettingsModal(false);
      fetchAccounts();
    } catch (error) {
      toast.error('ไม่สามารถบันทึกได้');
    }
  };

  const copyWebhookUrl = (accountId: string) => {
    const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || window.location.origin}/api/line-webhook/${accountId}`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('คัดลอก Webhook URL แล้ว');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">บัญชี LINE OA</h1>
            <p className="text-gray-500">จัดการบัญชี LINE Official Account ของคุณ</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            + เพิ่มบัญชี
          </button>
        </div>

        <div className="grid gap-6">
          {isLoading ? (
            [1, 2].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-32 bg-gray-200 rounded"></div>
              </div>
            ))
          ) : accounts.length === 0 ? (
            <div className="card text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500 mb-4">ยังไม่มีบัญชี LINE OA</p>
              <button onClick={() => setShowModal(true)} className="btn btn-primary">
                เพิ่มบัญชีแรกของคุณ
              </button>
            </div>
          ) : (
            accounts.map((account) => (
              <div key={account._id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{account.accountName}</h3>
                      <p className="text-sm text-gray-500">Channel ID: {account.channelId}</p>
                      {account.description && (
                        <p className="text-sm text-gray-400">{account.description}</p>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {account.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>

                {/* Webhook URL */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Webhook URL</p>
                      <p className="text-xs text-gray-500 font-mono truncate max-w-md">
                        {`${process.env.NEXT_PUBLIC_API_URL || ''}/api/line-webhook/${account._id}`}
                      </p>
                    </div>
                    <button
                      onClick={() => copyWebhookUrl(account._id)}
                      className="btn btn-secondary text-sm"
                    >
                      คัดลอก
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 py-4 border-y border-gray-100">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{account.statistics?.totalMessages || 0}</p>
                    <p className="text-sm text-gray-500">ข้อความ</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{account.statistics?.totalSlipsVerified || 0}</p>
                    <p className="text-sm text-gray-500">สลิปที่ตรวจ</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{account.statistics?.totalAiResponses || 0}</p>
                    <p className="text-sm text-gray-500">ตอบ AI</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-700">การตั้งค่าเร็ว</h4>
                    <button
                      onClick={() => openSettingsModal(account)}
                      className="text-primary-600 hover:text-primary-800 text-sm"
                    >
                      ตั้งค่าเพิ่มเติม
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">เปิดใช้งานบอท</p>
                      <p className="text-xs text-gray-500">ตอบกลับข้อความอัตโนมัติ</p>
                    </div>
                    <button
                      onClick={() => handleUpdateSettings(account._id, { enableBot: !account.settings?.enableBot })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${account.settings?.enableBot ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${account.settings?.enableBot ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">เปิดใช้งาน AI</p>
                      <p className="text-xs text-gray-500">ใช้ AI ตอบข้อความ</p>
                    </div>
                    <button
                      onClick={() => handleUpdateSettings(account._id, { enableAi: !account.settings?.enableAi })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${account.settings?.enableAi ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${account.settings?.enableAi ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">เปิดใช้งานตรวจสลิป</p>
                      <p className="text-xs text-gray-500">ตรวจสอบสลิปอัตโนมัติ</p>
                    </div>
                    <button
                      onClick={() => handleUpdateSettings(account._id, { enableSlipVerification: !account.settings?.enableSlipVerification })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${account.settings?.enableSlipVerification ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${account.settings?.enableSlipVerification ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 mt-4 border-t border-gray-100">
                  <button onClick={() => handleEdit(account)} className="btn btn-secondary flex-1 text-sm">
                    แก้ไขข้อมูล
                  </button>
                  <button onClick={() => handleDelete(account._id)} className="text-red-600 hover:text-red-800 px-3">
                    ลบ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Account Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editAccount ? 'แก้ไขบัญชี LINE OA' : 'เพิ่มบัญชี LINE OA'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">ชื่อบัญชี *</label>
                <input
                  type="text"
                  value={formData.accountName}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                  className="input"
                  required
                  placeholder="เช่น บัญชีหลัก"
                />
              </div>
              <div>
                <label className="label">Channel ID *</label>
                <input
                  type="text"
                  value={formData.channelId}
                  onChange={(e) => setFormData({ ...formData, channelId: e.target.value })}
                  className="input font-mono"
                  required
                  placeholder="xxxxxxxxxxxxxxx"
                />
              </div>
              <div>
                <label className="label">Channel Secret *</label>
                <input
                  type="text"
                  value={formData.channelSecret}
                  onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })}
                  className="input font-mono"
                  required
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </div>
              <div>
                <label className="label">Channel Access Token *</label>
                <textarea
                  value={formData.accessToken}
                  onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                  className="input font-mono text-xs"
                  required
                  rows={3}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxx..."
                />
              </div>
              <div>
                <label className="label">คำอธิบาย</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  placeholder="รายละเอียดเพิ่มเติม"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editAccount ? 'บันทึก' : 'เพิ่มบัญชี'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              ตั้งค่า: {selectedAccount.accountName}
            </h2>
            <div className="space-y-6">
              {/* Bot Settings */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">การตั้งค่าบอท</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">เปิดใช้งานบอท</span>
                    <button
                      onClick={() => setSettingsData({ ...settingsData, enableBot: !settingsData.enableBot })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settingsData.enableBot ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settingsData.enableBot ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Settings */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">การตั้งค่า AI</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">เปิดใช้งาน AI</span>
                    <button
                      onClick={() => setSettingsData({ ...settingsData, enableAi: !settingsData.enableAi })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settingsData.enableAi ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settingsData.enableAi ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="label">System Prompt</label>
                    <textarea
                      value={settingsData.aiSystemPrompt}
                      onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })}
                      className="input"
                      rows={3}
                      placeholder="คุณเป็นผู้ช่วยที่เป็นมิตร..."
                    />
                  </div>
                  <div>
                    <label className="label">Temperature ({settingsData.aiTemperature})</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settingsData.aiTemperature}
                      onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="label">ข้อความ Fallback</label>
                    <input
                      type="text"
                      value={settingsData.aiFallbackMessage}
                      onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              {/* Slip Settings */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">การตั้งค่าตรวจสลิป</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">เปิดใช้งานตรวจสลิป</span>
                    <button
                      onClick={() => setSettingsData({ ...settingsData, enableSlipVerification: !settingsData.enableSlipVerification })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settingsData.enableSlipVerification ? 'bg-primary-600' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settingsData.enableSlipVerification ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="label">ข้อความระหว่างตรวจสอบ</label>
                    <input
                      type="text"
                      value={settingsData.slipImmediateMessage}
                      onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowSettingsModal(false)} className="btn btn-secondary flex-1">
                  ยกเลิก
                </button>
                <button onClick={handleSaveSettings} className="btn btn-primary flex-1">
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
