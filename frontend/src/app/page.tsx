'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const { user, isLoading, isInitialized, checkAuth } = useAuthStore();
  const authCheckRef = useRef(false);
  const redirectRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check auth only once on mount
  useEffect(() => {
    if (!mounted) return;
    
    if (!authCheckRef.current && !isInitialized) {
      authCheckRef.current = true;
      checkAuth();
    }
  }, [mounted, isInitialized, checkAuth]);

  // Handle redirect after auth check
  useEffect(() => {
    if (!mounted || !isInitialized || isLoading || redirectRef.current) {
      return;
    }

    // Prevent multiple redirects
    redirectRef.current = true;

    // Small delay to ensure smooth transition
    const redirectTimer = setTimeout(() => {
      if (!user) {
        router.replace('/login');
      } else if (user.forcePasswordChange) {
        router.replace('/change-password');
      } else if (user.role === 'admin') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/user/dashboard');
      }
    }, 100);

    return () => clearTimeout(redirectTimer);
  }, [mounted, user, isLoading, isInitialized, router]);

  // Show loading spinner with smooth animation
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="relative flex flex-col items-center">
        {/* Main spinner */}
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-b-teal-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
        </div>
        
        {/* Loading text with fade animation */}
        <p className="mt-4 text-slate-400 text-sm animate-pulse">
          กำลังโหลด...
        </p>
      </div>
    </div>
  );
}
