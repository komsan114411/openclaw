'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, lineSessionUserApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Key,
  LogIn,
  Mail,
  Lock,
  Copy,
  Clock,
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Building2,
  Eye,
  EyeOff,
  Smartphone,
} from 'lucide-react';

interface LineAccount {
  _id: string;
  accountName: string;
  channelId: string;
  isActive: boolean;
}

interface Bank {
  bankCode: string;
  bankNameTh: string;
  bankNameEn: string;
  bankImg?: string;
  reLoginAtMins?: number;
}

interface SessionStatus {
  hasKeys: boolean;
  xLineAccess?: string;
  xHmac?: string;
  chatMid?: string;
  bankCode?: string;
  bankName?: string;
  status?: string;
  lastCheckedAt?: string;
  lastCheckResult?: string;
  extractedAt?: string;
  source?: string;
}

interface LoginStatus {
  success: boolean;
  status?: string;
  pin?: string;
  message?: string;
  stage?: string;
  error?: string;
}

interface CredentialsStatus {
  hasCredentials: boolean;
  email?: string;
  bankCode?: string;
  bankName?: string;
}

export default function LineSessionPage() {
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<LineAccount | null>(null);

  // Setup form
  const [setupForm, setSetupForm] = useState({
    email: '',
    password: '',
    bankCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Session/Login status
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);
  const [credentialsStatus, setCredentialsStatus] = useState<CredentialsStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Keys modal
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [fullKeys, setFullKeys] = useState<Record<string, unknown> | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Fetch accounts and banks
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsRes, banksRes] = await Promise.all([
        lineAccountsApi.getMyAccounts(),
        lineSessionUserApi.getBanks(),
      ]);

      setAccounts(accountsRes.data.accounts || []);
      setBanks(banksRes.data.banks || []);
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch session status for selected account
  const fetchSessionStatus = useCallback(async (accountId: string) => {
    try {
      const [sessionRes, credRes] = await Promise.all([
        lineSessionUserApi.getSession(accountId),
        lineSessionUserApi.getCredentialsStatus(accountId),
      ]);

      setSessionStatus(sessionRes.data.session);
      setCredentialsStatus(credRes.data);
    } catch {
      setSessionStatus(null);
      setCredentialsStatus(null);
    }
  }, []);

  // When account is selected
  useEffect(() => {
    if (selectedAccount) {
      fetchSessionStatus(selectedAccount._id);
      setLoginStatus(null);
      setSetupForm({ email: '', password: '', bankCode: '' });
    }
  }, [selectedAccount, fetchSessionStatus]);

  // Poll login status
  const pollLoginStatus = useCallback(async (accountId: string) => {
    try {
      const res = await lineSessionUserApi.getEnhancedLoginStatus(accountId);
      const status = res.data;
      setLoginStatus(status);

      // If still in progress, continue polling
      if (status.status === 'waiting_for_pin' || status.status === 'extracting_keys' || status.status === 'starting') {
        return true; // Continue polling
      }

      // If completed, refresh session status
      if (status.status === 'completed' || status.status === 'success') {
        await fetchSessionStatus(accountId);
        toast.success('ดึง Keys สำเร็จ');
      } else if (status.status === 'failed' || status.status === 'error') {
        toast.error(status.error || status.message || 'เกิดข้อผิดพลาด');
      }

      return false; // Stop polling
    } catch {
      return false;
    }
  }, [fetchSessionStatus]);

  // Start polling effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling && selectedAccount) {
      intervalId = setInterval(async () => {
        const shouldContinue = await pollLoginStatus(selectedAccount._id);
        if (!shouldContinue) {
          setIsPolling(false);
        }
      }, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPolling, selectedAccount, pollLoginStatus]);

  // Handle setup and login
  const handleSetup = async () => {
    if (!selectedAccount) return;

    if (!setupForm.email || !setupForm.password || !setupForm.bankCode) {
      toast.error('กรุณากรอกข้อมูลให้ครบ');
      return;
    }

    setIsSettingUp(true);
    try {
      const res = await lineSessionUserApi.setupSession(selectedAccount._id, {
        email: setupForm.email,
        password: setupForm.password,
        bankCode: setupForm.bankCode,
      });

      if (res.data.success) {
        setLoginStatus(res.data);
        setIsPolling(true);
        toast.success('เริ่มกระบวนการ Login แล้ว');
      } else {
        toast.error(res.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSettingUp(false);
    }
  };

  // Cancel login
  const handleCancelLogin = async () => {
    if (!selectedAccount) return;

    try {
      await lineSessionUserApi.cancelEnhancedLogin(selectedAccount._id);
      setLoginStatus(null);
      setIsPolling(false);
      toast.success('ยกเลิกแล้ว');
    } catch {
      toast.error('ไม่สามารถยกเลิกได้');
    }
  };

  // Re-login (use saved credentials)
  const handleRelogin = async () => {
    if (!selectedAccount) return;

    setIsSettingUp(true);
    try {
      const res = await lineSessionUserApi.startEnhancedLogin(selectedAccount._id, undefined, undefined, 'relogin');

      if (res.data.success !== false) {
        setLoginStatus(res.data);
        setIsPolling(true);
        toast.success('เริ่มกระบวนการ Re-login แล้ว');
      } else {
        toast.error(res.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSettingUp(false);
    }
  };

  // View full keys
  const handleViewKeys = async () => {
    if (!selectedAccount) return;

    setIsLoadingKeys(true);
    try {
      const res = await lineSessionUserApi.getFullKeys(selectedAccount._id);
      if (res.data.success) {
        setFullKeys(res.data.keys);
        setShowKeysModal(true);
      } else {
        toast.error(res.data.message || 'ไม่พบ Keys');
      }
    } catch {
      toast.error('ไม่สามารถโหลด Keys ได้');
    } finally {
      setIsLoadingKeys(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`คัดลอก ${label} แล้ว`);
  };

  // Get status display
  const getStatusDisplay = (status?: string) => {
    switch (status) {
      case 'active':
        return { color: 'success' as const, text: 'ใช้งานได้', icon: CheckCircle2 };
      case 'expired':
        return { color: 'error' as const, text: 'หมดอายุ', icon: XCircle };
      case 'pending':
        return { color: 'warning' as const, text: 'รอดึง Keys', icon: Clock };
      default:
        return { color: 'default' as const, text: 'ไม่ทราบ', icon: AlertTriangle };
    }
  };

  // Get login status display
  const getLoginStatusDisplay = (status?: string) => {
    switch (status) {
      case 'starting':
        return { text: 'กำลังเริ่ม...', color: 'text-blue-500' };
      case 'waiting_for_pin':
        return { text: 'รอยืนยัน PIN', color: 'text-amber-500' };
      case 'extracting_keys':
        return { text: 'กำลังดึง Keys...', color: 'text-emerald-500' };
      case 'completed':
      case 'success':
        return { text: 'สำเร็จ', color: 'text-emerald-500' };
      case 'failed':
      case 'error':
        return { text: 'ล้มเหลว', color: 'text-red-500' };
      default:
        return { text: status || 'ไม่ทราบ', color: 'text-slate-500' };
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white">
                <Key className="w-6 h-6" />
              </div>
              ดึง LINE Keys
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              ดึง Keys อัตโนมัติจากบัญชี LINE ของคุณ
            </p>
          </div>
        </div>

        {accounts.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<Key className="w-12 h-12" />}
              title="ยังไม่มีบัญชี LINE"
              description="กรุณาเพิ่มบัญชี LINE ก่อนใช้งานฟีเจอร์นี้"
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Account Selection */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-500" />
                เลือกบัญชี LINE
              </h2>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <button
                    key={account._id}
                    onClick={() => setSelectedAccount(account)}
                    className={`w-full p-3 rounded-xl text-left transition-all ${
                      selectedAccount?._id === account._id
                        ? 'bg-emerald-500/10 border-2 border-emerald-500'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="font-medium text-slate-900 dark:text-white">
                      {account.accountName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {account.channelId}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Setup & Status */}
            <Card className="lg:col-span-2 p-6">
              {!selectedAccount ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Key className="w-16 h-16 mb-4 opacity-30" />
                  <p>เลือกบัญชี LINE เพื่อเริ่มต้น</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Account Info */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {selectedAccount.accountName}
                      </h3>
                      <p className="text-sm text-slate-500">{selectedAccount.channelId}</p>
                    </div>
                    {sessionStatus?.status && (
                      <Badge variant={getStatusDisplay(sessionStatus.status).color}>
                        {getStatusDisplay(sessionStatus.status).text}
                      </Badge>
                    )}
                  </div>

                  {/* Current Keys Status */}
                  {sessionStatus?.hasKeys && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <div>
                            <p className="font-medium text-emerald-800 dark:text-emerald-200">
                              มี Keys แล้ว
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              ธนาคาร: {sessionStatus.bankName || '-'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleViewKeys}
                          disabled={isLoadingKeys}
                          className="gap-2"
                        >
                          {isLoadingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                          ดู Keys
                        </Button>
                      </div>
                      {sessionStatus.extractedAt && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                          ดึงเมื่อ: {new Date(sessionStatus.extractedAt).toLocaleString('th-TH')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Login Status (when in progress) */}
                  {loginStatus && (loginStatus.status === 'waiting_for_pin' || loginStatus.status === 'extracting_keys' || loginStatus.status === 'starting') && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-3 mb-3">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        <p className={`font-medium ${getLoginStatusDisplay(loginStatus.status).color}`}>
                          {getLoginStatusDisplay(loginStatus.status).text}
                        </p>
                      </div>

                      {loginStatus.pin && (
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Smartphone className="w-5 h-5 text-emerald-500" />
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              ยืนยัน PIN บนมือถือ
                            </p>
                          </div>
                          <p className="text-4xl font-bold tracking-[0.5em] text-emerald-600 dark:text-emerald-400">
                            {loginStatus.pin}
                          </p>
                        </div>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelLogin}
                        className="mt-3 text-red-500 hover:text-red-600"
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  )}

                  {/* Setup Form */}
                  {(!loginStatus || loginStatus.status === 'completed' || loginStatus.status === 'success' || loginStatus.status === 'failed' || loginStatus.status === 'error') && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        {credentialsStatus?.hasCredentials ? 'Login ใหม่' : 'ตั้งค่า Login'}
                      </h4>

                      {credentialsStatus?.hasCredentials && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                          <p className="text-blue-700 dark:text-blue-300">
                            มีข้อมูล Login บันทึกไว้แล้ว: {credentialsStatus.email}
                          </p>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleRelogin}
                            disabled={isSettingUp}
                            className="mt-2 gap-2"
                          >
                            {isSettingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Re-login ด้วยข้อมูลเดิม
                          </Button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            <Mail className="w-4 h-4 inline mr-1" />
                            Email LINE
                          </label>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            value={setupForm.email}
                            onChange={(e) => setSetupForm(prev => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            <Lock className="w-4 h-4 inline mr-1" />
                            Password LINE
                          </label>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="********"
                              value={setupForm.password}
                              onChange={(e) => setSetupForm(prev => ({ ...prev, password: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          <Building2 className="w-4 h-4 inline mr-1" />
                          ธนาคาร
                        </label>
                        <Select
                          value={setupForm.bankCode}
                          onChange={(e) => setSetupForm(prev => ({ ...prev, bankCode: e.target.value }))}
                        >
                          <option value="">-- เลือกธนาคาร --</option>
                          {banks.map((bank) => (
                            <option key={bank.bankCode} value={bank.bankCode}>
                              {bank.bankNameTh}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <Button
                        variant="primary"
                        onClick={handleSetup}
                        disabled={isSettingUp || !setupForm.email || !setupForm.password || !setupForm.bankCode}
                        className="w-full gap-2"
                      >
                        {isSettingUp ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            กำลังดำเนินการ...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            เริ่มดึง Keys
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <h4 className="font-medium text-slate-900 dark:text-white mb-2">
                      วิธีใช้งาน
                    </h4>
                    <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
                      <li>กรอก Email และ Password ของ LINE</li>
                      <li>เลือกธนาคารที่ต้องการใช้</li>
                      <li>กดปุ่ม "เริ่มดึง Keys"</li>
                      <li>ยืนยัน PIN ที่แสดงบนหน้าจอในแอป LINE มือถือ</li>
                      <li>ระบบจะดึง Keys อัตโนมัติเมื่อยืนยันสำเร็จ</li>
                    </ol>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Keys Modal */}
      <Modal
        isOpen={showKeysModal}
        onClose={() => setShowKeysModal(false)}
        title="LINE Keys"
        size="lg"
      >
        {fullKeys && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                xLineAccess
              </label>
              <div className="flex gap-2">
                <Input
                  value={(fullKeys.xLineAccess as string) || ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(fullKeys.xLineAccess as string, 'xLineAccess')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                xHmac
              </label>
              <div className="flex gap-2">
                <Input
                  value={(fullKeys.xHmac as string) || ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(fullKeys.xHmac as string, 'xHmac')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {fullKeys.chatMid ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Chat MID
                </label>
                <div className="flex gap-2">
                  <Input
                    value={String(fullKeys.chatMid) || ''}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(String(fullKeys.chatMid), 'chatMid')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="pt-4 border-t">
              <p className="text-xs text-slate-500">
                สถานะ: {String(fullKeys.status || '-')}<br />
                ดึงเมื่อ: {fullKeys.extractedAt ? new Date(String(fullKeys.extractedAt)).toLocaleString('th-TH') : '-'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
