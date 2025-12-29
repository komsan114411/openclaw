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
    <div className="flex min-h-screen relative overflow-hidden font-sans selection:bg-emerald-500/30 bg-[#0A0F0D]">
      {/* Background gradient effects */}
      <div className="fixed inset-0 bg-[#0A0F0D] -z-20" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-emerald-500/5 to-transparent rounded-full blur-[150px] -z-10 pointer-events-none" />

      {/* Mobile Glass Header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 glass-navbar z-30 flex items-center px-4 justify-between">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 min-h-[44px] min-w-[44px] bg-white/5 rounded-xl border border-white/10 shadow-lg text-white flex items-center justify-center hover:bg-white/10 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </motion.button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-white text-xs font-black">L</span>
          </div>
          <span className="text-xs font-black tracking-widest text-emerald-400 uppercase">Line OA</span>
        </div>
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-auto relative z-10 no-scrollbar w-full flex flex-col items-center bg-[#0A0F0D]">
        {/* Mobile Header Spacer */}
        <div className="md:hidden h-16" />

        <div className="container-responsive w-full animate-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
