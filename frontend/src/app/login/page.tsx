'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, login, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  useEffect(() => {
    if (user) {
      if (user.forcePasswordChange) {
        router.push('/change-password');
      } else if (user.role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/user/dashboard');
      }
    }
  }, [user, router]);

  const onSubmit = async (data: LoginForm) => {
    clearError();
    const success = await login(data.username, data.password);
    if (success) {
      toast.success('เข้าสู่ระบบสำเร็จ');
    } else {
      const latestError = useAuthStore.getState().error;
      toast.error(latestError || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.2),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(20,184,166,0.15),transparent)]" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="relative w-full max-w-md animate-fade">
        <Card className="border-white/10 shadow-2xl shadow-emerald-900/20 bg-white/5 backdrop-blur-2xl rounded-[2.5rem] p-6 sm:p-10">
          {/* Logo & Header */}
          <div className="text-center mb-10">
            <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/30 group hover:scale-110 transition-transform duration-500">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">ระบบ LINE OA</h1>
            <p className="text-slate-400 mt-3 font-bold text-sm tracking-wide">เข้าสู่ระบบเพื่อจัดการบัญชี LINE OA</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Input
              label="ชื่อผู้ใช้"
              placeholder="ระบุชื่อผู้ใช้"
              {...register('username', { required: 'กรุณากรอกชื่อผู้ใช้' })}
              error={errors.username?.message}
              autoComplete="username"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl"
              labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
            />

            <Input
              label="รหัสผ่าน"
              placeholder="•••••••• "
              type={showPassword ? 'text' : 'password'}
              {...register('password', { required: 'กรุณากรอกรหัสผ่าน' })}
              error={errors.password?.message}
              autoComplete="current-password"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl"
              labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-2 rounded-xl hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              }
            />

            {error && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-wider text-center">
                ⚠️ {error}
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-emerald-500/20 shadow-2xl hover:scale-[1.02] transition-transform bg-gradient-to-r from-emerald-500 to-teal-600 border-none"
              isLoading={isSubmitting || isLoading}
              loadingText="กำลังเข้าสู่ระบบ..."
            >
              เข้าสู่ระบบ
            </Button>
          </form>

          <div className="mt-10 pt-8 border-t border-white/5 text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">ยังไม่มีบัญชี?</p>
            <Link href="/register">
              <Button variant="ghost" fullWidth className="h-12 rounded-2xl text-white hover:bg-white/5 font-bold border border-white/10">
                สมัครสมาชิก
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
