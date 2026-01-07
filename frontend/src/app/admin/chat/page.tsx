'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, chatMessagesApi } from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import { AxiosError } from 'axios';
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
  const socketRef = useRef<Socket | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const lastMessageIdRef = useRef<string>('');
  const isInitialLoadRef = useRef<boolean>(true);
  const selectedUserRef = useRef<ChatUser | null>(null); // Track current user for socket
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Update ref when selectedUser changes
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Real-time WebSocket connection
  useEffect(() => {
    if (!selectedAccountId) return;

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(`${backendUrl}/ws`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Admin socket connected:', socket.id);
      // Subscribe to this LINE account's chat room
      socket.emit('subscribe_chat', { lineAccountId: selectedAccountId });
      // Join admin room for global notifications
      socket.emit('join', { userId: 'admin', role: 'admin' });
    });

    socket.on('message_received', (data: any) => {
      // Only process messages for the current selected account
      if (data.lineAccountId === selectedAccountId) {
        // Update messages if viewing this user's chat (check against REF to avoid stale closure)
        if (selectedUserRef.current && data.lineUserId === selectedUserRef.current.lineUserId) {
          setMessages((prev) => {
            // Prevent duplicates
            const exists = prev.some(
              (m) => m._id === data._id || (data.messageId && m.messageId === data.messageId)
            );
            if (exists) return prev;

            const newMessage: ChatMessage = {
              _id: data._id,
              messageId: data.messageId,
              direction: data.direction,
              messageType: data.messageType,
              messageText: data.messageText,
              createdAt: data.createdAt,
              lineUserName: data.lineUserName,
              sentBy: data.sentBy,
            };

            return [...prev, newMessage];
          });
        }

        // Update user list (new message notification)
        setUsers((prev) => {
          const userIndex = prev.findIndex((u) => u.lineUserId === data.lineUserId);
          if (userIndex === -1) {
            // New user - add to list
            return [
              {
                lineUserId: data.lineUserId,
                lineUserName: data.lineUserName || 'Unknown User',
                lineUserPicture: data.lineUserPicture,
                lastMessage: data.messageText,
                lastMessageTime: data.createdAt,
                unreadCount: data.direction === 'in' ? 1 : 0,
              },
              ...prev,
            ];
          }

          // Existing user - update last message
          const updated = [...prev];
          const isCurrentChat = selectedUserRef.current?.lineUserId === data.lineUserId;

          updated[userIndex] = {
            ...updated[userIndex],
            lastMessage: data.messageText,
            lastMessageTime: data.createdAt,
            unreadCount:
              data.direction === 'in' && !isCurrentChat
                ? (updated[userIndex].unreadCount || 0) + 1
                : updated[userIndex].unreadCount,
          };

          // Move to top of list
          const [user] = updated.splice(userIndex, 1);
          return [user, ...updated];
        });
      }
    });

    const handleConnect = () => {
      console.log('Admin socket connected/reconnected');
      socket.emit('subscribe_chat', { lineAccountId: selectedAccountId });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => {
      console.log('Admin socket disconnected');
    });

    // Initial subscription (in case socket was already connected)
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.emit('unsubscribe_chat', { lineAccountId: selectedAccountId });
      socket.disconnect();
    };
  }, [selectedAccountId, selectedUser]);

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
      const response = await chatMessagesApi.getUsers(selectedAccountId);
      if (response.data.success) {
        setUsers(response.data.users || []);
      }
    } catch (err) {
      toast.error((err as AxiosError<{ message?: string }>).response?.data?.message || 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  const fetchMessages = useCallback(async (userId: string) => {
    if (!selectedAccountId) return;
    setLoadingMessages(true);
    try {
      const response = await chatMessagesApi.getMessages(selectedAccountId, userId);
      if (response.data.success) {
        setMessages(response.data.messages || []);
      }
    } catch (err) {
      toast.error((err as AxiosError<{ message?: string }>).response?.data?.message || 'ไม่สามารถโหลดข้อความได้');
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

  // Fetch messages ONCE when selecting a user (no polling)
  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.lineUserId);

      // Reset scroll state for new user
      isInitialLoadRef.current = true;
      lastMessageIdRef.current = '';
      setHasNewMessage(false);
    } else {
      setMessages([]);
    }
    // NO POLLING - WebSocket handles real-time updates
  }, [selectedUser, fetchMessages]);

  // Check if user is at bottom of scroll
  const checkIfAtBottom = useCallback(() => {
    if (!messagesContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  // Handle scroll event - update isAtBottom state
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    if (atBottom && hasNewMessage) {
      setHasNewMessage(false);
    }
  }, [checkIfAtBottom, hasNewMessage]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setHasNewMessage(false);
      isAtBottomRef.current = true;
    }
  }, []);

  // Smart scroll: detect truly NEW messages by comparing last message ID
  useLayoutEffect(() => {
    if (messages.length === 0) {
      lastMessageIdRef.current = '';
      isInitialLoadRef.current = true;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const currentLastId = lastMessage?._id || '';
    const prevLastId = lastMessageIdRef.current;

    // Compare last message ID - if same, this is just polling refresh
    if (currentLastId === prevLastId) {
      return; // Same data, no scroll needed
    }

    // IDs are different - either new messages or initial load
    if (isInitialLoadRef.current) {
      // First load for this user - scroll to bottom
      scrollToBottom();
      isInitialLoadRef.current = false;
    } else {
      // Truly new message arrived
      if (isAtBottomRef.current) {
        scrollToBottom();
      } else {
        setHasNewMessage(true);
      }
    }

    // Update the last message ID for next comparison
    lastMessageIdRef.current = currentLastId;
  }, [messages, scrollToBottom]);

  // Reset initial load flag when switching users
  const prevSelectedUserRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const currentUserId = selectedUser?.lineUserId || null;

    if (currentUserId !== prevSelectedUserRef.current) {
      isInitialLoadRef.current = true;
      lastMessageIdRef.current = '';
      setHasNewMessage(false);
      prevSelectedUserRef.current = currentUserId;
    }
  }, [selectedUser]);

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
      const response = await chatMessagesApi.sendMessage(selectedAccountId, selectedUser.lineUserId, newMessage);

      if (response.data.success) {
        setNewMessage('');
        await fetchMessages(selectedUser.lineUserId);
      } else {
        toast.error(response.data.error || 'ไม่สามารถส่งข้อความได้');
      }
    } catch (err) {
      toast.error((err as AxiosError<{ message?: string }>).response?.data?.message || 'ไม่สามารถส่งข้อความได้');
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
      <div className="h-[calc(100vh-100px)] flex flex-col max-w-[1600px] mx-auto animate-fade overflow-hidden">

        {/* Neural Navigation Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-2">
          <div className="space-y-1 sm:space-y-2">
            <p className="text-slate-500 font-medium text-xs sm:text-sm">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              แชท<span className="text-[#06C755]">กับลูกค้า</span>
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm">
              สนทนากับลูกค้าผ่าน LINE OA
            </p>
          </div>

          <div className="flex items-center gap-3 bg-black/40 p-2 rounded-full border border-white/5 backdrop-blur-md">
            <Select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="w-60 border-none shadow-none bg-transparent font-semibold text-xs focus:ring-0 cursor-pointer text-white rounded-full px-4"
            >
              <option value="" className="bg-slate-900">เลือกบัญชี LINE</option>
              {accounts.map((account) => {
                const ownerName = account.owner?.fullName || account.owner?.username || 'Unknown';
                return (
                  <option key={account._id} value={account._id} className="bg-slate-900">
                    {account.accountName} ({ownerName})
                  </option>
                );
              })}
            </Select>
            {selectedAccountId && (
              <IconButton
                variant="primary"
                size="md"
                className="rounded-full w-10 h-10 shadow-lg shadow-[#06C755]/20 bg-[#06C755] hover:bg-[#05B048]"
                onClick={fetchUsers}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </IconButton>
            )}
          </div>

          {/* Owner Info Badge */}
          {selectedAccount?.owner && (
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5 backdrop-blur-sm self-end">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">เจ้าของบัญชี:</span>
              <span className="text-xs text-emerald-400 font-bold">{selectedAccount.owner.fullName || selectedAccount.owner.username}</span>
            </div>
          )}
        </div>

        {!selectedAccountId ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xl rounded-[2rem] border-2 border-dashed border-white/5 p-12">
            <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center text-4xl mb-6 animate-pulse border border-white/5">📡</div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">ยังไม่ได้เลือกบัญชี</h3>
            <p className="text-slate-400 font-medium text-sm">กรุณาเลือกบัญชี LINE ด้านบนเพื่อเริ่มใช้งาน</p>
          </div>

        ) : (
          <div className="flex-1 flex gap-6 min-h-0">

            {/* Personnel Manifest (User List) */}
            <Card className="w-[380px] lg:w-[420px] flex flex-col p-0 bg-black/40 backdrop-blur-xl border-white/5 shadow-2xl rounded-2xl overflow-hidden" variant="glass">
              <div className="p-4 sm:p-6 border-b border-white/5 bg-white/[0.02] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-1">รายชื่อผู้ใช้</p>
                    <h3 className="text-sm font-bold text-slate-200">การสนทนาทั้งหมด</h3>
                  </div>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-semibold text-[9px] px-3 py-1 animate-pulse">ออนไลน์</Badge>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-300 group-focus-within:text-emerald-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <Input
                    placeholder="ค้นหาผู้ใช้..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white/5 border-white/5 rounded-2xl h-14 text-[13px] pl-12 font-medium focus:bg-white/10 shadow-inner transition-all text-white placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3 custom-scrollbar">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-6">
                    <Spinner size="lg" className="text-emerald-500" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] animate-pulse">กำลังโหลดรายชื่อ...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-24 opacity-30">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">ไม่พบข้อความ</p>
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
                          "relative p-3 sm:p-4 rounded-xl sm:rounded-2xl cursor-pointer transition-all duration-500 group overflow-hidden border",
                          selectedUser?.lineUserId === user.lineUserId
                            ? "bg-slate-900 text-white border-[#06C755]/20 shadow-[#06C755]/10"
                            : "bg-white/[0.01] hover:bg-white/[0.03] border-white/5"
                        )}
                      >
                        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
                          <div className="relative">
                            <div className={cn(
                              "w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden border transition-all duration-500 flex items-center justify-center group-hover:scale-110",
                              selectedUser?.lineUserId === user.lineUserId ? "bg-white/10 border-white/10" : "bg-white/5 border-white/5"
                            )}>
                              {user.lineUserPicture ? (
                                <img src={user.lineUserPicture} alt={user.lineUserName} className="w-full h-full object-cover transition-transform duration-700" />
                              ) : (
                                <span className={cn("font-black text-base sm:text-lg", selectedUser?.lineUserId === user.lineUserId ? "text-white" : "text-slate-500")}>
                                  {(user.lineUserName || '?').charAt(0)}
                                </span>
                              )}
                            </div>
                            {user.unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] sm:text-[9px] font-black rounded-lg px-1.5 py-0.5 shadow-lg border border-black animate-bounce-subtle">
                                {user.unreadCount > 9 ? '9+' : user.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center justify-between mb-1">
                              <p className={cn("font-black text-xs sm:text-sm truncate uppercase tracking-tight", selectedUser?.lineUserId === user.lineUserId ? "text-white" : "text-slate-300")}>
                                {user.lineUserName}
                              </p>
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-widest transition-colors",
                                selectedUser?.lineUserId === user.lineUserId ? "text-[#06C755] opacity-100" : "text-slate-500 opacity-40 group-hover:opacity-70"
                              )}>
                                {formatLastSeen(user.lastMessageTime)}
                              </span>
                            </div>
                            <p className={cn(
                              "text-[10px] sm:text-xs font-medium truncate transition-all",
                              selectedUser?.lineUserId === user.lineUserId ? "text-white/60" : "text-slate-400 group-hover:text-slate-300"
                            )}>
                              {user.lastMessage || 'ไม่มีข้อความใหม่'}
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
            <Card className="flex-1 flex flex-col p-0 bg-black/40 backdrop-blur-xl border-white/5 shadow-2xl rounded-2xl overflow-hidden" variant="glass">
              {selectedUser ? (
                <>
                  {/* Uplink Header */}
                  <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02] backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 shadow-lg overflow-hidden flex items-center justify-center p-0.5">
                        <div className="w-full h-full rounded-[0.6rem] overflow-hidden">
                          {selectedUser.lineUserPicture ? (
                            <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center font-black text-lg text-slate-500 italic uppercase">
                              {selectedUser.lineUserName?.slice(0, 1)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-lg sm:text-xl font-black text-white tracking-tight uppercase">{selectedUser.lineUserName}</h2>
                          <div className="flex items-center gap-1.5 bg-[#06C755]/10 px-2 py-0.5 rounded-md border border-[#06C755]/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#06C755] animate-pulse" />
                            <span className="text-[9px] font-bold text-[#06C755] uppercase tracking-wider">ONLINE</span>
                          </div>
                        </div>
                        <p className="text-[10px] font-mono font-medium text-slate-500 tracking-wider uppercase">ID: {selectedUser.lineUserId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <IconButton
                        variant="ghost"
                        size="lg"
                        className="rounded-xl w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5"
                        onClick={() => fetchMessages(selectedUser.lineUserId)}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </IconButton>
                    </div>
                  </div>

                  {/* Downlink Feed with new message badge */}
                  <div className="flex-1 overflow-hidden relative">
                    {/* New message badge */}
                    {hasNewMessage && (
                      <button
                        onClick={scrollToBottom}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-[#06C755] text-white text-xs font-bold rounded-full shadow-lg shadow-[#06C755]/30 hover:bg-[#05a347] transition-all animate-bounce flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        ข้อความใหม่
                      </button>
                    )}

                    <div
                      ref={messagesContainerRef}
                      onScroll={handleScroll}
                      className="h-full overflow-y-auto p-4 sm:p-6 bg-black/20 custom-scrollbar"
                      style={{ overscrollBehavior: 'contain' }}
                    >
                      {loadingMessages ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 animate-fade">
                          <Spinner size="lg" className="text-[#06C755]" />
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">กำลังโหลดข้อความ...</p>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 opacity-40">
                          <EmptyState icon="🧊" title="ไม่มีประวัติการแชท" description="เริ่มการสนทนาใหม่" variant="glass" />
                        </div>
                      ) : (
                        <div className="space-y-4 sm:space-y-6">
                          {messages.map((msg, idx) => (
                            <motion.div
                              key={msg._id}
                              initial={{ opacity: 0, y: 10, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className={cn("flex w-full", msg.direction === 'out' ? 'justify-end' : 'justify-start')}
                            >
                              <div className={cn(
                                "max-w-[85%] sm:max-w-[80%] space-y-1 sm:space-y-2",
                                msg.direction === 'out' ? "items-end text-right" : "items-start text-left"
                              )}>
                                <div className={cn(
                                  "p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-lg border transition-all duration-500",
                                  msg.direction === 'out'
                                    ? "bg-slate-900 text-white border-white/10 rounded-tr-sm sm:rounded-tr-none"
                                    : "bg-white/[0.03] text-white border-white/5 rounded-tl-sm sm:rounded-tl-none backdrop-blur-md"
                                )}>
                                  {msg.messageType === 'image' && msg.messageId ? (
                                    <img
                                      src={chatMessagesApi.getImage(selectedAccountId, msg.messageId)}
                                      alt="sent image"
                                      className="max-w-full rounded-xl sm:rounded-2xl cursor-zoom-in hover:opacity-90 transition-opacity"
                                      onClick={() => window.open(chatMessagesApi.getImage(selectedAccountId, msg.messageId!), '_blank')}
                                      onLoad={() => {
                                        if (isAtBottomRef.current) scrollToBottom();
                                      }}
                                    />
                                  ) : (
                                    <p className="text-xs sm:text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">{msg.messageText}</p>
                                  )}
                                  <div className={cn(
                                    "mt-2 sm:mt-3 text-[8px] sm:text-[9px] font-semibold opacity-50",
                                    msg.direction === 'out' ? "text-[#06C755] text-right" : "text-slate-400"
                                  )}>
                                    {formatTime(msg.createdAt)}
                                    {msg.sentBy && msg.direction === 'out' && ` • ${msg.sentBy}`}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Neural Input Interface */}
                  <div className="p-4 sm:p-6 bg-white/[0.02] border-t border-white/5 backdrop-blur-md">
                    <div className="flex gap-3 sm:gap-4 items-end">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="พิมพ์ข้อความตอบกลับ..."
                        className="flex-1 min-h-[48px] sm:min-h-[56px] max-h-32 sm:max-h-48 resize-none bg-white/[0.03] border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-white font-medium text-xs sm:text-sm focus:ring-1 focus:ring-[#06C755]/50 transition-all placeholder:text-slate-500 outline-none custom-scrollbar"
                        rows={1}
                        disabled={sending}
                      />
                      <Button
                        variant="primary"
                        size="lg"
                        className="h-12 sm:h-14 px-6 sm:px-8 rounded-xl sm:rounded-2xl bg-[#06C755] hover:bg-[#05B048] font-semibold text-xs sm:text-sm shadow-lg shadow-[#06C755]/20 hover:shadow-[#06C755]/40 transition-all"
                        onClick={handleSendMessage}
                        isLoading={sending}
                        disabled={sending || !newMessage.trim()}
                      >
                        ส่ง
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-3 px-1.5 opacity-30">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#06C755] animate-pulse" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">เชื่อมต่อปลอดภัย</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 tracking-wider">ระบบ AI พร้อมใช้งาน</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 sm:p-12 lg:p-16 flex-1 flex flex-col items-center justify-center bg-black/40">
                  <EmptyState
                    icon="👈"
                    title="ยังไม่ได้เลือกผู้ใช้"
                    description="เลือกผู้ใช้จากรายการด้านซ้ายเพื่อเริ่มการสนทนา"
                    variant="glass"
                  />
                  <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/5 text-[10px] text-slate-400 max-w-xs text-center leading-relaxed">
                    ระบบจะแสดงประวัติการแชท รูปภาพ และสถานะการอ่านแบบ Real-time
                  </div>
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
    </DashboardLayout >
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
