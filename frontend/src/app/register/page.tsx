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
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="relative w-full max-w-md">
        <Card className="border-none shadow-premium-lg bg-white/80 backdrop-blur-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 11c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm8 10H4a6 6 0 0112 0v0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">สมัครสมาชิก</h1>
            <p className="text-slate-500 mt-2 font-medium">สร้างบัญชีเพื่อเริ่มใช้งานระบบ</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="ชื่อผู้ใช้"
              placeholder="เช่น myshop"
              {...register('username', { required: 'กรุณากรอกชื่อผู้ใช้' })}
              error={errors.username?.message}
              autoComplete="username"
              required
            />

            <Input
              label="รหัสผ่าน"
              placeholder="อย่างน้อย 6 ตัวอักษร"
              type="password"
              {...register('password', {
                required: 'กรุณากรอกรหัสผ่าน',
                minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
              })}
              error={errors.password?.message}
              autoComplete="new-password"
              required
            />

            <Input
              label="อีเมล (ไม่บังคับ)"
              placeholder="you@example.com"
              type="email"
              {...register('email')}
              autoComplete="email"
            />

            <Input
              label="ชื่อ-นามสกุล (ไม่บังคับ)"
              placeholder="ชื่อจริง"
              type="text"
              {...register('fullName')}
              autoComplete="name"
            />

            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-sm font-bold">
                {error}
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isSubmitting || isLoading}
              loadingText="กำลังสมัครสมาชิก..."
            >
              สมัครสมาชิก
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center text-sm text-slate-500">
            มีบัญชีแล้ว?{' '}
            <Link href="/login" className="text-emerald-700 font-bold hover:underline">
              เข้าสู่ระบบ
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

