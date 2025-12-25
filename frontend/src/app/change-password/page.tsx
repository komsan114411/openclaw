'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, checkAuth } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangePasswordForm>();

  const newPassword = watch('newPassword');

  const onSubmit = async (data: ChangePasswordForm) => {
    setIsSubmitting(true);
    try {
      const response = await authApi.changePassword(data.currentPassword, data.newPassword);
      if (response.data.success) {
        toast.success('เปลี่ยนรหัสผ่านสำเร็จ');
        await checkAuth();
        if (user?.role === 'admin') {
          router.push('/admin/dashboard');
        } else {
          router.push('/user/dashboard');
        }
      } else {
        toast.error(response.data.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="relative w-full max-w-md">
        <Card className="border-none shadow-premium-lg bg-white/80 backdrop-blur-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">เปลี่ยนรหัสผ่าน</h1>
            <p className="text-slate-500 mt-2 font-medium">เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="รหัสผ่านปัจจุบัน"
              placeholder="กรอกรหัสผ่านปัจจุบัน"
              type="password"
              {...register('currentPassword', { required: 'กรุณากรอกรหัสผ่านปัจจุบัน' })}
              error={errors.currentPassword?.message}
              autoComplete="current-password"
            />

            <Input
              label="รหัสผ่านใหม่"
              placeholder="กรอกรหัสผ่านใหม่"
              type="password"
              {...register('newPassword', {
                required: 'กรุณากรอกรหัสผ่านใหม่',
                minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
              })}
              error={errors.newPassword?.message}
              autoComplete="new-password"
            />

            <Input
              label="ยืนยันรหัสผ่านใหม่"
              placeholder="ยืนยันรหัสผ่านใหม่"
              type="password"
              {...register('confirmPassword', {
                required: 'กรุณายืนยันรหัสผ่าน',
                validate: (value) => value === newPassword || 'รหัสผ่านไม่ตรงกัน',
              })}
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isSubmitting}
              loadingText="กำลังบันทึก..."
            >
              เปลี่ยนรหัสผ่าน
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
