'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { activityLogsApi, usersApi } from '@/lib/api';
import { ActivityLog, User } from '@/types';
import toast from 'react-hot-toast';

export default function AdminHistoryPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [logsRes, usersRes] = await Promise.all([
        activityLogsApi.getAll({ limit: 200 }),
        usersApi.getAll(),
      ]);
      setLogs(logsRes.data.logs || []);
      setUsers(usersRes.data.users || []);
    } catch (error) {
      toast.error('ไม่สามารถโหลดประวัติได้');
    } finally {
      setIsLoading(false);
    }
  };

  const userMap = new Map(users.map((u) => [u._id, u.username]));

  const filtered = logs.filter((l) => {
    const text = `${l.action} ${l.message || ''} ${l.entityType || ''} ${l.entityId || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ประวัติระบบ</h1>
            <p className="text-gray-500">บันทึกการทำรายการทั้งหมด (Audit Log)</p>
          </div>
          <button onClick={fetchData} className="btn btn-secondary">
            รีเฟรช
          </button>
        </div>

        <div className="card">
          <input
            className="input w-full md:w-96"
            placeholder="ค้นหา action/message/entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เวลา</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้ทำรายการ</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">เป้าหมาย</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    ไม่พบประวัติ
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString('th-TH')}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-gray-900">
                        {log.actorRole === 'system'
                          ? 'system'
                          : userMap.get(log.actorUserId || '') || log.actorUserId || '-'}
                      </div>
                      {log.subjectUserId && (
                        <div className="text-gray-500">
                          ผู้เกี่ยวข้อง: {userMap.get(log.subjectUserId) || log.subjectUserId}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-700">{log.action}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.entityType ? `${log.entityType}:${log.entityId || ''}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{log.message || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

