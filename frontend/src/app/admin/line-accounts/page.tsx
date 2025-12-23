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

interface ExtendedLineAccount extends LineAccount {
  owner?: {
    username: string;
    email?: string;
  };
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

  const getWebhookUrl = (channelId: string) => {
    const base = publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '') || '';
    const normalized = base.replace(/\/+$/, '');
    return `${normalized}/api/webhook/line/${channelId}`;
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
      toast.success('Provisioned successfully');
      setShowAddModal(false);
      setFormData({ accountName: '', channelId: '', channelSecret: '', accessToken: '', description: '', ownerId: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to establish node');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      await lineAccountsApi.update(selectedAccount._id, formData);
      toast.success('Account configuration updated');
      setShowEditModal(false);
      fetchData();
    } catch (error: any) {
      toast.error('Failed to apply changes');
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
      customQuotaExceededMessage: (s as any).customQuotaExceededMessage || '',
      customBotDisabledMessage: (s as any).customBotDisabledMessage || '',
      customSlipDisabledMessage: (s as any).customSlipDisabledMessage || '',
      customAiDisabledMessage: (s as any).customAiDisabledMessage || '',
      customDuplicateSlipMessage: (s as any).customDuplicateSlipMessage || '',
      customSlipErrorMessage: (s as any).customSlipErrorMessage || '',
      customSlipSuccessMessage: (s as any).customSlipSuccessMessage || '',
      sendMessageWhenBotDisabled: boolToString((s as any).sendMessageWhenBotDisabled),
      sendMessageWhenSlipDisabled: boolToString((s as any).sendMessageWhenSlipDisabled),
      sendMessageWhenAiDisabled: boolToString((s as any).sendMessageWhenAiDisabled),
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
      toast.success('Neuro-logic parameters synchronized');
      setShowSettingsModal(false);
      fetchData();
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);
    try {
      await lineAccountsApi.delete(selectedAccount._id);
      toast.success('Account purged from registry');
      setShowDeleteConfirm(false);
      setShowDetailModal(false);
      fetchData();
    } catch (error: any) {
      toast.error('Deletion operation failed');
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
      toast.success(account.isActive ? 'Node offline' : 'Node online');
      setShowDisableConfirm(false);
      fetchData();
    } catch (error) {
      toast.error('State transition failed');
    }
  };

