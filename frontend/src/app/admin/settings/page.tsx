'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { systemSettingsApi, slipApi, chatbotApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [slipApiKey, setSlipApiKey] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [testingSlip, setTestingSlip] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await systemSettingsApi.get();
      setSettings(response.data.settings || {});
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSlipApi = async () => {
    if (!slipApiKey) {
      toast.error('กรุณากรอก API Key');
      return;
    }

    try {
      const response = await systemSettingsApi.update({ slipApiKey });
      if (response.data.success) {
        toast.success('บันทึก API Key สำเร็จ');
        setSlipApiKey('');
        fetchSettings();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleSaveAiApi = async () => {
    if (!aiApiKey) {
      toast.error('กรุณากรอก API Key');
      return;
    }

    try {
      const response = await systemSettingsApi.update({ aiApiKey });
      if (response.data.success) {
        toast.success('บันทึก API Key สำเร็จ');
        setAiApiKey('');
        fetchSettings();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleTestSlipApi = async () => {
    const key = slipApiKey || settings?.slipApiKeyPreview?.replace('...', '');
    if (!key) {
      toast.error('กรุณากรอก API Key ก่อน');
      return;
    }

    setTestingSlip(true);
    try {
      const response = await slipApi.testConnection(slipApiKey || settings?.slipApiKeyPreview);
      if (response.data.success) {
        toast.success(`เชื่อมต่อสำเร็จ! โควต้าเหลือ: ${response.data.remainingQuota || 'N/A'}`);
      } else {
        toast.error(response.data.message || 'เชื่อมต่อไม่สำเร็จ');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setTestingSlip(false);
    }
  };

  const handleTestAiApi = async () => {
    const key = aiApiKey || settings?.aiApiKeyPreview?.replace('...', '');
    if (!key) {
      toast.error('กรุณากรอก API Key ก่อน');
      return;
    }

    setTestingAi(true);
    try {
      const response = await chatbotApi.testConnection(aiApiKey || settings?.aiApiKeyPreview);
      if (response.data.success) {
        toast.success('เชื่อมต่อ AI สำเร็จ!');
      } else {
        toast.error(response.data.message || 'เชื่อมต่อไม่สำเร็จ');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setTestingAi(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout requiredRole="admin">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="card">
            <div className="h-40 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าระบบ</h1>
          <p className="text-gray-500">ตั้งค่า API และบัญชีธนาคาร</p>
        </div>

        {/* Slip API Settings */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Thunder API (ตรวจสอบสลิป)</h2>
          <div className="space-y-4">
            <div>
              <label className="label">API Key ปัจจุบัน</label>
              <p className="text-gray-600 font-mono">
                {settings?.slipApiKeyPreview || 'ยังไม่ได้ตั้งค่า'}
              </p>
            </div>
            <div>
              <label className="label">API Key ใหม่</label>
              <input
                type="password"
                value={slipApiKey}
                onChange={(e) => setSlipApiKey(e.target.value)}
                className="input"
                placeholder="กรอก Thunder API Key"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveSlipApi} className="btn btn-primary">
                บันทึก
              </button>
              <button onClick={handleTestSlipApi} disabled={testingSlip} className="btn btn-secondary">
                {testingSlip ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
              </button>
            </div>
          </div>
        </div>

        {/* AI API Settings */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">OpenAI API (AI Chatbot)</h2>
          <div className="space-y-4">
            <div>
              <label className="label">API Key ปัจจุบัน</label>
              <p className="text-gray-600 font-mono">
                {settings?.aiApiKeyPreview || 'ยังไม่ได้ตั้งค่า'}
              </p>
            </div>
            <div>
              <label className="label">API Key ใหม่</label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                className="input"
                placeholder="กรอก OpenAI API Key"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveAiApi} className="btn btn-primary">
                บันทึก
              </button>
              <button onClick={handleTestAiApi} disabled={testingAi} className="btn btn-secondary">
                {testingAi ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
              </button>
            </div>
          </div>
        </div>

        {/* Bank Accounts */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">บัญชีธนาคารสำหรับรับชำระเงิน</h2>
          {settings?.bankAccounts?.length > 0 ? (
            <div className="space-y-3">
              {settings.bankAccounts.map((account: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{account.bankName}</p>
                    <p className="text-sm text-gray-500">
                      {account.accountNumber} - {account.accountName}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm('ต้องการลบบัญชีนี้?')) {
                        try {
                          await systemSettingsApi.removeBankAccount(index);
                          toast.success('ลบบัญชีสำเร็จ');
                          fetchSettings();
                        } catch (error) {
                          toast.error('เกิดข้อผิดพลาด');
                        }
                      }
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 mb-4">ยังไม่มีบัญชีธนาคาร</p>
          )}
          <button className="btn btn-secondary mt-4">+ เพิ่มบัญชีธนาคาร</button>
        </div>
      </div>
    </DashboardLayout>
  );
}
