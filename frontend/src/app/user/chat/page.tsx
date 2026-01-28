'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { chatMessagesApi, lineAccountsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { RefreshCw, MessageSquare, ChevronLeft, ArrowDown, Send, Inbox } from 'lucide-react';

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
  const accountIdFromUrl = searchParams.get('accountId') || '';

  // Smart Account Selector state
  const [allAccounts, setAllAccounts] = useState<LineAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>(accountIdFromUrl);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const lastMessageIdRef = useRef<string>('');
  const isInitialLoadRef = useRef<boolean>(true);
  const selectedUserRef = useRef<ChatUser | null>(null); // Track current user for socket
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const hasAutoSelectedRef = useRef(false); // Prevent infinite loop from router.replace

  // Update ref when selectedUser changes
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Fetch all LINE accounts on mount - run ONCE only
  useEffect(() => {
    // Guard: prevent running if already auto-selected
    if (hasAutoSelectedRef.current) return;

    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await lineAccountsApi.getMyAccounts();
        const accounts = res.data?.accounts || res.data || [];
        setAllAccounts(accounts);

        // Auto-select first account if no accountId in URL (only once)
        if (!accountIdFromUrl && accounts.length > 0 && !hasAutoSelectedRef.current) {
          hasAutoSelectedRef.current = true; // Mark as done BEFORE router call
          const firstAccountId = accounts[0]._id;
          setActiveAccountId(firstAccountId);
          // Update URL silently - won't trigger re-run due to guard
          router.replace(`/user/chat?accountId=${firstAccountId}`);
        }
      } catch (err: any) {
        console.error('Failed to fetch LINE accounts:', err);
        toast.error('ไม่สามารถโหลดรายชื่อบัญชี LINE ได้');
      } finally {
        setLoadingAccounts(false);
      }
    };
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount to prevent infinite loop

  // Handle account switch
  const handleAccountSwitch = (newAccountId: string) => {
    setActiveAccountId(newAccountId);
    setSelectedUser(null);
    setMessages([]);
    setUsers([]);
    router.replace(`/user/chat?accountId=${newAccountId}`);
  };

  // Get active account object
  const activeAccount = allAccounts.find(acc => acc._id === activeAccountId);

  // Real-time socket connection
  useEffect(() => {
    if (!activeAccountId) return;

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const socket = io(`${backendUrl}/ws`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('User Chat Socket connected:', socket.id);
      // Subscribe to this LINE account's chat room
      console.log('Subscribing to chat room:', activeAccountId);
      socket.emit('subscribe_chat', { lineAccountId: activeAccountId });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    socket.on('message_received', (data: any) => {
      console.log('WebSocket message received:', data);

      if (data.lineAccountId !== activeAccountId) {
        console.log('Message ignored: Account ID mismatch', { received: data.lineAccountId, active: activeAccountId });
        return;
      }

      // 1. If message belongs to CURRENTLY OPEN chat
      if (selectedUserRef.current && data.lineUserId === selectedUserRef.current.lineUserId) {
        console.log('Appending message to active chat');
        setMessages((prev) => {
          // Prevent duplicates
          const exists = prev.some(
            (m) => m._id === data._id || (data.messageId && m.messageId === data.messageId)
          );
          if (exists) {
            console.log('Skip duplicate message:', data._id);
            return prev;
          }

          const newMessage: ChatMessage = {
            _id: data._id,
            messageId: data.messageId,
            direction: data.direction,
            messageType: data.messageType,
            messageText: data.messageText,
            createdAt: data.createdAt,
            sentBy: data.sentBy,
          };

          return [...prev, newMessage];
        });
      } else {
        console.log('Message is for different user:', data.lineUserId);
      }

      // 2. Update user list (last message / unread count) regardless of who is open
      setUsers((prev) => {
        const index = prev.findIndex(u => u.lineUserId === data.lineUserId);

        if (index === -1) {
          // New user (not in list) - Add to top
          const newUser: ChatUser = {
            lineUserId: data.lineUserId,
            lineUserName: data.lineUserName || 'Unknown User',
            lineUserPicture: data.lineUserPicture,
            lastMessage: data.messageType === 'image' ? '[รูปภาพ]' : (data.messageText || ''),
            lastMessageTime: data.createdAt,
            unreadCount: data.direction === 'in' ? 1 : 0,
          };
          return [newUser, ...prev];
        }

        const updatedUsers = [...prev];
        const isCurrentChat = selectedUserRef.current?.lineUserId === data.lineUserId;

        updatedUsers[index] = {
          ...updatedUsers[index],
          lastMessage: data.messageType === 'image' ? '[รูปภาพ]' : (data.messageText || ''),
          lastMessageTime: data.createdAt,
          // Only increment unread if NOT current chat and it's an incoming message
          unreadCount: (!isCurrentChat && data.direction === 'in')
            ? (updatedUsers[index].unreadCount + 1)
            : updatedUsers[index].unreadCount
        };

        // Move to top
        const [movedUser] = updatedUsers.splice(index, 1);
        updatedUsers.unshift(movedUser);

        return updatedUsers;
      });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => {
      socket.emit('unsubscribe_chat', { lineAccountId: activeAccountId });
      socket.disconnect();
    };
  }, [activeAccountId]);

  const fetchUsers = useCallback(async () => {
    if (!activeAccountId) {
      setUsers([]);
      setLoadingUsers(false);
      return;
    }
    setLoadingUsers(true);
    try {
      const res = await chatMessagesApi.getUsers(activeAccountId);
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
  }, [activeAccountId]);

  const fetchMessages = useCallback(async (userId: string) => {
    if (!activeAccountId) return;
    setLoadingMessages(true);
    try {
      const res = await chatMessagesApi.getMessages(activeAccountId, userId);
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
  }, [activeAccountId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
    // Consider "at bottom" if within 100px of bottom
    return scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  // Handle scroll event - update isAtBottom state
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    // Clear new message badge if user scrolled to bottom
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

    // Compare last message ID to detect truly new messages
    // If IDs are the same, this is just a polling refresh - do nothing
    if (currentLastId === prevLastId) {
      return; // Same data, no scroll needed
    }

    // IDs are different - either new messages or initial load
    if (isInitialLoadRef.current) {
      // First load for this user - scroll to bottom
      scrollToBottom();
      isInitialLoadRef.current = false;
    } else {
      // Truly new message arrived (not initial load, different ID)
      if (isAtBottomRef.current) {
        // User was at bottom, scroll to new messages
        scrollToBottom();
      } else {
        // User was reading history, show badge
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

    // When switching to a new user, reset scroll state
    if (currentUserId !== prevSelectedUserRef.current) {
      isInitialLoadRef.current = true;
      lastMessageIdRef.current = '';
      setHasNewMessage(false);
      prevSelectedUserRef.current = currentUserId;
    }
  }, [selectedUser]);

  const handleSendMessage = async () => {
    if (!activeAccountId || !selectedUser || !newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await chatMessagesApi.sendMessage(activeAccountId, selectedUser.lineUserId, newMessage.trim());
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

  // Loading state while fetching accounts
  if (loadingAccounts) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดบัญชี LINE..." />
      </DashboardLayout>
    );
  }

  // No accounts found
  if (!loadingAccounts && allAccounts.length === 0) {
    return (
      <DashboardLayout>
        <EmptyState
          icon={<MessageSquare className="w-16 h-16 text-slate-400" />}
          title="ยังไม่มีบัญชี LINE"
          description="กรุณาเพิ่มบัญชี LINE OA ก่อนเพื่อเริ่มใช้งานแชท"
          action={
            <Button variant="primary" onClick={() => router.push('/user/line-accounts')}>
              เพิ่มบัญชี LINE
            </Button>
          }
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Main container - use dvh for better mobile support */}
      <div className="flex flex-col max-w-[1600px] mx-auto animate-fade h-[calc(100dvh-80px)] lg:h-[calc(100vh-80px)] overflow-hidden">
        {/* Header - hide on mobile when chat is open */}
        <div className={cn(
          "page-header relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6 flex-shrink-0",
          showMobileChat && "hidden lg:flex"
        )}>
          <div className="space-y-1 sm:space-y-2 flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              แชทกับ<span className="text-[#06C755]">ลูกค้า</span>
            </h1>
            <p className="text-slate-400 font-medium text-xs sm:text-sm">
              สื่อสารและตอบกลับข้อความจากลูกค้าผ่าน LINE OA
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">
            <Button variant="outline" size="lg" onClick={fetchUsers} isLoading={loadingUsers} className="flex-1 sm:flex-none h-11 sm:h-12 px-4 sm:px-6 rounded-full font-semibold text-xs sm:text-sm border-white/10 bg-white/[0.03] hover:bg-white/5 text-white transition-all gap-2">
              <RefreshCw className="w-4 h-4" /> รีเฟรช
            </Button>
          </div>
        </div>

        {/* Grid container with proper height handling */}
        <div className={cn(
          "grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 flex-1 min-h-0",
          showMobileChat ? "overflow-hidden" : "overflow-auto lg:overflow-hidden"
        )}>
          {/* Col 1: Account Switcher (Desktop) */}
          <div className="hidden lg:flex lg:col-span-2 lg:flex-col lg:min-h-0">
            <Card className="p-0 overflow-hidden bg-black/40 border border-white/5 shadow-2xl rounded-xl sm:rounded-2xl flex flex-col flex-1 min-h-0" variant="glass">
              <div className="p-4 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">บัญชี LINE ({allAccounts.length})</p>
              </div>
              <div className="p-2 space-y-2 flex-1 overflow-y-auto overscroll-contain">
                {allAccounts.map((acc) => {
                  const isActive = acc._id === activeAccountId;
                  return (
                    <button
                      key={acc._id}
                      onClick={() => handleAccountSwitch(acc._id)}
                      className={cn(
                        'w-full p-3 rounded-xl transition-all duration-300 border text-left',
                        isActive
                          ? 'bg-[#06C755]/10 border-[#06C755]/30 shadow-[#06C755]/10'
                          : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/5'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                          isActive ? 'bg-[#06C755]/20' : 'bg-white/5'
                        )}>
                          <MessageSquare className={cn("w-4 h-4", isActive ? "text-[#06C755]" : "text-slate-400")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-xs font-bold truncate',
                            isActive ? 'text-[#06C755]' : 'text-white'
                          )}>
                            {acc.accountName || 'บัญชี LINE'}
                          </p>
                          <p className="text-[8px] text-slate-500 truncate font-mono">
                            {acc.channelId?.slice(0, 10)}...
                          </p>
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-[#06C755] animate-pulse" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Mobile Account Switcher - only show when chat list is visible */}
          {!showMobileChat && allAccounts.length > 1 && (
            <div className="lg:hidden flex-shrink-0">
              <Card className="p-3 overflow-hidden bg-black/40 border border-white/5 rounded-xl" variant="glass">
                <p className="text-[9px] font-semibold text-slate-400 mb-2">เลือกบัญชี LINE</p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                  {allAccounts.map((acc) => {
                    const isActive = acc._id === activeAccountId;
                    return (
                      <button
                        key={acc._id}
                        onClick={() => handleAccountSwitch(acc._id)}
                        className={cn(
                          'flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all border whitespace-nowrap flex items-center gap-1.5',
                          isActive
                            ? 'bg-[#06C755] text-white border-[#06C755]'
                            : 'bg-white/[0.02] text-slate-400 border-white/10 hover:bg-white/[0.05]'
                        )}
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> {acc.accountName || 'บัญชี'}
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* Mobile User List - flex to fill remaining space */}
          {!showMobileChat && (
            <div className="lg:hidden flex flex-col flex-1 min-h-0">
              <Card className="p-0 overflow-hidden bg-black/40 border border-white/5 shadow-2xl rounded-xl flex flex-col flex-1 min-h-0" variant="glass">
                <div className="p-4 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
                  <Input
                    placeholder="ค้นหาผู้ใช้..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-white/[0.03] border-white/5 h-10 rounded-lg text-white text-sm font-medium placeholder:text-slate-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-2 touch-pan-y">
                  {loadingUsers ? (
                    <div className="py-12 flex flex-col items-center gap-3">
                      <Spinner size="lg" />
                      <p className="text-[10px] font-semibold text-slate-400">กำลังโหลดข้อมูล...</p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-12 opacity-60">
                      <EmptyState
                        icon={<Inbox className="w-12 h-12 text-slate-500" />}
                        title="ยังไม่มีแชท"
                        description="รอข้อความจากลูกค้า"
                        variant="glass"
                      />
                    </div>
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.lineUserId}
                        onClick={() => {
                          setSelectedUser(u);
                          setShowMobileChat(true);
                        }}
                        className="w-full text-left p-3 rounded-xl bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 transition-all active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/5 overflow-hidden flex items-center justify-center">
                              {u.lineUserPicture ? (
                                <img src={u.lineUserPicture} alt={u.lineUserName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-black text-slate-500">{(u.lineUserName || '?').charAt(0)}</span>
                              )}
                            </div>
                            {u.unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-semibold rounded-full px-1.5 py-0.5">
                                {u.unreadCount > 9 ? '9+' : u.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white truncate text-sm">{u.lineUserName || 'ไม่ระบุชื่อ'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{u.lastMessage || 'ไม่มีข้อความ'}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* Col 2: Chat List - Desktop */}
          <div className="hidden lg:flex lg:col-span-3 lg:flex-col lg:min-h-0">
            <Card className="p-0 overflow-hidden bg-black/40 border border-white/5 shadow-2xl rounded-xl sm:rounded-2xl flex flex-col flex-1 min-h-0" variant="glass">
              <div className="p-4 sm:p-6 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">รายชื่อผู้ใช้</p>
                  <Badge variant="success" className="bg-[#06C755]/10 text-[#06C755] border-white/5 font-semibold text-[8px] sm:text-[9px] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg">
                    {users.length} คน
                  </Badge>
                </div>
                <Input
                  placeholder="ค้นหาผู้ใช้..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white/[0.03] border-white/5 h-10 sm:h-12 rounded-lg sm:rounded-xl text-white text-sm font-medium placeholder:text-slate-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3 space-y-2">
                {loadingUsers ? (
                  <div className="py-12 sm:py-20 flex flex-col items-center gap-3 sm:gap-4">
                    <Spinner size="lg" />
                    <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">กำลังโหลดข้อมูล...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-12 sm:py-20 opacity-60">
                    <EmptyState
                      icon={<Inbox className="w-12 h-12 text-slate-500" />}
                      title="ยังไม่มีแชท"
                      description="รอข้อความจากลูกค้า"
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
                          'w-full text-left p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all duration-500 border group',
                          isActive
                            ? 'bg-slate-900 text-white border-[#06C755]/20 shadow-[#06C755]/10'
                            : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/5'
                        )}
                      >
                        <div className="flex items-center gap-3 sm:gap-4">
                          <div className="relative flex-shrink-0">
                            <div className={cn(
                              'w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden flex items-center justify-center border transition-all duration-500 group-hover:scale-110',
                              isActive ? 'bg-white/10 border-white/10' : 'bg-white/5 border-white/5'
                            )}>
                              {u.lineUserPicture ? (
                                <img src={u.lineUserPicture} alt={u.lineUserName} className="w-full h-full object-cover" />
                              ) : (
                                <span className={cn('font-black text-base sm:text-lg', isActive ? 'text-white' : 'text-slate-500')}>
                                  {(u.lineUserName || '?').charAt(0)}
                                </span>
                              )}
                            </div>
                            {u.unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] sm:text-[9px] font-semibold rounded-lg px-1.5 sm:px-2 py-0.5 border-2 border-black shadow-lg">
                                {u.unreadCount > 9 ? '9+' : u.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn('font-black text-xs sm:text-sm truncate', isActive ? 'text-white' : 'text-slate-300')}>
                              {u.lineUserName || 'ไม่ระบุชื่อ'}
                            </p>
                            <p className={cn('text-[9px] sm:text-[10px] truncate group-hover:text-[#06C755] transition-colors', isActive ? 'text-white/60' : 'text-slate-400')}>
                              {u.lastMessage || 'ไม่มีข้อความ'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Col 3: Chat Area - Full screen on mobile when chat is open */}
          <div className={cn(
            "lg:col-span-7 flex flex-col min-h-0",
            showMobileChat
              ? "fixed inset-0 z-50 lg:static lg:z-auto"
              : "hidden lg:flex"
          )}>
            <Card className="p-0 overflow-hidden flex flex-col bg-black/40 lg:bg-black/40 border-0 lg:border border-white/5 shadow-2xl rounded-none lg:rounded-xl sm:lg:rounded-2xl flex-1 min-h-0" variant="glass">
              {selectedUser ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 sm:p-4 lg:p-6 border-b border-white/5 bg-slate-950/95 lg:bg-white/[0.02] flex items-center justify-between gap-3 sm:gap-4 flex-shrink-0 safe-area-top">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      {/* Mobile Back Button */}
                      <button
                        onClick={() => {
                          setSelectedUser(null);
                          setShowMobileChat(false);
                        }}
                        className="lg:hidden w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 transition-all flex-shrink-0 active:scale-95"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-lg sm:rounded-xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {selectedUser.lineUserPicture ? (
                          <img src={selectedUser.lineUserPicture} alt={selectedUser.lineUserName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-black text-slate-400 text-sm sm:text-base lg:text-lg">{(selectedUser.lineUserName || '?').charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-white truncate text-sm sm:text-base">{selectedUser.lineUserName || 'ไม่ระบุชื่อ'}</p>
                        <p className="text-[8px] sm:text-[9px] lg:text-[10px] font-mono font-semibold text-[#06C755] truncate">ID: {selectedUser.lineUserId}</p>
                      </div>
                    </div>
                    <IconButton
                      variant="ghost"
                      onClick={() => fetchMessages(selectedUser.lineUserId)}
                      disabled={loadingMessages}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-all disabled:opacity-50 flex-shrink-0"
                    >
                      {loadingMessages ? (
                        <Spinner size="sm" />
                      ) : (
                        <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </IconButton>
                  </div>

                  {/* Chat messages area with proper scrolling */}
                  <div className="flex-1 overflow-hidden relative min-h-0">
                    {/* New message badge */}
                    {hasNewMessage && (
                      <button
                        onClick={scrollToBottom}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-[#06C755] text-white text-xs font-bold rounded-full shadow-lg shadow-[#06C755]/30 hover:bg-[#05a347] transition-all animate-bounce flex items-center gap-2"
                      >
                        <ArrowDown className="w-4 h-4" />
                        ข้อความใหม่
                      </button>
                    )}

                    <div
                      ref={messagesContainerRef}
                      onScroll={handleScroll}
                      className="absolute inset-0 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-6 bg-black/20 touch-pan-y"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {loadingMessages ? (
                        <div className="py-16 sm:py-24 flex flex-col items-center gap-3 sm:gap-4">
                          <Spinner size="lg" />
                          <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400">กำลังโหลดข้อความ...</p>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="py-16 sm:py-24 opacity-60">
                          <EmptyState
                            icon={<Inbox className="w-12 h-12 text-slate-500" />}
                            title="ยังไม่มีข้อความ"
                            description="ยังไม่มีข้อความในแชทนี้"
                            variant="glass"
                          />
                        </div>
                      ) : (
                        <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                          {messages.map((msg) => {
                            const isOut = msg.direction === 'out';
                            const imageUrl =
                              msg.messageType === 'image' && msg.messageId
                                ? chatMessagesApi.getImage(activeAccountId, msg.messageId)
                                : null;

                            return (
                              <div key={msg._id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                                <div className={cn('max-w-[85%] sm:max-w-[80%] space-y-1 sm:space-y-2', isOut ? 'items-end' : 'items-start')}>
                                  <div className={cn(
                                    'p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-lg border transition-all duration-500',
                                    isOut
                                      ? 'bg-slate-900 text-white border-white/10 rounded-tr-sm sm:rounded-tr-none'
                                      : 'bg-white/[0.03] text-white border-white/5 rounded-tl-sm sm:rounded-tl-none backdrop-blur-md'
                                  )}>
                                    {msg.messageType === 'image' ? (
                                      imageUrl ? (
                                        <img
                                          src={imageUrl}
                                          alt="LINE image"
                                          className="max-w-full rounded-xl sm:rounded-2xl cursor-zoom-in"
                                          onClick={() => window.open(imageUrl, '_blank')}
                                          onLoad={() => {
                                            if (isAtBottomRef.current) scrollToBottom();
                                          }}
                                        />
                                      ) : (
                                        <p className="text-[9px] sm:text-[10px] font-semibold opacity-40">[รูปภาพ]</p>
                                      )
                                    ) : msg.messageType === 'sticker' ? (
                                      <p className="text-[9px] sm:text-[10px] font-semibold opacity-40">[สติกเกอร์]</p>
                                    ) : (
                                      <p className="text-xs sm:text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">{msg.messageText}</p>
                                    )}

                                    <div className={cn(
                                      'mt-2 sm:mt-3 text-[8px] sm:text-[9px] font-semibold opacity-50',
                                      isOut ? 'text-[#06C755] text-right' : 'text-slate-400'
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
                  </div>

                  {/* Message Input - Fixed at bottom with safe area */}
                  <div className="p-3 sm:p-4 lg:p-6 bg-slate-950/95 lg:bg-white/[0.02] border-t border-white/5 flex-shrink-0 safe-area-bottom">
                    <div className="flex gap-2 sm:gap-3 lg:gap-4 items-end">
                      <textarea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="พิมพ์ข้อความ..."
                        className="flex-1 min-h-[44px] sm:min-h-[48px] lg:min-h-[56px] max-h-24 sm:max-h-32 lg:max-h-48 resize-none bg-white/[0.03] border border-white/5 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-white font-medium text-sm sm:text-sm focus:ring-1 focus:ring-[#06C755]/50 transition-all placeholder:text-slate-500 outline-none"
                        rows={1}
                        disabled={sending}
                      />
                      <Button
                        variant="primary"
                        size="lg"
                        className="h-11 sm:h-12 lg:h-14 w-11 sm:w-auto px-0 sm:px-6 lg:px-8 rounded-xl sm:rounded-2xl bg-[#06C755] hover:bg-[#05B048] font-semibold text-xs sm:text-sm shadow-[#06C755]/20 transition-all"
                        onClick={handleSendMessage}
                        isLoading={sending}
                        disabled={sending || !newMessage.trim()}
                      >
                        <Send className="w-5 h-5 sm:hidden" />
                        <span className="hidden sm:inline">ส่ง</span>
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-8 sm:p-10 lg:p-12 flex-1 flex items-center justify-center">
                  <EmptyState
                    icon={<ChevronLeft className="w-12 h-12 text-slate-500" />}
                    title="เลือกผู้ใช้เพื่อเริ่มแชท"
                    description="กรุณาเลือกผู้ใช้จากรายชื่อด้านซ้ายเพื่อเริ่มการสนทนา"
                    variant="glass"
                  />
                </div>
              )}
            </Card>
          </div>
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