  const copyWebhookUrl = (channelId: string) => {
    const webhookUrl = getWebhookUrl(channelId);
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL sequence copied');
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
      <div className="space-y-12 animate-fade max-w-[1700px] mx-auto pb-12">

        {/* Superior Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter leading-none">LINE Integration Matrix</h1>
              <Badge variant="emerald" className="px-2 py-0.5 font-black text-[10px] uppercase tracking-widest">Multi-Node</Badge>
            </div>
            <p className="text-slate-500 font-medium text-lg">Manage organizational LINE Official Accounts, AI relay nodes, and webhook gateways.</p>
          </div>
          <Button variant="primary" className="rounded-2xl font-black uppercase tracking-widest shadow-emerald-500/10 shadow-xl" onClick={() => { setFormData({ accountName: '', channelId: '', channelSecret: '', accessToken: '', description: '', ownerId: '' }); setShowAddModal(true); }}>
            + Provision New Node
          </Button>
        </div>

        {/* Global Network Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Established Nodes" value={accounts.length} icon="📡" color="indigo" variant="glass" />
          <StatCard title="Active Transmissions" value={accounts.filter(a => a.isActive).length} icon="🟢" color="emerald" variant="glass" />
          <StatCard title="Total Data Flux" value={totalMessages.toLocaleString()} icon="💬" color="violet" variant="glass" />
          <StatCard title="Verified Assets" value={totalSlips.toLocaleString()} icon="📜" color="amber" variant="glass" />
        </div>

        {/* Search & Filter Interface */}
        <Card className="p-4 bg-white/40 backdrop-blur-xl border-none shadow-premium-sm rounded-3xl">
          <Input
            placeholder="Search Node Registry by Profile or Signature..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none shadow-none text-lg font-medium placeholder:text-slate-300"
          />
        </Card>

        {/* Integration Registry Table */}
        <Card className="overflow-hidden p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3.5rem]">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Node Profile</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Governance</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Protocol Stats</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Signal Features</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Operational State</th>
                  <th className="px-10 py-8 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Logic Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-10 py-32">
                      <PageLoading transparent message="Scanning network synchronization..." />
                    </td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-10 py-32 text-center">
                      <div className="flex flex-col items-center gap-6 opacity-30">
                        <div className="text-7xl">🕳️</div>
                        <p className="text-sm font-black uppercase tracking-[0.4em]">Registry is Void</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((account) => (
                    <motion.tr
                      key={account._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group hover:bg-slate-50/80 transition-all duration-300"
                    >
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center text-white shadow-2xl group-hover:scale-110 transition-transform duration-500">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          </div>
                          <div>
                            <p className="font-black text-slate-900 group-hover:text-emerald-600 transition-colors uppercase tracking-tight text-lg mb-0.5">{account.accountName}</p>
                            <p className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg w-fit">ID: {account.channelId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <p className="font-extrabold text-slate-700 uppercase tracking-tight text-sm mb-1">{account.owner?.username || 'SYSTEM_MASTER'}</p>
                        <p className="text-[10px] font-bold text-slate-400 lowercase italic">{account.owner?.email || 'root@core.net'}</p>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{(account.statistics?.totalMessages || 0).toLocaleString()}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Flux</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">{(account.statistics?.totalSlipsVerified || 0).toLocaleString()}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assets</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex flex-wrap gap-2 max-w-[150px]">
                          {account.settings?.enableBot && <Badge variant="emerald" className="rounded-lg text-[9px] px-1.5 py-0 font-black">BOT</Badge>}
                          {account.settings?.enableSlipVerification && <Badge variant="indigo" className="rounded-lg text-[9px] px-1.5 py-0 font-black">SLIP</Badge>}
                          {account.settings?.enableAi && <Badge variant="purple" className="rounded-lg text-[9px] px-1.5 py-0 font-black">AI</Badge>}
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-2.5">
                          <div className={cn("w-3 h-3 rounded-full shadow-lg", account.isActive ? "bg-emerald-500 shadow-emerald-500/50" : "bg-slate-300")} />
                          <span className={cn("text-[11px] font-black uppercase tracking-[0.15em]", account.isActive ? "text-emerald-600" : "text-slate-400")}>
                            {account.isActive ? 'established' : 'decoupled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <IconButton variant="glass" size="sm" className="rounded-xl" onClick={() => { setSelectedAccount(account); setShowDetailModal(true); }} title="View Matrix"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></IconButton>
                          <IconButton variant="glass" size="sm" className="rounded-xl text-emerald-500" onClick={() => openSettingsModal(account)} title="Logic Config"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></IconButton>
                          <IconButton variant="glass" size="sm" className="rounded-xl text-blue-500" onClick={() => openEditModal(account)} title="Identity Overhaul"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></IconButton>
                          <IconButton variant="glass" size="sm" className={cn("rounded-xl", account.isActive ? "text-amber-500" : "text-emerald-500")} onClick={() => handleToggleActive(account)} title={account.isActive ? 'Decouple Node' : 'Initialize Link'}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.122a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M13 12a1 1 0 11-2 0 1 1 0 012 0z" /></svg></IconButton>
                          <IconButton variant="glass" size="sm" className="rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white" onClick={() => { setSelectedAccount(account); setShowDeleteConfirm(true); }} title="Purge Node"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></IconButton>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Provision Node Modal */}
      <Modal isOpen={showAddModal} onClose={() => !isProcessing && setShowAddModal(false)} title="Provision New Integration Node" size="lg">
        <div className="space-y-6 pt-2">
          <div className="p-5 bg-slate-900 text-white rounded-[2rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-3xl font-black italic uppercase">DOWNLINK</div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-emerald-400">Security Clearance Required</p>
            <div className="space-y-4">
              <Input variant="glass" label="Logical Address (Account Name)" placeholder="Main Service Node" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} className="bg-white/5 border-white/10 text-white" />
              <div className="grid grid-cols-2 gap-4">
                <Input variant="glass" label="Channel Reference" placeholder="1234..." value={formData.channelId} onChange={(e) => setFormData({ ...formData, channelId: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                <Input variant="glass" type="password" label="Cryptographic Secret" placeholder="••••••••" value={formData.channelSecret} onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })} className="bg-white/5 border-white/10 text-white" />
              </div>
              <Input variant="glass" type="password" label="Encrypted Access Token" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Select label="Governance Authority (Owner)" value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}>
              <option value="">SYSTEM MASTER (Admin Only)</option>
              {users.filter(u => u.role === 'user').map((user) => (
                <option key={user._id} value={user._id}>{user.username} ({user.email})</option>
              ))}
            </Select>
            <Input label="Metadata Description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <div className="flex gap-4 pt-8 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowAddModal(false)} disabled={isProcessing}>Abort</Button>
            <Button variant="primary" className="flex-[2] font-black tracking-widest uppercase shadow-emerald-500/20 shadow-premium h-14 rounded-2xl" onClick={handleAddAccount} isLoading={isProcessing}>Execute Provisioning</Button>
          </div>
        </div>
      </Modal>

      {/* Identity Overhaul Modal */}
      <Modal isOpen={showEditModal} onClose={() => !isProcessing && setShowEditModal(false)} title={`Reconfigure Node: ${selectedAccount?.accountName}`} size="lg">
        <div className="space-y-6 pt-2">
          <Input label="Revised Name" value={formData.accountName} onChange={(e) => setFormData({ ...formData, accountName: e.target.value })} />
          <div className="grid grid-cols-2 gap-6">
            <Input label="Channel Secret (Hidden)" type="password" placeholder="Leave empty to retain existing secret" value={formData.channelSecret} onChange={(e) => setFormData({ ...formData, channelSecret: e.target.value })} />
            <Input label="Access Token (Hidden)" type="password" placeholder="Leave empty to retain existing token" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} />
          </div>
          <Select label="Reassign Governance" value={formData.ownerId} onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}>
            <option value="">SYSTEM MASTER</option>
            {users.filter(u => u.role === 'user').map((user) => (
              <option key={user._id} value={user._id}>{user.username} ({user.email})</option>
            ))}
          </Select>
          <Textarea label="Node Metadata" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />

          <div className="flex gap-4 pt-8 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowEditModal(false)} disabled={isProcessing}>Cancel</Button>
            <Button variant="primary" className="flex-[2] font-black tracking-widest uppercase shadow-emerald-500/10 shadow-lg h-14 rounded-2xl" onClick={handleEditAccount} isLoading={isProcessing}>Propagate Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Logic Config Modal */}
      <Modal isOpen={showSettingsModal} onClose={() => !isProcessing && setShowSettingsModal(false)} title={`Logic Configuration Matrix: ${selectedAccount?.accountName}`} size="xl">
        <div className="space-y-10 pt-2 max-h-[70vh] overflow-y-auto px-4 custom-scrollbar">

          {/* feature switches */}
          <div className="grid grid-cols-3 gap-6">
            <Card className="p-6 bg-emerald-50/50 border-emerald-100/50 rounded-3xl flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-2xl">🤖</div>
              <div className="space-y-1">
                <p className="font-black uppercase tracking-widest text-[10px]">Relay Bot</p>
                <Switch checked={settingsData.enableBot} onChange={(checked) => setSettingsData({ ...settingsData, enableBot: checked })} />
              </div>
            </Card>
            <Card className="p-6 bg-indigo-50/50 border-indigo-100/50 rounded-3xl flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl">📜</div>
              <div className="space-y-1">
                <p className="font-black uppercase tracking-widest text-[10px]">Extraction</p>
                <Switch checked={settingsData.enableSlipVerification} onChange={(checked) => setSettingsData({ ...settingsData, enableSlipVerification: checked })} />
              </div>
            </Card>
            <Card className="p-6 bg-purple-50/50 border-purple-100/50 rounded-3xl flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-2xl">🧠</div>
              <div className="space-y-1">
                <p className="font-black uppercase tracking-widest text-[10px]">Cognitive AI</p>
                <Switch checked={settingsData.enableAi} onChange={(checked) => setSettingsData({ ...settingsData, enableAi: checked })} />
              </div>
            </Card>
          </div>

          {/* AI Neuro Parameters */}
          <AnimatePresence>
            {settingsData.enableAi && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6 p-8 bg-slate-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 text-5xl font-black italic">NEURO CORE</div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4 text-purple-400">Cognitive Parameters</h3>
                <Textarea variant="glass" label="AI Behavioral System Prompt" value={settingsData.aiSystemPrompt} onChange={(e) => setSettingsData({ ...settingsData, aiSystemPrompt: e.target.value })} placeholder="Define the AI's persona and logic bounds..." rows={5} className="bg-white/5 border-white/10 text-white" />
                <div className="grid grid-cols-2 gap-6">
                  <Input variant="glass" type="number" step="0.1" min="0" max="1" label="Entropy Level (Temperature)" value={settingsData.aiTemperature} onChange={(e) => setSettingsData({ ...settingsData, aiTemperature: parseFloat(e.target.value) })} className="bg-white/5 border-white/10 text-white" />
                  <Input variant="glass" label="Link Failure Message" value={settingsData.aiFallbackMessage} onChange={(e) => setSettingsData({ ...settingsData, aiFallbackMessage: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Protocol Message Overrides */}
          <div className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 px-4">Downlink Message Overrides</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Extraction Latency Notice" value={settingsData.slipImmediateMessage} onChange={(e) => setSettingsData({ ...settingsData, slipImmediateMessage: e.target.value })} />
              <Input label="Resource Depletion Notice" value={settingsData.customQuotaExceededMessage} onChange={(e) => setSettingsData({ ...settingsData, customQuotaExceededMessage: e.target.value })} />
              <Input label="Offline Relay Notice" value={settingsData.customBotDisabledMessage} onChange={(e) => setSettingsData({ ...settingsData, customBotDisabledMessage: e.target.value })} />
              <Input label="Duplicate Vector Notice" value={settingsData.customDuplicateSlipMessage} onChange={(e) => setSettingsData({ ...settingsData, customDuplicateSlipMessage: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-4 pt-10 border-t border-slate-100">
            <Button variant="ghost" className="flex-1 font-bold" onClick={() => setShowSettingsModal(false)} disabled={isProcessing}>Discard</Button>
            <Button variant="primary" className="flex-[2] font-black tracking-widest uppercase h-14 rounded-2xl shadow-emerald-500/20 shadow-premium" onClick={handleSaveSettings} isLoading={isProcessing}>Synchronize Logic</Button>
          </div>
        </div>
      </Modal>

      {/* Node Analysis Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`Matrix Diagnostics: ${selectedAccount?.accountName}`} size="xl">
        {selectedAccount && (
          <div className="space-y-10 pt-2 max-h-[70vh] overflow-y-auto px-4 custom-scrollbar">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Signal Parameters</p>
                <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4">
                  <div><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Downlink ID</p><p className="font-mono text-xs font-black text-slate-900 break-all">{selectedAccount.channelId}</p></div>
                  <div><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Security Hash (Secret)</p><p className="font-mono text-xs font-black text-slate-400">••••••••••••••••••••••••</p></div>
                  <div><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Account Description</p><p className="text-sm font-medium text-slate-600">{selectedAccount.description || 'N/A'}</p></div>
                </div>
              </div>
              <div className="space-y-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Webhook Endpoint</p>
                <div className="p-8 h-full bg-slate-900 text-white rounded-[2.5rem] shadow-2xl flex flex-col justify-between">
                  <p className="text-[10px] font-mono font-black text-emerald-400 lowercase mb-4 leading-relaxed break-all opacity-80">{getWebhookUrl(selectedAccount.channelId)}</p>
                  <Button variant="primary" className="bg-white text-slate-900 h-10 px-4 text-[10px] font-black uppercase rounded-xl hover:bg-emerald-400 group" onClick={() => copyWebhookUrl(selectedAccount.channelId)}>
                    Copy Link Sequence <span className="ml-2 group-hover:translate-x-1 transition-transform inline-block">→</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] text-center shadow-premium-sm transition-transform hover:-translate-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Flux Volume</p>
                <p className="text-4xl font-black text-slate-900">{(selectedAccount.statistics?.totalMessages || 0).toLocaleString()}</p>
              </div>
              <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] text-center shadow-premium-sm transition-transform hover:-translate-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Asset Extraction</p>
                <p className="text-4xl font-black text-emerald-600">{(selectedAccount.statistics?.totalSlipsVerified || 0).toLocaleString()}</p>
              </div>
              <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] text-center shadow-premium-sm transition-transform hover:-translate-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Error Clusters</p>
                <p className="text-4xl font-black text-rose-500">{(selectedAccount.statistics?.totalSlipErrors || 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex gap-4 pt-10 border-t border-slate-100">
              <Button variant="ghost" className="flex-1 font-bold text-slate-400" onClick={() => setShowDetailModal(false)}>Close Interface</Button>
              <Button variant="secondary" className="flex-1 font-black uppercase" onClick={() => openEditModal(selectedAccount)}>Edit Identity</Button>
              <Button variant="danger" className="flex-1 font-black uppercase" onClick={() => setShowDeleteConfirm(true)}>Purge Node</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} title="Purge Node Integrity" message="Warning: This operation will permanently decouple the LINE node from the central matrix. All synchronized settings will be lost. This is a level-5 destructive action." confirmText="Purge Registry" type="danger" isLoading={isProcessing} />
      <ConfirmModal isOpen={showDisableConfirm} onClose={() => setShowDisableConfirm(false)} onConfirm={() => selectedAccount && handleToggleActive(selectedAccount)} title="Decouple Node Downlink" message="Confirm decoupling the selected node from the active signal relay. Transmission will cease until a new link is established." confirmText="Execute Decoupling" type="warning" isLoading={isProcessing} />

    </DashboardLayout>
  );
}
