'use client';

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Switch, Select } from '@/components/ui/Input';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
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
  Megaphone,
  Clock,
  Users,
  Globe,
  Palette,
  Check,
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

// Color presets for quick selection
const COLOR_PRESETS = [
  { bg: '#06C755', text: '#FFFFFF', name: 'LINE Green' },
  { bg: '#FF6B6B', text: '#FFFFFF', name: 'Red Alert' },
  { bg: '#4ECDC4', text: '#FFFFFF', name: 'Teal' },
  { bg: '#FFE66D', text: '#2D3436', name: 'Yellow' },
  { bg: '#6C5CE7', text: '#FFFFFF', name: 'Purple' },
  { bg: '#2D3436', text: '#FFFFFF', name: 'Dark' },
  { bg: '#0984E3', text: '#FFFFFF', name: 'Blue' },
  { bg: '#FD79A8', text: '#FFFFFF', name: 'Pink' },
];

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [isUploading, setIsUploading] = useState(false);
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
        setAnnouncements(data.announcements || []);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      toast.error('ไม่สามารถโหลดประกาศได้');
    } finally {
      setIsLoading(false);
    }
  };

  // Compress and resize image
  const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('ขนาดไฟล์ต้องไม่เกิน 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      setFormData(prev => ({ ...prev, imageBase64: compressed, imageUrl: '' }));
      toast.success('อัปโหลดรูปภาพสำเร็จ');
    } catch (error) {
      toast.error('ไม่สามารถอัปโหลดรูปภาพได้');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('กรุณากรอกหัวข้อประกาศ');
      return;
    }

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
      targetPages: announcement.targetPages || ['all'],
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

  const getTargetPageLabel = (pages: string[]) => {
    if (pages.includes('all')) return 'ทุกหน้า';
    if (pages.includes('public') && pages.includes('user')) return 'ทุกหน้า';
    if (pages.includes('public')) return 'หน้าสาธารณะ';
    if (pages.includes('user')) return 'หน้าผู้ใช้';
    return 'ทุกหน้า';
  };

  // Filter announcements based on tab
  const filteredAnnouncements = announcements.filter(a => {
    if (activeTab === 'active') return a.isActive && !isExpired(a.endDate);
    if (activeTab === 'inactive') return !a.isActive || isExpired(a.endDate);
    return true;
  });

  const stats = {
    total: announcements.length,
    active: announcements.filter(a => a.isActive && !isExpired(a.endDate)).length,
    views: announcements.reduce((sum, a) => sum + (a.viewCount || 0), 0),
    dismisses: announcements.reduce((sum, a) => sum + (a.dismissCount || 0), 0),
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Megaphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">จัดการประกาศ</h1>
              <p className="text-slate-500 mt-0.5">สร้างและจัดการประกาศสำหรับผู้ใช้</p>
            </div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-lg"
          >
            สร้างประกาศใหม่
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-700">{stats.total}</p>
                <p className="text-sm text-emerald-600">ประกาศทั้งหมด</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center shadow-md">
                <Eye className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-700">{stats.active}</p>
                <p className="text-sm text-blue-600">กำลังแสดง</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center shadow-md">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-purple-700">{stats.views.toLocaleString()}</p>
                <p className="text-sm text-purple-600">ยอดดูรวม</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shadow-md">
                <X className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-700">{stats.dismisses.toLocaleString()}</p>
                <p className="text-sm text-amber-600">ถูกปิดรวม</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs & List */}
        <Card className="overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-2 bg-slate-100 border-b">
            {[
              { key: 'all', label: 'ทั้งหมด', count: announcements.length },
              { key: 'active', label: 'กำลังแสดง', count: stats.active },
              { key: 'inactive', label: 'ปิดอยู่', count: announcements.length - stats.active },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                {tab.label}
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* List */}
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-emerald-500" />
              <p className="mt-3 text-slate-500">กำลังโหลดประกาศ...</p>
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <Bell className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-slate-500 text-lg font-medium">ยังไม่มีประกาศ</p>
              <p className="text-slate-400 text-sm mt-1">คลิกปุ่ม "สร้างประกาศใหม่" เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <AnimatePresence>
                {filteredAnnouncements.map((announcement, index) => (
                  <motion.div
                    key={announcement._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Preview Image */}
                      <div className="w-24 h-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 shadow-sm">
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
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-slate-800">{announcement.title}</h3>
                          {getStatusBadge(announcement)}
                          <Badge variant="outline" className="text-[10px]">
                            {announcement.displayType === 'banner' ? 'แบนเนอร์' : 'ป็อปอัพ'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {getTargetPageLabel(announcement.targetPages)}
                          </Badge>
                        </div>
                        {announcement.message && (
                          <p className="text-sm text-slate-500 truncate max-w-md">{announcement.message}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {(announcement.viewCount || 0).toLocaleString()} ดู
                          </span>
                          <span className="flex items-center gap-1">
                            <X className="w-3 h-3" />
                            {(announcement.dismissCount || 0).toLocaleString()} ปิด
                          </span>
                          {announcement.endDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              ถึง {new Date(announcement.endDate).toLocaleDateString('th-TH')}
                            </span>
                          )}
                          {announcement.priority > 0 && (
                            <span className="flex items-center gap-1 text-amber-500">
                              ⭐ ลำดับ {announcement.priority}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleToggleActive(announcement)}
                          className={`p-2.5 rounded-xl transition-all ${
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
                          className="p-2.5 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                          title="แก้ไข"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAnnouncement(announcement);
                            setShowDeleteModal(true);
                          }}
                          className="p-2.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
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
          size="xl"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Bell className="w-4 h-4" />
                ข้อมูลประกาศ
              </h3>
              <Input
                label="หัวข้อประกาศ"
                placeholder="เช่น ประกาศสำคัญ! ปรับปรุงระบบ"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
              <Textarea
                label="รายละเอียด (ไม่บังคับ)"
                placeholder="รายละเอียดเพิ่มเติม..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                rows={2}
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                รูปภาพ
              </h3>
              <div className="flex items-start gap-4">
                <div className="w-40 h-24 rounded-xl bg-slate-800 overflow-hidden flex-shrink-0 border-2 border-dashed border-slate-600">
                  {formData.imageBase64 || formData.imageUrl ? (
                    <div className="relative w-full h-full group">
                      <img
                        src={formData.imageBase64 || formData.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, imageBase64: '', imageUrl: '' })}
                        className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                      <ImageIcon className="w-8 h-8 mb-1" />
                      <span className="text-xs">ไม่มีรูป</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
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
                    leftIcon={isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    disabled={isUploading}
                  >
                    {isUploading ? 'กำลังอัปโหลด...' : 'อัปโหลดรูป'}
                  </Button>
                  <p className="text-xs text-slate-400">PNG, JPG ไม่เกิน 10MB • ระบบจะย่อขนาดอัตโนมัติ</p>
                  <Input
                    placeholder="หรือวาง URL รูปภาพ"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value, imageBase64: '' })}
                  />
                </div>
              </div>
            </div>

            {/* Display Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-4 h-4" />
                การแสดงผล
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">รูปแบบ</label>
                  <select
                    value={formData.displayType}
                    onChange={(e) => setFormData({ ...formData, displayType: e.target.value as 'banner' | 'popup' })}
                    className="w-full h-11 px-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="banner">แบนเนอร์ (แถบบน)</option>
                    <option value="popup">ป็อปอัพ (กลางจอ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">แสดงที่</label>
                  <select
                    value={formData.targetPages[0]}
                    onChange={(e) => setFormData({ ...formData, targetPages: [e.target.value] })}
                    className="w-full h-11 px-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="all">ทุกหน้า</option>
                    <option value="public">หน้าสาธารณะ</option>
                    <option value="user">หน้าผู้ใช้</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">ลำดับความสำคัญ</label>
                  <Input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    min={0}
                    max={100}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-4 h-4" />
                สีธีม
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setFormData({ ...formData, backgroundColor: preset.bg, textColor: preset.text })}
                    className={`relative w-10 h-10 rounded-xl transition-transform hover:scale-110 ${
                      formData.backgroundColor === preset.bg ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : ''
                    }`}
                    style={{ backgroundColor: preset.bg }}
                    title={preset.name}
                  >
                    {formData.backgroundColor === preset.bg && (
                      <Check className="w-4 h-4 absolute inset-0 m-auto" style={{ color: preset.text }} />
                    )}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">สีพื้นหลัง</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.backgroundColor}
                      onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                      className="w-11 h-11 rounded-xl cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={formData.backgroundColor}
                      onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">สีตัวอักษร</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.textColor}
                      onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                      className="w-11 h-11 rounded-xl cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={formData.textColor}
                      onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Link */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                ลิงก์ (ไม่บังคับ)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="URL"
                  placeholder="https://example.com"
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
            </div>

            {/* Schedule */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4" />
                กำหนดเวลา (ไม่บังคับ)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <p className="text-xs text-slate-400">ถ้าไม่กำหนด จะแสดงตลอด</p>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4" />
                ตัวเลือก
              </h3>
              <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl">
                <Switch
                  label="เปิดใช้งานประกาศ"
                  description="แสดงประกาศให้ผู้ใช้เห็น"
                  checked={formData.isActive}
                  onChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Switch
                  label="อนุญาตให้ปิดประกาศ"
                  description="ผู้ใช้สามารถกดปิดประกาศได้"
                  checked={formData.allowDismiss}
                  onChange={(checked) => setFormData({ ...formData, allowDismiss: checked })}
                />
                {formData.allowDismiss && (
                  <Switch
                    label="แสดงปุ่ม 'ปิด 7 วัน'"
                    description="ผู้ใช้สามารถเลือกซ่อนประกาศ 7 วัน"
                    checked={formData.allowDismissFor7Days}
                    onChange={(checked) => setFormData({ ...formData, allowDismissFor7Days: checked })}
                  />
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">ตัวอย่าง</h3>
              <div
                className="relative rounded-xl overflow-hidden shadow-lg"
                style={{ backgroundColor: formData.backgroundColor, color: formData.textColor }}
              >
                {(formData.imageBase64 || formData.imageUrl) && (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={formData.imageBase64 || formData.imageUrl}
                      alt=""
                      className="w-full h-full object-cover opacity-20"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30" />
                  </div>
                )}
                <div className="relative p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold">{formData.title || 'หัวข้อประกาศ'}</p>
                      {formData.message && (
                        <p className="text-sm opacity-90">{formData.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {formData.linkUrl && (
                      <button className="flex items-center gap-1 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
                        {formData.linkText || 'ดูเพิ่มเติม'}
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                    {formData.allowDismiss && (
                      <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !formData.title.trim()}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
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
          message={`ต้องการลบประกาศ "${selectedAnnouncement?.title}" หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`}
          confirmText="ลบประกาศ"
          type="danger"
        />
      </div>
    </DashboardLayout>
  );
}
