'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { PageLoading } from '@/components/ui/Loading';
import { Input } from '@/components/ui/Input';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bankToDelete, setBankToDelete] = useState<Bank | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ป้องกันการกดซ้ำ
  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchBanks = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/banks');
      if (response.data.success) {
        setBanks(response.data.banks);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load banks');
      toast.error('ไม่สามารถโหลดข้อมูลธนาคารได้');
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
        toast.success(response.data.message || 'นำเข้าธนาคารเริ่มต้นสำเร็จ', { icon: '🏦' });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to initialize banks');
      toast.error('ไม่สามารถนำเข้าธนาคารเริ่มต้นได้');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (bank: Bank) => {
    setBankToDelete(bank);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!bankToDelete) return;

    // ป้องกันการกดซ้ำ
    if (processingIdsRef.current.has(bankToDelete._id)) {
      toast.error('กำลังดำเนินการอยู่');
      return;
    }

    processingIdsRef.current.add(bankToDelete._id);
    setIsDeleting(true);

    try {
      await api.delete(`/api/admin/banks/${bankToDelete._id}`);
      toast.success('ลบธนาคารสำเร็จ', { icon: '🗑️' });
      setShowDeleteConfirm(false);
      await fetchBanks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถลบธนาคารได้');
    } finally {
      setIsDeleting(false);
      processingIdsRef.current.delete(bankToDelete._id);
    }
  };

  const handleToggleActive = async (bank: Bank) => {
    // ป้องกันการกดซ้ำ
    if (processingIdsRef.current.has(bank._id)) {
      toast.error('กำลังดำเนินการอยู่');
      return;
    }

    processingIdsRef.current.add(bank._id);

    try {
      await api.put(`/api/admin/banks/${bank._id}`, {
        isActive: !bank.isActive,
      });
      toast.success(
        bank.isActive ? 'ปิดใช้งานธนาคารสำเร็จ' : 'เปิดใช้งานธนาคารสำเร็จ',
        { icon: bank.isActive ? '🔒' : '🔓' }
      );
      await fetchBanks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถอัปเดตสถานะได้');
    } finally {
      processingIdsRef.current.delete(bank._id);
    }
  };

  const filteredBanks = banks.filter(bank =>
    bank.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bank.name.includes(searchQuery) ||
    bank.nameEn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bank.shortName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = banks.filter(b => b.isActive).length;
  const inactiveCount = banks.filter(b => !b.isActive).length;

  if (loading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading message="กำลังโหลดข้อมูลธนาคาร..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">จัดการธนาคาร</h1>
            <p className="page-subtitle">จัดการรายชื่อธนาคารในระบบ</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant="success">{activeCount} เปิดใช้งาน</Badge>
              <Badge variant="secondary">{inactiveCount} ปิดใช้งาน</Badge>
            </div>
            {banks.length === 0 && (
              <Button variant="secondary" onClick={handleInitDefaults}>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                นำเข้าธนาคารเริ่มต้น
              </Button>
            )}
            <Button onClick={() => setShowCreateModal(true)}>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              เพิ่มธนาคาร
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="ค้นหาธนาคาร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </div>
          </div>
        </Card>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-red-700 font-medium">{error}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setError('')}>
              ปิด
            </Button>
          </div>
        )}

        {/* Banks Table */}
        {filteredBanks.length === 0 ? (
          <Card className="py-12">
            <EmptyState
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              title={searchQuery ? 'ไม่พบธนาคารที่ค้นหา' : 'ยังไม่มีข้อมูลธนาคาร'}
              description={searchQuery ? 'ลองค้นหาด้วยคำอื่น' : 'นำเข้าธนาคารเริ่มต้นหรือเพิ่มธนาคารใหม่'}
              action={
                !searchQuery && (
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={handleInitDefaults}>
                      นำเข้าธนาคารเริ่มต้น
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)}>
                      เพิ่มธนาคาร
                    </Button>
                  </div>
                )
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">โลโก้</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">รหัส</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ชื่อธนาคาร</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ชื่อย่อ</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">สี</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">สถานะ</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBanks.map((bank) => (
                    <tr key={bank._id} className={`hover:bg-gray-50 transition-colors ${!bank.isActive ? 'bg-gray-50 opacity-60' : ''}`}>
                      <td className="px-6 py-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                          style={{ backgroundColor: bank.color || '#666' }}
                        >
                          {bank.shortName?.charAt(0) || bank.code.charAt(0)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary" size="sm">{bank.code}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">{bank.name}</p>
                        {bank.nameEn && (
                          <p className="text-sm text-gray-500">{bank.nameEn}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {bank.shortName || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-lg shadow-inner"
                            style={{ backgroundColor: bank.color || '#666' }}
                          />
                          <span className="text-xs font-mono text-gray-500">{bank.color}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant={bank.isActive ? 'success' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleActive(bank)}
                          disabled={processingIdsRef.current.has(bank._id)}
                        >
                          {bank.isActive ? '✓ เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </Button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingBank(bank)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(bank)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="ลบธนาคาร"
        message={`คุณต้องการลบธนาคาร "${bankToDelete?.name}" หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        type="danger"
        isLoading={isDeleting}
      />
    </DashboardLayout>
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
    color: bank?.color || '#1a73e8',
    logoUrl: bank?.logoUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const lastSubmitTimeRef = useRef<number>(0);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.code.trim()) {
      errors.code = 'กรุณากรอกรหัสธนาคาร';
    } else if (!/^[A-Z0-9]+$/.test(formData.code)) {
      errors.code = 'รหัสธนาคารต้องเป็นตัวพิมพ์ใหญ่และตัวเลขเท่านั้น';
    }

    if (!formData.name.trim()) {
      errors.name = 'กรุณากรอกชื่อธนาคาร';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ป้องกันการกดซ้ำ
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < 2000) {
      toast.error('กรุณารอสักครู่ก่อนทำรายการใหม่');
      return;
    }

    if (!validateForm()) {
      toast.error('กรุณาตรวจสอบข้อมูลให้ถูกต้อง');
      return;
    }

    lastSubmitTimeRef.current = now;
    setSaving(true);
    setError('');

    try {
      if (bank) {
        await api.put(`/api/admin/banks/${bank._id}`, formData);
        toast.success('อัปเดตธนาคารสำเร็จ', { icon: '✅' });
      } else {
        await api.post('/api/admin/banks', formData);
        toast.success('เพิ่มธนาคารสำเร็จ', { icon: '🏦' });
      }
      onSave();
    } catch (err: any) {
      const message = err.response?.data?.message || 'เกิดข้อผิดพลาด';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => !saving && onClose()}
      title={bank ? 'แก้ไขธนาคาร' : 'เพิ่มธนาคาร'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <Input
          label="รหัสธนาคาร"
          placeholder="เช่น KBANK, SCB, BBL"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
          error={formErrors.code}
          required
          disabled={saving || !!bank}
          hint="ใช้ตัวพิมพ์ใหญ่และตัวเลขเท่านั้น"
        />

        <Input
          label="ชื่อธนาคาร (ไทย)"
          placeholder="เช่น ธนาคารกสิกรไทย"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={formErrors.name}
          required
          disabled={saving}
        />

        <Input
          label="ชื่อธนาคาร (อังกฤษ)"
          placeholder="เช่น Kasikorn Bank"
          value={formData.nameEn}
          onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
          disabled={saving}
        />

        <Input
          label="ชื่อย่อ"
          placeholder="เช่น KBANK"
          value={formData.shortName}
          onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
          disabled={saving}
        />

        <div>
          <label className="label">สีธนาคาร</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200"
              disabled={saving}
            />
            <Input
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              placeholder="#1a73e8"
              disabled={saving}
              className="flex-1"
            />
          </div>
        </div>

        <Input
          label="URL โลโก้ (ไม่บังคับ)"
          placeholder="https://example.com/logo.png"
          value={formData.logoUrl}
          onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
          disabled={saving}
        />

        <div className="flex gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={saving}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            fullWidth
            isLoading={saving}
            loadingText="กำลังบันทึก..."
          >
            {bank ? 'บันทึกการแก้ไข' : 'เพิ่มธนาคาร'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
