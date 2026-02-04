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

export default function LineSessionSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthStatuses, setHealthStatuses] = useState<HealthStatus[]>([]);
  const [runtimeConfig, setRuntimeConfig] = useState<HealthCheckConfig | null>(null);
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

  useEffect(() => {
    fetchSettings();
    fetchRuntimeConfig();
    fetchHealthStatuses();
  }, [fetchRuntimeConfig, fetchHealthStatuses]);

  // Auto refresh health statuses every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHealthStatuses();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchHealthStatuses]);

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
