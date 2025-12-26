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

    if (minutes < 1) return 'เมื่อกี้';
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
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

        {/* Neural Navigation Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-2">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-[1.8rem] flex items-center justify-center text-3xl shadow-inner border border-emerald-500/20 animate-pulse-subtle">🛰️</div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-[-0.04em] uppercase leading-none">
                Neural <span className="text-emerald-500 text-[0.8em] align-top ml-1">Live</span> Chat
              </h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                <span className="w-8 h-[2px] bg-emerald-500/30"></span>
                Uplink Active: Real-time Communication Matrix
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/60 backdrop-blur-2xl p-2.5 rounded-[2rem] border border-white shadow-premium">
            <div className="pl-6 pr-2 py-2 flex items-center gap-2 border-r border-slate-100/50 mr-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Account</span>
            </div>
            <Select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="w-72 border-none shadow-none bg-transparent font-black uppercase text-[11px] tracking-wider focus:ring-0 cursor-pointer"
            >
              <option value="">SELECT LINE IDENTITY</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.accountName}
                </option>
              ))}
            </Select>
            {selectedAccountId && (
              <IconButton
                variant="primary"
                size="md"
                className="rounded-2xl shadow-emerald-500/20 shadow-xl w-12 h-12"
                onClick={fetchUsers}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </IconButton>
            )}
          </div>
        </div>

        {!selectedAccountId ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white/40 backdrop-blur-3xl rounded-[4rem] border-4 border-dashed border-slate-200">
            <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center text-4xl mb-6 animate-pulse">📡</div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">ยังไม่ได้เลือกบัญชี</h3>
            <p className="text-slate-400 font-medium max-w-sm text-center">กรุณาเลือกบัญชี LINE OA เพื่อเริ่มการสนทนา</p>
          </div>
        ) : (
          <div className="flex-1 flex gap-6 min-h-0">

            {/* Personnel Manifest (User List) */}
            <Card className="w-[420px] flex flex-col p-0 bg-white/60 backdrop-blur-3xl border-none shadow-premium-lg rounded-[3.5rem] overflow-hidden">
              <div className="p-8 border-b border-slate-100/50 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Personnel Manifest</p>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Active Transmissions</h3>
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] uppercase px-3 py-1 animate-pulse">Live Feed</Badge>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-300 group-focus-within:text-emerald-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <Input
                    placeholder="Search Signal Alias..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-slate-50/50 border-none rounded-2xl h-14 text-[13px] pl-12 font-bold focus:bg-white shadow-inner transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3 custom-scrollbar">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-6">
                    <Spinner size="lg" className="text-emerald-500" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] animate-pulse">Syncing Manifest...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-24 opacity-30">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Zero Signals Detected</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filteredUsers.map((user) => (
                      <motion.div
                        key={user.lineUserId}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => handleSelectUser(user)}
                        className={cn(
                          "relative p-5 rounded-[2.2rem] cursor-pointer transition-all duration-500 group overflow-hidden border border-transparent",
                          selectedUser?.lineUserId === user.lineUserId
                            ? "bg-slate-900 text-white shadow-2xl shadow-slate-900/20"
                            : "hover:bg-white hover:shadow-premium"
                        )}
                      >
                        <div className="flex items-center gap-5 relative z-10">
                          <div className="relative">
                            <div className={cn(
                              "w-16 h-16 rounded-[1.6rem] overflow-hidden border-2 shadow-inner transition-colors duration-500 flex items-center justify-center",
                              selectedUser?.lineUserId === user.lineUserId ? "bg-white/10 border-white/20" : "bg-slate-50 border-white"
                            )}>
                              {user.lineUserPicture ? (
                                <img src={user.lineUserPicture} alt={user.lineUserName} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                              ) : (
                                <span className="font-black text-xl opacity-30 uppercase italic">{user.lineUserName?.charAt(0) || '?'}</span>
                              )}
                            </div>
                            {user.unreadCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black rounded-lg px-2.5 py-1 shadow-lg border-2 border-white animate-bounce-subtle">
                                {user.unreadCount > 9 ? '9+' : user.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="font-black text-[13px] truncate uppercase tracking-tight">{user.lineUserName}</p>
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest opacity-40 transition-colors",
                                selectedUser?.lineUserId === user.lineUserId ? "text-emerald-400 opacity-100" : "group-hover:opacity-70"
                              )}>
                                {formatLastSeen(user.lastMessageTime)}
                              </span>
                            </div>
                            <p className={cn(
                              "text-xs font-medium truncate opacity-40 transition-all",
                              selectedUser?.lineUserId === user.lineUserId ? "opacity-80 font-bold" : "group-hover:opacity-60"
                            )}>
                              {user.lastMessage || 'Signal Initialized'}
                            </p>
                          </div>
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            selectedUser?.lineUserId === user.lineUserId ? "bg-emerald-400" : "bg-slate-100 group-hover:bg-emerald-200"
                          )} />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </Card>

            {/* Neural Interface (Chat Area) */}
            <Card className="flex-1 flex flex-col p-0 bg-white/80 backdrop-blur-3xl border-none shadow-premium-lg rounded-[4.5rem] overflow-hidden">
              {selectedUser ? (
                <>
                  {/* Uplink Header */}
                  <div className="p-10 border-b border-slate-100/50 flex items-center justify-between bg-white/40 backdrop-blur-md">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 rounded-[2.5rem] bg-white border border-slate-100 shadow-premium overflow-hidden flex items-center justify-center p-1">
                        <div className="w-full h-full rounded-[2rem] overflow-hidden">
                          {selectedUser.lineUserPicture ? (
                            <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-50 flex items-center justify-center font-black text-2xl text-slate-300 italic uppercase">
                              {selectedUser.lineUserName?.slice(0, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1.5">
                          <h2 className="text-3xl font-black text-slate-900 tracking-[-0.04em] uppercase">{selectedUser.lineUserName}</h2>
                          <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Active Link</span>
                          </div>
                        </div>
                        <p className="text-[10px] font-mono font-black text-slate-400 tracking-[0.2em] uppercase opacity-70">Registry ID: {selectedUser.lineUserId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <IconButton
                        variant="glass"
                        size="lg"
                        className="rounded-2xl shadow-premium-sm w-14 h-14 bg-white/50 border-white hover:bg-white"
                        onClick={() => fetchMessages(selectedUser.lineUserId)}
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </IconButton>
                    </div>
                  </div>

                  {/* Downlink Feed */}
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-12 space-y-8 bg-slate-50/10 custom-scrollbar relative"
                  >
                    <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
                      style={{ backgroundImage: 'radial-gradient(#10b981 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

                    {loadingMessages ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-6 animate-fade">
                        <div className="w-16 h-16 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] animate-pulse">Retrieving Encrypted Feed...</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-32 opacity-20">
                        <div className="w-24 h-24 rounded-[2.5rem] bg-slate-100 flex items-center justify-center text-4xl mb-6">🧊</div>
                        <p className="text-xs font-black uppercase tracking-[0.6em] text-slate-400">Zero Transmissions</p>
                      </div>
                    ) : (
                      <div className="relative z-10 space-y-8">
                        {messages.map((msg, idx) => (
                          <motion.div
                            key={msg._id}
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={cn("flex w-full", msg.direction === 'out' ? 'justify-end' : 'justify-start')}
                          >
                            <div className={cn(
                              "max-w-[70%] space-y-2",
                              msg.direction === 'out' ? "items-end text-right" : "items-start text-left"
                            )}>
                              <div className={cn(
                                "group relative p-6 rounded-[2.8rem] transition-all duration-500",
                                msg.direction === 'out'
                                  ? "bg-slate-900 text-white rounded-br-2xl shadow-2xl shadow-slate-900/10"
                                  : "bg-white text-slate-900 rounded-bl-2xl shadow-premium border border-slate-100 hover:border-emerald-100"
                              )}>
                                {msg.messageType === 'image' ? (
                                  <div className="relative group/img overflow-hidden rounded-[2rem] shadow-2xl">
                                    {msg.messageId ? (
                                      <img
                                        src={chatMessagesApi.getImage(selectedAccountId, msg.messageId)}
                                        alt="Received image"
                                        className="max-w-full rounded-[2rem] cursor-pointer hover:scale-110 transition-transform duration-1000"
                                        onClick={() => window.open(chatMessagesApi.getImage(selectedAccountId, msg.messageId!), '_blank')}
                                      />
                                    ) : (
                                      <div className="p-10 bg-slate-100 rounded-[2rem] text-slate-400 text-xs font-black uppercase tracking-widest">[Image Data Corrupted]</div>
                                    )}
                                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/img:opacity-100 transition-all duration-500 flex items-center justify-center backdrop-blur-sm">
                                      <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] font-mono">Expand Identity Visualization</span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-[14px] font-bold leading-relaxed tracking-tight whitespace-pre-wrap break-words">{msg.messageText}</p>
                                )}

                                <div className={cn(
                                  "flex items-center gap-3 mt-4 opacity-0 group-hover:opacity-40 transition-all duration-500",
                                  msg.direction === 'out' ? "justify-end" : "justify-start"
                                )}>
                                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">{formatTime(msg.createdAt)}</span>
                                  {msg.direction === 'out' && msg.sentBy && (
                                    <>
                                      <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 italic">OP: {msg.sentBy}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Command Console (Input) */}
                  <div className="p-10 bg-white/40 backdrop-blur-2xl border-t border-slate-100/50">
                    <div className="relative group bg-white flex items-center p-3 pr-5 rounded-[3rem] border border-slate-100 focus-within:border-slate-900/10 focus-within:shadow-2xl transition-all shadow-premium-sm">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Transmit response protocol..."
                        disabled={sending}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-[14px] font-bold text-slate-900 placeholder:text-slate-300 custom-scrollbar py-4 px-8 h-14 max-h-40 min-h-14 resize-none"
                        rows={1}
                      />
                      <Button
                        variant="primary"
                        size="lg"
                        className="rounded-[1.8rem] h-14 px-10 font-black uppercase tracking-[0.2em] text-[11px] shadow-emerald-500/20 shadow-2xl transition-all hover:scale-105 active:scale-95"
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                        isLoading={sending}
                      >
                        Launch
                      </Button>
                    </div>
                    <div className="mt-4 flex justify-between items-center px-8">
                      <div className="flex gap-6">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/30" />
                          Secure Uplink Established
                        </p>
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] opacity-40">MIME-Ready Matrix</p>
                      </div>
                      <p className="text-[9px] font-black text-slate-200 uppercase tracking-widest italic">V2.0 Neural Routing Active</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-24 animate-in fade-in zoom-in duration-1000">
                  <div className="w-40 h-40 bg-slate-50 rounded-[4rem] flex items-center justify-center text-6xl shadow-inner mb-10 group hover:scale-110 transition-transform duration-700">
                    <span className="grayscale opacity-20 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">💬</span>
                  </div>
                  <h4 className="text-3xl font-black text-slate-900 uppercase tracking-[0.3em] mb-4">Neural Standby</h4>
                  <p className="text-[10px] font-black text-slate-400 text-center max-w-sm leading-loose uppercase tracking-[0.25em]">Initialize communication by selecting a verified personnel signal from the manifest.</p>
                </div>
              )}
            </Card>

          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.05);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.2);
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
          <PageLoading message="กำลังเตรียมระบบแชท..." />
        </div>
      </DashboardLayout>
    }>
      <AdminChatContent />
    </Suspense>
  );
}
