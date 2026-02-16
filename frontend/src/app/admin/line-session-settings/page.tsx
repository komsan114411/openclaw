'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Switch } from '@/components/ui/Input';
import { systemSettingsApi, lineSessionApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Settings,
  Clock,
  RefreshCw,
  AlertTriangle,
  Save,
  Key,
  Activity,
  Zap,
  CheckCircle,
  XCircle,
  Play,
  Loader2,
  Shield,
  MessageSquare,
  Pause,
  RotateCcw,
  Trash2,
  Database,
  BarChart3,
} from 'lucide-react';

interface LineSessionSettings {
  lineSessionHealthCheckEnabled: boolean;
  lineSessionHealthCheckIntervalMinutes: number;
  lineSessionAutoReloginEnabled: boolean;
  lineSessionReloginCheckIntervalMinutes: number;
  lineSessionMaxConsecutiveFailures: number;
  lineSessionExpiryWarningMinutes: number;
}

interface HealthCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxConsecutiveFailures: number;
  expiryWarningMinutes: number;
  autoReloginEnabled: boolean;
  reloginCheckIntervalMinutes: number;
}

interface HealthStatus {
  lineAccountId: string;
  status: 'healthy' | 'unhealthy' | 'expired' | 'unknown';
  message: string;
  checkedAt: string;
  consecutiveFailures: number;
}

interface AutoFetchStatus {
  isRunning: boolean;
  config: {
    enabled: boolean;
    intervalSeconds: number;
    activeOnly: boolean;
    fetchLimit: number;
  };
  lastFetchTime: string | null;
  stats: {
    totalFetches: number;
    successfulFetches: number;
    failedFetches: number;
    totalNewMessages: number;
  };
}

interface SessionInfo {
  _id: string;
  name: string;
  bankName?: string;
  status?: string;
}

interface MessageStats {
  totalMessages: number;
  sessionCount: number;
  estimatedSizeBytes: number;
  perSession: Array<{
    _id: string;
    lineAccountId: string;
    count: number;
    oldestDate: string;
    newestDate: string;
  }>;
}

interface CleanupPreview {
  totalMessages: number;
  messagesToDelete: number;
  messagesRemaining: number;
  estimatedSizeBytes: number;
  cutoffDate: string;
  oldestMessageDate: string | null;
  newestMessageDate: string | null;
  perSessionCounts: Array<{
    _id: string;
    total: number;
    toDelete: number;
  }>;
}

