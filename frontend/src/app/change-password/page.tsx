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
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.1),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(249,115,22,0.1),transparent_55%)]" />
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-orange-500/5 blur-[120px] -z-10 pointer-events-none animate-pulse duration-[10s]" />

      <div className="relative w-full max-w-md">
        <Card className="border-none shadow-2xl shadow-orange-900/20 bg-white/10 backdrop-blur-2xl rounded-[3rem] p-8 md:p-10 border-white/10">
          <div className="text-center mb-10">
            <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-500/30 group hover:scale-110 transition-transform duration-500">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">เปลี่ยนรหัสผ่าน</h1>
            <p className="text-slate-400 mt-3 font-bold text-sm tracking-wide">เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Input
                label="รหัสผ่านปัจจุบัน"
                placeholder="กรอกรหัสผ่านเดิม"
                type="password"
                {...register('currentPassword', { required: 'กรุณากรอกรหัสผ่านปัจจุบัน' })}
                error={errors.currentPassword?.message}
                autoComplete="current-password"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-500 focus:ring-amber-500/20 h-12 rounded-2xl"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <div className="space-y-2">
              <Input
                label="รหัสผ่านใหม่"
                placeholder="ตั้งรหัสผ่านใหม่"
                type="password"
                {...register('newPassword', {
                  required: 'กรุณากรอกรหัสผ่านใหม่',
                  minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
                })}
                error={errors.newPassword?.message}
                autoComplete="new-password"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-500 focus:ring-amber-500/20 h-12 rounded-2xl"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <div className="space-y-2">
              <Input
                label="ยืนยันรหัสผ่านใหม่"
                placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                type="password"
                {...register('confirmPassword', {
                  required: 'กรุณายืนยันรหัสผ่าน',
                  validate: (value) => value === newPassword || 'รหัสผ่านไม่ตรงกัน',
                })}
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-500 focus:ring-amber-500/20 h-12 rounded-2xl"
                labelClassName="text-slate-300 font-bold uppercase tracking-wider text-[10px]"
              />
            </div>

            <Button
              type="submit"
              fullWidth
              size="lg"
              className="h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-orange-500/20 shadow-2xl hover:scale-[1.02] transition-transform bg-gradient-to-r from-amber-500 to-orange-600 border-none mt-4"
              isLoading={isSubmitting}
              loadingText="UPDATING CREDENTIALS..."
            >
              เปลี่ยนรหัสผ่าน
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
