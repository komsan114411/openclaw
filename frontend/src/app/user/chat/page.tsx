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
  Phone,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck
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
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

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
      socket.emit('subscribe_chat', { lineAccountId: activeAccountId });
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
    setSending(true);
    try {
      const res = await chatMessagesApi.sendMessage(activeAccountId, selectedUser.lineUserId, newMessage.trim());
      if (res.data?.success) {
        setNewMessage('');
        if (textareaRef.current) {
          textareaRef.current.style.height = '44px';
        }
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

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = '44px';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const filteredUsers = users.filter((u) => {
    const hay = `${u.lineUserName || ''} ${u.lineUserId}`.toLowerCase();
    return hay.includes(searchTerm.toLowerCase());
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
              <svg className="w-10 h-10 text-[#06C755]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 5.58 2 10c0 2.03.94 3.89 2.5 5.29V20l3.88-2.13c1.09.27 2.28.41 3.62.41 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/>
              </svg>
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
          "w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d0d]",
          showMobileChat && "hidden lg:flex"
        )}>
          {/* Header with Account Selector */}
          <div className="p-4 border-b border-white/5">
            {/* Account Dropdown */}
            <div className="relative mb-3">
              <button
                onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#06C755] flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 5.58 2 10c0 2.03.94 3.89 2.5 5.29V20l3.88-2.13c1.09.27 2.28.41 3.62.41 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-white truncate max-w-[180px]">
                      {activeAccount?.accountName || 'เลือกบัญชี'}
                    </p>
                    <p className="text-[10px] text-slate-500">{allAccounts.length} บัญชี</p>
                  </div>
                </div>
                <ChevronDown className={cn(
                  "w-4 h-4 text-slate-400 transition-transform",
                  showAccountDropdown && "rotate-180"
                )} />
              </button>

              {/* Dropdown */}
              {showAccountDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
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
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 5.58 2 10c0 2.03.94 3.89 2.5 5.29V20l3.88-2.13c1.09.27 2.28.41 3.62.41 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/>
                        </svg>
                      </div>
                      <span className={cn(
                        "text-sm font-medium truncate",
                        acc._id === activeAccountId ? "text-[#06C755]" : "text-white"
                      )}>
                        {acc.accountName || 'บัญชี LINE'}
                      </span>
                      {acc._id === activeAccountId && (
                        <Check className="w-4 h-4 text-[#06C755] ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="ค้นหา"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-white/[0.03] border border-white/5 rounded-full text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#06C755]/50 transition-colors"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="lg" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-white font-medium mb-1">ยังไม่มีแชท</p>
                <p className="text-slate-500 text-sm">รอข้อความจากลูกค้า</p>
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
                        // Clear unread count
                        setUsers(prev => prev.map(u =>
                          u.lineUserId === user.lineUserId ? { ...u, unreadCount: 0 } : u
                        ));
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-4 hover:bg-white/[0.03] transition-colors border-b border-white/[0.02]",
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
                        {/* Online indicator */}
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

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col bg-[#0a0a0a]",
          showMobileChat ? "fixed inset-0 z-50 lg:static" : "hidden lg:flex"
        )}>
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="h-16 px-4 flex items-center justify-between border-b border-white/5 bg-[#0d0d0d] flex-shrink-0 safe-area-top">
                <div className="flex items-center gap-3">
                  {/* Back button (mobile) */}
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setShowMobileChat(false);
                    }}
                    className="lg:hidden w-10 h-10 -ml-2 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  {/* User info */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 overflow-hidden flex-shrink-0">
                    {selectedUser.lineUserPicture ? (
                      <img src={selectedUser.lineUserPicture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-bold">
                        {(selectedUser.lineUserName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{selectedUser.lineUserName || 'ไม่ระบุชื่อ'}</p>
                    <p className="text-[10px] text-[#06C755]">ออนไลน์</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 transition-colors">
                    <Phone className="w-5 h-5" />
                  </button>
                  <button className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 transition-colors">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              </div>

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
                  className="absolute inset-0 overflow-y-auto px-4 py-4 touch-pan-y overscroll-contain"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Spinner size="lg" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-slate-500 text-sm">เริ่มการสนทนา</p>
                    </div>
                  ) : (
                    <div className="space-y-1 max-w-3xl mx-auto">
                      {messages.map((msg, index) => {
                        const prevMsg = index > 0 ? messages[index - 1] : null;
                        const showDate = shouldShowDateSeparator(msg, prevMsg);
                        const isOut = msg.direction === 'out';
                        const imageUrl = msg.messageType === 'image' && msg.messageId
                          ? chatMessagesApi.getImage(activeAccountId, msg.messageId)
                          : null;

                        // Check if same sender as previous (for grouping)
                        const sameSender = prevMsg && prevMsg.direction === msg.direction;
                        const isLastInGroup = index === messages.length - 1 || messages[index + 1]?.direction !== msg.direction;

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
                                  "w-8 h-8 rounded-full overflow-hidden flex-shrink-0",
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
                                "flex flex-col max-w-[75%] sm:max-w-[65%]",
                                isOut ? "items-end" : "items-start"
                              )}>
                                {/* Message Bubble */}
                                <div className={cn(
                                  "relative px-4 py-2.5 rounded-2xl",
                                  isOut
                                    ? "bg-[#06C755] text-white rounded-br-md"
                                    : "bg-[#1a1a1a] text-white rounded-bl-md"
                                )}>
                                  {msg.messageType === 'image' ? (
                                    imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt="รูปภาพ"
                                        className="max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
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
                                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                                      {msg.messageText}
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

              {/* Input Area */}
              <div className="px-4 py-3 border-t border-white/5 bg-[#0d0d0d] flex-shrink-0 safe-area-bottom">
                <div className="flex items-end gap-2 max-w-3xl mx-auto">
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pb-1">
                    <button className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 transition-colors">
                      <ImageIcon className="w-5 h-5" />
                    </button>
                  </div>

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
                      placeholder="พิมพ์ข้อความ"
                      className="w-full min-h-[44px] max-h-[120px] px-4 py-3 bg-white/[0.05] border border-white/10 rounded-3xl text-white text-[15px] placeholder:text-slate-500 focus:outline-none focus:border-[#06C755]/50 resize-none transition-colors"
                      rows={1}
                      disabled={sending}
                    />
                  </div>

                  {/* Send button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !newMessage.trim()}
                    className={cn(
                      "w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0",
                      newMessage.trim()
                        ? "bg-[#06C755] text-white hover:bg-[#05a347]"
                        : "bg-white/5 text-slate-500"
                    )}
                  >
                    {sending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Send className="w-5 h-5" />
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
                  <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
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
