'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter, usePathname } from 'next/navigation';

export function AuthStateListener() {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isInitialized, checkAuth } = useAuthStore();

    useEffect(() => {
        // This effect runs on mount to check if we have a session but no user in store
        // This happens when opening a new tab while already logged in
        const initAuth = async () => {
            if (!isInitialized) {
                await checkAuth();
            }
        };

        initAuth();
    }, [isInitialized, checkAuth]);

    useEffect(() => {
        // If we have a user and we're on a public auth page (login/register), redirect to dashboard
        if (user && (pathname === '/login' || pathname === '/register')) {
            const target = user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard';
            router.replace(target);
        }
    }, [user, pathname, router]);

    return null;
}
