'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { useAutoSlipSocket } from '@/hooks/useAutoSlipSocket';
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
  Terminal,
  Check,
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
  id: string;
  type: 'deposit' | 'withdraw' | 'transfer';
  amount: number;
  balance?: number;
  counterparty?: string;
  rawMessage?: string;
  messageDate: string;
  isProcessed?: boolean;
}

interface LoginStatusData {
  status: string;
  pinCode?: string;
  pinExpiresAt?: string;
  pinRemainingSeconds?: number;
  hasKeys: boolean;
  hasCUrl: boolean;
  cUrlBash?: string;
  xLineAccess?: string;
  xHmac?: string;
  chatMid?: string;
  message?: string;
  loginProgress: string;
  canTriggerLogin: boolean;
}

// Only GSB (ออมสิน) is supported for auto-slip extraction
const BANK_OPTIONS = [
  { value: 'GSB', label: 'ธนาคารออมสิน (GSB)', code: '030', color: '#E91E8C' },
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

// Login progress steps for real-time display
const LOGIN_STEPS = [
  { key: 'initializing', label: 'กำลังเริ่มต้น...', icon: Settings },
  { key: 'launching_browser', label: 'กำลังเปิดเบราว์เซอร์...', icon: Loader2 },
  { key: 'loading_extension', label: 'กำลังโหลด LINE Extension...', icon: Loader2 },
  { key: 'entering_credentials', label: 'กำลังกรอกข้อมูล...', icon: Mail },
  { key: 'waiting_pin', label: 'รอรหัส PIN...', icon: Smartphone },
  { key: 'pin_displayed', label: 'กรุณายืนยัน PIN บนมือถือ', icon: Smartphone },
  { key: 'verifying', label: 'กำลังตรวจสอบ...', icon: Loader2 },
  { key: 'extracting_keys', label: 'กำลังดึง Keys...', icon: Key },
  { key: 'success', label: 'ล็อกอินสำเร็จ!', icon: CheckCircle },
];

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

  // Login status - enhanced with real-time updates
  const [loginStatus, setLoginStatus] = useState<LoginStatusData | null>(null);
  const [isPollingLogin, setIsPollingLogin] = useState(false);
  const [pinCountdown, setPinCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

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

  // cURL modal
  const [showCurlModal, setShowCurlModal] = useState(false);
  const [curlData, setCurlData] = useState<{ cUrlBash?: string; xLineAccess?: string; xHmac?: string; chatMid?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  // Get current account ID for WebSocket
  const currentAccountId = newAccountId || selectedAccount?._id;

  // WebSocket hook for real-time updates
  const {
    isConnected: wsConnected,
    pinCode: wsPinCode,
    pinRemainingSeconds: wsPinRemaining,
    loginStatus: wsLoginStatus,
    hasKeys: wsHasKeys,
  } = useAutoSlipSocket({
    bankAccountId: currentAccountId,
    showToasts: false, // We handle toasts ourselves
    onPinRequired: (event) => {
      console.log('[AutoSlip] PIN required via WebSocket:', event);
      const remainingSeconds = Math.floor((new Date(event.expiresAt).getTime() - Date.now()) / 1000);
      setLoginStatus(prev => ({
        ...prev!,
        status: 'AWAITING_PIN',
        pinCode: event.pinCode,
        pinRemainingSeconds: remainingSeconds,
        loginProgress: 'pin_displayed',
        hasKeys: false,
        canTriggerLogin: false,
      }));
      setPinCountdown(remainingSeconds);
      toast.success(`รหัส PIN: ${event.pinCode}`, { duration: 60000, icon: '🔑' });
      // Refresh accounts to show PIN on card
      fetchAccounts();
    },
    onPinCleared: (event) => {
      console.log('[AutoSlip] PIN cleared via WebSocket:', event);
      // Clear PIN from local state immediately
      setLoginStatus(prev => prev ? ({
        ...prev,
        pinCode: undefined,
        pinRemainingSeconds: 0,
        loginProgress: event.reason === 'success' ? 'extracting_keys' : 'failed',
      }) : null);
      setPinCountdown(0);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      if (event.reason === 'success') {
        toast.success('ยืนยัน PIN สำเร็จ! กำลังดึง Keys...', { icon: '✅' });
      } else if (event.reason === 'timeout') {
        toast.error('PIN หมดอายุ กรุณาลองใหม่', { icon: '⏰' });
      }
      // Refresh accounts to clear PIN from card
      fetchAccounts();
    },
    onKeysExtracted: (event) => {
      console.log('[AutoSlip] Keys extracted via WebSocket:', event);
      // Update status to show keys ready
      setLoginStatus(prev => prev ? ({
        ...prev,
        status: 'KEYS_READY',
        pinCode: undefined,
        pinRemainingSeconds: 0,
        hasKeys: true,
        loginProgress: 'success',
      }) : null);
      setPinCountdown(0);
      toast.success('ดึง Keys สำเร็จ!', { icon: '🔑' });
      // Refresh accounts to show "มี Keys" badge
      fetchAccounts();
    },
    onLoginComplete: async (event) => {
      console.log('[AutoSlip] Login complete via WebSocket:', event);
      toast.success('ล็อกอินสำเร็จ! Keys พร้อมใช้งาน', { icon: '✅', duration: 5000 });
      setIsPollingLogin(false);
      setPinCountdown(0);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      // Don't reset wizard immediately - let user see the success state
      setLoginStatus(prev => prev ? ({
        ...prev,
        status: 'KEYS_READY',
        pinCode: undefined,
        pinRemainingSeconds: 0,
        hasKeys: true,
        loginProgress: 'success',
        canTriggerLogin: true,
      }) : null);
      await fetchAccounts();
      // Auto close wizard after 2 seconds
      setTimeout(() => {
        resetWizard();
      }, 2000);
    },
    onStatusChanged: (event) => {
      console.log('[AutoSlip] Status changed via WebSocket:', event);
      // Update login status
      setLoginStatus(prev => {
        if (!prev) return null;
        const update: Partial<LoginStatusData> = {
          status: event.newStatus,
        };
        // Clear PIN if status changed to non-PIN states
        if (['KEYS_READY', 'ACTIVE', 'LOGGED_IN', 'ERROR_SOFT', 'ERROR_FATAL'].includes(event.newStatus)) {
          update.pinCode = undefined;
          update.pinRemainingSeconds = 0;
        }
        // Update login progress based on status
        if (event.newStatus === 'LOGGING_IN') {
          update.loginProgress = 'logging_in';
        } else if (event.newStatus === 'AWAITING_PIN') {
          update.loginProgress = 'waiting_pin';
        } else if (event.newStatus === 'KEYS_READY' || event.newStatus === 'ACTIVE') {
          update.loginProgress = 'success';
          update.hasKeys = true;
        } else if (event.newStatus === 'ERROR_SOFT' || event.newStatus === 'ERROR_FATAL') {
          update.loginProgress = 'failed';
        }
        return { ...prev, ...update };
      });
      // Clear countdown if needed
      if (['KEYS_READY', 'ACTIVE', 'LOGGED_IN', 'ERROR_SOFT', 'ERROR_FATAL'].includes(event.newStatus)) {
        setPinCountdown(0);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }
      // Refresh accounts to show new status
      fetchAccounts();
    },
    onError: (event) => {
      console.log('[AutoSlip] Error via WebSocket:', event);
      toast.error(event.error || 'เกิดข้อผิดพลาด', { icon: '❌' });
      setIsPollingLogin(false);
      // Clear PIN and update status
      setLoginStatus(prev => prev ? ({
        ...prev,
        status: 'ERROR_SOFT',
        pinCode: undefined,
        pinRemainingSeconds: 0,
        loginProgress: 'failed',
        canTriggerLogin: true,
      }) : null);
      setPinCountdown(0);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      // Refresh accounts to show error status
      fetchAccounts();
    },
  });

  // Countdown timer for PIN
  useEffect(() => {
    if (loginStatus?.pinRemainingSeconds && loginStatus.pinRemainingSeconds > 0) {
      setPinCountdown(loginStatus.pinRemainingSeconds);
      
      countdownRef.current = setInterval(() => {
        setPinCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
    }
  }, [loginStatus?.pinRemainingSeconds]);

  // Update countdown from WebSocket
  useEffect(() => {
    if (wsPinRemaining && wsPinRemaining > 0) {
      setPinCountdown(wsPinRemaining);
    }
  }, [wsPinRemaining]);

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
    setPinCountdown(0);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
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
    setLoginStatus({
      status: 'LOGGING_IN',
      hasKeys: false,
      hasCUrl: false,
      message: 'กำลังเริ่มล็อกอิน...',
      loginProgress: 'logging_in',
      canTriggerLogin: false,
    });

    try {
      const res = await autoSlipApi.triggerLogin(accountId, wizardForm.lineEmail, wizardForm.linePassword);
      if (res.data.success) {
        // Check if existing keys are valid (no need to login)
        if (res.data.status === 'keys_valid') {
          toast.success('Keys ยังใช้งานได้! ไม่ต้อง Login ใหม่', { icon: '✅', duration: 5000 });
          setLoginStatus({
            status: 'KEYS_READY',
            hasKeys: true,
            hasCUrl: false,
            message: res.data.message,
            loginProgress: 'success',
            canTriggerLogin: true,
          });
          setIsPollingLogin(false);
          await fetchAccounts();
          // Auto close wizard after 2 seconds
          setTimeout(() => {
            resetWizard();
          }, 2000);
          return;
        }

        setLoginStatus({
          status: res.data.status || 'LOGGING_IN',
          pinCode: res.data.pinCode,
          pinRemainingSeconds: res.data.pinRemainingSeconds,
          hasKeys: res.data.hasKeys || false,
          hasCUrl: res.data.hasCUrl || false,
          message: res.data.message,
          loginProgress: res.data.loginProgress || 'logging_in',
          canTriggerLogin: false,
        });

        if (res.data.pinCode) {
          toast.success('ได้รับ PIN แล้ว กรุณายืนยันบนมือถือ', { icon: '🔑' });
          setPinCountdown(res.data.pinRemainingSeconds || 180);
        } else {
          toast.success('เริ่มล็อกอินแล้ว รอสักครู่...');
        }

        // Start polling for status updates
        pollLoginStatus(accountId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถล็อกอินได้');
      setIsPollingLogin(false);
      setLoginStatus(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Poll login status with enhanced data
  const pollLoginStatus = async (accountId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    let lastPinCode: string | undefined = undefined;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setIsPollingLogin(false);
        setLoginStatus(prev => prev ? ({
          ...prev,
          pinCode: undefined,
          pinRemainingSeconds: 0,
          loginProgress: 'failed',
        }) : null);
        setPinCountdown(0);
        toast.error('หมดเวลารอ กรุณาลองใหม่');
        return;
      }

      try {
        const res = await autoSlipApi.getLoginStatus(accountId);
        if (res.data) {
          const data = res.data as LoginStatusData;

          // Update login status with enhanced progress tracking
          setLoginStatus(prev => ({
            ...data,
            loginProgress: data.pinCode ? 'pin_displayed' :
              data.hasKeys ? 'success' :
              data.status === 'LOGGING_IN' ? 'logging_in' :
              data.status === 'AWAITING_PIN' ? 'waiting_pin' :
              prev?.loginProgress || 'logging_in',
          }));

          // Update countdown if PIN is present
          if (data.pinRemainingSeconds && data.pinRemainingSeconds > 0) {
            setPinCountdown(data.pinRemainingSeconds);
          }

          // Detect PIN change for notification
          if (data.pinCode && data.pinCode !== lastPinCode) {
            lastPinCode = data.pinCode;
            toast.success(`รหัส PIN: ${data.pinCode}`, { duration: 60000, icon: '🔑' });
          }

          // Check for success conditions: has keys or status is active/ready
          if (data.hasKeys || ['ACTIVE', 'KEYS_READY', 'LOGGED_IN'].includes(data.status)) {
            setIsPollingLogin(false);
            setPinCountdown(0);
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            toast.success('ล็อกอินสำเร็จ! ดึง Keys เรียบร้อย', { icon: '✅' });

            // Show cURL modal if available
            if (data.hasCUrl && data.cUrlBash) {
              setCurlData({
                cUrlBash: data.cUrlBash,
                xLineAccess: data.xLineAccess,
                xHmac: data.xHmac,
                chatMid: data.chatMid,
              });
              setShowCurlModal(true);
            }

            // Update status to show success before closing wizard
            setLoginStatus(prev => ({
              ...data,
              pinCode: undefined,
              pinRemainingSeconds: 0,
              loginProgress: 'success',
            }));

            await fetchAccounts();
            // Auto close wizard after 2 seconds
            setTimeout(() => {
              resetWizard();
            }, 2000);
            return;
          }

          // Check for error conditions
          if (['ERROR_SOFT', 'ERROR_FATAL', 'LOGIN_REQUIRED'].includes(data.status)) {
            // Only stop if not waiting for PIN
            if (!data.pinCode) {
              setIsPollingLogin(false);
              setPinCountdown(0);
              setLoginStatus(prev => ({
                ...data,
                pinCode: undefined,
                pinRemainingSeconds: 0,
                loginProgress: 'failed',
              }));
              toast.error('เกิดข้อผิดพลาด: ' + (data.message || 'กรุณาลองใหม่'));
              return;
            }
          }
        }
      } catch (err) {
        // Continue polling on error
      }

      attempts++;
      setTimeout(poll, 2000); // Poll every 2 seconds for faster updates
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

  // Fetch transactions (messages from backend)
  const fetchTransactions = async (accountId: string) => {
    setLoadingTransactions(true);
    try {
      const res = await autoSlipApi.getTransactions(accountId, { limit: 50 });
      if (res.data.success) {
        // Backend returns 'messages' field
        setTransactions(res.data.messages || []);
      }
    } catch (err: any) {
      // Silent fail
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Open account details and fetch cURL
  const openAccountDetails = async (account: BankAccount) => {
    setSelectedAccount(account);
    setSettingsForm({ checkInterval: account.checkInterval / 60000 });
    fetchTransactions(account._id);
    
    // Fetch login status to get cURL
    try {
      const res = await autoSlipApi.getLoginStatus(account._id);
      if (res.data && res.data.hasCUrl) {
        setCurlData({
          cUrlBash: res.data.cUrlBash,
          xLineAccess: res.data.xLineAccess,
          xHmac: res.data.xHmac,
          chatMid: res.data.chatMid,
        });
      }
    } catch (err) {
      // Silent fail
    }
  };

  // Copy to clipboard with feedback
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`คัดลอก ${field} แล้ว`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error('ไม่สามารถคัดลอกได้');
    }
  };

  // Copy PIN to clipboard
  const copyPIN = (pin: string) => {
    navigator.clipboard.writeText(pin);
    toast.success('คัดลอก PIN แล้ว');
  };

  // Format countdown time
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
              {wsConnected && <span className="ml-2 text-emerald-400">● เชื่อมต่อแล้ว</span>}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts.map((account) => {
              const statusConfig = STATUS_CONFIG[account.status] || STATUS_CONFIG.INIT;
              const StatusIcon = statusConfig.icon;
              const needsLogin = ['INIT', 'LOGIN_REQUIRED', 'ERROR_SOFT', 'ERROR_FATAL'].includes(account.status);

              return (
                <Card
                  key={account._id}
                  className="p-6 border border-white/5 bg-black/40 backdrop-blur-3xl rounded-[2rem] hover:border-white/10 transition-all"
                >
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg"
                          style={{ backgroundColor: BANK_COLORS[account.bankType] || '#666' }}
                        >
                          {account.bankType.slice(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-bold text-white">{account.accountName}</h3>
                          <p className="text-sm text-slate-400 font-mono">{account.accountNumber}</p>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={cn('text-white text-xs', statusConfig.color)}>
                        <StatusIcon className={cn('w-3 h-3 mr-1', account.status === 'LOGGING_IN' && 'animate-spin')} />
                        {statusConfig.label}
                      </Badge>
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
                    <div className="flex flex-wrap gap-2 mt-auto">
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
              <div className="flex items-center gap-2">
                {curlData?.cUrlBash && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCurlModal(true)}
                    className="text-cyan-400 hover:text-cyan-300 border border-cyan-500/20"
                  >
                    <Terminal className="w-4 h-4 mr-2" />
                    cURL
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectedAccount(null)} className="text-slate-400 hover:text-white">
                  ปิด
                </Button>
              </div>
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
                    <div key={tx.id} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
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

          {/* Step 1: Select Bank (Auto-select GSB since only one option) */}
          {wizardStep === 1 && (
            <div className="animate-fade">
              <h2 className="text-xl font-bold text-center text-white mb-2">ธนาคารที่รองรับ</h2>
              <p className="text-center text-slate-400 mb-8">ระบบ Auto-Slip รองรับเฉพาะธนาคารออมสิน (GSB)</p>
              <div className="flex justify-center">
                {BANK_OPTIONS.map((bank) => (
                  <button
                    key={bank.value}
                    onClick={() => handleSelectBank(bank.value)}
                    className="p-8 rounded-2xl border-2 border-[#E91E8C]/50 hover:border-[#E91E8C] bg-[#E91E8C]/10 hover:bg-[#E91E8C]/20 transition-all text-center max-w-[280px]"
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold mx-auto mb-4"
                      style={{ backgroundColor: bank.color }}
                    >
                      <Building2 className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-white text-lg">{bank.value}</p>
                    <p className="text-sm text-slate-400 mt-1">{bank.label.split('(')[0].trim()}</p>
                    <p className="text-xs text-emerald-400 mt-3 flex items-center justify-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      คลิกเพื่อเริ่มต้น
                    </p>
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
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl"
                  style={{ backgroundColor: selectedBankOption?.color }}
                >
                  {wizardForm.bankType.slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedBankOption?.label.split('(')[0].trim()}</h2>
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
                  required
                />
                <Input
                  label="ชื่อบัญชี"
                  value={wizardForm.accountName}
                  onChange={(e) => setWizardForm({ ...wizardForm, accountName: e.target.value })}
                  placeholder="ชื่อ-นามสกุล"
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

          {/* Step 3: Login with Real-time Status */}
          {wizardStep === 3 && (
            <div className="animate-fade">
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <LogIn className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">ล็อกอิน LINE</h2>
                <p className="text-slate-400">กรอกข้อมูล LINE เพื่อดึง Keys อัตโนมัติ</p>
              </div>

              {/* Login Status with Real-time Updates */}
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
                  {/* Status Message */}
                  <div className="flex items-center justify-center gap-2 mb-3">
                    {loginStatus.status === 'LOGGING_IN' && <Loader2 className="w-5 h-5 animate-spin text-blue-400" />}
                    {loginStatus.status === 'AWAITING_PIN' && <Smartphone className="w-5 h-5 text-purple-400" />}
                    {['ACTIVE', 'KEYS_READY', 'LOGGED_IN'].includes(loginStatus.status) && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                    <p className="text-sm font-medium">
                      {STATUS_CONFIG[loginStatus.status]?.description || loginStatus.message}
                    </p>
                  </div>

                  {/* PIN Display with Countdown */}
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
                      
                      {/* Countdown Timer */}
                      {pinCountdown > 0 && (
                        <div className="mt-3 flex items-center justify-center gap-2">
                          <Clock className="w-4 h-4 text-purple-400" />
                          <span className={cn(
                            'text-sm font-mono',
                            pinCountdown < 60 ? 'text-rose-400' : 'text-purple-400'
                          )}>
                            หมดอายุใน {formatCountdown(pinCountdown)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Progress Indicator */}
                  {isPollingLogin && !loginStatus.pinCode && (
                    <div className="mt-4">
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                      <p className="text-xs text-slate-500 text-center mt-2">กำลังดำเนินการ...</p>
                    </div>
                  )}
                </div>
              )}

              {/* Login Form */}
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

      {/* cURL Modal */}
      <Modal isOpen={showCurlModal} onClose={() => setShowCurlModal(false)} title="คัดลอก cURL (Bash)" size="lg">
        <div className="p-4 space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              ดึง Keys สำเร็จ! คุณสามารถคัดลอก cURL command ด้านล่างได้
            </p>
          </div>

          {/* cURL Command */}
          {curlData?.cUrlBash && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">cURL (Bash)</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(curlData.cUrlBash!, 'cURL')}
                  className={cn(
                    'text-xs',
                    copiedField === 'cURL' ? 'text-emerald-400' : 'text-cyan-400 hover:text-cyan-300'
                  )}
                >
                  {copiedField === 'cURL' ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      คัดลอกแล้ว
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      คัดลอก
                    </>
                  )}
                </Button>
              </div>
              <div className="bg-slate-900 border border-white/10 rounded-xl p-4 max-h-60 overflow-auto">
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
                  {curlData.cUrlBash}
                </pre>
              </div>
            </div>
          )}

          {/* Individual Keys */}
          <div className="grid grid-cols-1 gap-4">
            {curlData?.xLineAccess && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300">X-Line-Access</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(curlData.xLineAccess!, 'X-Line-Access')}
                    className={cn(
                      'text-xs',
                      copiedField === 'X-Line-Access' ? 'text-emerald-400' : 'text-cyan-400 hover:text-cyan-300'
                    )}
                  >
                    {copiedField === 'X-Line-Access' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="bg-slate-800 border border-cyan-500/20 rounded-xl p-3 overflow-x-auto">
                  <p className="text-sm text-cyan-300 font-mono break-all">{curlData.xLineAccess}</p>
                </div>
              </div>
            )}

            {curlData?.xHmac && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300">X-Hmac</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(curlData.xHmac!, 'X-Hmac')}
                    className={cn(
                      'text-xs',
                      copiedField === 'X-Hmac' ? 'text-emerald-400' : 'text-cyan-400 hover:text-cyan-300'
                    )}
                  >
                    {copiedField === 'X-Hmac' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="bg-slate-800 border border-cyan-500/20 rounded-xl p-3 overflow-x-auto">
                  <p className="text-sm text-cyan-300 font-mono break-all">{curlData.xHmac}</p>
                </div>
              </div>
            )}

            {curlData?.chatMid && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300">Chat MID</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(curlData.chatMid!, 'Chat MID')}
                    className={cn(
                      'text-xs',
                      copiedField === 'Chat MID' ? 'text-emerald-400' : 'text-cyan-400 hover:text-cyan-300'
                    )}
                  >
                    {copiedField === 'Chat MID' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="bg-slate-800 border border-cyan-500/20 rounded-xl p-3 overflow-x-auto">
                  <p className="text-sm text-cyan-300 font-mono break-all">{curlData.chatMid}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="ghost" className="h-12 px-6 rounded-2xl" onClick={() => setShowCurlModal(false)}>
              ปิด
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
