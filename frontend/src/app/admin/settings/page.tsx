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
  
  // Bank account form
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({
    bankName: '',
    accountNumber: '',
    accountName: '',
  });

  // USDT settings
  const [usdtSettings, setUsdtSettings] = useState({
    usdtEnabled: true,
    usdtNetwork: 'TRC20',
    usdtWalletAddress: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await systemSettingsApi.get();
      const data = response.data.settings || {};
      setSettings(data);
      setUsdtSettings({
        usdtEnabled: data.usdtEnabled ?? true,
        usdtNetwork: data.usdtNetwork || 'TRC20',
        usdtWalletAddress: data.usdtWalletAddress || '',
      });
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
    if (!slipApiKey && !settings?.slipApiKeyPreview) {
      toast.error('กรุณากรอก API Key ก่อน');
      return;
    }

    setTestingSlip(true);
    try {
      const response = await slipApi.testConnection(slipApiKey || 'use-saved');
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
    if (!aiApiKey && !settings?.aiApiKeyPreview) {
      toast.error('กรุณากรอก API Key ก่อน');
      return;
    }

    setTestingAi(true);
    try {
      const response = await chatbotApi.testConnection(aiApiKey || 'use-saved');
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

  const handleAddBankAccount = async () => {
    if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.accountName) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    try {
      const response = await systemSettingsApi.addBankAccount(bankForm);
      if (response.data.success) {
        toast.success('เพิ่มบัญชีธนาคารสำเร็จ');
        setShowBankModal(false);
        setBankForm({ bankName: '', accountNumber: '', accountName: '' });
        fetchSettings();
      } else {
        toast.error(response.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleRemoveBankAccount = async (index: number) => {
    if (!confirm('ต้องการลบบัญชีนี้?')) return;
    
    try {
      const response = await systemSettingsApi.removeBankAccount(index);
      if (response.data.success) {
        toast.success('ลบบัญชีสำเร็จ');
        fetchSettings();
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleSaveUsdtSettings = async () => {
    try {
      const response = await systemSettingsApi.update(usdtSettings);
      if (response.data.success) {
        toast.success('บันทึกการตั้งค่า USDT สำเร็จ');
        fetchSettings();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
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
              <label className="label">AI Model</label>
              <p className="text-gray-600">{settings?.aiModel || 'gpt-3.5-turbo'}</p>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">บัญชีธนาคารสำหรับรับชำระเงิน</h2>
            <button onClick={() => setShowBankModal(true)} className="btn btn-primary text-sm">
              + เพิ่มบัญชี
            </button>
          </div>
          
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
                    onClick={() => handleRemoveBankAccount(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">ยังไม่มีบัญชีธนาคาร</p>
          )}
        </div>

        {/* USDT Settings */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">การชำระเงินด้วย USDT</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">เปิดใช้งาน USDT</p>
                <p className="text-sm text-gray-500">อนุญาตให้ชำระเงินด้วย USDT</p>
              </div>
              <button
                onClick={() => setUsdtSettings({ ...usdtSettings, usdtEnabled: !usdtSettings.usdtEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${usdtSettings.usdtEnabled ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${usdtSettings.usdtEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            
            <div>
              <label className="label">Network</label>
              <select
                value={usdtSettings.usdtNetwork}
                onChange={(e) => setUsdtSettings({ ...usdtSettings, usdtNetwork: e.target.value })}
                className="input"
              >
                <option value="TRC20">TRC20 (Tron)</option>
                <option value="ERC20">ERC20 (Ethereum)</option>
                <option value="BEP20">BEP20 (BSC)</option>
              </select>
            </div>
            
            <div>
              <label className="label">Wallet Address</label>
              <input
                type="text"
                value={usdtSettings.usdtWalletAddress}
                onChange={(e) => setUsdtSettings({ ...usdtSettings, usdtWalletAddress: e.target.value })}
                className="input font-mono"
                placeholder="กรอก Wallet Address"
              />
            </div>
            
            <button onClick={handleSaveUsdtSettings} className="btn btn-primary">
              บันทึกการตั้งค่า USDT
            </button>
          </div>
        </div>

        {/* Contact Settings */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">ข้อมูลติดต่อ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">LINE ID</label>
              <p className="text-gray-600">{settings?.contactAdminLine || '-'}</p>
            </div>
            <div>
              <label className="label">Email</label>
              <p className="text-gray-600">{settings?.contactAdminEmail || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Bank Account Modal */}
      {showBankModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">เพิ่มบัญชีธนาคาร</h2>
            <div className="space-y-4">
              <div>
                <label className="label">ชื่อธนาคาร</label>
                <select
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className="input"
                >
                  <option value="">เลือกธนาคาร</option>
                  <option value="กสิกรไทย">ธนาคารกสิกรไทย</option>
                  <option value="กรุงเทพ">ธนาคารกรุงเทพ</option>
                  <option value="กรุงไทย">ธนาคารกรุงไทย</option>
                  <option value="ไทยพาณิชย์">ธนาคารไทยพาณิชย์</option>
                  <option value="กรุงศรี">ธนาคารกรุงศรีอยุธยา</option>
                  <option value="ทหารไทยธนชาต">ธนาคารทหารไทยธนชาต</option>
                  <option value="ออมสิน">ธนาคารออมสิน</option>
                  <option value="ธ.ก.ส.">ธนาคาร ธ.ก.ส.</option>
                </select>
              </div>
              <div>
                <label className="label">เลขบัญชี</label>
                <input
                  type="text"
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  className="input"
                  placeholder="xxx-x-xxxxx-x"
                />
              </div>
              <div>
                <label className="label">ชื่อบัญชี</label>
                <input
                  type="text"
                  value={bankForm.accountName}
                  onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                  className="input"
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowBankModal(false);
                    setBankForm({ bankName: '', accountNumber: '', accountName: '' });
                  }}
                  className="btn btn-secondary flex-1"
                >
                  ยกเลิก
                </button>
                <button onClick={handleAddBankAccount} className="btn btn-primary flex-1">
                  เพิ่มบัญชี
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
