'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, usersApi, systemSettingsApi } from '@/lib/api';
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
  Loader2
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
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('');
  const [isCheckingAll, setIsCheckingAll] = useState(false);

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatusInfo>>({});

  const [formData, setFormData] = useState({
    accountName: '',
    channelId: '',
    channelSecret: '',
    accessToken: '',
    description: '',
    ownerId: '',
  });

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

  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchPublicBaseUrl = async () => {
    try {
      const res = await systemSettingsApi.getPaymentInfo().catch(() => ({ data: {} }));
      setPublicBaseUrl(res.data.publicBaseUrl || '');
    } catch {
      setPublicBaseUrl('');
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
      enableBot: s.enableBot ?? false,
      enableAi: s.enableAi ?? false,
      enableSlipVerification: s.enableSlipVerification ?? false,
      aiSystemPrompt: s.aiSystemPrompt || '',
      aiTemperature: s.aiTemperature ?? 0.7,
      aiFallbackMessage: s.aiFallbackMessage || 'ขออภัย ระบบไม่สามารถตอบคำถามได้ในขณะนี้',
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

                <div className="grid grid-cols-4 gap-2 bg-white/[0.03] p-2 rounded-2xl border border-white/5">
                  <IconButton variant="ghost" size="sm" className="flex-1 h-10 rounded-xl" onClick={() => { setSelectedAccount(account); setShowDetailModal(true); }}><Eye className="w-4 h-4 text-slate-500" /></IconButton>
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

                <div className="space-y-6 relative z-10">
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

      <ConfirmModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} title="ยืนยันการลบ" message="คุณแน่ใจหรือว่าต้องการลบบัญชีนี้? การกระทำนี้ไม่สามารถย้อนกลับได้" confirmText="ลบบัญชี" type="danger" isLoading={isProcessing} />
      <ConfirmModal isOpen={showDisableConfirm} onClose={() => setShowDisableConfirm(false)} onConfirm={() => selectedAccount && handleToggleActive(selectedAccount)} title="ยืนยันการปิด" message="คุณแน่ใจหรือว่าต้องการปิดการใช้งานบัญชีนี้? Webhook จะหยุดรับข้อความจาก LINE" confirmText="ปิดบัญชี" type="warning" isLoading={isProcessing} />

    </DashboardLayout>
  );
}
