'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
import { systemSettingsApi } from '@/lib/api';
import { useSiteBranding } from '@/hooks/useSiteBranding';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface RegisterForm {
  username: string;
  password: string;
  email?: string;
  fullName?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { user, isInitialized, register: registerUser, isLoading, error, clearError, checkAuth } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const authCheckRef = useRef(false);
  const redirectRef = useRef(false);

  // Access control state
  const [accessStatus, setAccessStatus] = useState<{
    allowRegistration: boolean;
    registrationDisabledMessage: string;
  } | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  // Site branding — cached in localStorage to avoid flicker
  const siteBranding = useSiteBranding();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>();

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check access status on mount
  useEffect(() => {
    if (!mounted) return;

    const checkAccessStatus = async () => {
      try {
        const res = await systemSettingsApi.getAccessStatus();
        setAccessStatus({
          allowRegistration: res.data.allowRegistration,
          registrationDisabledMessage: res.data.registrationDisabledMessage,
        });
      } catch (error) {
        // Default to allowing access if API fails
        setAccessStatus({
          allowRegistration: true,
          registrationDisabledMessage: '',
        });
      } finally {
        setAccessLoading(false);
      }
    };

    checkAccessStatus();
  }, [mounted]);

  // Check auth on mount
  useEffect(() => {
    if (!mounted || authCheckRef.current) return;
    
    authCheckRef.current = true;
    
    if (!isInitialized) {
      checkAuth();
    }
  }, [mounted, isInitialized, checkAuth]);

  // Redirect if already logged in
  useEffect(() => {
    if (!mounted || !isInitialized || isLoading || redirectRef.current) return;
    
    if (user) {
      redirectRef.current = true;
      
      const timer = setTimeout(() => {
        if (user.forcePasswordChange) {
          router.replace('/change-password');
        } else if (user.role === 'admin') {
          router.replace('/admin/dashboard');
        } else {
          router.replace('/user/dashboard');
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [mounted, user, isInitialized, isLoading, router]);

  const onSubmit = async (data: RegisterForm) => {
    if (isLoading) return;

    clearError();

    // Clean up empty optional fields to avoid validation errors
    const cleanData: RegisterForm = {
      username: data.username,
      password: data.password,
    };
    if (data.email && data.email.trim()) {
      cleanData.email = data.email.trim();
    }
    if (data.fullName && data.fullName.trim()) {
      cleanData.fullName = data.fullName.trim();
    }

    const success = await registerUser(cleanData);
    if (success) {
      toast.success('สมัครสมาชิกสำเร็จ');
    } else {
      const latestError = useAuthStore.getState().error;
      toast.error(latestError || 'สมัครสมาชิกไม่สำเร็จ');
    }
  };

  // Show loading during hydration
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
      </div>
    );
  }

  // Show loading if checking auth, access status, or redirecting
  if (!isInitialized || accessLoading || (user && !redirectRef.current)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="relative flex flex-col items-center">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <p className="mt-4 text-slate-400 text-sm animate-pulse">กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  // Check if registration is disabled
  const registrationDisabled = accessStatus && accessStatus.allowRegistration === false;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.1),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.1),transparent_55%)]" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 blur-[120px] -z-10 pointer-events-none animate-pulse duration-[10s]" />

      <div className="relative w-full max-w-md">
        <Card className="border-none shadow-2xl shadow-emerald-900/20 bg-white/10 backdrop-blur-2xl rounded-[3rem] p-8 md:p-10 border-white/10">
          <div className="text-center mb-10">
            {siteBranding.siteLogoBase64 ? (
              <div className="w-20 h-20 rounded-[2rem] overflow-hidden mx-auto mb-6 shadow-xl shadow-emerald-500/30 hover:scale-110 transition-transform duration-500">
                <img src={siteBranding.siteLogoBase64} alt="Logo" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/30 group hover:scale-110 transition-transform duration-500">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 11c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm8 10H4a6 6 0 0112 0v0z" />
                </svg>
              </div>
            )}
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">สมัครสมาชิก</h1>
            {siteBranding.siteName && (
              <p className="text-emerald-400 mt-2 font-bold text-sm">{siteBranding.siteName}</p>
            )}
            <p className="text-slate-400 mt-2 font-bold text-sm tracking-wide">สร้างบัญชีเพื่อเริ่มใช้งานระบบอัตโนมัติ</p>
          </div>

          {/* Registration Disabled by Admin */}
          {registrationDisabled && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
              <div className="flex items-center justify-center gap-2 text-amber-400 mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-bold text-lg">ปิดรับสมัครสมาชิกชั่วคราว</span>
              </div>
              <p className="text-amber-300 text-sm">{accessStatus?.registrationDisabledMessage}</p>
            </div>
          )}

          {/* Error Alert Box */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-rose-400 font-bold text-sm mb-1">สมัครสมาชิกไม่สำเร็จ</h4>
                  <p className="text-rose-300 text-sm">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={clearError}
                  className="text-rose-400 hover:text-rose-300 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Input
                label="ชื่อผู้ใช้"
                placeholder="ระบุชื่อผู้ใช้"
                {...register('username', { required: 'กรุณากรอกชื่อผู้ใช้' })}
                error={errors.username?.message}
                autoComplete="username"
                required
                disabled={registrationDisabled || isLoading || isSubmitting}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl disabled:opacity-50"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <div className="space-y-2">
              <Input
                label="รหัสผ่าน"
                placeholder="••••••••"
                type="password"
                {...register('password', {
                  required: 'กรุณากรอกรหัสผ่าน',
                  minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
                })}
                error={errors.password?.message}
                autoComplete="new-password"
                required
                disabled={registrationDisabled || isLoading || isSubmitting}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl disabled:opacity-50"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <div className="space-y-2">
              <Input
                label="อีเมล (ไม่บังคับ)"
                placeholder="อีเมลของคุณ"
                type="email"
                {...register('email')}
                autoComplete="email"
                disabled={registrationDisabled || isLoading || isSubmitting}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl disabled:opacity-50"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <div className="space-y-2">
              <Input
                label="ชื่อ-นามสกุล (ไม่บังคับ)"
                placeholder="ชื่อจริง นามสกุลจริง"
                type="text"
                {...register('fullName')}
                autoComplete="name"
                disabled={registrationDisabled || isLoading || isSubmitting}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl disabled:opacity-50"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-wider text-center">
                ⚠️ {error}
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-emerald-500/20 shadow-2xl hover:scale-[1.02] transition-transform bg-gradient-to-r from-emerald-500 to-teal-600 border-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              isLoading={isSubmitting || isLoading}
              loadingText="กำลังสร้างบัญชี..."
              disabled={registrationDisabled || isSubmitting || isLoading}
            >
              ยืนยันการสมัคร
            </Button>
          </form>

          <div className="mt-10 pt-8 border-t border-white/5 text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">มีบัญชีอยู่แล้ว?</p>
            <Link href="/login">
              <Button variant="ghost" fullWidth className="h-12 rounded-2xl text-white hover:bg-white/5 font-bold border border-white/10">
                เข้าสู่ระบบ
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
