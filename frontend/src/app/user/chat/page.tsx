'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { chatMessagesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageLoading, Spinner } from '@/components/ui/Loading';
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
  sentBy?: string;
}

function UserChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    if (!accountId) {
      setUsers([]);
      setLoadingUsers(false);
      return;
    }
    setLoadingUsers(true);
    try {
      const res = await chatMessagesApi.getUsers(accountId);
      if (res.data?.success) {
        setUsers(res.data.users || []);
      } else {
        setUsers([]);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้');
    } finally {
      setLoadingUsers(false);
    }
  }, [accountId]);

  const fetchMessages = useCallback(async (userId: string) => {
    if (!accountId) return;
    setLoadingMessages(true);
    try {
      const res = await chatMessagesApi.getMessages(accountId, userId);
      if (res.data?.success) {
        setMessages(res.data.messages || []);
      } else {
        setMessages([]);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลดข้อความได้');
    } finally {
      setLoadingMessages(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.lineUserId);
    } else {
      setMessages([]);
    }
  }, [selectedUser, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingMessages]);

  const handleSendMessage = async () => {
    if (!accountId || !selectedUser || !newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await chatMessagesApi.sendMessage(accountId, selectedUser.lineUserId, newMessage.trim());
      if (res.data?.success) {
        setNewMessage('');
        await fetchMessages(selectedUser.lineUserId);
      } else {
        toast.error(res.data?.error || 'ไม่สามารถส่งข้อความได้');
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

  const filteredUsers = users.filter((u) => {
    const hay = `${u.lineUserName || ''} ${u.lineUserId}`.toLowerCase();
    return hay.includes(searchTerm.toLowerCase());
  });

  if (!accountId) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="💬"
          title="ไม่พบ Account ID"
          description="กรุณาเลือกบัญชี LINE จากหน้า LINE Accounts ก่อน"
          action={
            <Button variant="primary" onClick={() => router.push('/user/line-accounts')}>
              ไปหน้า LINE Accounts
            </Button>
          }
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 max-w-[1600px] mx-auto animate-fade h-[calc(100vh-120px)] md:h-auto">
        <div className="page-header relative z-10 flex-col sm:flex-row items-start sm:items-center">
          <div className="space-y-1 sm:space-y-2">
            <h1 className="page-title-responsive">
              Neural <span className="text-emerald-400">Communication</span>
            </h1>
            <p className="text-slate-400 font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg tracking-[0.2em] opacity-60 uppercase">
              Mission Control <span className="text-white">& Interaction Ledger</span>
            </p>
          </div>
          <Button variant="outline" size="lg" onClick={fetchUsers} isLoading={loadingUsers} className="w-full sm:w-auto h-14 rounded-2xl bg-white/[0.03] border-white/5 shadow-2xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-500/10 hover:text-emerald-400">
            SYNC_REGISTRY
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 flex-1 min-h-0">
          {/* Mobile User Selector */}
          <div className="lg:hidden">
            <Card className="p-3" variant="glass">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {selectedUser ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 text-white flex items-center justify-center overflow-hidden">
                        {selectedUser.lineUserPicture ? (
                          <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-black text-sm">{(selectedUser.lineUserName || '?').charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate text-sm uppercase tracking-tight">{selectedUser.lineUserName || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{users.length} NODES</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">INITIALIZE_SESSION...</p>
                  )}
                </div>
                <select
                  value={selectedUser?.lineUserId || ''}
                  onChange={(e) => {
                    const user = users.find(u => u.lineUserId === e.target.value);
                    if (user) setSelectedUser(user);
                  }}
                  className="px-3 py-2 bg-white/[0.03] border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white focus:ring-1 focus:ring-emerald-500 transition-all outline-none"
                >
                  <option value="" className="bg-slate-900 text-slate-500">SELECT_NODE...</option>
                  {users.map(u => (
                    <option key={u.lineUserId} value={u.lineUserId} className="bg-slate-900 text-white">
                      {u.lineUserName || u.lineUserId} {u.unreadCount > 0 ? `[SIGNAL: ${u.unreadCount}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </Card>
          </div>

          <Card className="hidden lg:block lg:col-span-4 p-0 overflow-hidden bg-black/40 border border-white/5 shadow-2xl rounded-[2.5rem]" variant="glass">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">User Registry</p>
                <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border-white/5 font-black text-[9px] px-3 py-1 rounded-lg">
                  {users.length} NODES
                </Badge>
              </div>
              <Input
                placeholder="QUERY_REGISTRY..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white/[0.03] border-white/5 h-12 rounded-xl text-white font-black text-[10px] tracking-widest placeholder:text-slate-600"
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto no-scrollbar p-3 space-y-2">
              {loadingUsers ? (
                <div className="py-20 flex flex-col items-center gap-4">
                  <Spinner size="lg" />
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Acquiring Data...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-20 opacity-40">
                  <EmptyState
                    icon="🧊"
                    title="NO_ACTIVE_SESSIONS"
                    description="Waiting for incoming neural signals."
                    variant="glass"
                  />
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isActive = selectedUser?.lineUserId === u.lineUserId;
                  return (
                    <button
                      key={u.lineUserId}
                      onClick={() => setSelectedUser(u)}
                      className={cn(
                        'w-full text-left p-4 rounded-3xl transition-all duration-500 border group',
                        isActive
                          ? 'bg-slate-900 text-white border-white/10 shadow-emerald-500/10'
                          : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/5'
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative flex-shrink-0">
                          <div className={cn(
                            'w-12 h-12 rounded-[1.2rem] overflow-hidden flex items-center justify-center border transition-all duration-500 group-hover:scale-110',
                            isActive ? 'bg-white/10 border-white/10' : 'bg-white/5 border-white/5'
                          )}>
                            {u.lineUserPicture ? (
                              <img src={u.lineUserPicture} alt={u.lineUserName} className="w-full h-full object-cover" />
                            ) : (
                              <span className={cn('font-black text-lg', isActive ? 'text-white' : 'text-slate-500')}>
                                {(u.lineUserName || '?').charAt(0)}
                              </span>
                            )}
                          </div>
                          {u.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-lg px-2 py-0.5 border-2 border-black shadow-lg">
                              {u.unreadCount > 9 ? '9+' : u.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-black text-xs truncate uppercase tracking-tight', isActive ? 'text-white' : 'text-slate-300')}>
                            {u.lineUserName || 'Unknown'}
                          </p>
                          <p className={cn('text-[10px] truncate uppercase tracking-widest group-hover:text-emerald-400 transition-colors', isActive ? 'text-white/60' : 'text-slate-500')}>
                            {u.lastMessage || 'NO_PAYLOAD'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="lg:col-span-8 p-0 overflow-hidden flex flex-col bg-black/40 border border-white/5 shadow-2xl rounded-[3rem]" variant="glass">
            {selectedUser ? (
              <>
                <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {selectedUser.lineUserPicture ? (
                        <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-slate-500 text-lg">{(selectedUser.lineUserName || '?').charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-white truncate text-base uppercase tracking-tight">{selectedUser.lineUserName || 'Unknown'}</p>
                      <p className="text-[10px] font-mono font-black text-emerald-400 truncate tracking-widest">NODE_ID: {selectedUser.lineUserId}</p>
                    </div>
                  </div>
                  <IconButton
                    variant="ghost"
                    onClick={() => fetchMessages(selectedUser.lineUserId)}
                    disabled={loadingMessages}
                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-all disabled:opacity-50"
                  >
                    {loadingMessages ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </IconButton>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-6 bg-black/20 min-h-[50vh]">
                  {loadingMessages ? (
                    <div className="py-24 flex flex-col items-center gap-4">
                      <Spinner size="lg" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Sync...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-24 opacity-60">
                      <EmptyState icon="🧊" title="SESSION_VOID" description="No interaction metadata found." variant="glass" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {messages.map((msg) => {
                        const isOut = msg.direction === 'out';
                        const imageUrl =
                          msg.messageType === 'image' && msg.messageId
                            ? chatMessagesApi.getImage(accountId, msg.messageId)
                            : null;

                        return (
                          <div key={msg._id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                            <div className={cn('max-w-[80%] space-y-2', isOut ? 'items-end' : 'items-start')}>
                              <div className={cn(
                                'p-4 rounded-[1.8rem] shadow-2xl border transition-all duration-500',
                                isOut
                                  ? 'bg-slate-900 text-white border-white/10 rounded-tr-none'
                                  : 'bg-white/[0.03] text-white border-white/5 rounded-tl-none backdrop-blur-md'
                              )}>
                                {msg.messageType === 'image' ? (
                                  imageUrl ? (
                                    <img
                                      src={imageUrl}
                                      alt="LINE image"
                                      className="max-w-full rounded-2xl cursor-zoom-in"
                                      onClick={() => window.open(imageUrl, '_blank')}
                                    />
                                  ) : (
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40">[IMAGE_PAYLOAD]</p>
                                  )
                                ) : msg.messageType === 'sticker' ? (
                                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">[STICKER_SIGNAL]</p>
                                ) : (
                                  <p className="text-[13px] font-medium whitespace-pre-wrap break-words leading-relaxed">{msg.messageText}</p>
                                )}

                                <div className={cn(
                                  'mt-3 text-[9px] font-black uppercase tracking-widest opacity-40',
                                  isOut ? 'text-emerald-400 text-right' : 'text-slate-500'
                                )}>
                                  {formatTime(msg.createdAt)}{isOut && msg.sentBy ? ` • ${msg.sentBy}` : ''}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="p-6 bg-white/[0.02] border-t border-white/5 pb-10 sm:pb-6">
                  <div className="flex gap-4 items-end">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="ENTER_PAYLOAD_CIPHER..."
                      className="flex-1 min-h-[56px] max-h-48 resize-none bg-white/[0.03] border-white/5 rounded-2xl px-6 py-4 text-white font-medium text-[13px] focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-slate-600 outline-none"
                      rows={1}
                      disabled={sending}
                    />
                    <Button
                      variant="primary"
                      size="lg"
                      className="h-14 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 font-black uppercase tracking-widest text-[11px] shadow-emerald-500/20"
                      onClick={handleSendMessage}
                      isLoading={sending}
                      disabled={sending || !newMessage.trim()}
                    >
                      TRANSMIT
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 md:p-10 flex-1 flex items-center justify-center">
                <EmptyState
                  icon="👈"
                  title="INITIALIZE_COMMUNICATION"
                  description="Awaiting selection for interaction protocol."
                  variant="glass"
                />
              </div>
            )}
          </Card>
        </div>
      </div >
    </DashboardLayout >
  );
}

export default function UserChatPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <PageLoading message="กำลังเปิดหน้าจอแชท..." />
        </DashboardLayout>
      }
    >
      <UserChatContent />
    </Suspense>
  );
}
