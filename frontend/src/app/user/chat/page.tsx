'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { chatMessagesApi, lineAccountsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { EmptyState } from '@/components/ui/Card';
import { PageLoading, Spinner } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import {
  Search,
  ChevronLeft,
  ChevronDown,
  Send,
  MoreVertical,
  X,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck,
  ArrowLeft,
  Filter,
  MessageCircle
} from 'lucide-react';

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

// Format relative time like LINE
const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'เมื่อกี้';
  if (diffMins < 60) return `${diffMins} นาที`;
  if (diffHours < 24) return `${diffHours} ชม.`;
  if (diffDays === 1) return 'เมื่อวาน';
  if (diffDays < 7) return `${diffDays} วัน`;

  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

// Format time for messages
const formatMessageTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

// Check if should show date separator
const shouldShowDateSeparator = (currentMsg: ChatMessage, prevMsg: ChatMessage | null) => {
  if (!prevMsg) return true;
  const currentDate = new Date(currentMsg.createdAt).toDateString();
  const prevDate = new Date(prevMsg.createdAt).toDateString();
  return currentDate !== prevDate;
};

// Format date for separator
const formatDateSeparator = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'วันนี้';
  if (date.toDateString() === yesterday.toDateString()) return 'เมื่อวาน';

  return date.toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
};

function UserChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountIdFromUrl = searchParams.get('accountId') || '';

  // State
  const [allAccounts, setAllAccounts] = useState<LineAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>(accountIdFromUrl);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const lastMessageIdRef = useRef<string>('');
  const isInitialLoadRef = useRef<boolean>(true);
  const selectedUserRef = useRef<ChatUser | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const hasAutoSelectedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update ref when selectedUser changes
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Fetch all LINE accounts on mount
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;

    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await lineAccountsApi.getMyAccounts();
        const accounts = res.data?.accounts || res.data || [];
        setAllAccounts(accounts);

        if (!accountIdFromUrl && accounts.length > 0 && !hasAutoSelectedRef.current) {
          hasAutoSelectedRef.current = true;
          const firstAccountId = accounts[0]._id;
          setActiveAccountId(firstAccountId);
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
  }, []);

  // Handle account switch
  const handleAccountSwitch = (newAccountId: string) => {
    setActiveAccountId(newAccountId);
    setSelectedUser(null);
    setMessages([]);
    setUsers([]);
    setShowAccountDropdown(false);
    router.replace(`/user/chat?accountId=${newAccountId}`);
  };

  // Handle back to chat list (mobile)
  const handleBackToList = () => {
    setSelectedUser(null);
    setShowMobileChat(false);
    setShowMessageSearch(false);
    setMessageSearchTerm('');
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
      console.log('Chat socket connected');
      socket.emit('subscribe_chat', { lineAccountId: activeAccountId });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    socket.on('message_received', (data: any) => {
      if (data.lineAccountId !== activeAccountId) return;

      if (selectedUserRef.current && data.lineUserId === selectedUserRef.current.lineUserId) {
        setMessages((prev) => {
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
            sentBy: data.sentBy,
          };

          return [...prev, newMessage];
        });
      }

      setUsers((prev) => {
        const index = prev.findIndex(u => u.lineUserId === data.lineUserId);

        if (index === -1) {
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
          unreadCount: (!isCurrentChat && data.direction === 'in')
            ? (updatedUsers[index].unreadCount + 1)
            : updatedUsers[index].unreadCount
        };

        const [movedUser] = updatedUsers.splice(index, 1);
        updatedUsers.unshift(movedUser);

        return updatedUsers;
      });
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

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.lineUserId);
      isInitialLoadRef.current = true;
      lastMessageIdRef.current = '';
      setHasNewMessage(false);
    } else {
      setMessages([]);
    }
  }, [selectedUser, fetchMessages]);

  // Scroll handling
  const checkIfAtBottom = useCallback(() => {
    if (!messagesContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    if (atBottom && hasNewMessage) {
      setHasNewMessage(false);
    }
  }, [checkIfAtBottom, hasNewMessage]);

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setHasNewMessage(false);
      isAtBottomRef.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (messages.length === 0) {
      lastMessageIdRef.current = '';
      isInitialLoadRef.current = true;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const currentLastId = lastMessage?._id || '';
    const prevLastId = lastMessageIdRef.current;

    if (currentLastId === prevLastId) return;

    if (isInitialLoadRef.current) {
      scrollToBottom();
      isInitialLoadRef.current = false;
    } else {
      if (isAtBottomRef.current) {
        scrollToBottom();
      } else {
        setHasNewMessage(true);
      }
    }

    lastMessageIdRef.current = currentLastId;
  }, [messages, scrollToBottom]);

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

  const handleSendMessage = async () => {
    if (!activeAccountId || !selectedUser || !newMessage.trim() || sending) return;

    const messageToSend = newMessage.trim();
    setSending(true);

    // Clear input immediately for better UX
    setNewMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }

    try {
      const res = await chatMessagesApi.sendMessage(activeAccountId, selectedUser.lineUserId, messageToSend);
      if (res.data?.success) {
        // Refresh messages
        await fetchMessages(selectedUser.lineUserId);
      } else {
        // Restore message if failed
        setNewMessage(messageToSend);
        const errorMsg = res.data?.message || res.data?.error || 'ไม่สามารถส่งข้อความได้';
        // Check for LINE API limit error
        if (errorMsg.includes('monthly limit') || errorMsg.includes('limit')) {
          toast.error('LINE OA ถึงโควต้าข้อความรายเดือนแล้ว กรุณาอัพเกรดแพลน LINE Official Account');
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (err: any) {
      // Restore message if failed
      setNewMessage(messageToSend);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'ไม่สามารถส่งข้อความได้';
      // Check for LINE API limit error
      if (errorMsg.includes('monthly limit') || errorMsg.includes('limit')) {
        toast.error('LINE OA ถึงโควต้าข้อความรายเดือนแล้ว กรุณาอัพเกรดแพลน LINE Official Account');
      } else {
        toast.error(errorMsg);
      }
      console.error('Send message error:', err);
    } finally {
      setSending(false);
    }
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = '44px';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  // Filter users
  const filteredUsers = users.filter((u) => {
    const matchesSearch = !searchTerm ||
      `${u.lineUserName || ''} ${u.lineUserId}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesUnread = !filterUnread || u.unreadCount > 0;
    return matchesSearch && matchesUnread;
  });

  // Filter messages by search term
  const filteredMessages = messages.filter((msg) => {
    if (!messageSearchTerm) return true;
    return msg.messageText?.toLowerCase().includes(messageSearchTerm.toLowerCase());
  });

  // Loading state
  if (loadingAccounts) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลด..." />
      </DashboardLayout>
    );
  }

  // No accounts found
  if (!loadingAccounts && allAccounts.length === 0) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100dvh-80px)] flex items-center justify-center">
          <EmptyState
            icon={<div className="w-20 h-20 rounded-full bg-[#06C755]/10 flex items-center justify-center">
              <MessageCircle className="w-10 h-10 text-[#06C755]" />
            </div>}
            title="ยังไม่มีบัญชี LINE"
            description="เพิ่มบัญชี LINE OA เพื่อเริ่มใช้งานแชท"
            action={
              <button
                onClick={() => router.push('/user/line-accounts')}
                className="px-6 py-3 bg-[#06C755] text-white font-semibold rounded-full hover:bg-[#05a347] transition-colors"
              >
                เพิ่มบัญชี LINE
              </button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100dvh-80px)] lg:h-[calc(100vh-80px)] flex bg-[#0a0a0a]">
        {/* Sidebar - Chat List */}
        <div className={cn(
          "w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d0d] transition-all duration-300 ease-out",
          showMobileChat ? "hidden lg:flex" : "flex"
        )}>
          {/* Header with Title & Account Selector */}
          <div className="safe-area-top">
            {/* Title Bar */}
            <div className="px-4 py-3 flex items-center justify-between">
              <h1 className="text-xl font-bold text-white">แชท</h1>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="w-2 h-2 rounded-full bg-[#06C755]" />
                {users.filter(u => u.unreadCount > 0).length > 0 && (
                  <span className="text-[#06C755] font-semibold">
                    {users.filter(u => u.unreadCount > 0).length} ยังไม่อ่าน
                  </span>
                )}
              </div>
            </div>

            {/* Account Dropdown */}
            <div className="px-4 pb-3">
              <div className="relative">
                <button
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[#06C755] flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white truncate max-w-[180px]">
                        {activeAccount?.accountName || 'เลือกบัญชี'}
                      </p>
                      <p className="text-[10px] text-slate-500">{allAccounts.length} บัญชี LINE OA</p>
                    </div>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-slate-400 transition-transform",
                    showAccountDropdown && "rotate-180"
                  )} />
                </button>

              {/* Dropdown */}
              {showAccountDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                  {allAccounts.map((acc) => (
                    <button
                      key={acc._id}
                      onClick={() => handleAccountSwitch(acc._id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors",
                        acc._id === activeAccountId && "bg-[#06C755]/10"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        acc._id === activeAccountId ? "bg-[#06C755]" : "bg-white/10"
                      )}>
                        <MessageCircle className="w-4 h-4 text-white" />
                      </div>
                      <span className={cn(
                        "text-sm font-medium truncate flex-1 text-left",
                        acc._id === activeAccountId ? "text-[#06C755]" : "text-white"
                      )}>
                        {acc.accountName || 'บัญชี LINE'}
                      </span>
                      {acc._id === activeAccountId && (
                        <Check className="w-4 h-4 text-[#06C755]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              </div>
            </div>

            {/* Search & Filter */}
            <div className="px-4 pb-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="ค้นหาผู้ใช้"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 bg-white/[0.05] border border-white/5 rounded-full text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#06C755]/50 transition-colors"
                />
              </div>
              <button
                onClick={() => setFilterUnread(!filterUnread)}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  filterUnread ? "bg-[#06C755] text-white" : "bg-white/[0.05] text-slate-400 hover:bg-white/[0.08]"
                )}
                title="กรองเฉพาะยังไม่อ่าน"
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="lg" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-white font-medium mb-1">
                  {filterUnread ? 'ไม่มีข้อความที่ยังไม่อ่าน' : 'ยังไม่มีแชท'}
                </p>
                <p className="text-slate-500 text-sm">
                  {filterUnread ? 'คุณอ่านข้อความทั้งหมดแล้ว' : 'รอข้อความจากลูกค้า'}
                </p>
              </div>
            ) : (
              <div>
                {filteredUsers.map((user) => {
                  const isActive = selectedUser?.lineUserId === user.lineUserId;
                  return (
                    <button
                      key={user.lineUserId}
                      onClick={() => {
                        setSelectedUser(user);
                        setShowMobileChat(true);
                        setUsers(prev => prev.map(u =>
                          u.lineUserId === user.lineUserId ? { ...u, unreadCount: 0 } : u
                        ));
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-4 hover:bg-white/[0.05] transition-all duration-200 border-b border-white/[0.02] active:scale-[0.98] active:bg-white/[0.08]",
                        isActive && "bg-white/[0.05]"
                      )}
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 overflow-hidden">
                          {user.lineUserPicture ? (
                            <img src={user.lineUserPicture} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
                              {(user.lineUserName || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#06C755] rounded-full border-2 border-[#0d0d0d]" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-white truncate pr-2">
                            {user.lineUserName || 'ไม่ระบุชื่อ'}
                          </p>
                          <span className="text-[10px] text-slate-500 flex-shrink-0">
                            {user.lastMessageTime && formatRelativeTime(user.lastMessageTime)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-400 truncate pr-2">
                            {user.lastMessage || 'ไม่มีข้อความ'}
                          </p>
                          {user.unreadCount > 0 && (
                            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 bg-[#06C755] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {user.unreadCount > 99 ? '99+' : user.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chat Area - Slide Animation */}
        <div className={cn(
          "flex-1 flex flex-col bg-[#0a0a0a] transition-all duration-300 ease-out",
          showMobileChat
            ? "fixed inset-0 z-50 pt-16 md:pt-0 lg:static lg:pt-0 translate-x-0 opacity-100"
            : "hidden lg:flex lg:translate-x-0 translate-x-full opacity-0"
        )}>
          {selectedUser ? (
            <>
              {/* Chat Header - LINE OA Style */}
              <div className="h-[60px] lg:h-16 px-3 lg:px-4 flex items-center justify-between border-b border-white/5 bg-[#06C755] lg:bg-[#0d0d0d] flex-shrink-0">
                <div className="flex items-center gap-3 lg:gap-3 flex-1 min-w-0">
                  {/* Back button - Always visible on mobile/tablet, hidden on desktop */}
                  <button
                    onClick={handleBackToList}
                    className="flex lg:hidden items-center justify-center gap-1.5 min-w-[80px] h-11 px-3 text-white bg-white/20 hover:bg-white/30 rounded-xl border border-white/20 shadow-lg transition-all duration-200 active:scale-95"
                  >
                    <ArrowLeft className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
                    <span className="text-sm font-bold">กลับ</span>
                  </button>

                  {/* User info */}
                  <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-full bg-white/20 lg:bg-gradient-to-br lg:from-slate-600 lg:to-slate-700 overflow-hidden flex-shrink-0 ring-2 ring-white/30 lg:ring-0">
                    {selectedUser.lineUserPicture ? (
                      <img src={selectedUser.lineUserPicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold text-base">
                        {(selectedUser.lineUserName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm lg:text-base truncate">{selectedUser.lineUserName || 'ไม่ระบุชื่อ'}</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-white lg:bg-[#06C755] animate-pulse" />
                      <p className="text-[11px] text-white/80 lg:text-[#06C755]">ออนไลน์</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  {/* Message search toggle */}
                  <button
                    onClick={() => setShowMessageSearch(!showMessageSearch)}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                      showMessageSearch ? "bg-white/30 lg:bg-[#06C755] text-white" : "hover:bg-white/20 lg:hover:bg-white/5 text-white lg:text-slate-400"
                    )}
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button className="w-10 h-10 rounded-full hover:bg-white/20 lg:hover:bg-white/5 flex items-center justify-center text-white lg:text-slate-400 transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Message Search Bar */}
              {showMessageSearch && (
                <div className="px-4 py-2 bg-[#0d0d0d] border-b border-white/5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="ค้นหาข้อความ..."
                      value={messageSearchTerm}
                      onChange={(e) => setMessageSearchTerm(e.target.value)}
                      autoFocus
                      className="w-full h-10 pl-10 pr-10 bg-white/[0.05] border border-white/10 rounded-full text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#06C755]/50"
                    />
                    {messageSearchTerm && (
                      <button
                        onClick={() => setMessageSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {messageSearchTerm && (
                    <p className="text-xs text-slate-500 mt-2">
                      พบ {filteredMessages.length} ข้อความ
                    </p>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-hidden relative">
                {/* New message indicator */}
                {hasNewMessage && (
                  <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-[#06C755] text-white text-xs font-semibold rounded-full shadow-lg hover:bg-[#05a347] transition-all flex items-center gap-2"
                  >
                    <ChevronDown className="w-4 h-4" />
                    ข้อความใหม่
                  </button>
                )}

                <div
                  ref={messagesContainerRef}
                  onScroll={handleScroll}
                  className="absolute inset-0 overflow-y-auto px-3 lg:px-4 py-4 touch-pan-y overscroll-contain scroll-smooth"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Spinner size="lg" />
                    </div>
                  ) : filteredMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <MessageCircle className="w-10 h-10 text-slate-500" />
                      </div>
                      <p className="text-slate-500 text-sm">
                        {messageSearchTerm ? 'ไม่พบข้อความที่ค้นหา' : 'เริ่มการสนทนา'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 max-w-3xl mx-auto">
                      {filteredMessages.map((msg, index) => {
                        const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
                        const showDate = shouldShowDateSeparator(msg, prevMsg);
                        const isOut = msg.direction === 'out';
                        const imageUrl = msg.messageType === 'image' && msg.messageId
                          ? chatMessagesApi.getImage(activeAccountId, msg.messageId)
                          : null;

                        const sameSender = prevMsg && prevMsg.direction === msg.direction;
                        const isLastInGroup = index === filteredMessages.length - 1 || filteredMessages[index + 1]?.direction !== msg.direction;

                        // Highlight search term
                        const highlightText = (text: string) => {
                          if (!messageSearchTerm) return text;
                          const regex = new RegExp(`(${messageSearchTerm})`, 'gi');
                          const parts = text.split(regex);
                          return parts.map((part, i) =>
                            regex.test(part) ? (
                              <mark key={i} className="bg-yellow-500/50 text-white rounded px-0.5">{part}</mark>
                            ) : part
                          );
                        };

                        return (
                          <div key={msg._id}>
                            {/* Date Separator */}
                            {showDate && (
                              <div className="flex items-center justify-center my-4">
                                <span className="px-3 py-1 bg-white/5 text-slate-400 text-[11px] rounded-full">
                                  {formatDateSeparator(msg.createdAt)}
                                </span>
                              </div>
                            )}

                            {/* Message */}
                            <div className={cn(
                              "flex items-end gap-2",
                              isOut ? "justify-end" : "justify-start",
                              !sameSender && "mt-3"
                            )}>
                              {/* Avatar for incoming messages */}
                              {!isOut && (
                                <div className={cn(
                                  "w-7 h-7 lg:w-8 lg:h-8 rounded-full overflow-hidden flex-shrink-0",
                                  !isLastInGroup && "invisible"
                                )}>
                                  {selectedUser.lineUserPicture ? (
                                    <img src={selectedUser.lineUserPicture} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-xs font-bold">
                                      {(selectedUser.lineUserName || '?').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className={cn(
                                "flex flex-col max-w-[80%] sm:max-w-[70%]",
                                isOut ? "items-end" : "items-start"
                              )}>
                                {/* Message Bubble */}
                                <div className={cn(
                                  "relative px-3 lg:px-4 py-2 lg:py-2.5 rounded-2xl",
                                  isOut
                                    ? "bg-[#06C755] text-white rounded-br-md"
                                    : "bg-[#1a1a1a] text-white rounded-bl-md"
                                )}>
                                  {msg.messageType === 'image' ? (
                                    imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt="รูปภาพ"
                                        className="max-w-[200px] lg:max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(imageUrl, '_blank')}
                                        onLoad={() => {
                                          if (isAtBottomRef.current) scrollToBottom();
                                        }}
                                      />
                                    ) : (
                                      <div className="flex items-center gap-2 text-white/60">
                                        <ImageIcon className="w-4 h-4" />
                                        <span className="text-sm">[รูปภาพ]</span>
                                      </div>
                                    )
                                  ) : msg.messageType === 'sticker' ? (
                                    <div className="flex items-center gap-2 text-white/60">
                                      <Smile className="w-4 h-4" />
                                      <span className="text-sm">[สติกเกอร์]</span>
                                    </div>
                                  ) : (
                                    <p className="text-sm lg:text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                                      {highlightText(msg.messageText || '')}
                                    </p>
                                  )}
                                </div>

                                {/* Time & Read status */}
                                {isLastInGroup && (
                                  <div className={cn(
                                    "flex items-center gap-1 mt-1 px-1",
                                    isOut ? "flex-row-reverse" : "flex-row"
                                  )}>
                                    <span className="text-[10px] text-slate-500">
                                      {formatMessageTime(msg.createdAt)}
                                    </span>
                                    {isOut && (
                                      <CheckCheck className="w-3.5 h-3.5 text-[#06C755]" />
                                    )}
                                  </div>
                                )}
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

              {/* Input Area - LINE Style */}
              <div className="px-2 sm:px-3 lg:px-4 py-2 lg:py-3 border-t border-white/5 bg-[#0d0d0d] flex-shrink-0 safe-area-bottom">
                <div className="flex items-end gap-2 max-w-3xl mx-auto">
                  {/* Input */}
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      value={newMessage}
                      onChange={handleTextareaChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Aa"
                      className="w-full min-h-[42px] max-h-[120px] px-4 py-2.5 bg-white/[0.08] border border-white/10 rounded-full text-white text-sm lg:text-[15px] placeholder:text-slate-500 focus:outline-none focus:border-[#06C755]/50 focus:bg-white/[0.1] resize-none transition-all"
                      rows={1}
                      disabled={sending}
                    />
                  </div>

                  {/* Send button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !newMessage.trim()}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5",
                      newMessage.trim()
                        ? "bg-[#06C755] text-white hover:bg-[#05a347] active:scale-90 shadow-lg shadow-[#06C755]/30"
                        : "bg-transparent text-slate-500"
                    )}
                  >
                    {sending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Send className={cn("w-5 h-5 transition-transform", newMessage.trim() && "translate-x-0.5")} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* No chat selected */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-12 h-12 text-slate-500" />
                </div>
                <p className="text-white font-medium mb-1">เลือกแชทเพื่อเริ่มสนทนา</p>
                <p className="text-slate-500 text-sm">เลือกผู้ใช้จากรายการด้านซ้าย</p>
              </div>
            </div>
          )}
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
          <PageLoading message="กำลังโหลด..." />
        </DashboardLayout>
      }
    >
      <UserChatContent />
    </Suspense>
  );
}
