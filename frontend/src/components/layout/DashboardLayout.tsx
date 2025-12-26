'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Sidebar from './Sidebar';
import { motion } from 'framer-motion';

interface DashboardLayoutProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'user';
}

export default function DashboardLayout({ children, requiredRole }: DashboardLayoutProps) {
  const router = useRouter();
  const { user, isLoading, checkAuth } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login');
      } else if (user.forcePasswordChange) {
        router.push('/change-password');
      } else if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
        router.push('/');
      }
    }
  }, [user, isLoading, requiredRole, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-b-teal-500 animate-spin-slow"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50/50 relative overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* Decorative background elements */}
      <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-full blur-[120px] -z-10 pointer-events-none animate-pulse duration-[10s]" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-500/5 to-indigo-500/5 rounded-full blur-[100px] -z-10 pointer-events-none animate-pulse duration-[8s]" />

      {/* Mobile Hamburger Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 p-3 bg-white/80 backdrop-blur-xl border border-white/40 rounded-xl shadow-lg shadow-slate-200/50 text-slate-700 hover:text-emerald-600 hover:border-emerald-200 transition-all duration-300"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </motion.button>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-auto relative z-10 no-scrollbar w-full">
        {/* Mobile Header Spacer */}
        <div className="md:hidden h-20" />

        <div className="p-4 md:p-8 lg:p-10 max-w-[1920px] mx-auto animate-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
