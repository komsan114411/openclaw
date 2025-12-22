'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card, EmptyState } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';

interface SlipTemplate {
  _id: string;
  name: string;
  description?: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault: boolean;
  isActive: boolean;
  isGlobal?: boolean;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'success', label: '✅ สำเร็จ', color: 'bg-green-100 text-green-800', icon: '✅' },
  { value: 'duplicate', label: '⚠️ สลิปซ้ำ', color: 'bg-yellow-100 text-yellow-800', icon: '⚠️' },
  { value: 'error', label: '❌ ผิดพลาด', color: 'bg-red-100 text-red-800', icon: '❌' },
  { value: 'not_found', label: '🔍 ไม่พบ', color: 'bg-gray-100 text-gray-800', icon: '🔍' },
];

function TemplatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get('accountId') || '';

  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    try {
      // This endpoint now returns both account-specific and global templates
      const response = await api.get(`/line-accounts/${accountId}/slip-templates`);
      if (response.data.success) {
        setTemplates(response.data.templates || []);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถโหลด Templates ได้');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSetDefault = async (templateId: string) => {
    try {
      await api.put(`/line-accounts/${accountId}/slip-templates/${templateId}/default`);
      toast.success('ตั้งเป็น Default สำเร็จ');
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'ไม่สามารถตั้งเป็น Default ได้');
    }
  };

  const getTypeInfo = (type: string) => {
    return TYPE_OPTIONS.find(t => t.value === type) || TYPE_OPTIONS[0];
  };

  // Separate global and account templates
  const globalTemplates = templates.filter(t => t.isGlobal);
  const accountTemplates = templates.filter(t => !t.isGlobal);

  // Group by type
  const groupByType = (templateList: SlipTemplate[]) => {
    return templateList.reduce((acc, template) => {
      if (!acc[template.type]) {
        acc[template.type] = [];
      }
      acc[template.type].push(template);
      return acc;
    }, {} as Record<string, SlipTemplate[]>);
  };

  if (!accountId) {
    return (
      <DashboardLayout>
        <Card className="p-12">
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            title="ไม่พบ Account ID"
            description="กรุณาเลือกบัญชี LINE จากหน้า LINE Accounts"
            action={
              <Button variant="primary" onClick={() => router.push('/user/line-accounts')}>
                ไปหน้า LINE Accounts
              </Button>
            }
          />
        </Card>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลด Templates..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="!p-2"
            >
              ← กลับ
            </Button>
            <div>
              <h1 className="page-title">🎨 Template ตอบกลับสลิป</h1>
              <p className="page-subtitle">เลือก Template สำหรับการตอบกลับเมื่อตรวจสอบสลิป</p>
            </div>
          </div>
        </div>

        {/* Global Templates Section */}
        {globalTemplates.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🌐</span>
              <h2 className="text-lg font-semibold text-gray-900">Templates ส่วนกลาง</h2>
              <Badge className="bg-purple-100 text-purple-800">{globalTemplates.length}</Badge>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Templates เหล่านี้สร้างโดยผู้ดูแลระบบ สามารถเลือกใช้ได้เลย
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {globalTemplates.map((template) => {
                const typeInfo = getTypeInfo(template.type);
                return (
                  <Card key={template._id} className="overflow-hidden p-0 border-2 border-purple-200 hover:shadow-lg transition-all">
                    <div className="h-2" style={{ backgroundColor: template.primaryColor || '#00C851' }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-purple-100 text-purple-700 text-xs">🌐 ส่วนกลาง</Badge>
                          <Badge className={typeInfo.color}>{typeInfo.icon}</Badge>
                        </div>
                        {template.isDefault && (
                          <Badge variant="success" size="sm">✓ ใช้งานอยู่</Badge>
                        )}
                      </div>
                      
                      <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
                      )}

                      {template.headerText && (
                        <div className="p-2 bg-gray-50 rounded-lg mb-3">
                          <p className="text-sm font-medium" style={{ color: template.primaryColor }}>
                            {template.headerText}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.showAmount && <span className="text-xs bg-blue-50 px-2 py-0.5 rounded">💰</span>}
                        {template.showSender && <span className="text-xs bg-green-50 px-2 py-0.5 rounded">👤</span>}
                        {template.showReceiver && <span className="text-xs bg-purple-50 px-2 py-0.5 rounded">🏦</span>}
                        {template.showDate && <span className="text-xs bg-orange-50 px-2 py-0.5 rounded">📅</span>}
                        {template.showTime && <span className="text-xs bg-pink-50 px-2 py-0.5 rounded">🕐</span>}
                        {template.showTransRef && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">🔢</span>}
                      </div>

                      <div className="pt-3 border-t">
                        {template.isDefault ? (
                          <Badge variant="success" className="w-full justify-center">✓ กำลังใช้งาน Template นี้</Badge>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            fullWidth
                            onClick={() => handleSetDefault(template._id)}
                          >
                            🎯 เลือกใช้ Template นี้
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Account Templates Section */}
        {accountTemplates.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">📁</span>
              <h2 className="text-lg font-semibold text-gray-900">Templates ของบัญชีนี้</h2>
              <Badge className="bg-blue-100 text-blue-800">{accountTemplates.length}</Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {accountTemplates.map((template) => {
                const typeInfo = getTypeInfo(template.type);
                return (
                  <Card key={template._id} className="overflow-hidden p-0 hover:shadow-lg transition-all">
                    <div className="h-2" style={{ backgroundColor: template.primaryColor || '#00C851' }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                        {template.isDefault && (
                          <Badge variant="success" size="sm">✓ ใช้งานอยู่</Badge>
                        )}
                      </div>
                      
                      <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{template.description}</p>
                      )}

                      {template.headerText && (
                        <div className="p-2 bg-gray-50 rounded-lg mb-3">
                          <p className="text-sm font-medium" style={{ color: template.primaryColor }}>
                            {template.headerText}
                          </p>
                        </div>
                      )}

                      <div className="pt-3 border-t">
                        {template.isDefault ? (
                          <Badge variant="success" className="w-full justify-center">✓ กำลังใช้งาน</Badge>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            fullWidth
                            onClick={() => handleSetDefault(template._id)}
                          >
                            เลือกใช้
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {templates.length === 0 && (
          <Card className="p-12">
            <EmptyState
              icon={
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="ยังไม่มี Template"
              description="กรุณาติดต่อผู้ดูแลระบบเพื่อสร้าง Template สำหรับใช้งาน"
            />
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function SlipTemplatesPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <PageLoading message="กำลังโหลด..." />
      </DashboardLayout>
    }>
      <TemplatesContent />
    </Suspense>
  );
}
