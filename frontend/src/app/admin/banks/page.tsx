'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Bank {
  _id: string;
  code: string;
  name: string;
  nameTh?: string;
  nameEn?: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

export default function BanksManagementPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);

  const fetchBanks = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/banks');
      if (response.data.success) {
        setBanks(response.data.banks);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load banks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const handleInitDefaults = async () => {
    try {
      setLoading(true);
      const response = await api.post('/api/admin/banks/init-defaults');
      if (response.data.success) {
        await fetchBanks();
        alert(response.data.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initialize banks');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (bankId: string) => {
    if (!confirm('คุณต้องการลบธนาคารนี้หรือไม่?')) return;

    try {
      await api.delete(`/api/admin/banks/${bankId}`);
      await fetchBanks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete bank');
    }
  };

  const handleToggleActive = async (bank: Bank) => {
    try {
      await api.put(`/api/admin/banks/${bank._id}`, {
        isActive: !bank.isActive,
      });
      await fetchBanks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update bank');
    }
  };

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
              <h1 className="text-xl font-bold">จัดการธนาคาร</h1>
            </div>
            <div className="flex space-x-2">
              {banks.length === 0 && (
                <button
                  onClick={handleInitDefaults}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  นำเข้าธนาคารเริ่มต้น
                </button>
              )}
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                + เพิ่มธนาคาร
              </button>
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
        {banks.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">ยังไม่มีข้อมูลธนาคาร</p>
            <button
              onClick={handleInitDefaults}
              className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
            >
              นำเข้าธนาคารเริ่มต้น
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    โลโก้
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    รหัส
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    ชื่อธนาคาร
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    ชื่อย่อ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    สี
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    สถานะ
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {banks.map((bank) => (
                  <tr key={bank._id} className={!bank.isActive ? 'bg-gray-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: bank.color || '#666' }}
                      >
                        {bank.shortName?.charAt(0) || bank.code.charAt(0)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                      {bank.code}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{bank.name}</div>
                      {bank.nameEn && (
                        <div className="text-sm text-gray-500">{bank.nameEn}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {bank.shortName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-6 h-6 rounded"
                          style={{ backgroundColor: bank.color || '#666' }}
                        />
                        <span className="text-sm font-mono">{bank.color}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(bank)}
                        className={`px-2 py-1 rounded text-xs ${
                          bank.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {bank.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => setEditingBank(bank)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => handleDelete(bank._id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingBank) && (
        <BankModal
          bank={editingBank}
          onClose={() => {
            setShowCreateModal(false);
            setEditingBank(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingBank(null);
            fetchBanks();
          }}
        />
      )}
    </div>
  );
}

interface BankModalProps {
  bank: Bank | null;
  onClose: () => void;
  onSave: () => void;
}

function BankModal({ bank, onClose, onSave }: BankModalProps) {
  const [formData, setFormData] = useState({
    code: bank?.code || '',
    name: bank?.name || '',
    nameTh: bank?.nameTh || '',
    nameEn: bank?.nameEn || '',
    shortName: bank?.shortName || '',
    color: bank?.color || '#666666',
    logoUrl: bank?.logoUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (bank) {
        await api.put(`/api/admin/banks/${bank._id}`, formData);
      } else {
        await api.post('/api/admin/banks', formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save bank');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">
            {bank ? 'แก้ไขธนาคาร' : 'เพิ่มธนาคาร'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">รหัสธนาคาร</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              className="w-full border rounded px-3 py-2"
              required
              disabled={!!bank}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ชื่อธนาคาร (ไทย)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ชื่อธนาคาร (อังกฤษ)</label>
            <input
              type="text"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ชื่อย่อ</label>
            <input
              type="text"
              value={formData.shortName}
              onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">สี</label>
            <div className="flex space-x-2">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-12 h-10 border rounded"
              />
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="flex-1 border rounded px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL โลโก้</label>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="https://..."
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
