'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { autoSlipApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import {
  Key,
  LogIn,
  Mail,
  Lock,
  Clock,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Building2,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Settings,
  CheckCircle,
  XCircle,
  Copy,
  Smartphone,
  Zap,
} from 'lucide-react';

interface BankAccount {
  _id: string;
  bankType: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  status: string;
  balance?: number;
  hasKeys: boolean;
  monitoringEnabled: boolean;
  checkInterval: number;
  lastMessageFetch?: string;
  errorCount: number;
  createdAt: string;
  pinCode?: string;
  pinExpiresAt?: string;
}

interface Transaction {
  _id: string;
  type: 'deposit' | 'withdraw' | 'transfer';
  amount: number;
  balance?: number;
  counterparty?: string;
  reference?: string;
  messageDate: string;
  createdAt: string;
}

const BANK_OPTIONS = [
  { value: 'SCB', label: 'ธนาคารไทยพาณิชย์ (SCB)', code: '014', color: '#4E2A84' },
  { value: 'KBANK', label: 'ธนาคารกสิกรไทย (KBANK)', code: '004', color: '#138F2D' },
  { value: 'GSB', label: 'ธนาคารออมสิน (GSB)', code: '030', color: '#E91E8C' },
  { value: 'BBL', label: 'ธนาคารกรุงเทพ (BBL)', code: '002', color: '#1E3A8A' },
  { value: 'KTB', label: 'ธนาคารกรุงไทย (KTB)', code: '006', color: '#00A9E0' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; description: string }> = {
  DISABLED: { label: 'ปิดการใช้งาน', color: 'bg-gray-500', icon: XCircle, description: 'บัญชีถูกปิดใช้งาน' },
  INIT: { label: 'เริ่มต้น', color: 'bg-blue-500', icon: Settings, description: 'กรุณาตั้งค่าและล็อกอิน' },
  LOGIN_REQUIRED: { label: 'ต้องล็อกอิน', color: 'bg-yellow-500', icon: LogIn, description: 'กดปุ่มล็อกอินเพื่อเริ่มต้น' },
  LOGGING_IN: { label: 'กำลังล็อกอิน', color: 'bg-indigo-500', icon: Loader2, description: 'รอระบบล็อกอิน...' },
  AWAITING_PIN: { label: 'รอยืนยัน PIN', color: 'bg-purple-500', icon: Smartphone, description: 'กรุณายืนยัน PIN บนมือถือ' },
  LOGGED_IN: { label: 'ล็อกอินแล้ว', color: 'bg-cyan-500', icon: CheckCircle, description: 'กำลังดึง Keys...' },
  KEYS_READY: { label: 'พร้อมใช้งาน', color: 'bg-teal-500', icon: Key, description: 'มี Keys พร้อมทำงาน' },
  ACTIVE: { label: 'กำลังทำงาน', color: 'bg-emerald-500', icon: Zap, description: 'ระบบกำลังดึงข้อมูลอัตโนมัติ' },
  ERROR_SOFT: { label: 'มีปัญหา', color: 'bg-orange-500', icon: AlertTriangle, description: 'เกิดข้อผิดพลาด กรุณาลองใหม่' },
  ERROR_FATAL: { label: 'ข้อผิดพลาด', color: 'bg-rose-500', icon: XCircle, description: 'ต้องรีเซ็ตและล็อกอินใหม่' },
};

const BANK_COLORS: Record<string, string> = {
  SCB: '#4E2A84',
  KBANK: '#138F2D',
  GSB: '#E91E8C',
  BBL: '#1E3A8A',
  KTB: '#00A9E0',
};

export default function AutoSlipPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Wizard modal - ขั้นตอนที่ 1: เลือกธนาคาร, 2: กรอกข้อมูล, 3: ล็อกอิน
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newAccountId, setNewAccountId] = useState<string | null>(null);
  const [wizardForm, setWizardForm] = useState({
    bankType: '',
    accountNumber: '',
    accountName: '',
    lineEmail: '',
    linePassword: '',
  });

  // Login status polling
  const [loginStatus, setLoginStatus] = useState<{
    status: string;
    pinCode?: string;
    message?: string;
  } | null>(null);
  const [isPollingLogin, setIsPollingLogin] = useState(false);

  // Delete confirm
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ checkInterval: 5 });

  // Manual keys modal
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [keysForm, setKeysForm] = useState({ xLineAccess: '', xHmac: '', chatMid: '' });
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await autoSlipApi.getMyAccounts();
      if (response.data.success) {
        setAccounts(response.data.accounts || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchAccounts, 15000);
    return () => clearInterval(interval);
  }, [fetchAccounts]);

  // Reset wizard
  const resetWizard = () => {
    setShowWizard(false);
    setWizardStep(1);
    setWizardForm({
      bankType: '',
      accountNumber: '',
      accountName: '',
      lineEmail: '',
      linePassword: '',
    });
    setNewAccountId(null);
    setLoginStatus(null);
    setIsPollingLogin(false);
  };

  // Step 1: Select Bank
  const handleSelectBank = (bankType: string) => {
    setWizardForm({ ...wizardForm, bankType });
    setWizardStep(2);
  };

  // Step 2: Create account and go to login
  const handleCreateAndLogin = async () => {
    if (!wizardForm.accountNumber || !wizardForm.accountName) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    setIsProcessing(true);
    try {
      const bank = BANK_OPTIONS.find((b) => b.value === wizardForm.bankType);
      const res = await autoSlipApi.createAccount({
        bankType: wizardForm.bankType,
        bankCode: bank?.code || '',
        accountNumber: wizardForm.accountNumber,
        accountName: wizardForm.accountName,
        lineEmail: wizardForm.lineEmail || undefined,
        linePassword: wizardForm.linePassword || undefined,
      });

      if (res.data.success && res.data.account) {
        setNewAccountId(res.data.account._id);
        toast.success('เพิ่มบัญชีสำเร็จ');
        setWizardStep(3);
        await fetchAccounts();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถเพิ่มบัญชีได้');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 3: Trigger login
  const handleTriggerLogin = async () => {
    const accountId = newAccountId || selectedAccount?._id;
    if (!accountId) return;

    if (!wizardForm.lineEmail || !wizardForm.linePassword) {
      toast.error('กรุณากรอก Email และ Password');
      return;
    }

    setIsProcessing(true);
    setIsPollingLogin(true);
    try {
      const res = await autoSlipApi.triggerLogin(accountId, wizardForm.lineEmail, wizardForm.linePassword);
      if (res.data.success) {
        setLoginStatus({
          status: res.data.status || 'LOGGING_IN',
          pinCode: res.data.pinCode,
          message: res.data.message,
        });

        if (res.data.pinCode) {
          toast.success('ได้รับ PIN แล้ว กรุณายืนยันบนมือถือ');
        } else {
          toast.success('เริ่มล็อกอินแล้ว รอสักครู่...');
        }

        // Start polling for status updates
        pollLoginStatus(accountId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถล็อกอินได้');
      setIsPollingLogin(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // Poll login status
  const pollLoginStatus = async (accountId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setIsPollingLogin(false);
        toast.error('หมดเวลารอ กรุณาลองใหม่');
        return;
      }

      try {
        const res = await autoSlipApi.getStatus(accountId);
        if (res.data) {
          setLoginStatus({
            status: res.data.status,
            pinCode: res.data.pinCode,
            message: res.data.message,
          });

          if (['ACTIVE', 'KEYS_READY', 'LOGGED_IN'].includes(res.data.status)) {
            setIsPollingLogin(false);
            toast.success('ล็อกอินสำเร็จ!');
            await fetchAccounts();
            return;
          }

          if (['ERROR_SOFT', 'ERROR_FATAL'].includes(res.data.status)) {
            setIsPollingLogin(false);
            toast.error('เกิดข้อผิดพลาด: ' + (res.data.message || 'กรุณาลองใหม่'));
            return;
          }
        }
      } catch (err) {
        // Continue polling
      }

      attempts++;
      setTimeout(poll, 5000);
    };

    poll();
  };

  // Quick login for existing account
  const handleQuickLogin = (account: BankAccount) => {
    setSelectedAccount(account);
    setWizardForm({
      ...wizardForm,
      lineEmail: '',
      linePassword: '',
    });
    setLoginStatus(null);
    setShowWizard(true);
    setWizardStep(3);
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    try {
      await autoSlipApi.deleteAccount(accountToDelete._id);
      toast.success('ลบบัญชีสำเร็จ');
      setShowDeleteModal(false);
      setAccountToDelete(null);
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถลบบัญชีได้');
    } finally {
      setIsDeleting(false);
    }
  };

  // Save manual keys
  const handleSaveKeys = async () => {
    if (!selectedAccount) return;
    if (!keysForm.xLineAccess || !keysForm.xHmac) {
      toast.error('กรุณากรอก X-Line-Access และ X-Hmac');
      return;
    }
    setIsSavingKeys(true);
    try {
      await autoSlipApi.setKeys(selectedAccount._id, {
        xLineAccess: keysForm.xLineAccess,
        xHmac: keysForm.xHmac,
        chatMid: keysForm.chatMid || undefined,
      });
      toast.success('บันทึก Keys สำเร็จ');
      setShowKeysModal(false);
      setKeysForm({ xLineAccess: '', xHmac: '', chatMid: '' });
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถบันทึก Keys ได้');
    } finally {
      setIsSavingKeys(false);
    }
  };

  // Fetch transactions
  const fetchTransactions = async (accountId: string) => {
    setLoadingTransactions(true);
    try {
      const res = await autoSlipApi.getTransactions(accountId, { limit: 50 });
      if (res.data.success) {
        setTransactions(res.data.transactions || []);
      }
    } catch (err: any) {
      // Silent fail
    } finally {
      setLoadingTransactions(false);
    }
  };

  const openAccountDetails = (account: BankAccount) => {
    setSelectedAccount(account);
    setSettingsForm({ checkInterval: account.checkInterval / 60000 });
    fetchTransactions(account._id);
  };

  // Copy PIN to clipboard
  const copyPIN = (pin: string) => {
    navigator.clipboard.writeText(pin);
    toast.success('คัดลอก PIN แล้ว');
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading />
      </DashboardLayout>
    );
  }

  const selectedBankOption = BANK_OPTIONS.find((b) => b.value === wizardForm.bankType);

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10">
        {/* Header */}
        <div className="page-header relative z-10 flex-col md:flex-row items-start md:items-center">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">ระบบอัตโนมัติ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              <span className="text-[#06C755]">Auto-Slip</span> ธนาคาร
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              เชื่อมต่อบัญชีธนาคารเพื่อดึงรายการธุรกรรมอัตโนมัติ
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              size="lg"
              variant="primary"
              onClick={() => {
                resetWizard();
                setShowWizard(true);
              }}
              className="h-11 sm:h-12 px-6 rounded-full font-semibold text-sm shadow-lg shadow-[#06C755]/20 w-full md:w-auto"
            >
              <Plus className="w-5 h-5 mr-2" />
              เพิ่มบัญชีธนาคาร
            </Button>
          </div>
        </div>

        {/* Account List */}
        {accounts.length === 0 ? (
          <Card className="p-12 border border-white/5 bg-black/40 backdrop-blur-3xl rounded-[2.5rem] text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Building2 className="w-12 h-12 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">ยังไม่มีบัญชีธนาคาร</h3>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              เพิ่มบัญชีธนาคารเพื่อให้ระบบดึงรายการธุรกรรมโดยอัตโนมัติผ่าน LINE Notify ของธนาคาร
            </p>
            <Button
              size="lg"
              variant="primary"
              onClick={() => {
                resetWizard();
                setShowWizard(true);
              }}
              className="h-12 px-8 rounded-full font-semibold"
            >
              <Plus className="w-5 h-5 mr-2" />
              เริ่มต้นเพิ่มบัญชี
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {accounts.map((account) => {
              const statusConfig = STATUS_CONFIG[account.status] || STATUS_CONFIG.INIT;
              const StatusIcon = statusConfig.icon;
              const needsLogin = ['INIT', 'LOGIN_REQUIRED', 'ERROR_SOFT', 'ERROR_FATAL'].includes(account.status);

              return (
                <Card
                  key={account._id}
                  className="group relative overflow-hidden transition-all duration-500 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/5 bg-white/[0.01] rounded-[2rem]"
                  padding="none"
                >
                  {/* Bank Color Accent */}
                  <div
                    className="absolute top-0 left-0 w-2 h-full rounded-l-[2rem]"
                    style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                  />

                  {/* Main Content */}
                  <div className="p-6 pl-8">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                        >
                          {account.bankType.slice(0, 2)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">{account.bankType}</h3>
                          <p className="text-xs text-slate-400 font-mono">{account.accountNumber}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {account.balance !== undefined && (
                          <p className="text-xl font-bold text-emerald-400">
                            ฿{account.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 mb-4">{account.accountName}</p>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-xs font-semibold', statusConfig.color)}>
                        <StatusIcon className={cn('w-4 h-4', account.status === 'LOGGING_IN' && 'animate-spin')} />
                        {statusConfig.label}
                      </div>
                      {account.hasKeys && (
                        <Badge variant="success" size="sm">
                          <Key className="w-3 h-3 mr-1" />
                          มี Keys
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mb-4">{statusConfig.description}</p>

                    {/* PIN Display */}
                    {account.pinCode && (
                      <div className="mb-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                        <p className="text-xs text-purple-400 mb-2">รหัส PIN สำหรับยืนยันบนมือถือ:</p>
                        <div className="flex items-center justify-between">
                          <span className="text-3xl font-mono font-bold text-white tracking-widest">
                            {account.pinCode}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyPIN(account.pinCode!)}
                            className="text-purple-400 hover:text-purple-300"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      {needsLogin ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleQuickLogin(account)}
                          className="flex-1 h-10 rounded-xl font-semibold"
                        >
                          <LogIn className="w-4 h-4 mr-2" />
                          ล็อกอิน LINE
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAccountDetails(account)}
                          className="flex-1 h-10 rounded-xl font-semibold text-slate-400 hover:text-white border border-white/10"
                        >
                          ดูรายละเอียด
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedAccount(account);
                          setShowKeysModal(true);
                        }}
                        className="h-10 px-4 rounded-xl text-slate-400 hover:text-cyan-400 border border-white/10"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAccountToDelete(account);
                          setShowDeleteModal(true);
                        }}
                        className="h-10 px-4 rounded-xl text-slate-400 hover:text-rose-400 border border-white/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Account Details Panel */}
        {selectedAccount && !showWizard && !showKeysModal && (
          <Card className="mt-8 p-6 border border-white/5 bg-black/40 backdrop-blur-3xl rounded-[2rem]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: BANK_COLORS[selectedAccount.bankType] || '#666' }}
                >
                  {selectedAccount.bankType.slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedAccount.accountName}</h3>
                  <p className="text-sm text-slate-400 font-mono">{selectedAccount.accountNumber}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedAccount(null)} className="text-slate-400 hover:text-white">
                ปิด
              </Button>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-white/[0.02] rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">สถานะ</p>
                <p className="text-sm font-semibold text-white">{STATUS_CONFIG[selectedAccount.status]?.label}</p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">ตรวจสอบทุก</p>
                <p className="text-sm font-semibold text-white">{selectedAccount.checkInterval / 60000} นาที</p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">อัปเดตล่าสุด</p>
                <p className="text-sm font-semibold text-white">
                  {selectedAccount.lastMessageFetch
                    ? new Date(selectedAccount.lastMessageFetch).toLocaleString('th-TH')
                    : '-'}
                </p>
              </div>
              <div className="p-4 bg-white/[0.02] rounded-2xl">
                <p className="text-xs text-slate-500 mb-1">ยอดคงเหลือ</p>
                <p className="text-sm font-semibold text-emerald-400">
                  {selectedAccount.balance !== undefined
                    ? `฿${selectedAccount.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                    : '-'}
                </p>
              </div>
            </div>

            {/* Transactions */}
            <div>
              <h4 className="text-sm font-semibold text-slate-300 mb-4">รายการธุรกรรมล่าสุด</h4>
              {loadingTransactions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">ยังไม่มีรายการธุรกรรม</div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {transactions.map((tx) => (
                    <div key={tx._id} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            tx.type === 'deposit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          )}
                        >
                          {tx.type === 'deposit' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {tx.type === 'deposit' ? 'เงินเข้า' : tx.type === 'withdraw' ? 'เงินออก' : 'โอน'}
                          </p>
                          <p className="text-xs text-slate-500">{new Date(tx.messageDate).toLocaleString('th-TH')}</p>
                        </div>
                      </div>
                      <p className={cn('text-lg font-bold', tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400')}>
                        {tx.type === 'deposit' ? '+' : '-'}฿{tx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Wizard Modal */}
      <Modal isOpen={showWizard} onClose={resetWizard} title="" size="lg">
        <div className="p-4">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all',
                    wizardStep >= step ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
                  )}
                >
                  {step}
                </div>
                {step < 3 && <div className={cn('w-12 h-1 mx-2 rounded-full', wizardStep > step ? 'bg-emerald-500' : 'bg-slate-700')} />}
              </div>
            ))}
          </div>

          {/* Step 1: Select Bank */}
          {wizardStep === 1 && (
            <div className="animate-fade">
              <h2 className="text-xl font-bold text-center text-white mb-2">เลือกธนาคาร</h2>
              <p className="text-center text-slate-400 mb-8">เลือกธนาคารที่ต้องการเชื่อมต่อ</p>
              <div className="grid grid-cols-2 gap-4">
                {BANK_OPTIONS.map((bank) => (
                  <button
                    key={bank.value}
                    onClick={() => handleSelectBank(bank.value)}
                    className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all text-left group"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg mb-4"
                      style={{ backgroundColor: bank.color }}
                    >
                      {bank.value.slice(0, 2)}
                    </div>
                    <h3 className="text-white font-semibold group-hover:text-emerald-400 transition-colors">{bank.value}</h3>
                    <p className="text-xs text-slate-500 mt-1">{bank.label.split('(')[0].trim()}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Account Info */}
          {wizardStep === 2 && (
            <div className="animate-fade">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: selectedBankOption?.color }}
                >
                  {wizardForm.bankType.slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{wizardForm.bankType}</h2>
                  <p className="text-sm text-slate-400">กรอกข้อมูลบัญชี</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="เลขบัญชี"
                  value={wizardForm.accountNumber}
                  onChange={(e) => setWizardForm({ ...wizardForm, accountNumber: e.target.value })}
                  placeholder="xxx-x-xxxxx-x"
                  className="h-14 rounded-2xl"
                  leftIcon={<CreditCard className="w-5 h-5 text-slate-400" />}
                  required
                />
                <Input
                  label="ชื่อบัญชี"
                  value={wizardForm.accountName}
                  onChange={(e) => setWizardForm({ ...wizardForm, accountName: e.target.value })}
                  placeholder="ชื่อ-นามสกุล ตามบัญชีธนาคาร"
                  className="h-14 rounded-2xl"
                  required
                />

                <div className="border-t border-white/10 pt-4 mt-6">
                  <p className="text-sm text-slate-300 mb-4 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    ข้อมูล LINE สำหรับล็อกอิน
                  </p>
                  <Input
                    label="LINE Email"
                    type="email"
                    value={wizardForm.lineEmail}
                    onChange={(e) => setWizardForm({ ...wizardForm, lineEmail: e.target.value })}
                    placeholder="email@example.com"
                    className="h-14 rounded-2xl"
                  />
                  <div className="relative">
                    <Input
                      label="LINE Password"
                      type={showPassword ? 'text' : 'password'}
                      value={wizardForm.linePassword}
                      onChange={(e) => setWizardForm({ ...wizardForm, linePassword: e.target.value })}
                      placeholder="รหัสผ่าน LINE"
                      className="h-14 rounded-2xl pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-[38px] text-slate-400 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <Button variant="ghost" className="flex-1 h-12 rounded-2xl" onClick={() => setWizardStep(1)}>
                  ย้อนกลับ
                </Button>
                <Button className="flex-[2] h-12 rounded-2xl" onClick={handleCreateAndLogin} isLoading={isProcessing}>
                  สร้างบัญชีและล็อกอิน
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Login */}
          {wizardStep === 3 && (
            <div className="animate-fade">
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <LogIn className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">ล็อกอิน LINE</h2>
                <p className="text-slate-400">กรอกข้อมูล LINE เพื่อดึง Keys อัตโนมัติ</p>
              </div>

              {/* Login Status */}
              {loginStatus && (
                <div
                  className={cn(
                    'mb-6 p-4 rounded-2xl border',
                    loginStatus.status === 'AWAITING_PIN'
                      ? 'bg-purple-500/10 border-purple-500/20'
                      : loginStatus.status === 'LOGGING_IN'
                      ? 'bg-blue-500/10 border-blue-500/20'
                      : ['ACTIVE', 'KEYS_READY', 'LOGGED_IN'].includes(loginStatus.status)
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-orange-500/10 border-orange-500/20'
                  )}
                >
                  <p className="text-sm text-center mb-2">{STATUS_CONFIG[loginStatus.status]?.description || loginStatus.message}</p>
                  {loginStatus.pinCode && (
                    <div className="text-center">
                      <p className="text-xs text-purple-400 mb-2">รหัส PIN:</p>
                      <div className="flex items-center justify-center gap-4">
                        <span className="text-4xl font-mono font-bold text-white tracking-[0.5em]">{loginStatus.pinCode}</span>
                        <Button variant="ghost" size="sm" onClick={() => copyPIN(loginStatus.pinCode!)} className="text-purple-400">
                          <Copy className="w-5 h-5" />
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">เปิด LINE บนมือถือและยืนยัน PIN นี้</p>
                    </div>
                  )}
                </div>
              )}

              {!loginStatus && (
                <div className="space-y-4">
                  <Input
                    label="LINE Email"
                    type="email"
                    value={wizardForm.lineEmail}
                    onChange={(e) => setWizardForm({ ...wizardForm, lineEmail: e.target.value })}
                    placeholder="email@example.com"
                    className="h-14 rounded-2xl"
                    leftIcon={<Mail className="w-5 h-5 text-slate-400" />}
                  />
                  <div className="relative">
                    <Input
                      label="LINE Password"
                      type={showPassword ? 'text' : 'password'}
                      value={wizardForm.linePassword}
                      onChange={(e) => setWizardForm({ ...wizardForm, linePassword: e.target.value })}
                      placeholder="รหัสผ่าน LINE"
                      className="h-14 rounded-2xl pr-12"
                      leftIcon={<Lock className="w-5 h-5 text-slate-400" />}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-[38px] text-slate-400 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-4 mt-8">
                <Button variant="ghost" className="flex-1 h-12 rounded-2xl" onClick={resetWizard} disabled={isPollingLogin}>
                  {isPollingLogin ? 'รอสักครู่...' : 'ปิด'}
                </Button>
                {!isPollingLogin && (
                  <Button className="flex-[2] h-12 rounded-2xl" onClick={handleTriggerLogin} isLoading={isProcessing}>
                    <LogIn className="w-4 h-4 mr-2" />
                    เริ่มล็อกอิน
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="ยืนยันการลบ" size="sm">
        <div className="p-4 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
            <Trash2 className="w-8 h-8 text-rose-400" />
          </div>
          <p className="text-slate-300 mb-2">ต้องการลบบัญชี</p>
          <p className="text-white font-semibold mb-6">{accountToDelete?.accountNumber}</p>
          <div className="flex gap-4">
            <Button variant="ghost" className="flex-1 h-12 rounded-2xl" onClick={() => setShowDeleteModal(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-2xl border-rose-500/20 text-rose-400 hover:bg-rose-500/10"
              onClick={handleDeleteAccount}
              isLoading={isDeleting}
            >
              ลบบัญชี
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manual Keys Modal */}
      <Modal isOpen={showKeysModal} onClose={() => setShowKeysModal(false)} title="ใส่ Keys ด้วยตัวเอง" size="md">
        <div className="p-4 space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <p className="text-sm text-blue-400">ใส่ Keys ที่ได้จาก Chrome DevTools หรือ Network Inspector</p>
          </div>
          <Input
            label="X-Line-Access"
            value={keysForm.xLineAccess}
            onChange={(e) => setKeysForm({ ...keysForm, xLineAccess: e.target.value })}
            placeholder="eyJ..."
            className="h-14 rounded-2xl font-mono text-sm"
          />
          <Input
            label="X-Hmac"
            value={keysForm.xHmac}
            onChange={(e) => setKeysForm({ ...keysForm, xHmac: e.target.value })}
            placeholder="abc123..."
            className="h-14 rounded-2xl font-mono text-sm"
          />
          <Input
            label="Chat MID (ไม่บังคับ)"
            value={keysForm.chatMid}
            onChange={(e) => setKeysForm({ ...keysForm, chatMid: e.target.value })}
            placeholder="u12345..."
            className="h-14 rounded-2xl font-mono text-sm"
          />
          <div className="flex gap-4 pt-4">
            <Button variant="ghost" className="flex-1 h-12 rounded-2xl" onClick={() => setShowKeysModal(false)}>
              ยกเลิก
            </Button>
            <Button className="flex-[2] h-12 rounded-2xl" onClick={handleSaveKeys} isLoading={isSavingKeys}>
              <Key className="w-4 h-4 mr-2" />
              บันทึก Keys
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
