'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Switch } from '@/components/ui/Input';
import { systemSettingsApi } from '@/lib/api';
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

  useEffect(() => {
    fetchSettings();
    fetchRuntimeConfig();
    fetchHealthStatuses();
    fetchAutoFetchStatus();
  }, [fetchRuntimeConfig, fetchHealthStatuses, fetchAutoFetchStatus]);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await systemSettingsApi.updateSystemSettings(settings);
      toast.success('บันทึกการตั้งค่าสำเร็จ');
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
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              กำหนดค่าการตรวจสอบ Keys และ Auto Re-login
            </p>
          </div>
          <div className="flex gap-2">
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  สถานะ Runtime
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">Health Check</p>
                <p className={`text-lg font-bold ${runtimeConfig.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {runtimeConfig.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">ตรวจสอบทุก</p>
                <p className="text-lg font-bold text-blue-600">{runtimeConfig.intervalMinutes} นาที</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">Max Failures</p>
                <p className="text-lg font-bold text-amber-600">{runtimeConfig.maxConsecutiveFailures} ครั้ง</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">Auto Relogin</p>
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
                    className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {status.status === 'healthy' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : status.status === 'expired' ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="font-mono text-xs truncate max-w-[200px]">
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
                        <span className="text-xs text-slate-500">
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
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
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
                  <p className="text-sm text-slate-500 dark:text-slate-400">
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
                <p className="text-xs text-slate-500 mt-1">
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
                <p className="text-xs text-slate-500 mt-1">
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
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
                  <p className="text-sm text-slate-500 dark:text-slate-400">
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
                <p className="text-xs text-slate-500 mt-1">
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
                <MessageSquare className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  ดึงข้อความอัตโนมัติ
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
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
                <p className="text-xs text-slate-500 dark:text-slate-400">สถานะ</p>
                <p className={`text-lg font-bold ${autoFetchStatus.isRunning ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {autoFetchStatus.isRunning ? 'กำลังทำงาน' : 'หยุดอยู่'}
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">ดึงทุก</p>
                <p className="text-lg font-bold text-violet-600">{autoFetchStatus.config.intervalSeconds} วินาที</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">ข้อความใหม่ทั้งหมด</p>
                <p className="text-lg font-bold text-blue-600">{autoFetchStatus.stats.totalNewMessages.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                <p className="text-xs text-slate-500 dark:text-slate-400">ดึงสำเร็จ/ทั้งหมด</p>
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
              <p className="text-xs text-slate-500 dark:text-slate-400">ดึงล่าสุดเมื่อ</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {new Date(autoFetchStatus.lastFetchTime).toLocaleString('th-TH')}
              </p>
            </div>
          )}

          {/* Settings Controls */}
          <div className="space-y-4">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  เปิดใช้งานการดึงอัตโนมัติ
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  ระบบจะดึงข้อความจากทุกบัญชีตามช่วงเวลาที่ตั้งค่า
                </p>
              </div>
              <div className="flex gap-2">
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
              <p className="text-xs text-slate-500 mt-2">
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
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
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