export default function LineSessionSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);
  const [runtimeConfig, setRuntimeConfig] = useState<HealthCheckConfig | null>(null);

  // Auto-fetch states
  const [autoFetchStatus, setAutoFetchStatus] = useState<AutoFetchStatus | null>(null);
  const [isUpdatingAutoFetch, setIsUpdatingAutoFetch] = useState(false);
  const [autoFetchInterval, setAutoFetchInterval] = useState(60);
  const [countdown, setCountdown] = useState<number>(0);

  // Message cleanup states
  const [cleanupUnit, setCleanupUnit] = useState<'days' | 'months'>('days');
  const [cleanupValue, setCleanupValue] = useState(30);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectAllSessions, setSelectAllSessions] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ deletedCount: number; messagesRemaining: number; message: string } | null>(null);

  // Message stats & preview states
  const [messageStats, setMessageStats] = useState<MessageStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [settings, setSettings] = useState<LineSessionSettings>({
    lineSessionHealthCheckEnabled: true,
    lineSessionHealthCheckIntervalMinutes: 5,
    lineSessionAutoReloginEnabled: true,
    lineSessionReloginCheckIntervalMinutes: 10,
    lineSessionMaxConsecutiveFailures: 3,
    lineSessionExpiryWarningMinutes: 5,
  });

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await systemSettingsApi.get();
      const data = res.data;
      setSettings({
        lineSessionHealthCheckEnabled: data.lineSessionHealthCheckEnabled ?? true,
        lineSessionHealthCheckIntervalMinutes: data.lineSessionHealthCheckIntervalMinutes ?? 5,
        lineSessionAutoReloginEnabled: data.lineSessionAutoReloginEnabled ?? true,
        lineSessionReloginCheckIntervalMinutes: data.lineSessionReloginCheckIntervalMinutes ?? 10,
        lineSessionMaxConsecutiveFailures: data.lineSessionMaxConsecutiveFailures ?? 3,
        lineSessionExpiryWarningMinutes: data.lineSessionExpiryWarningMinutes ?? 5,
      });
    } catch {
      toast.error('ไม่สามารถโหลดการตั้งค่าได้');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch runtime health check config
  const fetchRuntimeConfig = useCallback(async () => {
    try {
      const res = await api.get('/admin/line-session/settings/health-check');
      if (res.data.success) {
        setRuntimeConfig(res.data.settings);
      }
    } catch {
      console.error('Failed to fetch runtime config');
    }
  }, []);

  // Fetch all health statuses
  const fetchHealthStatuses = useCallback(async () => {
    try {
      const res = await api.get('/admin/line-session/health/all');
      if (res.data.success) {
        setHealthStatuses(res.data.statuses || []);
      }
    } catch {
      console.error('Failed to fetch health statuses');
    }
  }, []);

  // Force health check for all sessions
  const runHealthCheck = async () => {
    setIsCheckingHealth(true);
    try {
      // Enable health check if not already
      await api.put('/admin/line-session/settings/health-check', {
        enabled: true,
      });

      // Wait a bit and fetch new statuses
      await new Promise(resolve => setTimeout(resolve, 2000));
      await fetchHealthStatuses();
      await fetchRuntimeConfig();

      toast.success('ตรวจสอบ Keys เรียบร้อย');
    } catch {
      toast.error('ไม่สามารถตรวจสอบ Keys ได้');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  // Apply settings to runtime
  const applySettingsToRuntime = async () => {
    try {
      await api.put('/admin/line-session/settings/health-check', {
        enabled: settings.lineSessionHealthCheckEnabled,
        intervalMinutes: settings.lineSessionHealthCheckIntervalMinutes,
        maxConsecutiveFailures: settings.lineSessionMaxConsecutiveFailures,
        expiryWarningMinutes: settings.lineSessionExpiryWarningMinutes,
        autoReloginEnabled: settings.lineSessionAutoReloginEnabled,
        reloginCheckIntervalMinutes: settings.lineSessionReloginCheckIntervalMinutes,
      });
      await fetchRuntimeConfig();
      toast.success('อัปเดตการตั้งค่า runtime สำเร็จ');
    } catch {
      toast.error('ไม่สามารถอัปเดตการตั้งค่า runtime ได้');
    }
  };

  // Fetch auto-fetch status
  const fetchAutoFetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/admin/line-session/settings/auto-fetch');
      if (res.data.success !== false) {
        setAutoFetchStatus(res.data);
        setAutoFetchInterval(res.data.config?.intervalSeconds || 60);
      }
    } catch {
      console.error('Failed to fetch auto-fetch status');
    }
  }, []);

  // Update auto-fetch settings
  const updateAutoFetch = async (newSettings: Partial<AutoFetchStatus['config']>) => {
    setIsUpdatingAutoFetch(true);
    try {
      const res = await api.put('/admin/line-session/settings/auto-fetch', newSettings);
      if (res.data.success) {
        setAutoFetchStatus(res.data);
        toast.success(res.data.message || 'อัปเดตการตั้งค่าสำเร็จ');
      }
    } catch {
      toast.error('ไม่สามารถอัปเดตการตั้งค่าได้');
    } finally {
      setIsUpdatingAutoFetch(false);
    }
  };

  // Control auto-fetch (start/stop/restart)
  const controlAutoFetch = async (action: 'start' | 'stop' | 'restart') => {
    setIsUpdatingAutoFetch(true);
    try {
      const res = await api.post(`/admin/line-session/settings/auto-fetch/${action}`);
      if (res.data.success) {
        toast.success(res.data.message);
        await fetchAutoFetchStatus();
      }
    } catch {
      toast.error('ไม่สามารถดำเนินการได้');
    } finally {
      setIsUpdatingAutoFetch(false);
    }
  };

  // Fetch all messages manually
  const fetchAllMessagesNow = async () => {
    setIsUpdatingAutoFetch(true);
    try {
      const res = await api.post('/admin/line-session/batch/messages/fetch-all');
      if (res.data.success) {
        toast.success(res.data.message);
        await fetchAutoFetchStatus();
      } else {
        toast.error('ไม่สามารถดึงข้อความได้');
      }
    } catch {
      toast.error('เกิดข้อผิดพลาดในการดึงข้อความ');
    } finally {
      setIsUpdatingAutoFetch(false);
    }
  };

  // Fetch sessions for cleanup section
  const fetchSessions = useCallback(async () => {
    try {
      const res = await lineSessionApi.getAll();
      if (res.data.success) {
        setSessions(res.data.sessions || []);
      }
    } catch {
      console.error('Failed to fetch sessions');
    }
  }, []);

  // Fetch message stats (called on page load)
  const fetchMessageStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const res = await lineSessionApi.getMessageStats();
      if (res.data.success) {
        setMessageStats(res.data);
      }
    } catch {
      console.error('Failed to fetch message stats');
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Fetch cleanup preview
  const fetchPreview = useCallback(async () => {
    const data: { sessionIds?: string[]; olderThanDays?: number; olderThanMonths?: number } = {};
    if (cleanupUnit === 'days') {
      data.olderThanDays = cleanupValue;
    } else {
      data.olderThanMonths = cleanupValue;
    }
    if (!selectAllSessions && selectedSessionIds.length > 0) {
      data.sessionIds = selectedSessionIds;
    }

    setIsLoadingPreview(true);
    try {
      const res = await lineSessionApi.previewCleanup(data);
      if (res.data.success) {
        setPreview(res.data);
      }
    } catch {
      console.error('Failed to fetch cleanup preview');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [cleanupUnit, cleanupValue, selectAllSessions, selectedSessionIds]);

  // Compute cutoff date for preview
  const getCutoffDate = useCallback(() => {
    const d = new Date();
    if (cleanupUnit === 'days') {
      d.setDate(d.getDate() - cleanupValue);
    } else {
      d.setMonth(d.getMonth() - cleanupValue);
    }
    return d;
  }, [cleanupUnit, cleanupValue]);

  // Handle session selection toggle
  const toggleSession = (id: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
    setSelectAllSessions(false);
  };

  // Handle select all toggle
  const toggleSelectAll = () => {
    if (selectAllSessions) {
      setSelectAllSessions(false);
      setSelectedSessionIds([]);
    } else {
      setSelectAllSessions(true);
      setSelectedSessionIds([]);
    }
  };

  // Execute delete
  const handleDeleteMessages = async () => {
    setIsDeleting(true);
    setDeleteResult(null);
    try {
      const data: { sessionIds?: string[]; olderThanDays?: number; olderThanMonths?: number } = {};
      if (cleanupUnit === 'days') {
        data.olderThanDays = cleanupValue;
      } else {
        data.olderThanMonths = cleanupValue;
      }
      if (!selectAllSessions && selectedSessionIds.length > 0) {
        data.sessionIds = selectedSessionIds;
      }
      const res = await lineSessionApi.deleteOldMessages(data);
      if (res.data.success) {
        setDeleteResult({
          deletedCount: res.data.deletedCount,
          messagesRemaining: res.data.messagesRemaining,
          message: res.data.message,
        });
        toast.success(res.data.message);
        // Refresh stats and preview after delete
        fetchMessageStats();
        fetchPreview();
      }
    } catch {
      toast.error('ไม่สามารถลบข้อความได้');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchRuntimeConfig();
    fetchHealthStatuses();
    fetchAutoFetchStatus();
    fetchSessions();
    fetchMessageStats();
  }, [fetchRuntimeConfig, fetchHealthStatuses, fetchAutoFetchStatus, fetchSessions, fetchMessageStats]);

  // Auto refresh health statuses every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHealthStatuses();
      fetchAutoFetchStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchHealthStatuses, fetchAutoFetchStatus]);

  // Countdown timer for next auto-fetch
  useEffect(() => {
    if (!autoFetchStatus?.isRunning || !autoFetchStatus?.lastFetchTime) {
      setCountdown(0);
      return;
    }

    const calculateCountdown = () => {
      const lastFetch = new Date(autoFetchStatus.lastFetchTime!).getTime();
      const interval = autoFetchStatus.config.intervalSeconds * 1000;
      const nextFetch = lastFetch + interval;
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((nextFetch - now) / 1000));
      setCountdown(remaining);
    };

    calculateCountdown();
    const timer = setInterval(calculateCountdown, 1000);

    return () => clearInterval(timer);
  }, [autoFetchStatus?.isRunning, autoFetchStatus?.lastFetchTime, autoFetchStatus?.config.intervalSeconds]);

  // Format bytes to human-readable
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Get per-session message count from stats — match by sessionId or lineAccountId
  const getSessionMessageCount = (sessionId: string): number | null => {
    if (!messageStats) return null;
    const found = messageStats.perSession.find(
      (p) => p._id === sessionId || p.lineAccountId === sessionId,
    );
    return found ? found.count : 0;
  };

  // Auto-fetch preview with debounce when cleanup params change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cleanupValue > 0 && (selectAllSessions || selectedSessionIds.length > 0)) {
        fetchPreview();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cleanupUnit, cleanupValue, selectAllSessions, selectedSessionIds, fetchPreview]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Save to database (persistent)
      await systemSettingsApi.updateSystemSettings(settings);

      // 2. Auto-apply to runtime so settings take effect immediately
      try {
        await api.put('/admin/line-session/settings/health-check', {
          enabled: settings.lineSessionHealthCheckEnabled,
          intervalMinutes: settings.lineSessionHealthCheckIntervalMinutes,
          maxConsecutiveFailures: settings.lineSessionMaxConsecutiveFailures,
          expiryWarningMinutes: settings.lineSessionExpiryWarningMinutes,
          autoReloginEnabled: settings.lineSessionAutoReloginEnabled,
          reloginCheckIntervalMinutes: settings.lineSessionReloginCheckIntervalMinutes,
        });
        await fetchRuntimeConfig();
      } catch {
        // Non-critical — settings are saved to DB even if runtime apply fails
        console.error('Failed to apply settings to runtime');
      }

      toast.success('บันทึกและอัปเดตการตั้งค่าสำเร็จ');
    } catch {
      toast.error('ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white">
                <Key className="w-6 h-6" />
              </div>
              ตั้งค่า LINE Session
            </h1>
            <p className="text-slate-400 dark:text-slate-300 mt-1">
              กำหนดค่าการตรวจสอบ Keys และ Auto Re-login
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={applySettingsToRuntime}
              className="gap-2"
            >
              <Play className="w-4 h-4" />
              Apply to Runtime
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  บันทึกการตั้งค่า
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Runtime Status Card */}
        <Card className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border-indigo-200 dark:border-indigo-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  สถานะ Runtime
                </h2>
                <p className="text-sm text-slate-400 dark:text-slate-300">
                  การตั้งค่าที่ใช้งานอยู่ในขณะนี้
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={runHealthCheck}
              disabled={isCheckingHealth}
              className="gap-2"
            >
              {isCheckingHealth ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังตรวจสอบ...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  ตรวจสอบ Keys ทันที
                </>
              )}
            </Button>
          </div>

          {runtimeConfig && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">Health Check</p>
                <p className={`text-lg font-bold ${runtimeConfig.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {runtimeConfig.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">ตรวจสอบทุก</p>
                <p className="text-lg font-bold text-blue-600">{runtimeConfig.intervalMinutes} นาที</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">Max Failures</p>
                <p className="text-lg font-bold text-amber-600">{runtimeConfig.maxConsecutiveFailures} ครั้ง</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">Auto Relogin</p>
                <p className={`text-lg font-bold ${runtimeConfig.autoReloginEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {runtimeConfig.autoReloginEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}
                </p>
              </div>
            </div>
          )}

          {/* Health Status List */}
          {healthStatuses.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                สถานะ Sessions ({healthStatuses.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {healthStatuses.map((status) => (
                  <div
                    key={status.lineAccountId}
                    className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {status.status === 'healthy' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : status.status === 'expired' ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="font-mono text-xs truncate max-w-[120px] sm:max-w-[200px]">
                        {status.lineAccountId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        status.status === 'healthy'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : status.status === 'expired'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {status.status === 'healthy' ? 'ปกติ' : status.status === 'expired' ? 'หมดอายุ' : 'มีปัญหา'}
                      </span>
                      {status.consecutiveFailures > 0 && (
                        <span className="text-xs text-slate-300">
                          ({status.consecutiveFailures} fails)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {healthStatuses.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-300 text-center py-4">
              ยังไม่มี Session ที่ตรวจสอบ กดปุ่ม &quot;ตรวจสอบ Keys ทันที&quot; เพื่อเริ่มต้น
            </p>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Health Check Settings */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  ตรวจสอบสถานะ Keys
                </h2>
                <p className="text-sm text-slate-400 dark:text-slate-300">
                  ระบบจะตรวจสอบว่า Keys ยังใช้งานได้อยู่หรือไม่
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    เปิดใช้งานการตรวจสอบ
                  </p>
                  <p className="text-sm text-slate-400 dark:text-slate-300">
                    ระบบจะ Loop ตรวจสอบ Keys อัตโนมัติ
                  </p>
                </div>
                <Switch
                  checked={settings.lineSessionHealthCheckEnabled}
                  onChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      lineSessionHealthCheckEnabled: checked,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Clock className="w-4 h-4 inline mr-2" />
                  ตรวจสอบทุก (นาที)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.lineSessionHealthCheckIntervalMinutes}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lineSessionHealthCheckIntervalMinutes: parseInt(e.target.value) || 5,
                    }))
                  }
                  disabled={!settings.lineSessionHealthCheckEnabled}
                />
                <p className="text-xs text-slate-400 mt-1">
                  แนะนำ: 5-10 นาที (ค่าน้อยเกินอาจทำให้เซิร์ฟเวอร์หนัก)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  จำนวนครั้งที่ล้มเหลวก่อน Expired
                </label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.lineSessionMaxConsecutiveFailures}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lineSessionMaxConsecutiveFailures: parseInt(e.target.value) || 3,
                    }))
                  }
                  disabled={!settings.lineSessionHealthCheckEnabled}
                />
                <p className="text-xs text-slate-400 mt-1">
                  ถ้าตรวจสอบล้มเหลวติดต่อกัน X ครั้ง จะถือว่า Keys หมดอายุ
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <Clock className="w-4 h-4 inline mr-2" />
                  แจ้งเตือนก่อนหมดอายุ (นาที)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.lineSessionExpiryWarningMinutes}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lineSessionExpiryWarningMinutes: parseInt(e.target.value) || 5,
                    }))
                  }
                  disabled={!settings.lineSessionHealthCheckEnabled}
                />
              </div>
            </div>
          </Card>

          {/* Auto Re-login Settings */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Auto Re-login
                </h2>
                <p className="text-sm text-slate-400 dark:text-slate-300">
                  ล็อกอินใหม่อัตโนมัติเมื่อ Keys หมดอายุ
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    เปิดใช้งาน Auto Re-login
                  </p>
                  <p className="text-sm text-slate-400 dark:text-slate-300">
                    ระบบจะ Login ใหม่อัตโนมัติเมื่อ Keys หมดอายุ
                  </p>
                </div>
                <Switch
                  checked={settings.lineSessionAutoReloginEnabled}
                  onChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      lineSessionAutoReloginEnabled: checked,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <RefreshCw className="w-4 h-4 inline mr-2" />
                  ตรวจสอบ Re-login ทุก (นาที)
                </label>
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={settings.lineSessionReloginCheckIntervalMinutes}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      lineSessionReloginCheckIntervalMinutes: parseInt(e.target.value) || 10,
                    }))
                  }
                  disabled={!settings.lineSessionAutoReloginEnabled}
                />
                <p className="text-xs text-slate-400 mt-1">
                  ระบบจะตรวจสอบว่ามี Session ไหนต้อง Re-login ทุก X นาที
                </p>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      หมายเหตุ
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Auto Re-login ต้องการให้ผู้ใช้บันทึก Email และ Password ไว้ในระบบก่อน
                      และต้องยืนยัน PIN บนมือถือทุกครั้ง
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Auto Message Fetch Settings */}
        <Card className="p-6 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border-violet-200 dark:border-violet-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
                <MessageSquare className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  ดึงข้อความอัตโนมัติ
                </h2>
                <p className="text-sm text-slate-400 dark:text-slate-300">
                  ดึงข้อความจาก LINE ทุกบัญชีตามช่วงเวลาที่กำหนด
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAllMessagesNow}
                disabled={isUpdatingAutoFetch}
                className="gap-2"
              >
                {isUpdatingAutoFetch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                ดึงข้อความทันที
              </Button>
            </div>
          </div>

          {/* Auto-fetch Status */}
          {autoFetchStatus && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">สถานะ</p>
                <p className={`text-lg font-bold ${autoFetchStatus.isRunning ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {autoFetchStatus.isRunning ? 'กำลังทำงาน' : 'หยุดอยู่'}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">ดึงทุก</p>
                <p className="text-lg font-bold text-violet-600">{autoFetchStatus.config.intervalSeconds} วินาที</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">ข้อความใหม่ทั้งหมด</p>
                <p className="text-lg font-bold text-blue-600">{autoFetchStatus.stats.totalNewMessages.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-400 dark:text-slate-300">ดึงสำเร็จ/ทั้งหมด</p>
                <p className="text-lg font-bold text-emerald-600">
                  {autoFetchStatus.stats.successfulFetches}/{autoFetchStatus.stats.totalFetches}
                </p>
              </div>
            </div>
          )}

          {/* Countdown Progress Bar */}
          {autoFetchStatus?.isRunning && (
            <div className="mb-6 p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-violet-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
                    ดึงรายการถัดไปใน
                  </span>
                </div>
                <span className="text-2xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">
                  {countdown > 0 ? (
                    <>
                      {Math.floor(countdown / 60) > 0 && (
                        <span>{Math.floor(countdown / 60)} นาที </span>
                      )}
                      {countdown % 60} วินาที
                    </>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      กำลังดึง...
                    </span>
                  )}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-3 bg-violet-200 dark:bg-violet-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${autoFetchStatus?.config.intervalSeconds > 0
                      ? ((autoFetchStatus.config.intervalSeconds - countdown) / autoFetchStatus.config.intervalSeconds) * 100
                      : 0}%`
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-violet-500 dark:text-violet-400">
                <span>ดึงล่าสุด: {autoFetchStatus?.lastFetchTime ? new Date(autoFetchStatus.lastFetchTime).toLocaleTimeString('th-TH') : '-'}</span>
                <span>ทุก {autoFetchStatus?.config.intervalSeconds} วินาที</span>
              </div>
            </div>
          )}

          {/* Last Fetch Time (when stopped) */}
          {!autoFetchStatus?.isRunning && autoFetchStatus?.lastFetchTime && (
            <div className="mb-6 p-3 bg-white dark:bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-400 dark:text-slate-300">ดึงล่าสุดเมื่อ</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {new Date(autoFetchStatus.lastFetchTime).toLocaleString('th-TH')}
              </p>
            </div>
          )}

          {/* Settings Controls */}
          <div className="space-y-4">
            {/* Enable/Disable Toggle */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-xl">
              <div className="flex-1">
                <p className="font-medium text-slate-900 dark:text-white">
                  เปิดใช้งานการดึงอัตโนมัติ
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-300">
                  ระบบจะดึงข้อความจากทุกบัญชีตามช่วงเวลาที่ตั้งค่า
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {autoFetchStatus?.isRunning ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => controlAutoFetch('stop')}
                    disabled={isUpdatingAutoFetch}
                    className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Pause className="w-4 h-4" />
                    หยุด
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => controlAutoFetch('start')}
                    disabled={isUpdatingAutoFetch}
                    className="gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  >
                    <Play className="w-4 h-4" />
                    เริ่ม
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => controlAutoFetch('restart')}
                  disabled={isUpdatingAutoFetch}
                  className="gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  รีสตาร์ท
                </Button>
              </div>
            </div>

            {/* Interval Setting */}
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Clock className="w-4 h-4 inline mr-2" />
                ดึงข้อความทุก (วินาที)
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={10}
                  max={3600}
                  value={autoFetchInterval}
                  onChange={(e) => setAutoFetchInterval(parseInt(e.target.value) || 60)}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  onClick={() => updateAutoFetch({ intervalSeconds: autoFetchInterval })}
                  disabled={isUpdatingAutoFetch}
                >
                  {isUpdatingAutoFetch ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'อัปเดต'
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                ค่าต่ำสุด: 10 วินาที, ค่าสูงสุด: 3600 วินาที (1 ชั่วโมง)
              </p>
            </div>

            {/* Quick Interval Buttons */}
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                ตั้งค่าด่วน
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '10 วินาที', value: 10 },
                  { label: '30 วินาที', value: 30 },
                  { label: '1 นาที', value: 60 },
                  { label: '2 นาที', value: 120 },
                  { label: '5 นาที', value: 300 },
                  { label: '10 นาที', value: 600 },
                ].map((preset) => (
                  <Button
                    key={preset.value}
                    variant={autoFetchStatus?.config.intervalSeconds === preset.value ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setAutoFetchInterval(preset.value);
                      updateAutoFetch({ intervalSeconds: preset.value });
                    }}
                    disabled={isUpdatingAutoFetch}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Message Cleanup Section */}
        <Card className="p-6 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                ลบข้อความเก่า
              </h2>
              <p className="text-sm text-slate-400 dark:text-slate-300">
                ลบข้อความ (line_messages) ที่เก่าเกินไปเพื่อจัดการพื้นที่เก็บข้อมูล
              </p>
            </div>
          </div>

          {/* Message Stats Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-4 h-4 text-blue-500" />
                <p className="text-xs text-slate-400 dark:text-slate-300">ข้อความทั้งหมด</p>
              </div>
              <p className="text-lg font-bold text-blue-600">
                {isLoadingStats ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : (
                  (messageStats?.totalMessages ?? 0).toLocaleString()
                )}
              </p>
            </div>
            <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-violet-500" />
                <p className="text-xs text-slate-400 dark:text-slate-300">จำนวน Session</p>
              </div>
              <p className="text-lg font-bold text-violet-600">
                {isLoadingStats ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : (
                  messageStats?.sessionCount ?? 0
                )}
              </p>
            </div>
            <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-4 h-4 text-amber-500" />
                <p className="text-xs text-slate-400 dark:text-slate-300">พื้นที่โดยประมาณ</p>
              </div>
              <p className="text-lg font-bold text-amber-600">
                {isLoadingStats ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : (
                  formatBytes(messageStats?.estimatedSizeBytes ?? 0)
                )}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Time unit selection */}
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                <Clock className="w-4 h-4 inline mr-2" />
                กำหนดช่วงเวลา
              </label>
              <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cleanupUnit"
                    value="days"
                    checked={cleanupUnit === 'days'}
                    onChange={() => setCleanupUnit('days')}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">วัน</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cleanupUnit"
                    value="months"
                    checked={cleanupUnit === 'months'}
                    onChange={() => setCleanupUnit('months')}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">เดือน</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-slate-700 dark:text-slate-300">ลบข้อความเก่ากว่า</span>
                <Input
                  type="number"
                  min={1}
                  max={cleanupUnit === 'days' ? 3650 : 120}
                  value={cleanupValue}
                  onChange={(e) => setCleanupValue(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {cleanupUnit === 'days' ? 'วัน' : 'เดือน'}ย้อนหลัง
                </span>
              </div>
            </div>

            {/* Session selection */}
            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                เลือกบัญชี
              </label>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAllSessions}
                  onChange={toggleSelectAll}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  เลือกทั้งหมด ({sessions.length} บัญชี)
                </span>
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {sessions.map((session) => {
                  const msgCount = getSessionMessageCount(session._id);
                  return (
                    <label
                      key={session._id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectAllSessions || selectedSessionIds.includes(session._id)}
                        onChange={() => toggleSession(session._id)}
                        disabled={selectAllSessions}
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-0">
                        <span className="truncate">{session.name}</span>
                        {session.bankName && (
                          <span className="text-slate-400 ml-1">({session.bankName})</span>
                        )}
                      </span>
                      {msgCount !== null && (
                        <span className="text-xs text-slate-400 dark:text-slate-300 tabular-nums">
                          {msgCount.toLocaleString()} ข้อความ
                        </span>
                      )}
                      {session.status && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          session.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {session.status}
                        </span>
                      )}
                    </label>
                  );
                })}
                {sessions.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-2">
                    ไม่พบบัญชี
                  </p>
                )}
              </div>
            </div>

            {/* Preview with live data */}
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  {isLoadingPreview ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      <span className="text-sm text-amber-700 dark:text-amber-300">กำลังคำนวณ...</span>
                    </div>
                  ) : preview ? (
                    <div className="space-y-2">
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        จะลบ {preview.messagesToDelete.toLocaleString()} ข้อความ จากทั้งหมด {preview.totalMessages.toLocaleString()} ข้อความ
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        หลังลบจะเหลือ {preview.messagesRemaining.toLocaleString()} ข้อความ
                        {preview.estimatedSizeBytes > 0 && (
                          <> &middot; ประมาณ {formatBytes(preview.estimatedSizeBytes)} ที่จะเพิ่มพื้นที่</>
                        )}
                      </p>

                      {/* Date explanation */}
                      <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                        <p>
                          ลบข้อความตั้งแต่{' '}
                          {preview.oldestMessageDate ? (
                            <strong>
                              {new Date(preview.oldestMessageDate).toLocaleDateString('th-TH', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </strong>
                          ) : (
                            'ข้อมูลเก่าสุด'
                          )}{' '}
                          ถึง <strong>ก่อนวันที่{' '}
                          {new Date(preview.cutoffDate).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}</strong>
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          (ข้อความวันที่{' '}
                          {new Date(preview.cutoffDate).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}{' '}
                          เป็นต้นไปจะไม่ถูกลบ)
                        </p>
                      </div>

                      {/* Progress bar: delete vs keep ratio */}
                      {preview.totalMessages > 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400 mb-1">
                            <span>ลบ {Math.round((preview.messagesToDelete / preview.totalMessages) * 100)}%</span>
                            <span>เก็บ {Math.round((preview.messagesRemaining / preview.totalMessages) * 100)}%</span>
                          </div>
                          <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-red-400 dark:bg-red-500 transition-all duration-500"
                              style={{ width: `${(preview.messagesToDelete / preview.totalMessages) * 100}%` }}
                            />
                            <div
                              className="h-full bg-slate-300 dark:bg-slate-600"
                              style={{ width: `${(preview.messagesRemaining / preview.totalMessages) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      จะลบข้อความก่อนวันที่{' '}
                      {getCutoffDate().toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Delete Result */}
            {deleteResult && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <div className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-emerald-800 dark:text-emerald-200">
                      ลบสำเร็จ
                    </p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                      ลบไปแล้ว {deleteResult.deletedCount.toLocaleString()} ข้อความ &middot; เหลือ {deleteResult.messagesRemaining.toLocaleString()} ข้อความ
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Button */}
            <div className="flex justify-end">
              <Button
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting || (!selectAllSessions && selectedSessionIds.length === 0)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                ลบข้อความเก่า
              </Button>
            </div>
          </div>

          {/* Confirm Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    ยืนยันการลบข้อความ
                  </h3>
                </div>

                {/* Summary table */}
                {preview && (
                  <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400 dark:text-slate-300">จำนวนที่จะลบ</span>
                      <span className="font-bold text-red-600">{preview.messagesToDelete.toLocaleString()} ข้อความ</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400 dark:text-slate-300">จำนวนที่จะเหลือ</span>
                      <span className="font-bold text-emerald-600">{preview.messagesRemaining.toLocaleString()} ข้อความ</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400 dark:text-slate-300">พื้นที่ที่จะเพิ่ม</span>
                      <span className="font-bold text-blue-600">{formatBytes(preview.estimatedSizeBytes)}</span>
                    </div>
                  </div>
                )}

                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                  ลบข้อความตั้งแต่เริ่มต้น ถึง <strong>ก่อนวันที่{' '}
                  {getCutoffDate().toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}</strong>
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                  จาก{' '}
                  <strong>
                    {selectAllSessions
                      ? `ทุกบัญชี (${sessions.length} บัญชี)`
                      : `${selectedSessionIds.length} บัญชีที่เลือก`}
                  </strong>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-300 mb-4">
                  (ข้อความวันที่{' '}
                  {getCutoffDate().toLocaleDateString('th-TH', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}{' '}
                  เป็นต้นไปจะไม่ถูกลบ)
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-6">
                  การดำเนินการนี้ไม่สามารถย้อนกลับได้
                </p>
                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDeleteMessages}
                    disabled={isDeleting}
                    className="gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        กำลังลบ...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        ยืนยันลบ
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Info Card */}
        <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                การทำงานของระบบ
              </h3>
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">1.</span>
                  <span>ผู้ใช้ใส่ Email, Password และเลือกธนาคาร แล้วกด Login</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">2.</span>
                  <span>ระบบจะเปิด Browser เข้า LINE และแสดง PIN ให้ยืนยัน</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">3.</span>
                  <span>เมื่อยืนยัน PIN แล้ว ระบบจะดึง Keys (xLineAccess, xHmac) อัตโนมัติ</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">4.</span>
                  <span>ระบบจะ Loop ตรวจสอบ Keys ตามช่วงเวลาที่ตั้งค่าไว้</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">5.</span>
                  <span>ถ้า Keys หมดอายุ และเปิด Auto Re-login ไว้ ระบบจะ Login ใหม่อัตโนมัติ</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
