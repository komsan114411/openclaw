'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 11c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm0 0c0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4  -4 1.79-4 4zm-8 9h16"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">สมัครสมาชิก</h1>
            <p className="text-gray-500 mt-2">สร้างบัญชีเพื่อเริ่มใช้งานระบบ</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="username" className="label">
                ชื่อผู้ใช้ *
              </label>
              <input
                id="username"
                type="text"
                {...register('username', { required: 'กรุณากรอกชื่อผู้ใช้' })}
                className="input"
                placeholder="เช่น myshop"
              />
              {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="label">
                รหัสผ่าน *
              </label>
              <input
                id="password"
                type="password"
                {...register('password', {
                  required: 'กรุณากรอกรหัสผ่าน',
                  minLength: { value: 6, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
                })}
                className="input"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
              {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="email" className="label">
                อีเมล (ไม่บังคับ)
              </label>
              <input id="email" type="email" {...register('email')} className="input" placeholder="you@example.com" />
            </div>

            <div>
              <label htmlFor="fullName" className="label">
                ชื่อ-นามสกุล (ไม่บังคับ)
              </label>
              <input id="fullName" type="text" {...register('fullName')} className="input" placeholder="ชื่อจริง" />
            </div>

            {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

            <button type="submit" disabled={isSubmitting || isLoading} className="btn btn-primary w-full py-3">
              {isSubmitting || isLoading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            มีบัญชีแล้ว?{' '}
            <a href="/login" className="text-primary-700 hover:underline">
              เข้าสู่ระบบ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

