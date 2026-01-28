'use client';

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Switch } from '@/components/ui/Input';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Bell,
  Image as ImageIcon,
  Calendar,
  ExternalLink,
  BarChart3,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

interface Announcement {
  _id: string;
  title: string;
  message?: string;
  imageUrl?: string;
  imageBase64?: string;
  linkUrl?: string;
  linkText?: string;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  allowDismiss: boolean;
  allowDismissFor7Days: boolean;
  displayType: 'banner' | 'popup' | 'slide';
  position: 'top' | 'center' | 'bottom';
  backgroundColor?: string;
  textColor?: string;
  priority: number;
  targetPages: string[];
  viewCount: number;
  dismissCount: number;
  createdAt: string;
}

interface FormData {
  title: string;
  message: string;
  imageUrl: string;
  imageBase64: string;
  linkUrl: string;
  linkText: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  allowDismiss: boolean;
  allowDismissFor7Days: boolean;
  displayType: 'banner' | 'popup' | 'slide';
  position: 'top' | 'center' | 'bottom';
  backgroundColor: string;
  textColor: string;
  priority: number;
  targetPages: string[];
}

const defaultFormData: FormData = {
  title: '',
  message: '',
  imageUrl: '',
  imageBase64: '',
  linkUrl: '',
  linkText: '',
  isActive: true,
  startDate: '',
  endDate: '',
  allowDismiss: true,
  allowDismissFor7Days: true,
  displayType: 'banner',
  position: 'top',
  backgroundColor: '#06C755',
  textColor: '#FFFFFF',
  priority: 0,
  targetPages: ['all'],
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch(`${apiUrl}/announcements/admin?includeInactive=true`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setAnnouncements(data.announcements);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      toast.error('ไม่สามารถโหลดประกาศได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setFormData(prev => ({ ...prev, imageBase64: base64, imageUrl: '' }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const url = selectedAnnouncement
        ? `${apiUrl}/announcements/admin/${selectedAnnouncement._id}`
        : `${apiUrl}/announcements/admin`;

      const response = await fetch(url, {
        method: selectedAnnouncement ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          startDate: formData.startDate || undefined,
          endDate: formData.endDate || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(selectedAnnouncement ? 'อัปเดตประกาศสำเร็จ' : 'สร้างประกาศสำเร็จ');
        setShowModal(false);
        resetForm();
        fetchAnnouncements();
      } else {
        toast.error(data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      const response = await fetch(`${apiUrl}/announcements/admin/${announcement._id}/toggle`, {
        method: 'PUT',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.announcement.isActive ? 'เปิดประกาศแล้ว' : 'ปิดประกาศแล้ว');
        fetchAnnouncements();
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleDelete = async () => {
    if (!selectedAnnouncement) return;

    try {
      const response = await fetch(`${apiUrl}/announcements/admin/${selectedAnnouncement._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        toast.success('ลบประกาศสำเร็จ');
        setShowDeleteModal(false);
        setSelectedAnnouncement(null);
        fetchAnnouncements();
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      message: announcement.message || '',
      imageUrl: announcement.imageUrl || '',
      imageBase64: announcement.imageBase64 || '',
      linkUrl: announcement.linkUrl || '',
      linkText: announcement.linkText || '',
      isActive: announcement.isActive,
      startDate: announcement.startDate ? announcement.startDate.slice(0, 16) : '',
      endDate: announcement.endDate ? announcement.endDate.slice(0, 16) : '',
      allowDismiss: announcement.allowDismiss,
      allowDismissFor7Days: announcement.allowDismissFor7Days,
      displayType: announcement.displayType,
      position: announcement.position,
      backgroundColor: announcement.backgroundColor || '#06C755',
      textColor: announcement.textColor || '#FFFFFF',
      priority: announcement.priority,
      targetPages: announcement.targetPages,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setSelectedAnnouncement(null);
    setFormData(defaultFormData);
  };

  const isExpired = (endDate?: string) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  const getStatusBadge = (announcement: Announcement) => {
    if (!announcement.isActive) {
      return <Badge variant="secondary">ปิดใช้งาน</Badge>;
    }
    if (isExpired(announcement.endDate)) {
      return <Badge variant="warning">หมดอายุ</Badge>;
    }
    return <Badge variant="success">แสดงอยู่</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">จัดการประกาศ</h1>
            <p className="text-slate-500 mt-1">สร้างและจัดการประกาศแบนเนอร์สำหรับผู้ใช้</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
            className="bg-[#06C755] hover:bg-[#05B048]"
          >
            สร้างประกาศใหม่
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{announcements.length}</p>
                <p className="text-xs text-slate-500">ประกาศทั้งหมด</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Eye className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {announcements.filter(a => a.isActive && !isExpired(a.endDate)).length}
                </p>
                <p className="text-xs text-slate-500">กำลังแสดง</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {announcements.reduce((sum, a) => sum + a.viewCount, 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">ยอดดูรวม</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <X className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {announcements.reduce((sum, a) => sum + a.dismissCount, 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">ถูกปิดรวม</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Announcements List */}
        <Card>
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">รายการประกาศ</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>ยังไม่มีประกาศ</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {announcements.map((announcement) => (
                <div key={announcement._id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Preview Image */}
                    <div className="w-20 h-14 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                      {announcement.imageBase64 || announcement.imageUrl ? (
                        <img
                          src={announcement.imageBase64 || announcement.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: announcement.backgroundColor }}
                        >
                          <Bell className="w-6 h-6" style={{ color: announcement.textColor }} />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-800 truncate">{announcement.title}</h3>
                        {getStatusBadge(announcement)}
                        <Badge variant="outline" className="text-[10px]">
                          {announcement.displayType === 'banner' ? 'แบนเนอร์' : 'ป็อปอัพ'}
                        </Badge>
                      </div>
                      {announcement.message && (
                        <p className="text-sm text-slate-500 truncate">{announcement.message}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {announcement.viewCount.toLocaleString()} views
                        </span>
                        <span className="flex items-center gap-1">
                          <X className="w-3 h-3" />
                          {announcement.dismissCount.toLocaleString()} dismissed
                        </span>
                        {announcement.endDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            ถึง {new Date(announcement.endDate).toLocaleDateString('th-TH')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(announcement)}
                        className={`p-2 rounded-lg transition-colors ${
                          announcement.isActive
                            ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                        title={announcement.isActive ? 'ปิดประกาศ' : 'เปิดประกาศ'}
                      >
                        {announcement.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleEdit(announcement)}
                        className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                        title="แก้ไข"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedAnnouncement(announcement);
                          setShowDeleteModal(true);
                        }}
                        className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          title={selectedAnnouncement ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <Input
              label="หัวข้อประกาศ *"
              placeholder="เช่น ประกาศสำคัญ! ปรับปรุงระบบ"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />

            {/* Message */}
            <Textarea
              label="รายละเอียด"
              placeholder="รายละเอียดเพิ่มเติม..."
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={3}
            />

            {/* Image Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">รูปภาพประกาศ</label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-32 h-20 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border-2 border-dashed border-slate-300">
                  {formData.imageBase64 || formData.imageUrl ? (
                    <div className="relative w-full h-full">
                      <img
                        src={formData.imageBase64 || formData.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, imageBase64: '', imageUrl: '' })}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    leftIcon={<Upload className="w-4 h-4" />}
                  >
                    อัปโหลดรูป
                  </Button>
                  <p className="text-xs text-slate-500">PNG, JPG ขนาดไม่เกิน 5MB (แนะนำ 1200x400)</p>
                  <Input
                    placeholder="หรือใส่ URL รูปภาพ"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value, imageBase64: '' })}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Link */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="ลิงก์ปุ่ม"
                placeholder="https://..."
                value={formData.linkUrl}
                onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
              />
              <Input
                label="ข้อความปุ่ม"
                placeholder="ดูเพิ่มเติม"
                value={formData.linkText}
                onChange={(e) => setFormData({ ...formData, linkText: e.target.value })}
              />
            </div>

            {/* Display Type & Position */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">รูปแบบการแสดง</label>
                <select
                  value={formData.displayType}
                  onChange={(e) => setFormData({ ...formData, displayType: e.target.value as any })}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="banner">แบนเนอร์ (แถบบนสุด)</option>
                  <option value="popup">ป็อปอัพ (กลางหน้าจอ)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">ลำดับความสำคัญ</label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={100}
                />
              </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">สีพื้นหลัง</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.backgroundColor}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0"
                  />
                  <Input
                    value={formData.backgroundColor}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">สีตัวอักษร</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.textColor}
                    onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0"
                  />
                  <Input
                    value={formData.textColor}
                    onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="เริ่มแสดง"
                type="datetime-local"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
              <Input
                label="สิ้นสุดแสดง"
                type="datetime-local"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>

            {/* Options */}
            <div className="space-y-4 p-4 bg-slate-50 rounded-xl">
              <Switch
                label="เปิดใช้งานประกาศ"
                checked={formData.isActive}
                onChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Switch
                label="อนุญาตให้ผู้ใช้ปิดประกาศ"
                checked={formData.allowDismiss}
                onChange={(checked) => setFormData({ ...formData, allowDismiss: checked })}
              />
              {formData.allowDismiss && (
                <Switch
                  label="แสดงตัวเลือก 'ปิด 7 วัน'"
                  checked={formData.allowDismissFor7Days}
                  onChange={(checked) => setFormData({ ...formData, allowDismissFor7Days: checked })}
                />
              )}
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">ตัวอย่างการแสดงผล</label>
              <div
                className="relative rounded-xl overflow-hidden"
                style={{ backgroundColor: formData.backgroundColor, color: formData.textColor }}
              >
                {(formData.imageBase64 || formData.imageUrl) && (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={formData.imageBase64 || formData.imageUrl}
                      alt=""
                      className="w-full h-full object-cover opacity-20"
                    />
                  </div>
                )}
                <div className="relative p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{formData.title || 'หัวข้อประกาศ'}</p>
                      {formData.message && (
                        <p className="text-xs opacity-90">{formData.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {formData.linkUrl && (
                      <button className="flex items-center gap-1 px-3 py-1.5 bg-white/20 rounded-lg text-xs font-medium">
                        {formData.linkText || 'ดูเพิ่มเติม'}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    {formData.allowDismiss && (
                      <button className="p-1.5 bg-white/10 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !formData.title}
                className="bg-[#06C755] hover:bg-[#05B048]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : selectedAnnouncement ? (
                  'บันทึกการแก้ไข'
                ) : (
                  'สร้างประกาศ'
                )}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation */}
        <ConfirmModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedAnnouncement(null);
          }}
          onConfirm={handleDelete}
          title="ลบประกาศ"
          message={`ต้องการลบประกาศ "${selectedAnnouncement?.title}" หรือไม่?`}
          confirmText="ลบประกาศ"
          type="danger"
        />
      </div>
    </DashboardLayout>
  );
}
