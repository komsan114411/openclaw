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
  CheckCircle2,
  XCircle,
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
  { value: 'SCB', label: 'ธนาคารไทยพาณิชย์ (SCB)', code: '014' },
  { value: 'KBANK', label: 'ธนาคารกสิกรไทย (KBANK)', code: '004' },
  { value: 'GSB', label: 'ธนาคารออมสิน (GSB)', code: '030' },
  { value: 'BBL', label: 'ธนาคารกรุงเทพ (BBL)', code: '002' },
  { value: 'KTB', label: 'ธนาคารกรุงไทย (KTB)', code: '006' },
];

const STATUS_LABELS: Record<string, string> = {
  DISABLED: 'ปิดการใช้งาน',
  INIT: 'เริ่มต้น',
  LOGIN_REQUIRED: 'ต้องล็อกอิน',
  LOGGING_IN: 'กำลังล็อกอิน',
  AWAITING_PIN: 'รอ PIN',
  LOGGED_IN: 'ล็อกอินแล้ว',
  KEYS_READY: 'พร้อมใช้งาน',
  ACTIVE: 'กำลังทำงาน',
  ERROR_SOFT: 'ข้อผิดพลาดชั่วคราว',
  ERROR_FATAL: 'ข้อผิดพลาดร้ายแรง',
};

