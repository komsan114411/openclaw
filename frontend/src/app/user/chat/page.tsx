'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

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
  createdAt: string;
  lineUserName?: string;
  sentBy?: string;
}

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get(`/chat-messages/${accountId}/users`);
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load chat users');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const fetchMessages = useCallback(async (userId: string) => {
    if (!accountId) return;
    try {
      const response = await api.get(`/chat-messages/${accountId}/${userId}`);
      if (response.data.success) {
        setMessages(response.data.messages);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load messages');
    }
  }, [accountId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.lineUserId);
    }
  }, [selectedUser, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectUser = (user: ChatUser) => {
    setSelectedUser(user);
    setMessages([]);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || sending || !accountId) return;

    setSending(true);
    try {
      const response = await api.post(
        `/chat-messages/${accountId}/${selectedUser.lineUserId}/send`,
        { message: newMessage }
      );

      if (response.data.success) {
        setNewMessage('');
        await fetchMessages(selectedUser.lineUserId);
      } else {
        setError(response.data.error || 'Failed to send message');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  };

  if (!accountId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-500 mb-4">ไม่พบ Account ID</p>
          <button
            onClick={() => router.push('/user/line-accounts')}
            className="text-green-500 hover:underline"
          >
            กลับไปหน้า LINE Accounts
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-900"
              >
                ← กลับ
              </button>
              <h1 className="text-xl font-bold">ประวัติการแชท</h1>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
            <button onClick={() => setError('')} className="float-right">&times;</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex h-[calc(100vh-200px)] bg-white rounded-lg shadow overflow-hidden">
          {/* User List */}
          <div className="w-1/3 border-r overflow-y-auto">
            <div className="p-4 border-b bg-gray-50">
              <h2 className="font-semibold">รายชื่อผู้ใช้ ({users.length})</h2>
            </div>
            {users.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                ยังไม่มีการสนทนา
              </div>
            ) : (
              users.map((user) => (
                <div
                  key={user.lineUserId}
                  onClick={() => handleSelectUser(user)}
                  className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                    selectedUser?.lineUserId === user.lineUserId ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
                      {user.lineUserPicture ? (
                        <img
                          src={user.lineUserPicture}
                          alt={user.lineUserName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-600 text-lg">
                          {user.lineUserName?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate">{user.lineUserName}</p>
                        {user.unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                            {user.unreadCount}
                          </span>
                        )}
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

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {selectedUser ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
                      {selectedUser.lineUserPicture ? (
                        <img
                          src={selectedUser.lineUserPicture}
                          alt={selectedUser.lineUserName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-600 text-lg">
                          {selectedUser.lineUserName?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{selectedUser.lineUserName}</p>
                      <p className="text-xs text-gray-500">{selectedUser.lineUserId}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          msg.direction === 'out'
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {msg.messageType === 'image' ? (
                          <div className="text-sm italic">[รูปภาพ]</div>
                        ) : msg.messageType === 'sticker' ? (
                          <div className="text-sm italic">[สติกเกอร์]</div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.messageText}</p>
                        )}
                        <p
                          className={`text-xs mt-1 ${
                            msg.direction === 'out' ? 'text-green-100' : 'text-gray-500'
                          }`}
                        >
                          {formatTime(msg.createdAt)}
                          {msg.direction === 'out' && msg.sentBy && ` • ${msg.sentBy}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t bg-gray-50">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="พิมพ์ข้อความ..."
                      className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                      disabled={sending}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? 'กำลังส่ง...' : 'ส่ง'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                เลือกผู้ใช้เพื่อดูประวัติการแชท
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatHistoryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
