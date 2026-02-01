'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, usersApi, systemSettingsApi, lineSessionApi } from '@/lib/api';
import { useLoginNotifications } from '@/hooks';
import { LineAccount, User } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { Input, Select, Textarea, Switch } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  Bot,
  FileCheck,
  MessageSquare,
  Activity,
  CreditCard,
  Search,
  Plus,
  Settings,
  Edit,
  Trash2,
  Copy,
  User as UserIcon,
  Shield,
  Smartphone,
  ExternalLink,
  Power,
  Eye,
  MoreVertical,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2,
  Key,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Terminal,
  History,
  LogIn,
  Mail,
  Lock,
  Zap,
  Building2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Download
} from 'lucide-react';

interface ExtendedLineAccount extends LineAccount {
  // owner property is now inherited from LineAccount
}

// Connection status type
type ConnectionStatusType = 'connected' | 'disconnected' | 'checking' | 'unknown';

interface ConnectionStatusInfo {
  status: ConnectionStatusType;
  lastChecked?: Date;
  errorMessage?: string;
  botName?: string;
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
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('');
  const [isCheckingAll, setIsCheckingAll] = useState(false);

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatusInfo>>({});

  // LINE Session state
  const [sessionData, setSessionData] = useState<{
    session: any | null;
    health: any | null;
    history: any[];
    isLoading: boolean;
  }>({
    session: null,
    health: null,
    history: [],
    isLoading: false,
  });
  const [sessionKeyForm, setSessionKeyForm] = useState({
    xLineAccess: '',
    xHmac: '',
    userAgent: '',
    lineVersion: '',
    curlCommand: '',
    extractedFrom: 'manual',
  });
  const [sessionTab, setSessionTab] = useState<'login' | 'keys' | 'curl' | 'history' | 'bank'>('login');

