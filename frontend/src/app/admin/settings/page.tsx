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
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  
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
      setPublicBaseUrl(data.publicBaseUrl || '');
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

  const handleSavePublicBaseUrl = async () => {
    try {
      const response = await systemSettingsApi.update({ publicBaseUrl });
      if (response.data.success) {
        toast.success('บันทึก URL เว็บสำเร็จ');
        fetchSettings();
      } else {
        toast.error(response.data.message || 'บันทึกไม่สำเร็จ');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
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

        {/* Public URL Settings */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">URL ของเว็บ (สำหรับ Webhook)</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Base URL (เช่น https://your-domain.com)</label>
              <input
                type="text"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                className="input font-mono"
                placeholder="https://example.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                ระบบจะใช้ค่านี้เพื่อแสดง Webhook URL ให้เอาไปตั้งค่าใน LINE Developers
              </p>
            </div>
            <button onClick={handleSavePublicBaseUrl} className="btn btn-primary">
              บันทึก URL เว็บ
            </button>
          </div>
        </div>

        {/* Slip API Settings */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Thunder API (ตรวจสอบสลิป)</h2>
                <p className="text-sm text-gray-500">API สำหรับตรวจสอบสลิปโอนเงิน</p>
              </div>
            </div>
            <span className={`px-3 py-1 text-xs rounded-full font-medium ${settings?.slipApiKeyPreview ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {settings?.slipApiKeyPreview ? '✓ ตั้งค่าแล้ว' : '✗ ยังไม่ได้ตั้งค่า'}
            </span>
          </div>
          <div className="space-y-4">
            {settings?.slipApiKeyPreview && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <label className="text-xs text-gray-500">API Key ปัจจุบัน</label>
                <p className="text-gray-800 font-mono text-sm">{settings.slipApiKeyPreview}</p>
              </div>
            )}
            <div>
              <label className="label">API Key ใหม่</label>
              <input
                type="password"
                value={slipApiKey}
                onChange={(e) => setSlipApiKey(e.target.value)}
                className="input"
                placeholder="กรอก Thunder API Key"
              />
              <p className="text-xs text-gray-500 mt-1">
                ขอ API Key ได้ที่{' '}
                <a href="https://thunder.in.th" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  thunder.in.th
                </a>
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveSlipApi} className="btn btn-primary">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                บันทึก
              </button>
              <button onClick={handleTestSlipApi} disabled={testingSlip} className="btn btn-secondary">
                {testingSlip ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังทดสอบ...
                  </span>
                ) : 'ทดสอบการเชื่อมต่อ'}
              </button>
            </div>
          </div>
        </div>

        {/* AI API Settings */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">OpenAI API (AI Chatbot)</h2>
                <p className="text-sm text-gray-500">API สำหรับระบบตอบแชทอัตโนมัติ</p>
              </div>
            </div>
            <span className={`px-3 py-1 text-xs rounded-full font-medium ${settings?.aiApiKeyPreview ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {settings?.aiApiKeyPreview ? '✓ ตั้งค่าแล้ว' : '✗ ยังไม่ได้ตั้งค่า'}
            </span>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {settings?.aiApiKeyPreview && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <label className="text-xs text-gray-500">API Key ปัจจุบัน</label>
                  <p className="text-gray-800 font-mono text-sm">{settings.aiApiKeyPreview}</p>
                </div>
              )}
              <div className="p-3 bg-blue-50 rounded-lg">
                <label className="text-xs text-blue-600">AI Model</label>
                <p className="text-blue-800 font-medium">{settings?.aiModel || 'gpt-3.5-turbo'}</p>
              </div>
            </div>
            <div>
              <label className="label">API Key ใหม่</label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                className="input"
                placeholder="กรอก OpenAI API Key (sk-...)"
              />
              <p className="text-xs text-gray-500 mt-1">
                ขอ API Key ได้ที่{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  platform.openai.com
                </a>
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveAiApi} className="btn btn-primary">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                บันทึก
              </button>
              <button onClick={handleTestAiApi} disabled={testingAi} className="btn btn-secondary">
                {testingAi ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังทดสอบ...
                  </span>
                ) : 'ทดสอบการเชื่อมต่อ'}
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
