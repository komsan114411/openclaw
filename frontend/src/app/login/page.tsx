'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface LoginForm {
  username: string;
  password: string;
}

const MAX_USERNAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 128;
const MAX_LOGIN_ATTEMPTS = 5;

export default function LoginPage() {
  const router = useRouter();
  const { user, isInitialized, login, isLoading, error, clearError, checkAuth, setInitialized } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [mounted, setMounted] = useState(false);
  
  // Refs to prevent duplicate operations
  const authCheckRef = useRef(false);
  const redirectRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError: setFormError,
  } = useForm<LoginForm>({ mode: 'onBlur' });

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load lockout state from localStorage
  useEffect(() => {
    if (!mounted) return;
    
    try {
      const storedLockout = localStorage.getItem('login_lockout');
      if (storedLockout) {
        const lockoutEnd = parseInt(storedLockout, 10);
        if (Date.now() < lockoutEnd) {
          setIsLocked(true);
          setLockoutTime(Math.ceil((lockoutEnd - Date.now()) / 1000));
        } else {
          localStorage.removeItem('login_lockout');
          localStorage.removeItem('login_attempts');
        }
      }
      const storedAttempts = localStorage.getItem('login_attempts');
      if (storedAttempts) setLoginAttempts(parseInt(storedAttempts, 10));
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [mounted]);

  // Lockout countdown timer
  useEffect(() => {
    if (!isLocked || lockoutTime <= 0) return;
    
    const timer = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          try {
            localStorage.removeItem('login_lockout');
            localStorage.removeItem('login_attempts');
          } catch (e) {
            // Ignore localStorage errors
          }
          setLoginAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isLocked, lockoutTime]);

  // Check auth status on mount - only once
  useEffect(() => {
    if (!mounted || authCheckRef.current) return;
    
    authCheckRef.current = true;
    
    // If already initialized, don't check again
    if (isInitialized) return;
    
    // Check auth with a small delay to prevent race conditions
    const timer = setTimeout(() => {
      checkAuth();
    }, 50);
    
    return () => clearTimeout(timer);
  }, [mounted, isInitialized, checkAuth]);

  // Redirect if already logged in
  useEffect(() => {
    if (!mounted || !isInitialized || isLoading || redirectRef.current) return;
    
    if (user) {
      redirectRef.current = true;
      
      // Small delay for smooth transition
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

  // Caps Lock detection
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    setCapsLockOn(e.getModifierState('CapsLock'));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mounted, handleKeyDown]);

  const sanitizeInput = (value: string): string => value.trim().slice(0, MAX_USERNAME_LENGTH);

  const onSubmit = async (data: LoginForm) => {
    if (isLocked) {
      toast.error('กรุณารอ ' + lockoutTime + ' วินาที');
      return;
    }
    
    if (isLoading) {
      return; // Prevent double submission
    }
    
    clearError();
    const sanitizedUsername = sanitizeInput(data.username);
    const sanitizedPassword = data.password.slice(0, MAX_PASSWORD_LENGTH);
    
    if (!sanitizedUsername) {
      setFormError('username', { message: 'กรุณากรอกชื่อผู้ใช้' });
      return;
    }

    const success = await login(sanitizedUsername, sanitizedPassword);
    
    if (success) {
      try {
        localStorage.removeItem('login_attempts');
        localStorage.removeItem('login_lockout');
      } catch (e) {
        // Ignore localStorage errors
      }
      setLoginAttempts(0);
      toast.success('เข้าสู่ระบบสำเร็จ');
    } else {
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);
      
      try {
        localStorage.setItem('login_attempts', newAttempts.toString());
      } catch (e) {
        // Ignore localStorage errors
      }
      
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockoutEnd = Date.now() + 60000;
        try {
          localStorage.setItem('login_lockout', lockoutEnd.toString());
        } catch (e) {
          // Ignore localStorage errors
        }
        setIsLocked(true);
        setLockoutTime(60);
        toast.error('ล็อกอินผิดพลาดหลายครั้ง กรุณารอ 1 นาที');
      } else {
        const latestError = useAuthStore.getState().error;
        const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
        toast.error((latestError || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง') + ' (เหลือ ' + remaining + ' ครั้ง)');
      }
      setValue('password', '');
    }
  };

  const remainingAttempts = MAX_LOGIN_ATTEMPTS - loginAttempts;

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
      </div>
    );
  }

  // Show loading if checking auth or redirecting
  if (!isInitialized || (user && !redirectRef.current)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="relative flex flex-col items-center">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <p className="mt-4 text-slate-400 text-sm animate-pulse">กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(6,199,85,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(6,199,85,0.1),transparent)]" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#06C755]/5 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#06C755]/5 blur-[120px] rounded-full pointer-events-none" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative w-full max-w-md">
        <div className="absolute -inset-1 bg-gradient-to-r from-[#06C755]/20 to-emerald-500/20 rounded-[2.5rem] blur-xl opacity-50" />
        <Card className="relative border-white/10 shadow-2xl bg-slate-900/90 backdrop-blur-2xl rounded-[2rem] p-6 sm:p-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[#06C755]/50 to-transparent" />

          <div className="text-center mb-8">
            <div className="relative inline-block">
              <div className="absolute -inset-2 bg-[#06C755]/20 rounded-full blur-xl" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#06C755] to-emerald-600 flex items-center justify-center shadow-xl shadow-[#06C755]/30 transform hover:scale-105 transition-all duration-300">
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-6 tracking-tight">LINE OA <span className="text-[#06C755]">Management</span></h1>
            <p className="text-slate-400 mt-2 text-sm">เข้าสู่ระบบเพื่อจัดการบัญชี LINE OA ของคุณ</p>
          </div>

          {isLocked && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center animate-pulse">
              <div className="flex items-center justify-center gap-2 text-rose-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                <span className="font-semibold">บัญชีถูกล็อกชั่วคราว</span>
              </div>
              <p className="text-rose-300 text-sm mt-1">กรุณารอ <span className="font-bold">{lockoutTime}</span> วินาที</p>
            </div>
          )}

          {!isLocked && loginAttempts > 0 && remainingAttempts <= 3 && (
            <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-amber-400 text-sm">เหลือโอกาสเข้าสู่ระบบอีก <span className="font-bold">{remainingAttempts}</span> ครั้ง</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" autoComplete="off">
            <div className="space-y-1">
              <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider block mb-2">ชื่อผู้ใช้</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input type="text" placeholder="ระบุชื่อผู้ใช้" maxLength={MAX_USERNAME_LENGTH} disabled={isLocked || isSubmitting || isLoading} autoComplete="username" aria-label="ชื่อผู้ใช้"
                  className="w-full h-12 pl-12 pr-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  {...register('username', { required: 'กรุณากรอกชื่อผู้ใช้', maxLength: { value: MAX_USERNAME_LENGTH, message: 'ไม่เกิน ' + MAX_USERNAME_LENGTH + ' ตัวอักษร' }, pattern: { value: /^[a-zA-Z0-9_]+$/, message: 'ใช้ได้เฉพาะ a-z, 0-9, _ เท่านั้น' } })} />
              </div>
              {errors.username && <p className="text-rose-400 text-xs mt-1">⚠️ {errors.username.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider block mb-2">รหัสผ่าน</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" maxLength={MAX_PASSWORD_LENGTH} disabled={isLocked || isSubmitting || isLoading} autoComplete="current-password" aria-label="รหัสผ่าน"
                  className="w-full h-12 pl-12 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  {...register('password', { required: 'กรุณากรอกรหัสผ่าน', maxLength: { value: MAX_PASSWORD_LENGTH, message: 'รหัสผ่านยาวเกินไป' } })} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-white transition-colors" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} tabIndex={-1}>
                  {showPassword ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                </button>
              </div>
              {errors.password && <p className="text-rose-400 text-xs mt-1">⚠️ {errors.password.message}</p>}
              {capsLockOn && <p className="text-amber-400 text-xs mt-1 animate-pulse">⚠️ Caps Lock เปิดอยู่</p>}
            </div>

            {error && !isLocked && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-rose-400 text-sm">{error}</p>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" className="h-14 rounded-xl font-bold text-sm shadow-lg shadow-[#06C755]/20 hover:shadow-[#06C755]/30 transition-all bg-gradient-to-r from-[#06C755] to-emerald-600 hover:from-[#05a347] hover:to-emerald-700 border-none disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLocked || isSubmitting || isLoading} isLoading={isSubmitting || isLoading} loadingText="กำลังเข้าสู่ระบบ...">
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                เข้าสู่ระบบ
              </span>
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-slate-500 text-sm mb-4">ยังไม่มีบัญชี?</p>
            <Link href="/register">
              <Button variant="ghost" fullWidth className="h-12 rounded-xl text-white hover:bg-white/5 font-medium border border-white/10 hover:border-[#06C755]/30 transition-all">
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                  สมัครสมาชิกใหม่
                </span>
              </Button>
            </Link>
          </div>

          <div className="mt-6 text-center">
            <p className="text-slate-600 text-[10px] flex items-center justify-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              การเชื่อมต่อปลอดภัยด้วย SSL
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
