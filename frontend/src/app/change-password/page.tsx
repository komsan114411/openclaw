'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">เปลี่ยนรหัสผ่าน</h1>
            <p className="text-gray-500 mt-2">กรุณาเปลี่ยนรหัสผ่านเพื่อความปลอดภัย</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="currentPassword" className="label">
                รหัสผ่านปัจจุบัน
              </label>
              <input
                id="currentPassword"
                type="password"
                {...register('currentPassword', { required: 'กรุณากรอกรหัสผ่านปัจจุบัน' })}
                className="input"
                placeholder="กรอกรหัสผ่านปัจจุบัน"
              />
              {errors.currentPassword && (
                <p className="mt-1 text-sm text-red-500">{errors.currentPassword.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="newPassword" className="label">
                รหัสผ่านใหม่
              </label>
              <input
                id="newPassword"
                type="password"
                {...register('newPassword', {
                  required: 'กรุณากรอกรหัสผ่านใหม่',
                  minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
                })}
                className="input"
                placeholder="กรอกรหัสผ่านใหม่"
              />
              {errors.newPassword && (
                <p className="mt-1 text-sm text-red-500">{errors.newPassword.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                ยืนยันรหัสผ่านใหม่
              </label>
              <input
                id="confirmPassword"
                type="password"
                {...register('confirmPassword', {
                  required: 'กรุณายืนยันรหัสผ่าน',
                  validate: (value) => value === newPassword || 'รหัสผ่านไม่ตรงกัน',
                })}
                className="input"
                placeholder="ยืนยันรหัสผ่านใหม่"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full py-3">
              {isSubmitting ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
