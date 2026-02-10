'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Sidebar from './Sidebar';
import { motion } from 'framer-motion';

interface DashboardLayoutProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

export default function DashboardLayout({ children, requiredRole }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isInitialized, checkAuth } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const authCheckRef = useRef(false);

  // Check auth only once on mount
  useEffect(() => {
    if (!authCheckRef.current) {
      authCheckRef.current = true;
      checkAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  // Handle authorization after auth check completes
  useEffect(() => {
    // Wait until initialized and not loading
    if (!isInitialized || isLoading) {
      return;
    }

    // No user after auth check - redirect to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // User needs to change password
    if (user.forcePasswordChange) {
      router.replace('/change-password');
      return;
    }

    const isAdmin = user.role === 'admin';
    const isAdminRoute = pathname.startsWith('/admin');
    const isUserRoute = pathname.startsWith('/user');

    // STRICT ROUTE PROTECTION:
    // - Regular users can ONLY access /user/* routes
    // - Admin users can ONLY access /admin/* routes
    if (!isAdmin && isAdminRoute) {
      // Regular user trying to access admin route → redirect to user dashboard
      router.replace('/user/dashboard');
      setIsAuthorized(false);
      return;
    }

    if (isAdmin && isUserRoute) {
      // Admin trying to access user route → redirect to admin dashboard
      router.replace('/admin/dashboard');
      setIsAuthorized(false);
      return;
    }

    // Additional check: if requiredRole is specified and doesn't match
    if (requiredRole && user.role !== requiredRole) {
      const redirectPath = isAdmin ? '/admin/dashboard' : '/user/dashboard';
      router.replace(redirectPath);
      setIsAuthorized(false);
      return;
    }

    setIsAuthorized(true);
  }, [user, isLoading, isInitialized, pathname, requiredRole, router]);

  // Show loading spinner while:
  // 1. Not initialized yet (first load)
  // 2. Currently loading (checking auth)
  // 3. User exists but not yet authorized (checking role)
  if (!isInitialized || isLoading || (user && !isAuthorized)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-b-teal-500 animate-spin-slow"></div>
        </div>
      </div>
    );
  }

  // No user after initialization - will redirect to login
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-b-teal-500 animate-spin-slow"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans selection:bg-emerald-500/30 bg-[#0A0F0D]">
      {/* Background gradient effects */}
      <div className="fixed inset-0 bg-[#0A0F0D] -z-20" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-emerald-500/5 to-transparent rounded-full blur-[150px] -z-10 pointer-events-none" />

      {/* Mobile Glass Header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 sm:h-16 glass-navbar z-30 flex items-center px-3 sm:px-4 justify-between">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 min-h-[44px] min-w-[44px] bg-white/5 rounded-xl border border-white/10 shadow-lg text-white flex items-center justify-center hover:bg-white/10 transition-all active:bg-white/15"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </motion.button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-white text-[10px] sm:text-xs font-black">L</span>
          </div>
          <span className="text-[10px] sm:text-xs font-black tracking-widest text-emerald-400 uppercase">Line OA</span>
        </div>
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main content - independently scrollable */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10 w-full bg-[#0A0F0D]">
        {/* Mobile Header Spacer */}
        <div className="md:hidden h-14 sm:h-16" />

        <div className="container-responsive w-full animate-fade px-2 sm:px-4 md:px-6 pb-6 sm:pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
