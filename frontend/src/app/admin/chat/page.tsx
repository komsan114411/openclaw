'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, lineAccountsApi } from '@/lib/api';
import { LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Loading';

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
  direction: 'in' | 'out';
  messageType: string;
  messageText?: string;
  imageUrl?: string;
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

  // Fetch all LINE accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const response = await lineAccountsApi.getAll();
      setAccounts(response.data.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  // Fetch users for selected account
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

  // Fetch messages for selected user
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
    // Scroll to bottom when messages change
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
        toast.success('ส่งข้อความสำเร็จ');
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
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatLastSeen = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'เมื่อสักครู่';
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    if (days < 7) return `${days} วันที่แล้ว`;
    return date.toLocaleDateString('th-TH');
  };

  const filteredUsers = users.filter(user =>
    user.lineUserName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lineUserId.includes(searchTerm)
  );

  const selectedAccount = accounts.find(a => a._id === selectedAccountId);

  return (
    <DashboardLayout requiredRole="admin">
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ประวัติการแชท LINE</h1>
            <p className="text-gray-500">ดูและตอบกลับข้อความจากลูกค้า</p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="w-64"
            >
              <option value="">-- เลือกบัญชี LINE --</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.accountName}
                </option>
              ))}
            </Select>
            {selectedAccountId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchUsers}
              >
                รีเฟรช
              </Button>
            )}
          </div>
        </div>

        {!selectedAccountId ? (
          <Card className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-500 mb-2">เลือกบัญชี LINE เพื่อดูประวัติการแชท</p>
              <p className="text-sm text-gray-400">คุณสามารถดูและตอบกลับข้อความจากลูกค้าได้ที่นี่</p>
            </div>
          </Card>
        ) : (
          <div className="flex-1 flex gap-4 min-h-0">
            {/* User List */}
            <Card className="w-80 flex flex-col p-0 overflow-hidden">
              {/* Account Info */}
              {selectedAccount && (
                <div className="p-3 bg-gradient-to-r from-green-500 to-green-600 text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{selectedAccount.accountName}</p>
                      <p className="text-xs text-white/80">{users.length} ผู้ใช้</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="p-3 border-b">
                <Input
                  placeholder="ค้นหาผู้ใช้..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  leftIcon={
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  }
                />
              </div>

              {/* User List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm ? 'ไม่พบผู้ใช้ที่ค้นหา' : 'ยังไม่มีการสนทนา'}
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.lineUserId}
                      onClick={() => handleSelectUser(user)}
                      className={`p-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedUser?.lineUserId === user.lineUserId ? 'bg-green-50 border-l-4 border-l-green-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden">
                            {user.lineUserPicture ? (
                              <img
                                src={user.lineUserPicture}
                                alt={user.lineUserName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-gray-500 text-lg font-medium">
                                {user.lineUserName?.charAt(0) || '?'}
                              </span>
                            )}
                          </div>
                          {user.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {user.unreadCount > 9 ? '9+' : user.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-900 truncate">{user.lineUserName}</p>
                            <span className="text-xs text-gray-400">
                              {formatLastSeen(user.lastMessageTime)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 truncate">
                            {user.lastMessage || 'ไม่มีข้อความ'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Chat Area */}
            <Card className="flex-1 flex flex-col p-0 overflow-hidden">
              {selectedUser ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b bg-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden">
                        {selectedUser.lineUserPicture ? (
                          <img
                            src={selectedUser.lineUserPicture}
                            alt={selectedUser.lineUserName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-gray-500 font-medium">
                            {selectedUser.lineUserName?.charAt(0) || '?'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{selectedUser.lineUserName}</p>
                        <p className="text-xs text-gray-500">{selectedUser.lineUserId}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchMessages(selectedUser.lineUserId)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </Button>
                  </div>

                  {/* Messages */}
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50"
                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
                  >
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        ยังไม่มีข้อความ
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg._id}
                          className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                              msg.direction === 'out'
                                ? 'bg-green-500 text-white rounded-br-md'
                                : 'bg-white text-gray-800 rounded-bl-md'
                            }`}
                          >
                            {msg.messageType === 'image' ? (
                              msg.imageUrl ? (
                                <img
                                  src={msg.imageUrl}
                                  alt="รูปภาพ"
                                  className="max-w-full rounded-lg cursor-pointer"
                                  onClick={() => window.open(msg.imageUrl, '_blank')}
                                />
                              ) : (
                                <div className="text-sm italic opacity-70">[รูปภาพ]</div>
                              )
                            ) : msg.messageType === 'sticker' ? (
                              <div className="text-sm italic opacity-70">[สติกเกอร์]</div>
                            ) : msg.messageType === 'location' ? (
                              <div className="text-sm italic opacity-70">[ตำแหน่งที่ตั้ง]</div>
                            ) : (
                              <p className="whitespace-pre-wrap break-words">{msg.messageText}</p>
                            )}
                            <div className={`flex items-center gap-1 mt-1 ${
                              msg.direction === 'out' ? 'justify-end' : 'justify-start'
                            }`}>
                              <span className={`text-xs ${
                                msg.direction === 'out' ? 'text-green-100' : 'text-gray-400'
                              }`}>
                                {formatTime(msg.createdAt)}
                              </span>
                              {msg.direction === 'out' && msg.sentBy && (
                                <span className="text-xs text-green-100">• {msg.sentBy}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="p-4 border-t bg-white">
                    <div className="flex gap-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="พิมพ์ข้อความ..."
                        disabled={sending}
                        className="flex-1"
                      />
                      <Button
                        variant="primary"
                        onClick={handleSendMessage}
                        disabled={sending || !newMessage.trim()}
                        isLoading={sending}
                      >
                        ส่ง
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">เลือกผู้ใช้เพื่อดูประวัติการแชท</p>
                    <p className="text-sm text-gray-400 mt-1">คลิกที่รายชื่อผู้ใช้ทางซ้ายมือ</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function AdminChatPage() {
  return (
    <Suspense fallback={
      <DashboardLayout requiredRole="admin">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    }>
      <AdminChatContent />
    </Suspense>
  );
}
