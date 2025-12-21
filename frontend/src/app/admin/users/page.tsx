'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi, packagesApi, subscriptionsApi } from '@/lib/api';
import { User, Package } from '@/types';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    fullName: '',
    role: 'user',
    forcePasswordChange: true,
  });
  const [editFormData, setEditFormData] = useState({
    email: '',
    fullName: '',
    role: 'user',
    isActive: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, packagesRes] = await Promise.all([
        usersApi.getAll(),
        packagesApi.getAll(true),
      ]);
      setUsers(usersRes.data.users || []);
      setPackages(packagesRes.data.packages || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await usersApi.create(formData);
      if (response.data.success) {
        toast.success('สร้างผู้ใช้สำเร็จ');
        setShowModal(false);
        setFormData({
          username: '',
          password: '',
          email: '',
          fullName: '',
          role: 'user',
          forcePasswordChange: true,
        });
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    try {
      const response = await usersApi.update(selectedUser._id, editFormData);
      if (response.data.success) {
        toast.success('อัปเดตผู้ใช้สำเร็จ');
        setShowEditModal(false);
        setSelectedUser(null);
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('ต้องการลบผู้ใช้นี้หรือไม่?')) return;
    try {
      const response = await usersApi.delete(id);
      if (response.data.success) {
        toast.success('ลบผู้ใช้สำเร็จ');
        fetchData();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleGrantPackage = async () => {
    if (!selectedUser || !selectedPackageId) {
      toast.error('กรุณาเลือกแพ็คเกจ');
      return;
    }
    
    try {
      const response = await subscriptionsApi.grant(selectedUser._id, selectedPackageId);
      if (response.data.success) {
        toast.success('ให้แพ็คเกจสำเร็จ');
        setShowGrantModal(false);
        setSelectedUser(null);
        setSelectedPackageId('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setEditFormData({
      email: user.email || '',
      fullName: user.fullName || '',
      role: user.role,
      isActive: user.isActive,
    });
    setShowEditModal(true);
  };

  const openGrantModal = (user: User) => {
    setSelectedUser(user);
    setSelectedPackageId('');
    setShowGrantModal(true);
  };

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้งาน</h1>
            <p className="text-gray-500">เพิ่ม แก้ไข หรือลบผู้ใช้งาน</p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            + เพิ่มผู้ใช้
          </button>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้ใช้</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">อีเมล</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">บทบาท</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold">
                          {user.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.username}</p>
                          <p className="text-sm text-gray-500">{user.fullName || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{user.email || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {user.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {user.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openGrantModal(user)}
                          className="text-green-600 hover:text-green-800 text-sm"
                        >
                          ให้แพ็คเกจ
                        </button>
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user._id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">เพิ่มผู้ใช้ใหม่</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="label">ชื่อผู้ใช้ *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">รหัสผ่าน *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="label">อีเมล</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">บทบาท</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.forcePasswordChange}
                  onChange={(e) => setFormData({ ...formData, forcePasswordChange: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-gray-700">บังคับเปลี่ยนรหัสผ่านครั้งแรก</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary flex-1">
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  สร้างผู้ใช้
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">แก้ไขผู้ใช้: {selectedUser.username}</h2>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="label">อีเมล</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  value={editFormData.fullName}
                  onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">บทบาท</label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  className="input"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editFormData.isActive}
                  onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-gray-700">เปิดใช้งาน</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary flex-1">
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant Package Modal */}
      {showGrantModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">ให้แพ็คเกจ: {selectedUser.username}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">เลือกแพ็คเกจ</label>
                <select
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  className="input"
                >
                  <option value="">-- เลือกแพ็คเกจ --</option>
                  {packages.filter(p => p.isActive).map((pkg) => (
                    <option key={pkg._id} value={pkg._id}>
                      {pkg.name} - {pkg.slipQuota.toLocaleString()} สลิป ({pkg.durationDays} วัน)
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-gray-500">
                การให้แพ็คเกจจะเพิ่มโควต้าให้ผู้ใช้โดยไม่ต้องชำระเงิน
              </p>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowGrantModal(false)} className="btn btn-secondary flex-1">
                  ยกเลิก
                </button>
                <button onClick={handleGrantPackage} className="btn btn-primary flex-1">
                  ให้แพ็คเกจ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
