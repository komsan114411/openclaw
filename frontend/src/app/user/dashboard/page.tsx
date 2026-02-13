'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { lineAccountsApi, subscriptionsApi, systemSettingsApi } from '@/lib/api';
import { LineAccount, QuotaInfo } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader, StatCardMini } from '@/components/ui';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  FileText,
  Brain,
  Users,
  Package,
  Ban,
  AlertTriangle,
  Plus,
} from 'lucide-react';


interface Subscription {
  _id: string;
  packageName: string;
  quota: number;
  remainingQuota: number;
  expiresAt: string;
  status: string;
}

interface AiQuotaInfo {
  hasQuota: boolean;
  remainingQuota: number;
  totalQuota: number;
  usedQuota: number;
  reservedQuota: number;
  activeSubscriptions: number;
}

export default function UserDashboard() {
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [aiQuota, setAiQuota] = useState<AiQuotaInfo | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [globalAiEnabled, setGlobalAiEnabled] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, quotaRes, aiQuotaRes, subRes, aiSettingsRes] = await Promise.all([
          lineAccountsApi.getMyAccounts(),
          subscriptionsApi.getQuota(),
          subscriptionsApi.getAiQuota().catch(() => ({ data: { aiQuota: null } })),
          subscriptionsApi.getMy().catch(() => ({ data: { subscription: null } })),
          systemSettingsApi.getAiSettings().catch(() => ({ data: { globalAiEnabled: true } })),
        ]);

        setLineAccounts(accountsRes.data.accounts || []);
        setQuota(quotaRes.data.quota || null);
        setAiQuota(aiQuotaRes.data.aiQuota || null);
        setSubscription(subRes.data.subscription || null);
        setGlobalAiEnabled(aiSettingsRes.data.globalAiEnabled ?? true);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalMessages = lineAccounts.reduce((sum, acc) => sum + (acc.statistics?.totalMessages || 0), 0);

  // Calculate quota percentage (slip)
  const quotaPercentage = subscription
    ? Math.round(((subscription.remainingQuota ?? 0) / (subscription.quota ?? 1)) * 100)
    : 0;

  // Calculate AI quota percentage
  const aiQuotaPercentage = aiQuota && aiQuota.totalQuota > 0
    ? Math.round((aiQuota.remainingQuota / aiQuota.totalQuota) * 100)
    : 0;

  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };


  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading message="กำลังโหลดข้อมูล..." />
      </DashboardLayout>
    );
  }

  // Check for low quota warnings
  const showSlipWarning = quotaPercentage < 20 && subscription;
  const showAiWarning = aiQuota && aiQuota.totalQuota > 0 && aiQuotaPercentage < 20;
  const showAiDisabledWarning = !globalAiEnabled;

  return (
    <DashboardLayout>
      <div className="section-gap animate-fade pb-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* AI DISABLED BY ADMIN WARNING */}
        {showAiDisabledWarning && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-slate-500/10 to-slate-500/5 border border-slate-500/30 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-600 flex items-center justify-center flex-shrink-0">
                <Ban className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-300">ระบบ AI ถูกปิดชั่วคราว</p>
                <p className="text-xs text-slate-400">ผู้ดูแลระบบปิดการใช้งาน AI Chatbot ชั่วคราว ฟังก์ชัน AI จะไม่ทำงานจนกว่าจะเปิดใช้งานอีกครั้ง</p>
              </div>
            </div>
          </div>
        )}

        {/* LOW QUOTA WARNINGS */}
        {(showSlipWarning || showAiWarning) && (
          <div className="mb-6 space-y-3">
            {showSlipWarning && (
              <div className="bg-gradient-to-r from-rose-500/10 to-rose-500/5 border border-rose-500/30 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-rose-400">โควต้าสลิปใกล้หมด!</p>
                  <p className="text-xs text-rose-300/70">เหลือเพียง {subscription?.remainingQuota?.toLocaleString() || 0} ครั้ง ({quotaPercentage}%) กรุณาเติมโควต้าเพื่อใช้งานต่อ</p>
                </div>
                <Link href="/user/packages">
                  <Button variant="outline" size="sm" className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 whitespace-nowrap">
                    เติมโควต้า
                  </Button>
                </Link>
              </div>
            )}

            {showAiWarning && (
              <div className="bg-gradient-to-r from-violet-500/10 to-violet-500/5 border border-violet-500/30 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-violet-400">โควต้า AI ใกล้หมด!</p>
                  <p className="text-xs text-violet-300/70">เหลือเพียง {aiQuota?.remainingQuota?.toLocaleString() || 0} ครั้ง ({aiQuotaPercentage}%) กรุณาเติมโควต้าเพื่อใช้ AI ต่อ</p>
                </div>
                <Link href="/user/packages">
                  <Button variant="outline" size="sm" className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10 whitespace-nowrap">
                    เติมโควต้า
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* PAGE HEADER */}
        <SectionHeader
          title="แดชบอร์ด"
          highlight="LINE OA"
          subtitle="ภาพรวมการใช้งาน • โควต้า • การตรวจสลิป • สถานะระบบ"
          actions={
            <>
              <Link href="/user/line-accounts" className="flex-1 sm:flex-none">
                <Button variant="primary" size="lg" className="w-full sm:w-auto gap-2">
                  <Plus className="w-4 h-4" /> เพิ่มบัญชี LINE
                </Button>
              </Link>
              <Link href="/user/packages" className="flex-1 sm:flex-none">
                <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2">
                  <Package className="w-4 h-4" /> ซื้อแพ็คเกจ
                </Button>
              </Link>
            </>
          }
        />

        {/* QUICK STATS - Real Data Only */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mt-6">
          <StatCardMini
            icon={<MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />}
            value={lineAccounts.length}
            label="บัญชี LINE"
            badgeText={lineAccounts.length > 0 ? 'ใช้งานอยู่' : undefined}
            badgeVariant="success"
          />

          <StatCardMini
            icon={<FileText className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />}
            value={subscription?.remainingQuota?.toLocaleString() || '0'}
            label="โควต้าสลิป"
            color="emerald"
            badgeText={quotaPercentage < 20 && subscription ? 'ใกล้หมด' : undefined}
            badgeVariant="warning"
          />

          <StatCardMini
            icon={<Brain className="w-5 h-5 sm:w-6 sm:h-6 text-violet-400" />}
            value={aiQuota?.remainingQuota?.toLocaleString() || '0'}
            label="โควต้า AI"
            color="violet"
            badgeText={aiQuotaPercentage < 20 && aiQuota && aiQuota.totalQuota > 0 ? 'ใกล้หมด' : undefined}
            badgeVariant="warning"
          />

          <StatCardMini
            icon={<Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />}
            value={totalMessages > 0 ? totalMessages.toLocaleString() : '0'}
            label="ข้อความทั้งหมด"
            color="blue"
          />
        </div>

        {/* MAIN CONTENT */}
        <div className="space-y-4 sm:space-y-6 mt-6">

            {/* Current Subscription Card */}
            {subscription ? (
              <Card className="bg-slate-950 border border-[#06C755]/20 shadow-2xl overflow-hidden relative" variant="glass">
                <div className="absolute top-0 right-0 w-48 sm:w-80 h-48 sm:h-80 bg-[#06C755]/5 rounded-full blur-[60px] sm:blur-[100px] -mr-24 sm:-mr-40 -mt-24 sm:-mt-40" />

                <div className="p-4 sm:p-6 lg:p-8 relative z-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-xs sm:text-sm font-semibold text-slate-300 mb-1">แพ็คเกจปัจจุบัน</p>
                      <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                        {subscription.packageName || 'แพ็คเกจมาตรฐาน'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#06C755] animate-pulse" />
                      <span className="text-xs font-semibold text-[#06C755]">ใช้งานอยู่</span>
                    </div>
                  </div>

                  {/* Slip Quota Progress */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> โควต้าสลิปคงเหลือ
                        </span>
                        <p className="text-3xl sm:text-4xl font-black text-white">
                          {subscription.remainingQuota?.toLocaleString() || 0}
                          <span className="text-lg sm:text-xl text-slate-400 font-semibold ml-2">
                            / {subscription.quota?.toLocaleString() || 0}
                          </span>
                        </p>
                      </div>
                      <span className={cn(
                        "text-sm font-black",
                        quotaPercentage > 50 ? 'text-[#06C755]' : quotaPercentage > 20 ? 'text-amber-500' : 'text-rose-500'
                      )}>
                        {quotaPercentage}%
                      </span>
                    </div>

                    <div className="h-3 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          quotaPercentage > 50 ? 'bg-[#06C755]' : quotaPercentage > 20 ? 'bg-amber-500' : 'bg-rose-500'
                        )}
                        style={{ width: `${quotaPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* AI Quota Progress */}
                  {aiQuota && aiQuota.totalQuota > 0 && (
                    <div className="space-y-3 mt-4 pt-4 border-t border-white/5">
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                            <Brain className="w-3 h-3" /> โควต้า AI คงเหลือ
                          </span>
                          <p className="text-2xl sm:text-3xl font-black text-white">
                            {aiQuota.remainingQuota?.toLocaleString() || 0}
                            <span className="text-base sm:text-lg text-slate-400 font-semibold ml-2">
                              / {aiQuota.totalQuota?.toLocaleString() || 0}
                            </span>
                          </p>
                        </div>
                        <span className={cn(
                          "text-sm font-black",
                          aiQuotaPercentage > 50 ? 'text-violet-400' : aiQuotaPercentage > 20 ? 'text-amber-500' : 'text-rose-500'
                        )}>
                          {aiQuotaPercentage}%
                        </span>
                      </div>

                      <div className="h-3 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            aiQuotaPercentage > 50 ? 'bg-violet-500' : aiQuotaPercentage > 20 ? 'bg-amber-500' : 'bg-rose-500'
                          )}
                          style={{ width: `${aiQuotaPercentage}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expiry & Actions */}
                  <div className="mt-6 pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <div>
                        <span className="text-xs font-semibold text-slate-300">หมดอายุ</span>
                        <p className="text-sm font-bold text-white">
                          {subscription.expiresAt ? formatDate(subscription.expiresAt) : 'ไม่มีกำหนด'}
                        </p>
                      </div>
                      {quotaPercentage < 20 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span className="text-xs font-semibold text-rose-400">สลิปใกล้หมด</span>
                        </div>
                      )}
                      {aiQuota && aiQuota.totalQuota > 0 && aiQuotaPercentage < 20 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          <span className="text-xs font-semibold text-violet-400">AI ใกล้หมด</span>
                        </div>
                      )}
                    </div>
                    <Link href="/user/packages">
                      <Button variant="primary" size="sm" className="bg-[#06C755] hover:bg-[#05B048]">
                        เติมโควต้า
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ) : (
              /* No Subscription - Prompt to Buy */
              <Card className="bg-slate-950 border border-white/10 overflow-hidden" variant="glass">
                <div className="p-6 sm:p-8 text-center">
                  <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Package className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">ยังไม่มีแพ็คเกจ</h3>
                  <p className="text-sm text-slate-400 mb-6">เลือกแพ็คเกจที่เหมาะกับการใช้งานของคุณ</p>
                  <Link href="/user/packages">
                    <Button variant="primary" className="bg-[#06C755] hover:bg-[#05B048]">
                      ดูแพ็คเกจทั้งหมด
                    </Button>
                  </Link>
                </div>
              </Card>
            )}

            {/* LINE Accounts List */}
            <Card className="bg-slate-950 border border-white/5" variant="glass">
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">บัญชี LINE OA</h3>
                  <Link href="/user/line-accounts">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                      ดูทั้งหมด →
                    </Button>
                  </Link>
                </div>

                {lineAccounts.length > 0 ? (
                  <div className="space-y-3">
                    {lineAccounts.slice(0, 3).map((account) => (
                      <div
                        key={account._id}
                        className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="w-10 h-10 bg-[#06C755]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-5 h-5 text-[#06C755]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{account.accountName}</p>
                          <p className="text-xs text-slate-400">
                            {account.statistics?.totalMessages?.toLocaleString() || 0} ข้อความ
                          </p>
                        </div>
                        <Badge variant={account.isActive ? 'success' : 'secondary'} size="sm">
                          {account.isActive ? 'ใช้งาน' : 'ปิด'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-400 mb-4">ยังไม่มีบัญชี LINE OA</p>
                    <Link href="/user/line-accounts/new">
                      <Button variant="outline" size="sm">
                        เพิ่มบัญชีแรก
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
