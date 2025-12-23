'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, lineAccountsApi, chatMessagesApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Spinner, PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

interface ChatUser {
  lineUserId: string;
  lineUserName: string;
  lineUserPicture?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

interface ChatMessage {
  _id: string;
  messageId?: string;
  direction: 'in' | 'out';
  messageType: string;
  messageText?: string;
  createdAt: string;
  lineUserName?: string;
  sentBy?: string;
}

function AdminChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accountId);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await lineAccountsApi.getAll();
      setAccounts(response.data.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!selectedAccountId) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/chat-messages/${selectedAccountId}/users`);
      if (response.data.success) {
        setUsers(response.data.users || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  const fetchMessages = useCallback(async (userId: string) => {
    if (!selectedAccountId) return;
    setLoadingMessages(true);
    try {
      const response = await api.get(`/chat-messages/${selectedAccountId}/${userId}`);
      if (response.data.success) {
        setMessages(response.data.messages || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลดข้อความได้');
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchUsers();
    setSelectedUser(null);
    setMessages([]);
  }, [selectedAccountId, fetchUsers]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.lineUserId);
    }
  }, [selectedUser, fetchMessages]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelectAccount = (id: string) => {
    setSelectedAccountId(id);
    router.push(`/admin/chat?accountId=${id}`, { scroll: false });
  };

  const handleSelectUser = (user: ChatUser) => {
    setSelectedUser(user);
    setMessages([]);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || sending || !selectedAccountId) return;

    setSending(true);
    try {
      const response = await api.post(
        `/chat-messages/${selectedAccountId}/${selectedUser.lineUserId}/send`,
        { message: newMessage }
      );

      if (response.data.success) {
        setNewMessage('');
        await fetchMessages(selectedUser.lineUserId);
      } else {
        toast.error(response.data.error || 'ไม่สามารถส่งข้อความได้');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถส่งข้อความได้');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatLastSeen = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' });
  };

  const filteredUsers = users.filter(user =>
    user.lineUserName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lineUserId.includes(searchTerm)
  );

  const selectedAccount = accounts.find(a => a._id === selectedAccountId);

  return (
    <DashboardLayout requiredRole="admin">
      <div className="h-[calc(100vh-140px)] flex flex-col space-y-6 max-w-[1600px] mx-auto animate-fade">

        {/* Superior Navigation Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-xl shadow-inner">🛰️</div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase">Signal Relay</h1>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Real-time LINE communication downlink</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/60 backdrop-blur-xl p-2 rounded-2xl border border-white shadow-premium-sm">
            <Select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="w-64 border-none shadow-none bg-transparent font-black uppercase text-xs"
            >
              <option value="">Select Frequency Node</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.accountName}
                </option>
              ))}
            </Select>
            {selectedAccountId && (
              <IconButton
                variant="primary"
                size="sm"
                className="rounded-xl shadow-emerald-500/20 shadow-lg"
                onClick={fetchUsers}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </IconButton>
            )}
          </div>
        </div>

        {!selectedAccountId ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white/40 backdrop-blur-3xl rounded-[4rem] border-4 border-dashed border-slate-200">
            <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-4xl mb-6 animate-pulse">📡</div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">No Uplink Established</h3>
            <p className="text-slate-400 font-medium max-w-sm text-center">Establish a connection by selecting a LINE integration node from the frequency selector above.</p>
          </div>
        ) : (
          <div className="flex-1 flex gap-6 min-h-0">

            {/* Personnel Manifest (User List) */}
            <Card className="w-[380px] flex flex-col p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3rem] overflow-hidden">
              <div className="p-6 border-b border-slate-100 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Active Subjects</p>
                  <Badge variant="emerald" className="animate-pulse">Live Feed</Badge>
                </div>
                <Input
                  placeholder="Search by Alias or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-50 border-none rounded-2xl h-12 text-sm"
                />
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 custom-scrollbar">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Spinner size="lg" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Scanning Signal...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-20">
                    <p className="text-xs font-black text-slate-300 uppercase tracking-[0.15em]">Terminal Void</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredUsers.map((user) => (
                      <motion.div
                        key={user.lineUserId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => handleSelectUser(user)}
                        className={cn(
                          "relative p-4 rounded-[1.8rem] cursor-pointer transition-all duration-500 group overflow-hidden border border-transparent",
                          selectedUser?.lineUserId === user.lineUserId
                            ? "bg-slate-900 text-white shadow-2xl shadow-slate-900/10 border-white/5"
                            : "hover:bg-white hover:shadow-premium-sm"
                        )}
                      >
                        {selectedUser?.lineUserId === user.lineUserId && (
                          <motion.div
                            layoutId="activeUserSlot"
                            className="absolute inset-0 bg-slate-900 -z-10"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                          />
                        )}
                        <div className="flex items-center gap-4 relative z-10">
                          <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden border border-white/10 shadow-inner">
                              {user.lineUserPicture ? (
                                <img src={user.lineUserPicture} alt={user.lineUserName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-black text-lg opacity-40">{user.lineUserName?.charAt(0) || '?'}</span>
                              )}
                            </div>
                            {user.unreadCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black rounded-lg px-2 py-0.5 shadow-lg border-2 border-white">
                                {user.unreadCount > 9 ? '9+' : user.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="font-black text-sm truncate uppercase tracking-tight">{user.lineUserName}</p>
                              <span className={cn("text-[10px] font-bold uppercase tracking-widest opacity-40", selectedUser?.lineUserId === user.lineUserId && "text-emerald-400 opacity-100")}>
                                {formatLastSeen(user.lastMessageTime)}
                              </span>
                            </div>
                            <p className={cn("text-xs font-medium truncate opacity-50", selectedUser?.lineUserId === user.lineUserId && "opacity-80 font-bold")}>
                              {user.lastMessage || 'Channel Established'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </Card>

            {/* Neural Interface (Chat Area) */}
            <Card className="flex-1 flex flex-col p-0 bg-white/80 backdrop-blur-3xl border-none shadow-premium-lg rounded-[4rem] overflow-hidden">
              {selectedUser ? (
                <>
                  {/* Uplink Header */}
                  <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white/30">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-[2rem] bg-slate-50 border border-white shadow-premium-sm overflow-hidden flex items-center justify-center">
                        {selectedUser.lineUserPicture ? (
                          <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl font-black text-slate-300 lowercase italic">{selectedUser.lineUserName?.slice(0, 2)}</span>
                        )}
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tighter leading-none mb-1 uppercase">{selectedUser.lineUserName} <span className="text-emerald-500 opacity-20 ml-2 animate-pulse">●</span></h2>
                        <p className="text-[10px] font-mono font-black text-slate-400 tracking-widest uppercase opacity-70">SUBJECT_ID: {selectedUser.lineUserId}</p>
                      </div>
                    </div>
                    <IconButton variant="glass" size="lg" className="rounded-2xl shadow-premium-sm" onClick={() => fetchMessages(selectedUser.lineUserId)}>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </IconButton>
                  </div>

                  {/* Downlink Feed */}
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/20 custom-scrollbar"
                    style={{
                      backgroundImage: `radial-gradient(circle at 2px 2px, rgba(16, 185, 129, 0.05) 1px, transparent 0)`,
                      backgroundSize: '32px 32px'
                    }}
                  >
                    {loadingMessages ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Spinner size="lg" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Decoding Feed...</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20">
                        <p className="text-6xl mb-4">🧊</p>
                        <p className="text-xs font-black uppercase tracking-[0.5em]">Frozen Data Link</p>
                      </div>
                    ) : (
                      <AnimatePresence>
                        {messages.map((msg, idx) => (
                          <motion.div
                            key={msg._id}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={cn("flex w-full px-2", msg.direction === 'out' ? 'justify-end' : 'justify-start')}
                          >
                            <div className={cn(
                              "max-w-[75%] space-y-1.5",
                              msg.direction === 'out' ? "items-end" : "items-start"
                            )}>
                              <div className={cn(
                                "group relative p-5 rounded-[2.2rem] shadow-premium transition-all duration-300",
                                msg.direction === 'out'
                                  ? "bg-slate-900 text-white rounded-br-lg shadow-slate-900/5 hover:shadow-slate-900/10"
                                  : "bg-white text-slate-900 rounded-bl-lg border border-slate-100/50 hover:bg-slate-50"
                              )}>
                                {msg.messageType === 'image' ? (
                                  <div className="relative group/img overflow-hidden rounded-2xl">
                                    {msg.messageId ? (
                                      <img
                                        src={chatMessagesApi.getImage(selectedAccountId, msg.messageId)}
                                        alt="Received image"
                                        className="max-w-full rounded-2xl cursor-pointer hover:scale-105 transition-transform duration-700"
                                        onClick={() => window.open(chatMessagesApi.getImage(selectedAccountId, msg.messageId!), '_blank')}
                                      />
                                    ) : (
                                      <div className="p-6 bg-slate-100 rounded-2xl text-slate-500 text-sm font-bold">[รูปภาพ]</div>
                                    )}
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white font-black text-xs uppercase italic">Expand Interface</div>
                                  </div>
                                ) : (
                                  <p className="text-[13px] font-medium leading-relaxed whitespace-pre-wrap break-words">{msg.messageText}</p>
                                )}

                                <div className={cn(
                                  "flex items-center gap-2 mt-3 opacity-30 text-[9px] font-black uppercase tracking-widest transition-opacity group-hover:opacity-60",
                                  msg.direction === 'out' ? "justify-end" : "justify-start"
                                )}>
                                  <span>{formatTime(msg.createdAt)}</span>
                                  {msg.direction === 'out' && msg.sentBy && (
                                    <>
                                      <span>•</span>
                                      <span className="text-emerald-400 uppercase italic">OPERATOR: {msg.sentBy}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>

                  {/* Command Console (Input) */}
                  <div className="p-8 bg-white border-t border-slate-100">
                    <div className="relative group bg-slate-50 flex items-center p-2 pr-4 rounded-[2.5rem] border border-slate-100 group-focus-within:border-slate-900 transition-all shadow-inner">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Type a command or response..."
                        disabled={sending}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-[13px] font-medium placeholder:text-slate-300 custom-scrollbar py-3 px-6 h-12 max-h-32 min-h-12 resize-none"
                        rows={1}
                      />
                      <Button
                        variant="primary"
                        size="lg"
                        className="rounded-2xl h-11 px-8 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/20 shadow-premium"
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                        isLoading={sending}
                      >
                        Broadcast
                      </Button>
                    </div>
                    <div className="mt-3 flex gap-4 px-4">
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Protocol: Secured downlink</p>
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest opacity-40">Markdown allowed</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-20 opacity-30">
                  <div className="w-32 h-32 bg-slate-100 rounded-[3.5rem] flex items-center justify-center text-5xl mb-8 grayscale">💬</div>
                  <h4 className="text-2xl font-black text-slate-900 uppercase tracking-[0.2em] mb-4">Neural Link Standby</h4>
                  <p className="text-xs font-bold text-center max-w-xs leading-relaxed uppercase tracking-widest">Select a persona from the downlink manifest to initiate high-fidelity interaction stream.</p>
                </div>
              )}
            </Card>

          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.3);
        }
      `}</style>
    </DashboardLayout>
  );
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={
      <DashboardLayout requiredRole="admin">
        <div className="flex items-center justify-center min-h-[60vh]">
          <PageLoading message="Synchronizing Frequencies..." />
        </div>
      </DashboardLayout>
    }>
      <AdminChatContent />
    </Suspense>
  );
}
