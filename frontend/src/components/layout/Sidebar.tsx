'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// =============================================================================
// MENU ITEM TYPE DEFINITION
// =============================================================================
interface MenuItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  group: 'management' | 'system' | 'logs';
}

// =============================================================================
// ADMIN MENU ITEMS - ONLY RENDERED FOR ADMIN USERS
// =============================================================================
const ADMIN_MENU_ITEMS: MenuItem[] = [
  // Management Group
  {
    group: 'management',
    name: 'ศูนย์ควบคุม',
    href: '/admin/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    group: 'management',
    name: 'จัดการผู้ใช้',
    href: '/admin/users',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    group: 'management',
    name: 'บัญชี LINE',
    href: '/admin/line-accounts',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    group: 'management',
    name: 'แชท',
    href: '/admin/chat',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  // System Group
  {
    group: 'system',
    name: 'เทมเพลตสลิป',
    href: '/admin/templates',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    group: 'system',
    name: 'ข้อความตอบกลับ',
    href: '/admin/system-responses',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    group: 'system',
    name: 'ธนาคาร',
    href: '/admin/banks',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    group: 'system',
    name: 'แพ็คเกจ',
    href: '/admin/packages',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    group: 'system',
    name: 'ตั้งค่าระบบ',
    href: '/admin/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  // Logs Group
  {
    group: 'logs',
    name: 'การชำระเงิน',
    href: '/admin/payments',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    group: 'logs',
    name: 'ประวัติระบบ',
    href: '/admin/history',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

// =============================================================================
// USER MENU ITEMS - ONLY RENDERED FOR REGULAR USERS
// =============================================================================
const USER_MENU_ITEMS: MenuItem[] = [
  // Management Group
  {
    group: 'management',
    name: 'แดชบอร์ด',
    href: '/user/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    group: 'management',
    name: 'บัญชี LINE ของฉัน',
    href: '/user/line-accounts',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    group: 'management',
    name: 'แชท',
    href: '/user/chat',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  // System Group
  {
    group: 'system',
    name: 'ซื้อแพ็คเกจ',
    href: '/user/packages',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    group: 'system',
    name: 'เทมเพลตของฉัน',
    href: '/user/templates',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  // Logs Group
  {
    group: 'logs',
    name: 'โควต้าของฉัน',
    href: '/user/quota',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    group: 'logs',
    name: 'ประวัติการชำระเงิน',
    href: '/user/payments',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    group: 'logs',
    name: 'ประวัติการใช้งาน',
    href: '/user/history',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

// =============================================================================
// MOBILE BOTTOM NAVIGATION ITEMS
// =============================================================================
const ADMIN_MOBILE_NAV = [
  { href: '/admin/dashboard', icon: '🏠', label: 'หน้าแรก' },
  { href: '/admin/chat', icon: '💬', label: 'แชท' },
  { href: '/admin/users', icon: '👥', label: 'ผู้ใช้' },
  { href: '/admin/payments', icon: '📄', label: 'สลิป' },
  { href: '/admin/settings', icon: '⚙️', label: 'ตั้งค่า' },
];

const USER_MOBILE_NAV = [
  { href: '/user/dashboard', icon: '🏠', label: 'หน้าแรก' },
  { href: '/user/chat', icon: '💬', label: 'แชท' },
  { href: '/user/line-accounts', icon: '💼', label: 'บัญชี' },
  { href: '/user/payments', icon: '📄', label: 'ชำระเงิน' },
  { href: '/user/packages', icon: '📦', label: 'แพ็คเกจ' },
];

// =============================================================================
// SIDEBAR COMPONENT
// =============================================================================
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  // STRICT ROLE CHECK: Determine which menu to render based on user role
  const isAdmin = user?.role === 'admin';
  const menuItems = isAdmin ? ADMIN_MENU_ITEMS : USER_MENU_ITEMS;
  const mobileNavItems = isAdmin ? ADMIN_MOBILE_NAV : USER_MOBILE_NAV;

  // Group rendering function
  const renderGroup = (group: 'management' | 'system' | 'logs', title: string) => {
    const items = menuItems.filter(item => item.group === group);
    if (items.length === 0) return null;

    return (
      <div className="space-y-1.5 mb-8">
        <h3 className="px-5 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400/40 mb-3">
          {title}
        </h3>
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => window.innerWidth < 768 && onClose()}
              className={clsx(
                'group flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl transition-all duration-300 relative overflow-hidden',
                isActive
                  ? 'sidebar-link-active text-white bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border border-white/5 shadow-lg shadow-emerald-900/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 hover:translate-x-1'
              )}
            >
              <span className={clsx(
                'transition-all duration-300 transform',
                isActive ? 'text-emerald-400 scale-110 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'group-hover:text-emerald-400 group-hover:scale-110'
              )}>
                {item.icon}
              </span>
              <span className={clsx(
                "font-medium text-sm tracking-wide transition-all duration-300",
                isActive ? "text-white font-bold" : "group-hover:text-white"
              )}>{item.name}</span>
              {item.badge && (
                <span className="absolute right-3 px-2 py-0.5 text-[9px] font-bold bg-emerald-500 text-white rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)] tracking-widest uppercase">
                  {item.badge}
                </span>
              )}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-500 rounded-r-full shadow-[0_0_15px_rgba(16,185,129,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0A0F0D] text-white w-[85vw] xs:w-72 max-w-[288px] relative overflow-hidden shadow-2xl border-r border-emerald-500/10">
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-10%] left-[-20%] w-[140%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[100%] h-[30%] bg-teal-500/5 blur-[100px] rounded-full pointer-events-none" />

      {/* Logo */}
      <div className="p-8 pb-4 relative">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">LINE OA</h1>
            <p className="text-[10px] text-emerald-400/60 font-medium tracking-widest uppercase">
              Management System
            </p>
          </div>
        </div>
      </div>

      {/* Role Indicator Badge - Prominent visual feedback */}
      <div className="px-6 pb-6 relative">
        <div className={clsx(
          "w-full py-3 px-4 rounded-xl border backdrop-blur-sm flex items-center justify-center gap-2 transition-all duration-300",
          isAdmin
            ? "bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/10"
            : "bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10"
        )}>
          {/* Icon */}
          {isAdmin ? (
            <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.8 1.1 2.8 2.5V11c.6.3 1 .9 1 1.5v3c0 1-.8 1.5-1.5 1.5h-4.6c-.7 0-1.5-.5-1.5-1.5v-3c0-.6.4-1.2 1-1.5V9.5c0-1.4 1.4-2.5 2.8-2.5zm0 1.2c-.8 0-1.5.7-1.5 1.3v1.5h3V9.5c0-.6-.7-1.3-1.5-1.3z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          )}
          {/* Badge Text */}
          <span className={clsx(
            "text-xs font-black tracking-[0.15em] uppercase",
            isAdmin ? "text-amber-400" : "text-emerald-400"
          )}>
            {isAdmin ? 'ADMIN CONSOLE' : 'MEMBER ZONE'}
          </span>
          {/* Animated dot indicator */}
          <div className={clsx(
            "w-2 h-2 rounded-full animate-pulse",
            isAdmin
              ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
              : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
          )} />
        </div>
      </div>

      {/* Navigation - Renders ONLY the appropriate menu based on role */}
      <nav className="flex-1 px-4 overflow-y-auto no-scrollbar relative">
        {renderGroup('management', 'การจัดการ')}
        {renderGroup('system', 'ระบบ')}
        {renderGroup('logs', 'ข้อมูล & บันทึก')}
      </nav>

      {/* User Info Section */}
      <div className="p-6 relative z-10 border-t border-white/5 bg-white/[0.01]">
        <div className="p-4 rounded-[1.5rem] bg-white/[0.03] border border-white/[0.05] backdrop-blur-md shadow-xl group hover:border-emerald-500/20 transition-all duration-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center border border-white/10 shadow-lg group-hover:shadow-emerald-500/20 transition-all duration-500 group-hover:scale-110">
              <span className="text-white font-bold text-lg drop-shadow-md">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm truncate text-white group-hover:text-emerald-400 transition-colors">{user?.username}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={clsx(
                  "w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_5px]",
                  isAdmin ? "bg-rose-500 shadow-rose-500/50" : "bg-emerald-500 shadow-emerald-500/50"
                )} />
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  {isAdmin ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] text-xs font-bold rounded-xl bg-white/5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 transition-all duration-300 border border-transparent"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar - Fixed, doesn't scroll with content */}
      <div className="hidden md:block h-screen sticky top-0 flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-40 md:hidden"
            />
            {/* Sidebar */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 md:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation - Role-specific items */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0A0F0D]/95 backdrop-blur-xl border-t border-emerald-500/10 px-2 pb-safe">
        <div className="flex items-center justify-around h-14 xs:h-16">
          {mobileNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300',
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? 'text-[#06C755] bg-[#06C755]/10'
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              )}
            >
              <span className="text-xl mb-0.5">{item.icon}</span>
              <span className="text-[9px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
