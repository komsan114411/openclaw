'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
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
  logoBase64?: string;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // ป้องกันการกดซ้ำ
  const processingIdsRef = useRef<Set<string>>(new Set());

  const fetchBanks = useCallback(async () => {
    try {
      const response = await api.get('/admin/banks');
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
      const response = await api.post('/admin/banks/init-defaults');
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

  const handleSyncFromThunder = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const response = await api.post('/admin/banks/sync-from-thunder');
      if (response.data.success) {
        await fetchBanks();
        toast.success(response.data.message || 'ซิงค์ธนาคารจาก Thunder API สำเร็จ', { icon: '⚡' });
      } else {
        toast.error(response.data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถซิงค์ธนาคารได้');
    } finally {
      setIsSyncing(false);
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
      await api.put(`/admin/banks/${bank._id}`, {
        isActive: !bank.isActive,
      });
      toast.success(
        bank.isActive ? 'ปิดใช้งานธนาคารสำเร็จ' : 'เปิดใช้งานธนาคารสำเร็จ',
        { icon: bank.isActive ? '🔴' : '🟢' }
      );
      await fetchBanks();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    } finally {
      processingIdsRef.current.delete(bank._id);
    }
  };

  const filteredBanks = banks.filter(
    (bank) =>
      bank.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      bank.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (bank.shortName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
  );

  const getBankLogo = (bank: Bank) => {
    if (bank.logoBase64) {
      return bank.logoBase64;
    }
    if (bank.logoUrl) {
      return bank.logoUrl;
    }
    return null;
  };

  if (loading) {
    return (
      <DashboardLayout requiredRole="admin">
        <PageLoading />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">จัดการธนาคาร</h1>
            <p className="page-subtitle">จัดการรายชื่อธนาคารในระบบ (ไม่สามารถลบธนาคารได้ ใช้การปิดใช้งานแทน)</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="secondary"
              onClick={handleSyncFromThunder}
              isLoading={isSyncing}
              loadingText="กำลังซิงค์..."
            >
              ⚡ ซิงค์จาก Thunder API
            </Button>
            <Button variant="secondary" onClick={handleInitDefaults}>
              นำเข้าธนาคารเริ่มต้น
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              + เพิ่มธนาคาร
            </Button>
          </div>
        </div>

        {/* Search */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="ค้นหาธนาคาร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Badge variant="secondary">{filteredBanks.length} ธนาคาร</Badge>
          </div>
        </Card>

        {/* Banks Table */}
        <Card>
          {filteredBanks.length === 0 ? (
            <EmptyState
              icon={
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              title="ยังไม่มีธนาคาร"
              description="เริ่มต้นด้วยการซิงค์จาก Thunder API หรือนำเข้าธนาคารเริ่มต้น"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">โลโก้</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">รหัส</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">ชื่อธนาคาร</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">ชื่อย่อ</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">สี</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">สถานะ</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBanks.map((bank) => (
                    <tr key={bank._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                          style={{ backgroundColor: bank.color || '#6b7280' }}
                        >
                          {getBankLogo(bank) ? (
                            <img
                              src={getBankLogo(bank)!}
                              alt={bank.name}
                              className="w-8 h-8 object-contain"
                            />
                          ) : (
                            bank.shortName?.substring(0, 2) || bank.code.substring(0, 2)
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">{bank.code}</td>
                      <td className="py-3 px-4">{bank.name}</td>
                      <td className="py-3 px-4 text-gray-500">{bank.shortName || '-'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border border-gray-200"
                            style={{ backgroundColor: bank.color || '#6b7280' }}
                          />
                          <span className="text-xs text-gray-500 font-mono">{bank.color || '-'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={bank.isActive ? 'success' : 'secondary'}>
                          {bank.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingBank(bank)}
                          >
                            แก้ไข
                          </Button>
                          <Button
                            variant={bank.isActive ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={() => handleToggleActive(bank)}
                          >
                            {bank.isActive ? 'ปิด' : 'เปิด'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <BankModal
          bank={null}
          onClose={() => setShowCreateModal(false)}
          onSave={() => {
            setShowCreateModal(false);
            fetchBanks();
          }}
        />
      )}

      {/* Edit Modal */}
      {editingBank && (
        <BankModal
          bank={editingBank}
          onClose={() => setEditingBank(null)}
          onSave={() => {
            setEditingBank(null);
            fetchBanks();
          }}
        />
      )}
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
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    bank?.logoBase64 || bank?.logoUrl || null
  );
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('ไฟล์ต้องมีขนาดไม่เกิน 2MB');
      return;
    }

    setLogoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      let bankId = bank?._id;

      if (bank) {
        // Update existing bank
        await api.put(`/admin/banks/${bank._id}`, formData);
      } else {
        // Create new bank
        const response = await api.post('/admin/banks', formData);
        bankId = response.data.bank._id;
      }

      // Upload logo if selected
      if (logoFile && bankId) {
        setUploadingLogo(true);
        const logoFormData = new FormData();
        logoFormData.append('logo', logoFile);
        await api.post(`/admin/banks/${bankId}/logo`, logoFormData);
      }

      toast.success(bank ? 'อัปเดตธนาคารสำเร็จ' : 'เพิ่มธนาคารสำเร็จ', { icon: '✅' });
      onSave();
    } catch (err: any) {
      const message = err.response?.data?.message || 'เกิดข้อผิดพลาด';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
      setUploadingLogo(false);
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

        {/* Logo Upload */}
        <div>
          <label className="label">โลโก้ธนาคาร</label>
          <div className="space-y-3">
            {logoPreview ? (
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center border-2 border-gray-200"
                  style={{ backgroundColor: formData.color || '#f3f4f6' }}
                >
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-12 h-12 object-contain"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600">
                    {logoFile ? logoFile.name : 'โลโก้ปัจจุบัน'}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={saving}
                    className="text-red-600 hover:text-red-700 mt-1"
                  >
                    ลบโลโก้
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  className="w-10 h-10 mx-auto text-gray-400 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-gray-600">คลิกเพื่ออัพโหลดรูปโลโก้</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF ขนาดไม่เกิน 2MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
              disabled={saving}
            />
            {!logoPreview && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                เลือกไฟล์
              </Button>
            )}
          </div>
        </div>

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
            isLoading={saving || uploadingLogo}
            loadingText={uploadingLogo ? 'กำลังอัพโหลดโลโก้...' : 'กำลังบันทึก...'}
          >
            {bank ? 'บันทึกการแก้ไข' : 'เพิ่มธนาคาร'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
