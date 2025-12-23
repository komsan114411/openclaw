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
      <div className="space-y-6 max-w-[1600px] mx-auto animate-fade">
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-3">
            <IconButton variant="outline" onClick={() => router.back()} aria-label="Back">
              <span className="text-lg">←</span>
            </IconButton>
            <div>
              <h1 className="page-title">แชท</h1>
              <p className="page-subtitle">ตอบกลับลูกค้าจาก LINE OA ของคุณ</p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchUsers} isLoading={loadingUsers}>
            รีเฟรชรายชื่อ
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[70vh]">
          {/* Users */}
          <Card className="lg:col-span-4 p-0 overflow-hidden" variant="glass">
            <div className="p-6 border-b border-white/30 bg-white/30">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">รายชื่อผู้ใช้</p>
                <Badge variant="emerald" dot pulse>
                  {users.length} คน
                </Badge>
              </div>
              <Input
                placeholder="ค้นหา (ชื่อ/ID)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white/60 border-white/40"
              />
            </div>

            <div className="max-h-[70vh] overflow-y-auto no-scrollbar p-3 space-y-2">
              {loadingUsers ? (
                <div className="py-16 flex flex-col items-center gap-4">
                  <Spinner size="lg" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">กำลังโหลด...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-16 opacity-50">
                  <EmptyState
                    icon="🕳️"
                    title="ไม่พบรายการสนทนา"
                    description="เมื่อมีลูกค้าทักเข้ามา รายการจะปรากฏที่นี่"
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
                        'w-full text-left p-4 rounded-2xl transition-all border',
                        isActive
                          ? 'bg-slate-900 text-white border-white/10 shadow-premium'
                          : 'bg-white/60 hover:bg-white border-white/40'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className={cn(
                            'w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center border',
                            isActive ? 'bg-white/10 border-white/10' : 'bg-slate-50 border-slate-100'
                          )}>
                            {u.lineUserPicture ? (
                              <img src={u.lineUserPicture} alt={u.lineUserName} className="w-full h-full object-cover" />
                            ) : (
                              <span className={cn('font-black', isActive ? 'text-white/60' : 'text-slate-400')}>
                                {(u.lineUserName || '?').charAt(0)}
                              </span>
                            )}
                          </div>
                          {u.unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black rounded-lg px-2 py-0.5 border-2 border-white shadow-lg">
                              {u.unreadCount > 9 ? '9+' : u.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-black text-sm truncate', isActive ? 'text-white' : 'text-slate-900')}>
                            {u.lineUserName || 'Unknown'}
                          </p>
                          <p className={cn('text-xs truncate', isActive ? 'text-white/60' : 'text-slate-500')}>
                            {u.lastMessage || '—'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {/* Messages */}
          <Card className="lg:col-span-8 p-0 overflow-hidden" variant="glass">
            {selectedUser ? (
              <>
                <div className="p-6 border-b border-white/30 bg-white/30 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900/5 border border-white/40 flex items-center justify-center overflow-hidden">
                      {selectedUser.lineUserPicture ? (
                        <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-black text-slate-400">{(selectedUser.lineUserName || '?').slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 truncate">{selectedUser.lineUserName || 'Unknown'}</p>
                      <p className="text-[10px] font-mono text-slate-400 truncate">ID: {selectedUser.lineUserId}</p>
                    </div>
                  </div>
                  <IconButton
                    variant="outline"
                    onClick={() => fetchMessages(selectedUser.lineUserId)}
                    isLoading={loadingMessages}
                    aria-label="Refresh messages"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </IconButton>
                </div>

                <div className="h-[55vh] overflow-y-auto no-scrollbar p-6 bg-slate-50/30">
                  {loadingMessages ? (
                    <div className="py-20 flex flex-col items-center gap-4">
                      <Spinner size="lg" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">กำลังโหลดข้อความ...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-20 opacity-60">
                      <EmptyState icon="🧊" title="ยังไม่มีข้อความ" description="เมื่อมีการสนทนา ข้อความจะแสดงที่นี่" variant="glass" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((msg) => {
                        const isOut = msg.direction === 'out';
                        const imageUrl =
                          msg.messageType === 'image' && msg.messageId
                            ? chatMessagesApi.getImage(accountId, msg.messageId)
                            : null;

                        return (
                          <div key={msg._id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                            <div className={cn('max-w-[80%] space-y-1', isOut ? 'items-end' : 'items-start')}>
                              <div className={cn(
                                'p-4 rounded-3xl shadow-sm border',
                                isOut
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-900 border-slate-100'
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
                                    <p className="text-sm italic opacity-70">[รูปภาพ]</p>
                                  )
                                ) : msg.messageType === 'sticker' ? (
                                  <p className="text-sm italic opacity-70">[สติกเกอร์]</p>
                                ) : (
                                  <p className="text-[13px] font-medium whitespace-pre-wrap break-words">{msg.messageText}</p>
                                )}

                                <div className={cn(
                                  'mt-2 text-[10px] font-bold uppercase tracking-widest opacity-50',
                                  isOut ? 'text-white/60 text-right' : 'text-slate-400'
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

                <div className="p-5 bg-white border-t border-slate-100">
                  <div className="flex gap-3 items-end">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="พิมพ์ข้อความ... (Enter เพื่อส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                      className="input flex-1 min-h-[48px] max-h-32 resize-none"
                      rows={1}
                      disabled={sending}
                    />
                    <Button
                      variant="primary"
                      size="lg"
                      className="h-12"
                      onClick={handleSendMessage}
                      isLoading={sending}
                      disabled={sending || !newMessage.trim()}
                    >
                      ส่ง
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-10">
                <EmptyState
                  icon="👈"
                  title="เลือกผู้ใช้เพื่อเริ่มแชท"
                  description="คลิกที่รายชื่อทางซ้ายเพื่อดูประวัติและตอบกลับ"
                  variant="glass"
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
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