  // Auto Login state (Enhanced)
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  });
  const [loginStatus, setLoginStatus] = useState<{
    status: string;
    pinCode?: string;
    error?: string;
    isLoading: boolean;
    requestId?: string;
    chatMid?: string;
    sessionReused?: boolean;
    cooldownRemainingMs?: number;
    workerState?: string;
  }>({
    status: 'idle',
    pinCode: undefined,
    error: undefined,
    isLoading: false,
    requestId: undefined,
    chatMid: undefined,
    sessionReused: false,
    cooldownRemainingMs: undefined,
    workerState: undefined,
  });

  // Bank configuration state
  const [bankData, setBankData] = useState<{
    banks: any[];
    currentBank: any | null;
    messages: any[];
    summary: any | null;
    isLoading: boolean;
    isFetching: boolean;
  }>({
    banks: [],
    currentBank: null,
    messages: [],
    summary: null,
    isLoading: false,
    isFetching: false,
  });
  const [bankForm, setBankForm] = useState({
    bankCode: '',
    bankName: '',
    accountNumber: '',
    chatMid: '',
  });

  // WebSocket login notifications
  const loginNotifications = useLoginNotifications({
    lineAccountId: selectedAccount?._id,
    showToasts: false, // We handle toasts manually
    onStatusChange: (event) => {
      // Update login status from WebSocket event
      setLoginStatus(prev => ({
        ...prev,
        status: event.status,
        pinCode: event.pinCode || prev.pinCode,
        error: event.error,
        workerState: event.status,
      }));

      // Handle success/failure
      if (event.status === 'success') {
        setLoginStatus(prev => ({ ...prev, isLoading: false }));
        toast.success('Login successful - Keys captured');
        if (selectedAccount) {
          fetchSessionData(selectedAccount._id);
          fetchBankData(selectedAccount._id);
        }
      } else if (event.status === 'failed') {
        setLoginStatus(prev => ({
          ...prev,
          isLoading: false,
          error: event.error || 'Login failed',
        }));
        toast.error(event.error || 'Login failed');
      } else if (event.status === 'pin_displayed' && event.pinCode) {
        toast.success(`PIN: ${event.pinCode}`, { duration: 60000, icon: '🔑' });
      }
    },
    onLoginEvent: (event) => {
      if (event.type === 'login_completed') {
        toast.success('Login completed - Keys saved');
      } else if (event.type === 'login_failed') {
        toast.error(event.error || 'Login failed');
      }
    },
  });

  // Update login PIN from WebSocket
  useEffect(() => {
    if (loginNotifications.pinCode && loginNotifications.pinCode !== loginStatus.pinCode) {
      setLoginStatus(prev => ({ ...prev, pinCode: loginNotifications.pinCode || undefined }));
    }
  }, [loginNotifications.pinCode, loginStatus.pinCode]);

  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
    ownerId: '',
  });

  const [settingsData, setSettingsData] = useState({
    enableBot: true,
    enableAi: false,
    enableSlipVerification: true,
    aiSystemPrompt: '',
    aiTemperature: 0.7,
    aiFallbackMessage: 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
    aiModel: '' as string,  // AI Model สำหรับบัญชีนี้
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

  // AI Settings from system
  const [globalAiEnabled, setGlobalAiEnabled] = useState<boolean>(true);
  const [allowedAiModels, setAllowedAiModels] = useState<string[]>([]);

  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchPublicBaseUrl = async () => {
    try {
      const res = await systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} }));
      setPublicBaseUrl(res.data.publicBaseUrl || '');
    } catch {
      setPublicBaseUrl('');
    }
  };

  const fetchAiSettings = async () => {
    try {
      const res = await systemSettingsApi.getAiSettings();
      setGlobalAiEnabled(res.data.globalAiEnabled ?? true);
      setAllowedAiModels(res.data.allowedAiModels || ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini']);
    } catch {
      setAllowedAiModels(['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini']);
    }
  };

  const getWebhookUrl = (account: ExtendedLineAccount) => {
    const base = publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '') || '';
    const normalized = base.replace(/\/+$/, '');
    // ใช้ webhookSlug ถ้ามี หรือ fallback ไป channelId
    const slug = account.webhookSlug || account.channelId;
    return `${normalized}/api/webhook/line/${slug}`;
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
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
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPublicBaseUrl();
    fetchAiSettings();
  }, [fetchData]);

  // Check connection for a single account
  const checkSingleConnection = async (accountId: string) => {
    setConnectionStatus(prev => ({
      ...prev,
      [accountId]: { status: 'checking' }
    }));

    try {
      const response = await lineAccountsApi.testConnection(accountId);
      if (response.data.success) {
        setConnectionStatus(prev => ({
          ...prev,
          [accountId]: {
            status: 'connected',
            lastChecked: new Date(),
            botName: response.data.botInfo?.displayName || undefined,
          }
        }));
      } else {
        setConnectionStatus(prev => ({
          ...prev,
          [accountId]: {
            status: 'disconnected',
            lastChecked: new Date(),
            errorMessage: response.data.message || 'การเชื่อมต่อล้มเหลว',
          }
        }));
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setConnectionStatus(prev => ({
        ...prev,
        [accountId]: {
          status: 'disconnected',
          lastChecked: new Date(),
          errorMessage: err.response?.data?.message || 'ไม่สามารถเชื่อมต่อได้',
        }
      }));
    }
  };

  // Check all account connections
  const checkAllConnections = async () => {
    if (accounts.length === 0) return;

    setIsCheckingAll(true);

    const checkingStatus: Record<string, ConnectionStatusInfo> = {};
    accounts.forEach(acc => {
      checkingStatus[acc._id] = { status: 'checking' };
    });
    setConnectionStatus(checkingStatus);

    for (const account of accounts) {
      await checkSingleConnection(account._id);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setIsCheckingAll(false);
    toast.success('ตรวจสอบการเชื่อมต่อเสร็จสิ้น');
  };

  // Auto-check all connections when accounts are loaded
  useEffect(() => {
    if (accounts.length > 0 && !isLoading && Object.keys(connectionStatus).length === 0) {
      const autoCheckConnections = async () => {
        setIsCheckingAll(true);
        const checkingStatus: Record<string, ConnectionStatusInfo> = {};
        accounts.forEach(acc => {
          checkingStatus[acc._id] = { status: 'checking' };
        });
        setConnectionStatus(checkingStatus);

        for (const account of accounts) {
          await checkSingleConnection(account._id);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        setIsCheckingAll(false);
      };
      autoCheckConnections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, isLoading]);

  const handleAddAccount = async () => {
    if (!formData.accountName || !formData.channelId || !formData.channelSecret || !formData.accessToken) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }

    setIsProcessing(true);
    try {
      await lineAccountsApi.create({
        ...formData,
        ownerId: formData.ownerId || undefined,
      });
      toast.success('เพิ่มบัญชีสำเร็จ');
      setShowAddModal(false);
      setFormData({ accountName: '', channelId: '', channelSecret: '', accessToken: '', description: '', ownerId: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถเพิ่มบัญชีได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      await lineAccountsApi.update(selectedAccount._id, formData);
      toast.success('อัปเดตบัญชีสำเร็จ');
      setShowEditModal(false);
      fetchData();
    } catch (error: any) {
      toast.error('ไม่สามารถบันทึกได้');
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
    const boolToString = (val: boolean | null | undefined): string => {
      if (val === null || val === undefined) return 'default';
      return val ? 'true' : 'false';
    };
    setSettingsData({
      enableBot: s.enableBot ?? true,
      enableAi: s.enableAi ?? false,
      enableSlipVerification: s.enableSlipVerification ?? true,
      aiSystemPrompt: s.aiSystemPrompt || '',
      aiTemperature: s.aiTemperature ?? 0.7,
      aiFallbackMessage: s.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
      aiModel: s.aiModel || '',
      slipImmediateMessage: s.slipImmediateMessage || 'กำลังตรวจสอบสลิป กรุณารอสักครู่...',
      customQuotaExceededMessage: s.customQuotaExceededMessage || '',
      customBotDisabledMessage: s.customBotDisabledMessage || '',
      customSlipDisabledMessage: s.customSlipDisabledMessage || '',
      customAiDisabledMessage: s.customAiDisabledMessage || '',
      customDuplicateSlipMessage: s.customDuplicateSlipMessage || '',
      customSlipErrorMessage: s.customSlipErrorMessage || '',
      customSlipSuccessMessage: s.customSlipSuccessMessage || '',
      sendMessageWhenBotDisabled: boolToString(s.sendMessageWhenBotDisabled),
      sendMessageWhenSlipDisabled: boolToString(s.sendMessageWhenSlipDisabled),
      sendMessageWhenAiDisabled: boolToString(s.sendMessageWhenAiDisabled),
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
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
      toast.success('บันทึกการตั้งค่าสำเร็จ');
      setShowSettingsModal(false);
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      await lineAccountsApi.delete(selectedAccount._id);
      toast.success('ลบบัญชีสำเร็จ');
      setShowDeleteConfirm(false);
      setShowDetailModal(false);
      fetchData();
    } catch (error: any) {
      toast.error('ไม่สามารถลบได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleActive = async (account: ExtendedLineAccount) => {
    if (account.isActive && !showDisableConfirm) {
      setSelectedAccount(account);
      setShowDisableConfirm(true);
      return;
    }

    try {
      await lineAccountsApi.update(account._id, { isActive: !account.isActive });
      toast.success(account.isActive ? 'ปิดบัญชีแล้ว' : 'เปิดบัญชีแล้ว');
      setShowDisableConfirm(false);
      fetchData();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const copyWebhookUrl = (account: ExtendedLineAccount) => {
    const webhookUrl = getWebhookUrl(account);
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('คัดลอก Webhook URL แล้ว');
  };

  // LINE Session functions
  const fetchSessionData = async (accountId: string) => {
    setSessionData(prev => ({ ...prev, isLoading: true }));
    try {
      const [sessionRes, healthRes, historyRes] = await Promise.allSettled([
        lineSessionApi.getSession(accountId),
        lineSessionApi.getHealth(accountId),
        lineSessionApi.getHistory(accountId, 10),
      ]);

      setSessionData({
        session: sessionRes.status === 'fulfilled' ? sessionRes.value.data : null,
        health: healthRes.status === 'fulfilled' ? healthRes.value.data : null,
        history: historyRes.status === 'fulfilled' ? historyRes.value.data?.history || [] : [],
        isLoading: false,
      });
    } catch (error) {
      setSessionData(prev => ({ ...prev, isLoading: false }));
      toast.error('ไม่สามารถโหลดข้อมูล Session ได้');
    }
  };

  // Fetch bank data
  const fetchBankData = async (accountId: string) => {
    setBankData(prev => ({ ...prev, isLoading: true }));
    try {
      const [banksRes, currentBankRes, messagesRes, summaryRes] = await Promise.allSettled([
        lineSessionApi.getBanks(),
        lineSessionApi.getBank(accountId),
        lineSessionApi.getMessages(accountId, { limit: 20 }),
        lineSessionApi.getTransactionSummary(accountId),
      ]);

      const banks = banksRes.status === 'fulfilled' ? banksRes.value.data?.banks || [] : [];
      const currentBank = currentBankRes.status === 'fulfilled' ? currentBankRes.value.data : null;
      const messages = messagesRes.status === 'fulfilled' ? messagesRes.value.data?.messages || [] : [];
      const summary = summaryRes.status === 'fulfilled' ? summaryRes.value.data : null;

      setBankData({
        banks,
        currentBank,
        messages,
        summary,
        isLoading: false,
        isFetching: false,
      });

      // Set form data from current bank
      if (currentBank) {
        setBankForm({
          bankCode: currentBank.bankCode || '',
          bankName: currentBank.bankName || '',
          accountNumber: currentBank.accountNumber || '',
          chatMid: currentBank.chatMid || '',
        });
      }
    } catch (error) {
      setBankData(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Save bank configuration
  const handleSaveBank = async () => {
    if (!selectedAccount) return;
    if (!bankForm.bankCode) {
      toast.error('กรุณาเลือกธนาคาร');
      return;
    }

    setIsProcessing(true);
    try {
      await lineSessionApi.setBank(selectedAccount._id, {
        bankCode: bankForm.bankCode,
        bankName: bankForm.bankName,
        accountNumber: bankForm.accountNumber || undefined,
        chatMid: bankForm.chatMid || undefined,
      });
      toast.success('บันทึกการตั้งค่าธนาคารสำเร็จ');
      await fetchBankData(selectedAccount._id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถบันทึกได้');
    } finally {
      setIsProcessing(false);
    }
  };

  // Fetch messages manually
  const handleFetchMessages = async () => {
    if (!selectedAccount) return;
    setBankData(prev => ({ ...prev, isFetching: true }));
    try {
      const res = await lineSessionApi.fetchMessages(selectedAccount._id);
      toast.success(`ดึงข้อความสำเร็จ: ${res.data.newMessages || 0} ข้อความใหม่`);
      await fetchBankData(selectedAccount._id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถดึงข้อความได้');
      setBankData(prev => ({ ...prev, isFetching: false }));
    }
  };

  const openSessionModal = async (account: ExtendedLineAccount) => {
    setSelectedAccount(account);
    setShowSessionModal(true);
    setSessionTab('keys');
    setSessionKeyForm({
      xLineAccess: '',
      xHmac: '',
      userAgent: '',
      lineVersion: '',
      curlCommand: '',
      extractedFrom: 'manual',
    });
    setBankForm({
      bankCode: '',
      bankName: '',
      accountNumber: '',
      chatMid: '',
    });
    await Promise.all([
      fetchSessionData(account._id),
      fetchBankData(account._id),
    ]);
  };

  const handleSetKeys = async () => {
    if (!selectedAccount) return;
    if (!sessionKeyForm.xLineAccess || !sessionKeyForm.xHmac) {
      toast.error('กรุณากรอก xLineAccess และ xHmac');
      return;
    }

    setIsProcessing(true);
    try {
      await lineSessionApi.setKeys(selectedAccount._id, {
        xLineAccess: sessionKeyForm.xLineAccess,
        xHmac: sessionKeyForm.xHmac,
        userAgent: sessionKeyForm.userAgent || undefined,
        lineVersion: sessionKeyForm.lineVersion || undefined,
        extractedFrom: sessionKeyForm.extractedFrom || 'manual',
      });
      toast.success('บันทึก Keys สำเร็จ');
      await fetchSessionData(selectedAccount._id);
      setSessionKeyForm(prev => ({ ...prev, xLineAccess: '', xHmac: '' }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถบันทึก Keys ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParseCurl = async () => {
    if (!selectedAccount) return;
    if (!sessionKeyForm.curlCommand) {
      toast.error('กรุณาวาง CURL command');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await lineSessionApi.parseCurl(selectedAccount._id, sessionKeyForm.curlCommand);
      toast.success('แยก Keys จาก CURL สำเร็จ');
      await fetchSessionData(selectedAccount._id);
      setSessionKeyForm(prev => ({ ...prev, curlCommand: '' }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถแยก Keys จาก CURL ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTriggerRelogin = async () => {
    if (!selectedAccount) return;

    setIsProcessing(true);
    try {
      await lineSessionApi.triggerRelogin(selectedAccount._id, 'manual');
      toast.success('กำลังดำเนินการ Relogin');
      await fetchSessionData(selectedAccount._id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'ไม่สามารถ Relogin ได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const getHealthStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Healthy</Badge>;
      case 'unhealthy':
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Unhealthy</Badge>;
      case 'expired':
        return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">Expired</Badge>;
      default:
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">Unknown</Badge>;
    }
  };

  // Enhanced Auto Login handlers
  const handleStartLogin = async () => {
    if (!selectedAccount) return;
    if (!loginForm.email || !loginForm.password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoginStatus(prev => ({
      ...prev,
      isLoading: true,
      status: 'requesting',
      error: undefined,
      pinCode: undefined,
      chatMid: undefined,
      sessionReused: false,
    }));

    try {
      // Use enhanced login API
      const res = await lineSessionApi.startEnhancedLogin(
        selectedAccount._id,
        loginForm.email,
        loginForm.password,
        'manual'
      );

      const data = res.data;

      // Debug: Log the response data
      console.log('[handleStartLogin] API Response:', JSON.stringify(data, null, 2));

      // Handle cooldown
      if (data.status === 'cooldown') {
        const seconds = Math.ceil((data.cooldownRemainingMs || 0) / 1000);
        setLoginStatus(prev => ({
          ...prev,
          isLoading: false,
          status: 'cooldown',
          error: data.error || `Please wait ${seconds} seconds`,
          cooldownRemainingMs: data.cooldownRemainingMs,
        }));
        toast.error(`Cooldown: Please wait ${seconds} seconds`);
        return;
      }

      // Debug: Log FULL API response
      console.log('[handleStartLogin] FULL API Response:', data);
      console.log('[handleStartLogin] pinCode value:', data.pinCode, 'type:', typeof data.pinCode);

      // Extract PIN from response - handle different possible field names
      const pinCodeValue = data.pinCode || data.pin || data.pin_code;

      setLoginStatus(prev => ({
        ...prev,
        status: data.status || 'unknown',
        pinCode: pinCodeValue,
        error: data.error,
        requestId: data.requestId,
        chatMid: data.chatMid,
        sessionReused: data.sessionReused,
        isLoading: !data.success && data.status !== 'failed',
      }));

      // Show PIN popup immediately if available
      if (pinCodeValue) {
        console.log('[handleStartLogin] PIN FOUND:', pinCodeValue);
        // Show prominent alert for PIN
        alert(`PIN Code: ${pinCodeValue}\n\nPlease enter this PIN on your LINE mobile app.`);
      }

      if (data.success) {
        if (data.sessionReused) {
          toast.success('Session reused - Keys copied from existing login');
        } else {
          toast.success('Login successful - Keys captured');
        }
        if (data.chatMid) {
          toast(`ChatMid captured: ${data.chatMid.substring(0, 20)}...`);
        }
        await fetchSessionData(selectedAccount._id);
        await fetchBankData(selectedAccount._id);
      } else if (pinCodeValue) {
        console.log('[handleStartLogin] PIN received:', pinCodeValue);
        toast.success(`PIN: ${pinCodeValue}`, { duration: 60000, icon: '🔑' });
        // WebSocket will handle real-time updates
        // Fall back to polling if WebSocket is not connected
        if (!loginNotifications.isConnected) {
          console.log('[Login] WebSocket not connected, falling back to polling');
          pollLoginStatus(selectedAccount._id);
        } else {
          console.log('[Login] WebSocket connected, waiting for real-time updates');
        }
      } else if (data.status === 'pin_displayed') {
        // PIN status but no pinCode - show message to user
        console.warn('[handleStartLogin] PIN status but no pinCode in response!', data);
        toast.error('PIN was displayed but not captured. Please check backend logs.');
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Login failed';
      setLoginStatus(prev => ({
        ...prev,
        isLoading: false,
        status: 'failed',
        error: errorMsg,
      }));
      toast.error(errorMsg);
    }
  };

  // Poll login status for PIN verification
  const pollLoginStatus = async (lineAccountId: string) => {
    const maxAttempts = 60; // 2 minutes (2 sec intervals)
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setLoginStatus(prev => ({
          ...prev,
          isLoading: false,
          status: 'failed',
          error: 'Login timeout - please try again',
        }));
        return;
      }

      attempts++;

      try {
        const res = await lineSessionApi.getEnhancedLoginStatus(lineAccountId);
        const data = res.data;

        // Update status from worker
        if (data.worker) {
          setLoginStatus(prev => ({
            ...prev,
            pinCode: data.worker.pinCode || prev.pinCode,
            workerState: data.worker.state,
          }));
        }

        // Check if completed or failed
        if (data.worker?.state === 'ready' && data.worker?.hasKeys) {
          setLoginStatus(prev => ({
            ...prev,
            isLoading: false,
            status: 'success',
            chatMid: data.worker?.hasChatMid ? 'captured' : undefined,
          }));
          toast.success('Login successful - Keys captured');
          await fetchSessionData(lineAccountId);
          await fetchBankData(lineAccountId);
          return;
        }

        if (data.worker?.state === 'error' || data.worker?.state === 'closed') {
          setLoginStatus(prev => ({
            ...prev,
            isLoading: false,
            status: 'failed',
            error: data.worker?.error || 'Login failed',
          }));
          return;
        }

        // Continue polling
        setTimeout(poll, 2000);
      } catch {
        // Continue polling on error
        setTimeout(poll, 2000);
      }
    };

    poll();
  };

  const handleCancelLogin = async () => {
    if (!selectedAccount) return;

    try {
      // Use enhanced cancel API
      await lineSessionApi.cancelEnhancedLogin(selectedAccount._id);
      setLoginStatus({
        status: 'idle',
        pinCode: undefined,
        error: undefined,
        isLoading: false,
        requestId: undefined,
        chatMid: undefined,
        sessionReused: false,
        cooldownRemainingMs: undefined,
        workerState: undefined,
      });
      toast('Login cancelled');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel login');
    }
  };

  const handleResetCooldown = async () => {
    if (!selectedAccount) return;

    try {
      await lineSessionApi.resetCooldown(selectedAccount._id);
      setLoginStatus(prev => ({
        ...prev,
        status: 'idle',
        cooldownRemainingMs: undefined,
        error: undefined,
      }));
      toast.success('Cooldown reset');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to reset cooldown');
    }
  };

  const getLoginStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Success</Badge>;
      case 'failed':
        return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">Failed</Badge>;
      case 'cooldown':
        return <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20">Cooldown</Badge>;
      case 'waiting_pin':
      case 'pin_displayed':
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">Waiting PIN</Badge>;
      case 'requesting':
      case 'initializing':
      case 'launching_browser':
      case 'loading_extension':
      case 'checking_session':
      case 'entering_credentials':
      case 'verifying':
      case 'extracting_keys':
      case 'triggering_messages':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">In Progress</Badge>;
      default:
        return <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">Idle</Badge>;
    }
  };

  const filteredAccounts = accounts.filter(acc =>
    acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.channelId.includes(searchTerm) ||
    acc.owner?.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMessages = accounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);
  const totalSlips = accounts.reduce((sum, acc) => sum + (acc.statistics?.totalSlipsVerified || 0), 0);

  return (
    <DashboardLayout requiredRole="admin">
      <div className="section-gap animate-fade pb-10">

        <div className="page-header relative z-10">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              บัญชี <span className="text-[#06C755]">LINE OA</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              ศูนย์ควบคุมบัญชี Official Account ทั้งหมด
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            <Button
              onClick={checkAllConnections}
              size="lg"
              variant="outline"
              disabled={isCheckingAll || accounts.length === 0}
              leftIcon={isCheckingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              className="h-11 sm:h-12 px-4 sm:px-5 rounded-full font-semibold text-xs border-white/10 bg-white/[0.03] hover:bg-white/5 text-white"
            >
              {isCheckingAll ? 'กำลังตรวจ...' : 'ตรวจสอบ API'}
            </Button>
            <Button
              onClick={() => { setFormData({ accountName: '', channelId: '', channelSecret: '', accessToken: '', description: '', ownerId: '' }); setShowAddModal(true); }}
              size="lg"
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              className="h-11 sm:h-12 px-5 sm:px-6 rounded-full font-semibold text-xs shadow-lg shadow-[#06C755]/20"
            >
              เพิ่มบัญชีใหม่
            </Button>
          </div>
        </div>

        <div className="grid-stats">
          <StatCard title="บัญชีทั้งหมด" value={accounts.length} icon="📱" color="indigo" variant="glass" />
          <StatCard title="ใช้งานอยู่" value={accounts.filter(a => a.isActive).length} icon="⚡" color="emerald" variant="glass" />
          <StatCard title="ข้อความ" value={totalMessages.toLocaleString()} icon="violet" color="violet" variant="glass" />
          <StatCard title="สลิปยืนยัน" value={totalSlips.toLocaleString()} icon="✅" color="amber" variant="glass" />
        </div>

        <Card variant="glass" className="p-2 sm:p-4 group border-white/[0.05]">
          <Input
            placeholder="ค้นหาชื่อบัญชี, Channel ID หรือเจ้าของ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />}
            className="bg-transparent border-none shadow-none text-sm sm:text-lg font-black uppercase tracking-tight placeholder:text-slate-600 placeholder:font-bold h-10 sm:h-14 text-white"
          />
        </Card>

        <Card className="hidden lg:block overflow-hidden" variant="glass" padding="none">
          <div className="table-responsive">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">บัญชี / ช่องทาง</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">ผู้ดูแลรับผิดชอบ</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">ตัวชี้วัดประสิทธิภาพ</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">สถานะระบบ</th>
                  <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.02]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-32">
                      <PageLoading transparent message="กำลังเชื่อมโยงเครือข่าย..." />
                    </td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-32 text-center">
                      <div className="flex flex-col items-center gap-6 opacity-30">
                        <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-4xl">🤖</div>
                        <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-sm">ไม่พบข้อมูลบัญชี</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => (
                    <motion.tr
                      key={account._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group hover:bg-white/[0.02] transition-all duration-300"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-white shadow-xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <Smartphone className="w-7 h-7" />
                          </div>
                          <div>
                            <p className="font-black text-white leading-none mb-1.5 group-hover:text-emerald-400 transition-colors uppercase tracking-tight text-base">{account.accountName}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] font-mono font-bold text-slate-500 bg-white/[0.03] px-2 py-0.5 rounded-lg border border-white/5">ID: {account.channelId}</p>
                              <div className="flex gap-1">
                                {account.settings?.enableBot && <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" title="BOT Active" />}
                                {account.settings?.enableAi && <div className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" title="AI Active" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center font-black text-slate-500 group-hover:text-emerald-400 transition-colors">
                            {(account.owner?.username || 'ADM')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-white uppercase tracking-tight leading-none mb-1 text-sm">{account.owner?.username || 'System Admin'}</p>
                            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{account.owner?.email || 'OFFICIAL'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-center gap-8">
                          <div className="text-center group-hover:scale-105 transition-transform">
                            <p className="text-base font-black text-white tracking-tighter">{(account.statistics?.totalMessages || 0).toLocaleString()}</p>
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">ข้อความ</p>
                          </div>
                          <div className="text-center group-hover:scale-105 transition-transform">
                            <p className="text-base font-black text-emerald-400 tracking-tighter">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">ตรวจสอบแล้ว</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={cn("w-2.5 h-2.5 rounded-full shadow-lg", account.isActive ? "bg-emerald-500 shadow-emerald-500/30 animate-pulse" : "bg-slate-700")} />
                            <span className={cn("text-[10px] font-black uppercase tracking-[0.15em]", account.isActive ? "text-emerald-400" : "text-slate-600")}>
                              {account.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </span>
                          </div>
                          {/* Connection Status Badge */}
                          <button
                            onClick={() => checkSingleConnection(account._id)}
                            disabled={connectionStatus[account._id]?.status === 'checking'}
                            className={cn(
                              "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wide flex items-center gap-1 transition-all cursor-pointer hover:opacity-80 border",
                              connectionStatus[account._id]?.status === 'connected' && 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                              connectionStatus[account._id]?.status === 'disconnected' && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                              connectionStatus[account._id]?.status === 'checking' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                              (!connectionStatus[account._id] || connectionStatus[account._id]?.status === 'unknown') && 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            )}
                          >
                            {connectionStatus[account._id]?.status === 'connected' && (
                              <><Wifi className="w-3 h-3" /> API ✓</>
                            )}
                            {connectionStatus[account._id]?.status === 'disconnected' && (
                              <><WifiOff className="w-3 h-3" /> โหลด</>
                            )}
                            {connectionStatus[account._id]?.status === 'checking' && (
                              <><Loader2 className="w-3 h-3 animate-spin" /> ...</>
                            )}
                            {(!connectionStatus[account._id] || connectionStatus[account._id]?.status === 'unknown') && (
                              <><RefreshCw className="w-3 h-3" /> ตรวจ</>
                            )}
                          </button>
                          <div className="flex gap-1 mt-1">
                            <div className={cn("px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest border", account.settings?.enableBot ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-white/5 bg-white/5 text-slate-600")}>Bot</div>
                            <div className={cn("px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest border", account.settings?.enableAi ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-400" : "border-white/5 bg-white/5 text-slate-600")}>AI</div>
                            <div className={cn("px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest border", account.settings?.enableSlipVerification ? "border-amber-500/20 bg-amber-500/10 text-amber-400" : "border-white/5 bg-white/5 text-slate-600")}>Slip</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                          <IconButton variant="ghost" size="sm" className="rounded-xl h-10 w-10 text-slate-500 hover:text-white hover:bg-white/5" onClick={() => { setSelectedAccount(account); setShowDetailModal(true); }}><Eye className="w-4 h-4" /></IconButton>
                          <IconButton variant="ghost" size="sm" className="rounded-xl h-10 w-10 text-cyan-400 hover:bg-cyan-400/10" onClick={() => openSessionModal(account)} title="Session & Keys"><Key className="w-4 h-4" /></IconButton>
                          <IconButton variant="ghost" size="sm" className="rounded-xl h-10 w-10 text-emerald-500 hover:bg-emerald-500/10" onClick={() => openSettingsModal(account)}><Settings className="w-4 h-4" /></IconButton>
                          <IconButton variant="ghost" size="sm" className="rounded-xl h-10 w-10 text-blue-400 hover:bg-blue-400/10" onClick={() => openEditModal(account)}><Edit className="w-4 h-4" /></IconButton>
                          <IconButton variant="ghost" size="sm" className={cn("rounded-xl h-10 w-10 transition-all", account.isActive ? "text-amber-500 hover:bg-amber-500/10" : "text-emerald-500 hover:bg-emerald-500/10")} onClick={() => handleToggleActive(account)}><Power className="w-4 h-4" /></IconButton>
                          <IconButton variant="ghost" size="sm" className="rounded-xl h-10 w-10 text-rose-500 hover:bg-rose-500 hover:text-white" onClick={() => { setSelectedAccount(account); setShowDeleteConfirm(true); }}><Trash2 className="w-4 h-4" /></IconButton>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Mobile Card View */}
        <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pb-10">
          {isLoading ? (
            [1, 2, 3, 4].map(i => <Card key={i} className="h-64 animate-pulse" variant="glass"><div /></Card>)
          ) : filteredAccounts.length === 0 ? (
            <div className="col-span-full flex flex-col items-center gap-6 opacity-30 py-20 text-white">
              <div className="text-5xl">🕳️</div>
              <p className="text-sm font-black uppercase tracking-widest">ไม่พบข้อมูลบัญชี</p>
            </div>
          ) : (
            filteredAccounts.map((account) => (
              <Card key={account._id} variant="glass" className="p-6 sm:p-8 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-center text-white shadow-xl">
                      <Smartphone className="w-6 h-6 sm:w-7 sm:h-7" />
                    </div>
                    <div>
                      <h3 className="font-black text-white uppercase tracking-tight text-base sm:text-lg leading-none mb-1.5">{account.accountName}</h3>
                      <p className="text-[9px] sm:text-[10px] font-mono font-bold text-slate-500 bg-white/[0.03] px-2 py-0.5 rounded-lg border border-white/5 w-fit">ID: {account.channelId}</p>
                    </div>
                  </div>
                  <div className={cn("w-2.5 h-2.5 rounded-full shadow-lg", account.isActive ? "bg-emerald-500 shadow-emerald-500/30" : "bg-slate-700")} />
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest leading-none mb-1">ข้อความ</span>
                      <p className="font-black text-white text-sm">{(account.statistics?.totalMessages || 0).toLocaleString()}</p>
                    </div>
                    <div className="w-px h-6 bg-white/5" />
                    <div className="flex flex-col text-right">
                      <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest leading-none mb-1">ตรวจสอบแล้ว</span>
                      <p className="font-black text-emerald-400 text-sm">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Connection Status Badge */}
                    <button
                      onClick={() => checkSingleConnection(account._id)}
                      disabled={connectionStatus[account._id]?.status === 'checking'}
                      className={cn(
                        "px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border flex items-center gap-1 cursor-pointer hover:opacity-80 transition-all",
                        connectionStatus[account._id]?.status === 'connected' && 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                        connectionStatus[account._id]?.status === 'disconnected' && 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                        connectionStatus[account._id]?.status === 'checking' && 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                        (!connectionStatus[account._id] || connectionStatus[account._id]?.status === 'unknown') && 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      )}
                    >
                      {connectionStatus[account._id]?.status === 'connected' && <><Wifi className="w-3 h-3" /> API</>}
                      {connectionStatus[account._id]?.status === 'disconnected' && <><WifiOff className="w-3 h-3" /> ERR</>}
                      {connectionStatus[account._id]?.status === 'checking' && <><Loader2 className="w-3 h-3 animate-spin" /></>}
                      {(!connectionStatus[account._id] || connectionStatus[account._id]?.status === 'unknown') && <><RefreshCw className="w-3 h-3" /></>}
                    </button>
                    <div className={cn("px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border", account.settings?.enableBot ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-white/5 bg-white/5 text-slate-600")}>Bot</div>
                    <div className={cn("px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border", account.settings?.enableAi ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-400" : "border-white/5 bg-white/5 text-slate-600")}>AI</div>
                    <div className={cn("px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border", account.settings?.enableSlipVerification ? "border-amber-500/20 bg-amber-500/10 text-amber-400" : "border-white/5 bg-white/5 text-slate-600")}>Slip</div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 bg-white/[0.03] p-2 rounded-2xl border border-white/5">
                  <IconButton variant="ghost" size="sm" className="flex-1 h-10 rounded-xl" onClick={() => { setSelectedAccount(account); setShowDetailModal(true); }}><Eye className="w-4 h-4 text-slate-500" /></IconButton>
                  <IconButton variant="ghost" size="sm" className="flex-1 h-10 rounded-xl text-cyan-400 hover:bg-cyan-400/10" onClick={() => openSessionModal(account)}><Key className="w-4 h-4" /></IconButton>
                  <IconButton variant="ghost" size="sm" className="flex-1 h-10 rounded-xl text-emerald-500 hover:bg-emerald-500/10" onClick={() => openSettingsModal(account)}><Settings className="w-4 h-4" /></IconButton>
                  <IconButton variant="ghost" size="sm" className="flex-1 h-10 rounded-xl text-blue-400 hover:bg-blue-400/10" onClick={() => openEditModal(account)}><Edit className="w-4 h-4" /></IconButton>
                  <IconButton variant="ghost" size="sm" className="flex-1 h-10 rounded-xl text-rose-500 hover:bg-rose-500/10" onClick={() => { setSelectedAccount(account); setShowDeleteConfirm(true); }}><Trash2 className="w-4 h-4" /></IconButton>
                </div>
              </Card>
            ))
          )}
        </div>

      </div>

      {/* Provision Node Modal */}
      <Modal isOpen={showAddModal} onClose={() => !isProcessing && setShowAddModal(false)} title="เพิ่มบัญชี LINE OA" size="lg">
        <div className="space-y-8 pt-4">
          <div className="p-8 bg-slate-900 text-white rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[60px] -mr-32 -mt-32 pointer-events-none group-hover:bg-emerald-500/30 transition-colors duration-700" />
            <p className="text-[10px] font-black mb-6 text-emerald-400 flex items-center gap-3 uppercase tracking-[0.2em]"><Smartphone className="w-5 h-5" /> LINE CONNECTIVITY PROTOCOL</p>
            <div className="space-y-6">
              <Input variant="glass" label="ชื่อบัญชีสำหรับการระบุตัวตน" placeholder="เช่น บัญชีธุรกิจหลัก / ฝ่ายบริการลูกค้า" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} className="bg-white/5 border-white/10 text-white h-14 font-bold" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input variant="glass" label="Channel ID" placeholder="1234567890" value={formData.channelId} onChange={(e) => setFormData({ ...formData, channelId: e.target.value })} className="bg-white/5 border-white/10 text-white h-14 font-mono" />
                <Input variant="glass" type="password" label="Channel Secret" placeholder="••••••••" value={formData.channelSecret} onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })} className="bg-white/5 border-white/10 text-white h-14" />
              </div>
              <Input variant="glass" type="password" label="Messaging Access Token (Long-lived)" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} className="bg-white/5 border-white/10 text-white h-14" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">เจ้าของบัญชีผู้รับผิดชอบ</label>
              <Select value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner font-bold">
                <option value="">System Administrator</option>
                {users.filter(u => u.role === 'user').map((user) => (
                  <option key={user._id} value={user._id}>{user.username} ({user.email})</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">บันทึกช่วยจำ (Optional)</label>
              <Input placeholder="ระบุรายละเอียดเพิ่มเติม..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner" />
            </div>
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-100 px-2">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]" onClick={() => setShowAddModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-emerald-500/20 shadow-xl" onClick={handleAddAccount} isLoading={isProcessing}>เริ่มสร้างบัญชี</Button>
          </div>
        </div>
      </Modal>

      {/* Identity Overhaul Modal */}
      <Modal isOpen={showEditModal} onClose={() => !isProcessing && setShowEditModal(false)} title={`แก้ไขบัญชี: ${selectedAccount?.accountName}`} size="lg">
        <div className="space-y-8 pt-4">
          <div className="bg-slate-50/50 p-8 rounded-[3rem] border border-white shadow-inner space-y-6">
            <Input label="ชื่อบัญชี" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} className="h-14 rounded-2xl bg-white border-none shadow-sm font-bold" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Channel Secret" type="password" placeholder="เว้นว่างหากไม่ต้องการเปลี่ยน" value={formData.channelSecret} onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })} className="h-14 rounded-2xl bg-white border-none shadow-sm" />
              <Input label="Access Token" type="password" placeholder="เว้นว่างหากไม่ต้องการเปลี่ยน" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} className="h-14 rounded-2xl bg-white border-none shadow-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">โอนสิทธิ์การดูแล</label>
              <Select value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })} className="h-14 rounded-2xl bg-white border-none shadow-sm font-bold">
                <option value="">System Administrator</option>
                {users.filter(u => u.role === 'user').map((user) => (
                  <option key={user._id} value={user._id}>{user.username} ({user.email})</option>
                ))}
              </Select>
            </div>
            <Textarea label="คำอธิบายเพิ่มเติม" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="rounded-[2rem] bg-white border-none shadow-sm p-6" />
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-100 px-2">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]" onClick={() => setShowEditModal(false)} disabled={isProcessing}>ยกเลิกการแก้ไข</Button>
            <Button variant="primary" className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-emerald-500/20 shadow-xl" onClick={handleEditAccount} isLoading={isProcessing}>อัปเดตข้อมูลบัญชี</Button>
          </div>
        </div>
      </Modal>

      {/* Logic Config Modal */}
      <Modal isOpen={showSettingsModal} onClose={() => !isProcessing && setShowSettingsModal(false)} title={`ตั้งค่าระบบอัจฉริยะ: ${selectedAccount?.accountName}`} size="xl">
        <div className="space-y-12 pt-6 max-h-[75vh] overflow-y-auto px-6 custom-scrollbar pb-10">

          {/* Feature Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={cn("p-8 rounded-[2.5rem] flex flex-col items-center text-center gap-6 transition-all border-2", settingsData.enableBot ? "bg-emerald-50 border-emerald-200 shadow-premium-sm" : "bg-slate-50 border-slate-100 opacity-60")}>
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg", settingsData.enableBot ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400")}>🤖</div>
              <div className="space-y-2">
                <p className="font-black text-xs uppercase tracking-widest text-slate-900">Automation Bot</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">ระบบตอบกลับอัตโนมัติ</p>
              </div>
              <Switch checked={settingsData.enableBot} onChange={(checked) => setSettingsData({ ...settingsData, enableBot: checked })} />
            </div>

            <div className={cn("p-8 rounded-[2.5rem] flex flex-col items-center text-center gap-6 transition-all border-2", settingsData.enableSlipVerification ? "bg-amber-50 border-amber-200 shadow-premium-sm" : "bg-slate-50 border-slate-100 opacity-60")}>
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg", settingsData.enableSlipVerification ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-400")}>📄</div>
              <div className="space-y-2">
                <p className="font-black text-xs uppercase tracking-widest text-slate-900">Slip Verifier</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">ระบบตรวจสอบสลิป</p>
              </div>
              <Switch checked={settingsData.enableSlipVerification} onChange={(checked) => setSettingsData({ ...settingsData, enableSlipVerification: checked })} />
            </div>

            <div className={cn("p-8 rounded-[2.5rem] flex flex-col items-center text-center gap-6 transition-all border-2", settingsData.enableAi ? "bg-indigo-50 border-indigo-200 shadow-premium-sm" : "bg-slate-50 border-slate-100 opacity-60")}>
              <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg", settingsData.enableAi ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-400")}>🧠</div>
              <div className="space-y-2">
                <p className="font-black text-xs uppercase tracking-widest text-slate-900">Neural Engine</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">สมองกลอัจฉริยะ (AI)</p>
              </div>
              <Switch checked={settingsData.enableAi} onChange={(checked) => setSettingsData({ ...settingsData, enableAi: checked })} />
            </div>
          </div>

          {/* AI Configuration Section */}
          <AnimatePresence>
            {settingsData.enableAi && (
              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8 p-10 bg-slate-900 rounded-[3.5rem] text-white shadow-3xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none group-hover:bg-indigo-500/20 transition-colors duration-1000" />
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-4 text-indigo-400">
                    <span className="w-1.5 h-8 bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.5)]" /> การตั้งค่าขุมพลัง AI
                  </h3>
                  <Badge className="bg-white/10 text-white border-none font-black text-[9px] px-3 py-1 uppercase tracking-widest rounded-lg">GEN-2 AI</Badge>
                </div>

                {/* Global AI Status Warning */}
                {!globalAiEnabled && (
                  <div className="bg-rose-500/20 border border-rose-500/30 rounded-2xl p-4 mb-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white text-lg">⚠️</div>
                      <div>
                        <p className="text-sm font-bold text-rose-400">AI ถูกปิดทั้งระบบ</p>
                        <p className="text-xs text-rose-300/70">แม้เปิด AI สำหรับบัญชีนี้ ระบบจะไม่ทำงานจนกว่า Admin จะเปิด Global AI</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6 relative z-10">
                  {/* AI Model Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-4">เลือก AI Model</label>
                    <Select
                      value={settingsData.aiModel}
                      onChange={(e) => setSettingsData({ ...settingsData, aiModel: e.target.value })}
                      className="bg-white/5 border-white/10 text-white h-14 rounded-2xl font-bold"
                    >
                      <option value="">ใช้ค่าเริ่มต้นของระบบ</option>
                      {allowedAiModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </Select>
                    <p className="text-[9px] text-white/30 px-4">เลือก model ที่ต้องการใช้สำหรับบัญชีนี้ หรือปล่อยว่างเพื่อใช้ค่าเริ่มต้นของระบบ</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-4">ระบุกระบวนการทำงานของ AI (คำสั่งพื้นฐาน)</label>
                    <Textarea variant="glass" value={settingsData.aiSystemPrompt} onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })} placeholder="กำหนดบทบาท, เงื่อนไข และพฤติกรรมของ AI..." rows={6} className="bg-white/5 border-white/10 text-white p-8 rounded-[2rem] font-medium leading-relaxed" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-4">ความสร้างสรรค์ของ AI (โหมดสุ่มเนื้อหา)</label>
                      <Input variant="glass" type="number" step="0.1" min="0" max="1" value={settingsData.aiTemperature} onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })} className="bg-white/5 border-white/10 text-white h-14 rounded-2xl font-black text-center" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-4">ข้อความตอบรับเมื่อระบบขัดข้อง</label>
                      <Input variant="glass" value={settingsData.aiFallbackMessage} onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })} className="bg-white/5 border-white/10 text-white h-14 rounded-2xl" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Protocol Message Overrides */}
          <div className="space-y-8 px-2">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em] px-2 flex items-center gap-3">
              <span className="w-8 h-px bg-slate-200" /> การปรับแต่งหน้าตาการใช้งาน <span className="flex-1 h-px bg-slate-200" />
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">กำลังตรวจสอบสลิป</label>
                <Input value={settingsData.slipImmediateMessage} onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">เครดิตโควต้าหมด</label>
                <Input value={settingsData.customQuotaExceededMessage} onChange={(e) => setSettingsData({ ...settingsData, customQuotaExceededMessage: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">ระบบบอทปิดใช้งาน</label>
                <Input value={settingsData.customBotDisabledMessage} onChange={(e) => setSettingsData({ ...settingsData, customBotDisabledMessage: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">ตรวจพบสลิปซ้ำ</label>
                <Input value={settingsData.customDuplicateSlipMessage} onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })} className="h-14 rounded-2xl bg-slate-50 border-none shadow-inner" />
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-10 border-t border-slate-100 pb-4">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]" onClick={() => setShowSettingsModal(false)} disabled={isProcessing}>ยกเลิก</Button>
            <Button variant="primary" className="flex-[2] h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-emerald-500/20 shadow-xl" onClick={handleSaveSettings} isLoading={isProcessing}>บันทึกการตั้งค่าโครงข่าย</Button>
          </div>
        </div>
      </Modal>

      {/* Node Analysis Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`รายละเอียดบัญชี: ${selectedAccount?.accountName}`} size="xl">
        {selectedAccount && (
          <div className="space-y-12 pt-6 max-h-[75vh] overflow-y-auto px-6 custom-scrollbar pb-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> การตั้งค่าหลัก
                </h3>
                <div className="p-8 bg-slate-50/50 rounded-[3rem] border border-white shadow-inner space-y-6">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Target Channel ID</p>
                    <p className="font-mono text-sm font-black text-slate-900 break-all p-4 bg-white rounded-2xl shadow-sm border border-slate-100">{selectedAccount.channelId}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Secret Key</p>
                      <p className="font-mono text-sm text-slate-300 p-4 bg-white rounded-2xl border border-slate-100">••••••••••••</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Admin Owner</p>
                      <p className="text-sm font-black text-slate-900 p-4 bg-white rounded-2xl border border-slate-100 truncate">{selectedAccount.owner?.username || 'System'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">System Memo</p>
                    <p className="text-sm font-bold text-slate-600 p-4 bg-white rounded-2xl border border-slate-100 min-h-[80px] leading-relaxed">{selectedAccount.description || 'ไม่มีคำอธิบายเพิ่มเติมสำหรับบัญชีนี้'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" /> สถานะการเชื่อมต่อ
                </h3>
                <div className="p-8 h-full bg-slate-900 text-white rounded-[3rem] shadow-premium-lg flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[60px] -mr-32 -mt-32 pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-emerald-400 mb-4 uppercase tracking-[0.2em]">ลิงก์รับข้อมูล Webhook</p>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] font-mono text-sm text-white/80 break-all leading-relaxed mb-8">
                      {getWebhookUrl(selectedAccount)}
                    </div>
                  </div>
                  <Button variant="primary" size="lg" className="w-full h-16 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-white text-slate-900 hover:bg-emerald-400 transition-all relative z-10" onClick={() => copyWebhookUrl(selectedAccount)}>
                    คัดลอก Webhook URL
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> สถิติวิเคราะห์เรียลไทม์
              </h3>
              <div className="grid grid-cols-3 gap-6">
                <Card variant="glass" className="p-8 text-center rounded-[2.5rem] border-slate-100 hover:scale-105 transition-transform">
                  <p className="text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">ปริมาณข้อมูลเครือข่าย</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter">{(selectedAccount.statistics?.totalMessages || 0).toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">จำนวนข้อความที่ประมวลผล</p>
                </Card>
                <Card variant="glass" className="p-8 text-center rounded-[2.5rem] border-emerald-100 bg-emerald-50/20 hover:scale-105 transition-transform">
                  <p className="text-[10px] font-black text-emerald-600 mb-3 uppercase tracking-widest">ประสิทธิภาพสูง</p>
                  <p className="text-3xl font-black text-emerald-600 tracking-tighter">{(selectedAccount.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-emerald-500/60 uppercase mt-1">สลิปที่ถูกต้อง</p>
                </Card>
                <Card variant="glass" className="p-8 text-center rounded-[2.5rem] border-rose-100 bg-rose-50/20 hover:scale-105 transition-transform">
                  <p className="text-[10px] font-black text-rose-600 mb-3 uppercase tracking-widest">ข้อผิดพลาดของระบบ</p>
                  <p className="text-3xl font-black text-rose-600 tracking-tighter">{(selectedAccount.statistics?.totalSlipErrors || 0).toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-rose-500/60 uppercase mt-1">สลิปที่ไม่ถูกต้อง</p>
                </Card>
              </div>
            </div>

            <div className="flex gap-4 pt-10 border-t border-slate-100">
              <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]" onClick={() => setShowDetailModal(false)}>ปิดหน้าต่าง</Button>
              <Button variant="secondary" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px]" onClick={() => openEditModal(selectedAccount)}>แก้ไขโครงร่าง</Button>
              <Button variant="danger" className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border-none" onClick={() => setShowDeleteConfirm(true)}>ถอนรากบัญชี</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Session & Keys Modal */}
      <Modal isOpen={showSessionModal} onClose={() => !isProcessing && setShowSessionModal(false)} title={`Session & Keys: ${selectedAccount?.accountName}`} size="xl">
        {selectedAccount && (
          <div className="space-y-8 pt-4 max-h-[75vh] overflow-y-auto px-2 custom-scrollbar pb-6">
            {/* Session Status Header */}
            <div className="p-6 bg-slate-900 text-white rounded-[2rem] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-[60px] -mr-24 -mt-24 pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                      <Key className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">LINE Session Status</p>
                      <p className="text-white font-bold">{selectedAccount.accountName}</p>
                    </div>
                  </div>
                  {sessionData.isLoading ? (
                    <Spinner size="sm" />
                  ) : sessionData.health ? (
                    getHealthStatusBadge(sessionData.health.status)
                  ) : (
                    <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20">No Session</Badge>
                  )}
                </div>

                {sessionData.session && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-sm font-bold text-white">{sessionData.session.status || 'N/A'}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Last Check</p>
                      <p className="text-sm font-bold text-white">
                        {sessionData.session.lastCheckedAt
                          ? new Date(sessionData.session.lastCheckedAt).toLocaleString('th-TH')
                          : 'Never'}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Failures</p>
                      <p className="text-sm font-bold text-white">{sessionData.session.consecutiveFailures || 0}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Extracted From</p>
                      <p className="text-sm font-bold text-white truncate">{sessionData.session.extractedFrom || 'N/A'}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => setSessionTab('login')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  sessionTab === 'login' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <LogIn className="w-4 h-4" /> Login
              </button>
              <button
                onClick={() => setSessionTab('keys')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  sessionTab === 'keys' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Key className="w-4 h-4" /> Keys
              </button>
              <button
                onClick={() => setSessionTab('curl')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  sessionTab === 'curl' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Terminal className="w-4 h-4" /> CURL
              </button>
              <button
                onClick={() => setSessionTab('history')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  sessionTab === 'history' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <History className="w-4 h-4" /> History
              </button>
              <button
                onClick={() => setSessionTab('bank')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  sessionTab === 'bank' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Building2 className="w-4 h-4" /> Bank
              </button>
            </div>

            {/* Login Tab */}
            {sessionTab === 'login' && (
              <div className="space-y-6">
                {/* Login Form */}
                <div className="p-6 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-[2rem] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-[60px] -mr-24 -mt-24 pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                          <Zap className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">Auto Login</p>
                          <p className="text-white font-bold">Login with Email & Password</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* WebSocket Connection Indicator */}
                        <div className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider",
                          loginNotifications.isConnected
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        )}>
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            loginNotifications.isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                          )} />
                          {loginNotifications.isConnected ? "Live" : "Offline"}
                        </div>
                        {getLoginStatusBadge(loginStatus.status)}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                        <input
                          type="email"
                          placeholder="LINE Email"
                          value={loginForm.email}
                          onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                          disabled={loginStatus.isLoading}
                        />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                        <input
                          type="password"
                          placeholder="LINE Password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                          disabled={loginStatus.isLoading}
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button
                        variant="primary"
                        onClick={handleStartLogin}
                        isLoading={loginStatus.isLoading}
                        disabled={loginStatus.isLoading || !loginForm.email || !loginForm.password}
                        className="flex-1 h-14 rounded-xl font-bold bg-white text-blue-600 hover:bg-white/90"
                      >
                        <LogIn className="w-5 h-5 mr-2" /> Start Login
                      </Button>
                      {loginStatus.isLoading && (
                        <Button
                          variant="outline"
                          onClick={handleCancelLogin}
                          className="h-14 rounded-xl font-bold border-white/30 text-white hover:bg-white/10"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* PIN Code Display */}
                {loginStatus.pinCode && (
                  <div className="p-6 bg-amber-50 rounded-[2rem] border-2 border-amber-200">
                    <div className="text-center">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">PIN Code</p>
                      <div className="flex items-center justify-center gap-2">
                        {loginStatus.pinCode.split('').map((digit, i) => (
                          <span key={i} className="w-12 h-14 flex items-center justify-center text-2xl font-black text-amber-700 bg-white rounded-xl border-2 border-amber-300 shadow-sm">
                            {digit}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-amber-600 mt-4">Please verify this PIN on your mobile LINE app</p>
                    </div>
                  </div>
                )}

                {/* Cooldown Display with Reset Button */}
                {loginStatus.status === 'cooldown' && loginStatus.cooldownRemainingMs && (
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-orange-500" />
                        <div>
                          <p className="text-sm font-bold text-orange-700">Cooldown Active</p>
                          <p className="text-xs text-orange-600">
                            Please wait {Math.ceil(loginStatus.cooldownRemainingMs / 1000)} seconds before trying again
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetCooldown}
                        className="border-orange-300 text-orange-600 hover:bg-orange-100"
                      >
                        Reset Cooldown
                      </Button>
                    </div>
                  </div>
                )}

                {/* Session Reused Indicator */}
                {loginStatus.sessionReused && loginStatus.status === 'success' && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-3">
                      <Copy className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="text-sm font-bold text-blue-700">Session Reused</p>
                        <p className="text-xs text-blue-600">Keys were copied from an existing login with the same email</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ChatMid Display */}
                {loginStatus.chatMid && (
                  <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-indigo-500" />
                      <div>
                        <p className="text-sm font-bold text-indigo-700">ChatMid Captured</p>
                        <p className="text-xs font-mono text-indigo-600 break-all">
                          {loginStatus.chatMid.length > 30
                            ? `${loginStatus.chatMid.substring(0, 30)}...`
                            : loginStatus.chatMid}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {loginStatus.error && loginStatus.status !== 'cooldown' && (
                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                    <div className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-rose-500" />
                      <p className="text-sm text-rose-700">{loginStatus.error}</p>
                    </div>
                  </div>
                )}

                {/* Worker State Progress */}
                {loginStatus.isLoading && loginStatus.workerState && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      <div>
                        <p className="text-sm font-bold text-blue-700">Processing</p>
                        <p className="text-xs text-blue-600 capitalize">
                          {loginStatus.workerState.replace(/_/g, ' ')}
                          {loginStatus.requestId && (
                            <span className="ml-2 text-blue-400 font-mono">
                              (Request: {loginStatus.requestId.substring(0, 8)}...)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Display */}
                {loginStatus.status === 'success' && !loginStatus.sessionReused && (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <div>
                        <p className="text-sm font-bold text-emerald-700">Login Successful</p>
                        <p className="text-xs text-emerald-600">Keys have been captured and saved</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Info */}
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Enhanced Auto Login Features</p>
                  <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
                    <li>Profile isolation - separate browser profile per account</li>
                    <li>Dual-layer key interception (CDP + Puppeteer)</li>
                    <li>Auto chatMid extraction for bank messages</li>
                    <li>Session reuse - copy keys from same email accounts</li>
                    <li>Auto recovery on browser crash (up to 3 retries)</li>
                    <li>Cooldown management with exponential backoff</li>
                    <li className="text-blue-600 font-medium">Real-time WebSocket notifications for login status</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Keys Tab */}
            {sessionTab === 'keys' && (
              <div className="space-y-6">
                <div className="p-6 bg-slate-50 rounded-[2rem] space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Set Keys Manually</p>
                  <div className="space-y-4">
                    <Input
                      label="X-Line-Access Token"
                      placeholder="eyJhbGciOiJIUzI1NiJ9..."
                      value={sessionKeyForm.xLineAccess}
                      onChange={(e) => setSessionKeyForm(prev => ({ ...prev, xLineAccess: e.target.value }))}
                      className="font-mono text-sm"
                    />
                    <Input
                      label="X-Hmac"
                      placeholder="HMAC signature..."
                      value={sessionKeyForm.xHmac}
                      onChange={(e) => setSessionKeyForm(prev => ({ ...prev, xHmac: e.target.value }))}
                      className="font-mono text-sm"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="User Agent (Optional)"
                        placeholder="LINE/13.0.0..."
                        value={sessionKeyForm.userAgent}
                        onChange={(e) => setSessionKeyForm(prev => ({ ...prev, userAgent: e.target.value }))}
                        className="text-sm"
                      />
                      <Input
                        label="LINE Version (Optional)"
                        placeholder="13.0.0"
                        value={sessionKeyForm.lineVersion}
                        onChange={(e) => setSessionKeyForm(prev => ({ ...prev, lineVersion: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="primary"
                      onClick={handleSetKeys}
                      isLoading={isProcessing}
                      className="flex-1 h-12 rounded-xl font-bold"
                    >
                      Save Keys
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleTriggerRelogin}
                      isLoading={isProcessing}
                      className="h-12 rounded-xl font-bold"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" /> Relogin
                    </Button>
                  </div>
                </div>

                {/* Current Keys Display */}
                {sessionData.session && sessionData.session.xLineAccess && (
                  <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-200">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4">Current Keys</p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase mb-1">X-Line-Access</p>
                        <p className="font-mono text-xs text-emerald-700 bg-white/50 p-2 rounded-lg break-all">
                          {sessionData.session.xLineAccess.substring(0, 30)}...
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase mb-1">X-Hmac</p>
                        <p className="font-mono text-xs text-emerald-700 bg-white/50 p-2 rounded-lg break-all">
                          {sessionData.session.xHmac.substring(0, 30)}...
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CURL Tab */}
            {sessionTab === 'curl' && (
              <div className="space-y-6">
                <div className="p-6 bg-slate-900 text-white rounded-[2rem]">
                  <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-4">Extract Keys from CURL</p>
                  <p className="text-xs text-white/60 mb-4">
                    วาง CURL command จาก Browser DevTools (Network tab) ที่มี X-Line-Access header
                  </p>
                  <Textarea
                    placeholder={`curl 'https://api.line.me/...' \\
  -H 'X-Line-Access: eyJhbGciOiJIUzI1NiJ9...' \\
  -H 'X-Hmac: abc123...'`}
                    value={sessionKeyForm.curlCommand}
                    onChange={(e) => setSessionKeyForm(prev => ({ ...prev, curlCommand: e.target.value }))}
                    rows={8}
                    className="font-mono text-sm bg-white/5 border-white/10 text-white rounded-xl"
                  />
                  <Button
                    variant="primary"
                    onClick={handleParseCurl}
                    isLoading={isProcessing}
                    className="w-full mt-4 h-12 rounded-xl font-bold bg-cyan-500 hover:bg-cyan-600"
                  >
                    <Terminal className="w-4 h-4 mr-2" /> Extract & Save Keys
                  </Button>
                </div>
              </div>
            )}

            {/* History Tab */}
            {sessionTab === 'history' && (
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Key Extraction History</p>
                {sessionData.history.length === 0 ? (
                  <div className="p-8 bg-slate-50 rounded-[2rem] text-center">
                    <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">No history found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessionData.history.map((item: any, index: number) => (
                      <div key={item._id || index} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={cn(
                            "text-[9px] font-bold",
                            item.eventType === 'key_set' && "bg-emerald-100 text-emerald-700",
                            item.eventType === 'key_expired' && "bg-rose-100 text-rose-700",
                            item.eventType === 'relogin' && "bg-amber-100 text-amber-700"
                          )}>
                            {item.eventType}
                          </Badge>
                          <span className="text-[9px] text-slate-400">
                            {new Date(item.createdAt).toLocaleString('th-TH')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{item.extractedFrom || 'Manual'}</p>
                        {item.xLineAccess && (
                          <p className="font-mono text-[10px] text-slate-400 mt-1 truncate">
                            {item.xLineAccess.substring(0, 40)}...
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bank Tab */}
            {sessionTab === 'bank' && (
              <div className="space-y-6">
                {/* Bank Configuration */}
                <div className="p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-[2rem] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-[60px] -mr-24 -mt-24 pointer-events-none" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">Bank Configuration</p>
                        <p className="text-white font-bold">Select Bank to Monitor</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2 block">Bank</label>
                        <select
                          value={bankForm.bankCode}
                          onChange={(e) => {
                            const bank = bankData.banks.find((b: any) => b.bankCode === e.target.value);
                            setBankForm(prev => ({
                              ...prev,
                              bankCode: e.target.value,
                              bankName: bank?.bankNameTh || bank?.bankNameEn || '',
                            }));
                          }}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white/40"
                          disabled={bankData.isLoading}
                        >
                          <option value="" className="text-slate-900">-- Select Bank --</option>
                          {bankData.banks.map((bank: any) => (
                            <option key={bank.bankCode} value={bank.bankCode} className="text-slate-900">
                              {bank.bankNameTh || bank.bankNameEn} ({bank.bankCode})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2 block">Account Number (Optional)</label>
                          <input
                            type="text"
                            placeholder="123-4-56789-0"
                            value={bankForm.accountNumber}
                            onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-2 block">Chat MID (for message fetch)</label>
                          <input
                            type="text"
                            placeholder="u1234567890abcdef..."
                            value={bankForm.chatMid}
                            onChange={(e) => setBankForm(prev => ({ ...prev, chatMid: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      onClick={handleSaveBank}
                      isLoading={isProcessing}
                      disabled={isProcessing || !bankForm.bankCode}
                      className="w-full mt-6 h-14 rounded-xl font-bold bg-white text-emerald-600 hover:bg-white/90"
                    >
                      Save Bank Configuration
                    </Button>
                  </div>
                </div>

                {/* Transaction Summary */}
                {bankData.summary && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Deposits</p>
                          <p className="text-lg font-black text-emerald-700">{bankData.summary.deposits?.count || 0} txn</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-emerald-600">
                        {Number(bankData.summary.deposits?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                    <div className="p-6 bg-rose-50 rounded-[2rem] border border-rose-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                          <TrendingDown className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">Withdrawals</p>
                          <p className="text-lg font-black text-rose-700">{bankData.summary.withdrawals?.count || 0} txn</p>
                        </div>
                      </div>
                      <p className="text-2xl font-black text-rose-600">
                        {Number(bankData.summary.withdrawals?.total || 0).toLocaleString('th-TH', { style: 'currency', currency: 'THB' })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fetch Messages */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Messages from Bank OA</p>
                    <p className="text-sm text-slate-600">{bankData.messages.length} messages loaded</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={handleFetchMessages}
                    isLoading={bankData.isFetching}
                    disabled={bankData.isFetching || !sessionData.session?.xLineAccess}
                    className="h-10 rounded-xl font-bold"
                  >
                    <Download className="w-4 h-4 mr-2" /> Fetch Now
                  </Button>
                </div>

                {/* Recent Messages */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Recent Messages</p>
                  {bankData.messages.length === 0 ? (
                    <div className="p-8 bg-slate-50 rounded-[2rem] text-center">
                      <Wallet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">No messages yet</p>
                      <p className="text-xs text-slate-400 mt-1">Configure bank and fetch messages to see transactions</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                      {bankData.messages.map((msg: any, index: number) => (
                        <div key={msg._id || index} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <Badge className={cn(
                              "text-[9px] font-bold",
                              msg.transactionType === 'deposit' && "bg-emerald-100 text-emerald-700",
                              msg.transactionType === 'withdraw' && "bg-rose-100 text-rose-700",
                              msg.transactionType === 'transfer' && "bg-blue-100 text-blue-700",
                              msg.transactionType === 'unknown' && "bg-slate-100 text-slate-600"
                            )}>
                              {msg.transactionType || 'unknown'}
                            </Badge>
                            <span className="text-[9px] text-slate-400">
                              {msg.messageDate ? new Date(msg.messageDate).toLocaleString('th-TH') : '-'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-600 truncate flex-1 mr-4">{msg.text?.substring(0, 60) || 'No text'}</p>
                            {msg.amount && (
                              <p className={cn(
                                "text-sm font-bold",
                                msg.transactionType === 'deposit' ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {msg.transactionType === 'deposit' ? '+' : '-'}{Number(msg.amount).toLocaleString()} THB
                              </p>
                            )}
                          </div>
                          {msg.balance && (
                            <p className="text-[10px] text-slate-400 mt-1">Balance: {Number(msg.balance).toLocaleString()} THB</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-6 border-t border-slate-100">
              <Button
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold"
                onClick={() => setShowSessionModal(false)}
                disabled={isProcessing}
              >
                Close
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-xl font-bold"
                onClick={() => fetchSessionData(selectedAccount._id)}
                disabled={sessionData.isLoading}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", sessionData.isLoading && "animate-spin")} /> Refresh
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} title="ยืนยันการลบ" message="คุณแน่ใจหรือว่าต้องการลบบัญชีนี้? การกระทำนี้ไม่สามารถย้อนกลับได้" confirmText="ลบบัญชี" type="danger" isLoading={isProcessing} />
      <ConfirmModal isOpen={showDisableConfirm} onClose={() => setShowDisableConfirm(false)} onConfirm={() => selectedAccount && handleToggleActive(selectedAccount)} title="ยืนยันการปิด" message="คุณแน่ใจหรือว่าต้องการปิดการใช้งานบัญชีนี้? Webhook จะหยุดรับข้อความจาก LINE" confirmText="ปิดบัญชี" type="warning" isLoading={isProcessing} />

    </DashboardLayout>
  );
}
