'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function Home() {
  const router = useRouter();
  const { isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await checkAuth();
      if (cancelled) return;

      // Use the latest store state to avoid effect loops & stale values.
      const { user: currentUser } = useAuthStore.getState();
      if (!currentUser) {
        router.push('/login');
      } else if (currentUser.role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/user/dashboard');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, checkAuth]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return null;
}