const STATUS_COLORS: Record<string, string> = {
  DISABLED: 'bg-gray-500',
  INIT: 'bg-blue-500',
  LOGIN_REQUIRED: 'bg-yellow-500',
  LOGGING_IN: 'bg-indigo-500',
  AWAITING_PIN: 'bg-purple-500',
  LOGGED_IN: 'bg-cyan-500',
  KEYS_READY: 'bg-teal-500',
  ACTIVE: 'bg-emerald-500',
  ERROR_SOFT: 'bg-orange-500',
  ERROR_FATAL: 'bg-rose-500',
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

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    bankType: '',
    accountNumber: '',
    accountName: '',
    lineEmail: '',
    linePassword: '',
  });

  // Delete confirm
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Login modal
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Keys modal
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [keysForm, setKeysForm] = useState({
    xLineAccess: '',
    xHmac: '',
    chatMid: '',
  });
  const [isSavingKeys, setIsSavingKeys] = useState(false);

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
  }, [fetchAccounts]);

  const handleCreateAccount = async () => {
    if (!createForm.bankType || !createForm.accountNumber || !createForm.accountName) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    setIsCreating(true);
    try {
      const bank = BANK_OPTIONS.find((b) => b.value === createForm.bankType);
      await autoSlipApi.createAccount({
        bankType: createForm.bankType,
        bankCode: bank?.code || '',
        accountNumber: createForm.accountNumber,
        accountName: createForm.accountName,
        lineEmail: createForm.lineEmail || undefined,
        linePassword: createForm.linePassword || undefined,
      });
      toast.success('เพิ่มบัญชีสำเร็จ');
      setShowCreateModal(false);
      setCreateForm({
        bankType: '',
        accountNumber: '',
        accountName: '',
        lineEmail: '',
        linePassword: '',
      });
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถเพิ่มบัญชีได้');
    } finally {
      setIsCreating(false);
    }
  };

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

  const handleTriggerLogin = async () => {
    if (!selectedAccount) return;
    setIsLoggingIn(true);
    try {
      const res = await autoSlipApi.triggerLogin(
        selectedAccount._id,
        loginForm.email || undefined,
        loginForm.password || undefined
      );
      if (res.data.success) {
        if (res.data.pinCode) {
          toast.success(`PIN Code: ${res.data.pinCode}`);
        } else {
          toast.success('เริ่มล็อกอินสำเร็จ กรุณารอสักครู่');
        }
      } else {
        toast.error(res.data.message || 'ไม่สามารถเริ่มล็อกอินได้');
      }
      setShowLoginModal(false);
      setLoginForm({ email: '', password: '' });
      await fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถเริ่มล็อกอินได้');
    } finally {
      setIsLoggingIn(false);
    }
  };

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

  const fetchTransactions = async (accountId: string) => {
    setLoadingTransactions(true);
    try {
      const res = await autoSlipApi.getTransactions(accountId, { limit: 50 });
      if (res.data.success) {
        setTransactions(res.data.transactions || []);
      }
    } catch (err: any) {
      toast.error('ไม่สามารถโหลดรายการธุรกรรมได้');
    } finally {
      setLoadingTransactions(false);
    }
  };

  const openAccountDetails = (account: BankAccount) => {
    setSelectedAccount(account);
    fetchTransactions(account._id);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10">
        {/* Header */}
        <div className="page-header relative z-10 flex-col md:flex-row items-start md:items-center">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">การจัดการบัญชี</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              <span className="text-[#06C755]">Auto-Slip</span> ธนาคาร
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              เพิ่มและจัดการบัญชีธนาคารสำหรับดึงรายการอัตโนมัติ
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <Button
              size="lg"
              variant="primary"
              onClick={() => setShowCreateModal(true)}
              className="h-11 sm:h-12 px-5 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20 w-full md:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              เพิ่มบัญชีธนาคาร
            </Button>
          </div>
        </div>

        {/* Account List */}
        {accounts.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="ยังไม่มีบัญชีธนาคาร"
            description="เพิ่มบัญชีธนาคารเพื่อเริ่มดึงรายการธุรกรรมอัตโนมัติ"
            variant="glass"
            className="py-24"
            action={
              <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                เพิ่มบัญชีธนาคาร
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {accounts.map((account) => (
              <Card
                key={account._id}
                className="group relative overflow-hidden transition-all duration-500 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/5 bg-white/[0.01] p-6 rounded-[2rem] cursor-pointer"
                padding="none"
                onClick={() => openAccountDetails(account)}
              >
                {/* Bank Color Accent */}
                <div
                  className="absolute top-0 left-0 w-2 h-full rounded-l-[2rem]"
                  style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                />

                {/* Header */}
                <div className="flex items-start justify-between mb-4 pl-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-5 h-5 text-slate-400" />
                      <span className="text-lg font-black text-white">{account.bankType}</span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold text-white',
                          STATUS_COLORS[account.status] || 'bg-gray-500'
                        )}
                      >
                        {STATUS_LABELS[account.status] || account.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
                      <CreditCard className="w-3 h-3" />
                      {account.accountNumber}
                    </p>
                    <p className="text-sm text-slate-300 mt-1">{account.accountName}</p>
                  </div>
                  <div className="text-right">
                    {account.balance !== undefined && (
                      <p className="text-xl font-bold text-emerald-400">
                        {account.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">THB</p>
                  </div>
                </div>

                {/* Status Indicators */}
                <div className="flex flex-wrap gap-2 mb-4 pl-4">
                  {account.hasKeys ? (
                    <Badge variant="success" size="sm">
                      <Key className="w-3 h-3 mr-1" />
                      มี Keys
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      <Key className="w-3 h-3 mr-1" />
                      ไม่มี Keys
                    </Badge>
                  )}
                  {account.monitoringEnabled ? (
                    <Badge variant="info" size="sm">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      ตรวจสอบอัตโนมัติ
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm">
                      ปิดการตรวจสอบ
                    </Badge>
                  )}
                  {account.errorCount > 0 && (
                    <Badge variant="error" size="sm">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Error: {account.errorCount}
                    </Badge>
                  )}
                </div>

                {/* Info */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 pl-4">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    ตรวจสอบทุก {account.checkInterval / 60000} นาที
                  </span>
                  {account.lastMessageFetch && (
                    <span>
                      อัปเดตล่าสุด: {new Date(account.lastMessageFetch).toLocaleString('th-TH')}
                    </span>
                  )}
                </div>

                {/* Actions (prevent card click) */}
                <div className="grid grid-cols-3 gap-2 mt-4 pl-4" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setSelectedAccount(account);
                      setShowLoginModal(true);
                    }}
                    className="h-9 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-white/5"
                  >
                    <LogIn className="w-3 h-3 mr-1" />
                    ล็อกอิน
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setSelectedAccount(account);
                      setShowKeysModal(true);
                    }}
                    className="h-9 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-white/5"
                  >
                    <Key className="w-3 h-3 mr-1" />
                    ใส่ Keys
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setAccountToDelete(account);
                      setShowDeleteModal(true);
                    }}
                    className="h-9 rounded-xl text-[10px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-white/5"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    ลบ
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Account Details Panel */}
        {selectedAccount && !showLoginModal && !showKeysModal && (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAccount(null)}
                className="text-slate-400 hover:text-white"
              >
                ปิด
              </Button>
            </div>

            {/* Transactions */}
            <div>
              <h4 className="text-sm font-semibold text-slate-300 mb-4">รายการธุรกรรมล่าสุด</h4>
              {loadingTransactions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  ยังไม่มีรายการธุรกรรม
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {transactions.map((tx) => (
                    <div
                      key={tx._id}
                      className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            tx.type === 'deposit'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          )}
                        >
                          {tx.type === 'deposit' ? (
                            <TrendingUp className="w-5 h-5" />
                          ) : (
                            <TrendingDown className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {tx.type === 'deposit' ? 'เงินเข้า' : tx.type === 'withdraw' ? 'เงินออก' : 'โอน'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(tx.messageDate).toLocaleString('th-TH')}
                          </p>
                          {tx.counterparty && (
                            <p className="text-xs text-slate-400">{tx.counterparty}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            'text-lg font-bold',
                            tx.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {tx.type === 'deposit' ? '+' : '-'}
                          {tx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </p>
                        {tx.balance !== undefined && (
                          <p className="text-xs text-slate-500">
                            คงเหลือ: {tx.balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Create Account Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="เพิ่มบัญชีธนาคาร"
        size="md"
      >
        <div className="space-y-6 p-2">
          <Select
            label="ธนาคาร"
            value={createForm.bankType}
            onChange={(e) => setCreateForm({ ...createForm, bankType: e.target.value })}
            options={[
              { value: '', label: 'เลือกธนาคาร' },
              ...BANK_OPTIONS.map((b) => ({ value: b.value, label: b.label })),
            ]}
            className="h-14 rounded-2xl"
            required
          />
          <Input
            label="เลขบัญชี"
            value={createForm.accountNumber}
            onChange={(e) => setCreateForm({ ...createForm, accountNumber: e.target.value })}
            placeholder="xxx-x-xxxxx-x"
            className="h-14 rounded-2xl"
            required
          />
          <Input
            label="ชื่อบัญชี"
            value={createForm.accountName}
            onChange={(e) => setCreateForm({ ...createForm, accountName: e.target.value })}
            placeholder="ชื่อ-นามสกุล"
            className="h-14 rounded-2xl"
            required
          />

          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-slate-400 mb-4">
              ข้อมูล LINE (ไม่บังคับ - สามารถใส่ภายหลังได้)
            </p>
            <Input
              label="LINE Email"
              type="email"
              value={createForm.lineEmail}
              onChange={(e) => setCreateForm({ ...createForm, lineEmail: e.target.value })}
              placeholder="email@example.com"
              className="h-14 rounded-2xl"
            />
            <Input
              label="LINE Password"
              type="password"
              value={createForm.linePassword}
              onChange={(e) => setCreateForm({ ...createForm, linePassword: e.target.value })}
              placeholder="รหัสผ่าน LINE"
              className="h-14 rounded-2xl"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              variant="ghost"
              className="flex-1 h-12 rounded-2xl"
              onClick={() => setShowCreateModal(false)}
              disabled={isCreating}
            >
              ยกเลิก
            </Button>
            <Button
              className="flex-[2] h-12 rounded-2xl"
              onClick={handleCreateAccount}
              isLoading={isCreating}
            >
              เพิ่มบัญชี
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="ยืนยันการลบบัญชี"
        size="sm"
      >
        <div className="space-y-6 p-2">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
              <Trash2 className="w-8 h-8 text-rose-400" />
            </div>
            <p className="text-slate-300">
              คุณต้องการลบบัญชี <strong>{accountToDelete?.accountNumber}</strong> ใช่หรือไม่?
            </p>
            <p className="text-sm text-slate-500 mt-2">
              รายการธุรกรรมทั้งหมดจะถูกลบไปด้วย
            </p>
          </div>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              className="flex-1 h-12 rounded-2xl"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
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

      {/* Login Modal */}
      <Modal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setLoginForm({ email: '', password: '' });
        }}
        title={`ล็อกอิน LINE - ${selectedAccount?.bankType}`}
        size="md"
      >
        <div className="space-y-6 p-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <p className="text-sm text-amber-400">
              ระบบจะทำการล็อกอินและดึง Keys อัตโนมัติ กรุณารอจนกว่า PIN จะแสดงขึ้นมา
            </p>
          </div>

          <Input
            label="LINE Email"
            type="email"
            value={loginForm.email}
            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
            placeholder="email@example.com"
            className="h-14 rounded-2xl"
            leftIcon={<Mail className="w-5 h-5 text-slate-400" />}
          />

          <div className="relative">
            <Input
              label="LINE Password"
              type={showPassword ? 'text' : 'password'}
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
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

          <div className="flex gap-4 pt-4">
            <Button
              variant="ghost"
              className="flex-1 h-12 rounded-2xl"
              onClick={() => {
                setShowLoginModal(false);
                setLoginForm({ email: '', password: '' });
              }}
              disabled={isLoggingIn}
            >
              ยกเลิก
            </Button>
            <Button
              className="flex-[2] h-12 rounded-2xl"
              onClick={handleTriggerLogin}
              isLoading={isLoggingIn}
            >
              <LogIn className="w-4 h-4 mr-2" />
              เริ่มล็อกอิน
            </Button>
          </div>
        </div>
      </Modal>

      {/* Keys Modal */}
      <Modal
        isOpen={showKeysModal}
        onClose={() => {
          setShowKeysModal(false);
          setKeysForm({ xLineAccess: '', xHmac: '', chatMid: '' });
        }}
        title={`ใส่ Keys - ${selectedAccount?.bankType}`}
        size="md"
      >
        <div className="space-y-6 p-2">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <p className="text-sm text-blue-400">
              ใส่ Keys ที่ได้จากการดักจับ Network Request จาก LINE Chrome Extension
            </p>
          </div>

          <Input
            label="X-Line-Access"
            value={keysForm.xLineAccess}
            onChange={(e) => setKeysForm({ ...keysForm, xLineAccess: e.target.value })}
            placeholder="eyJ..."
            className="h-14 rounded-2xl font-mono text-sm"
            required
          />

          <Input
            label="X-Hmac"
            value={keysForm.xHmac}
            onChange={(e) => setKeysForm({ ...keysForm, xHmac: e.target.value })}
            placeholder="abc123..."
            className="h-14 rounded-2xl font-mono text-sm"
            required
          />

          <Input
            label="Chat MID (ไม่บังคับ)"
            value={keysForm.chatMid}
            onChange={(e) => setKeysForm({ ...keysForm, chatMid: e.target.value })}
            placeholder="u12345..."
            className="h-14 rounded-2xl font-mono text-sm"
          />

          <div className="flex gap-4 pt-4">
            <Button
              variant="ghost"
              className="flex-1 h-12 rounded-2xl"
              onClick={() => {
                setShowKeysModal(false);
                setKeysForm({ xLineAccess: '', xHmac: '', chatMid: '' });
              }}
              disabled={isSavingKeys}
            >
              ยกเลิก
            </Button>
            <Button
              className="flex-[2] h-12 rounded-2xl"
              onClick={handleSaveKeys}
              isLoading={isSavingKeys}
            >
              <Key className="w-4 h-4 mr-2" />
              บันทึก Keys
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
