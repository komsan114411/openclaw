'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
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
  const { user, register: registerUser, isLoading, error, clearError } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>();

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

  const onSubmit = async (data: RegisterForm) => {
    clearError();
    const success = await registerUser(data);
    if (success) {
      toast.success('สมัครสมาชิกสำเร็จ');
    } else {
      const latestError = useAuthStore.getState().error;
      toast.error(latestError || 'สมัครสมาชิกไม่สำเร็จ');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.1),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.1),transparent_55%)]" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 blur-[120px] -z-10 pointer-events-none animate-pulse duration-[10s]" />
      
      <div className="relative w-full max-w-md">
        <Card className="border-none shadow-2xl shadow-emerald-900/20 bg-white/10 backdrop-blur-2xl rounded-[3rem] p-8 md:p-10 border-white/10">
          <div className="text-center mb-10">
            <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/30 group hover:scale-110 transition-transform duration-500">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 11c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm8 10H4a6 6 0 0112 0v0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">สมัครสมาชิก</h1>
            <p className="text-slate-400 mt-3 font-bold text-sm tracking-wide">สร้างบัญชีเพื่อเริ่มใช้งานระบบอัตโนมัติ</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Input
                label="ชื่อผู้ใช้"
                placeholder="ระบุ Username"
                {...register('username', { required: 'กรุณากรอกชื่อผู้ใช้' })}
                error={errors.username?.message}
                autoComplete="username"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl"
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
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <div className="space-y-2">
              <Input
                label="อีเมล (ไม่บังคับ)"
                placeholder="name@example.com"
                type="email"
                {...register('email')}
                autoComplete="email"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl"
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
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 rounded-2xl"
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
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-emerald-500/20 shadow-2xl hover:scale-[1.02] transition-transform bg-gradient-to-r from-emerald-500 to-teal-600 border-none"
              isLoading={isSubmitting || isLoading}
              loadingText="CREATING ACCOUNT..."
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

