'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const { user, isLoading, isInitialized, checkAuth } = useAuthStore();
  const authCheckRef = useRef(false);

  useEffect(() => {
    // Only check auth once
    if (!authCheckRef.current) {
      authCheckRef.current = true;
      checkAuth();
    }
  }, [checkAuth]);

  useEffect(() => {
    // Wait until initialized and not loading
    if (!isInitialized || isLoading) {
      return;
    }

    // Redirect based on user state
    if (!user) {
      router.replace('/login');
    } else if (user.forcePasswordChange) {
      router.replace('/change-password');
    } else if (user.role === 'admin') {
      router.replace('/admin/dashboard');
    } else {
      router.replace('/user/dashboard');
    }
  }, [user, isLoading, isInitialized, router]);

  // Always show loading until redirect happens
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
        <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-b-teal-500 animate-spin-slow"></div>
      </div>
    </div>
  );
}
