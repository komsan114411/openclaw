'use client';

import { ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'default' | 'primary' | 'secondary' | 'indigo' | 'violet' | 'emerald' | 'slate' | 'rose' | 'purple' | 'amber' | 'blue' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  className = ''
}: BadgeProps) {
  const variantClasses = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100/50',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100/50',
    error: 'bg-rose-50 text-rose-700 border-rose-100/50',
    rose: 'bg-rose-50 text-rose-700 border-rose-100/50',
    warning: 'bg-amber-50 text-amber-700 border-amber-100/50',
    amber: 'bg-amber-50 text-amber-700 border-amber-100/50',
    info: 'bg-blue-50 text-blue-700 border-blue-100/50',
    blue: 'bg-blue-50 text-blue-700 border-blue-100/50',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100/50',
    violet: 'bg-violet-50 text-violet-700 border-violet-100/50',
    purple: 'bg-purple-50 text-purple-700 border-purple-100/50',
    default: 'bg-slate-50 text-slate-700 border-slate-200/50',
    slate: 'bg-slate-50 text-slate-700 border-slate-200/50',
    primary: 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-500/20',
    secondary: 'bg-slate-700 text-white border-slate-700 shadow-sm shadow-slate-700/20',
    outline: 'bg-transparent border-slate-200 text-slate-500',
  };

  const dotColors = {
    success: 'bg-emerald-500',
    emerald: 'bg-emerald-500',
    error: 'bg-rose-500',
    rose: 'bg-rose-500',
    warning: 'bg-amber-500',
    amber: 'bg-amber-500',
    info: 'bg-blue-500',
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
    purple: 'bg-purple-500',
    default: 'bg-slate-400',
    slate: 'bg-slate-400',
    primary: 'bg-white',
    secondary: 'bg-emerald-400',
    outline: 'bg-slate-300',
  };

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
    sm: 'px-2 py-0.5 text-xs font-bold leading-none',
    md: 'px-2.5 py-1 text-sm font-bold leading-none',
    lg: 'px-3.5 py-1.5 text-base font-bold leading-none',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border transition-all duration-300',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', dotColors[variant])}></span>
          )}
          <span className={cn('relative inline-flex rounded-full h-2 w-2', dotColors[variant])}></span>
        </span>
      )}
      {children}
    </span>
  );
}

// Status Badge with predefined statuses
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'approved' | 'rejected' | 'expired' | 'success' | 'error' | 'syncing' | 'verified' | 'failed' | 'cancelled';
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const statusConfig = {
    active: { label: 'Active', variant: 'success' as const, dot: true, pulse: true },
    inactive: { label: 'Inactive', variant: 'default' as const, dot: true, pulse: false },
    pending: { label: 'Pending', variant: 'warning' as const, dot: true, pulse: true },
    verified: { label: 'Verified', variant: 'success' as const, dot: true, pulse: false },
    approved: { label: 'Approved', variant: 'success' as const, dot: true, pulse: false },
    rejected: { label: 'Rejected', variant: 'error' as const, dot: true, pulse: false },
    expired: { label: 'Expired', variant: 'error' as const, dot: true, pulse: false },
    failed: { label: 'Failed', variant: 'error' as const, dot: true, pulse: false },
    cancelled: { label: 'Cancelled', variant: 'default' as const, dot: true, pulse: false },
    success: { label: 'Success', variant: 'success' as const, dot: true, pulse: false },
    error: { label: 'Error', variant: 'error' as const, dot: true, pulse: false },
    syncing: { label: 'Syncing', variant: 'info' as const, dot: true, pulse: true },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} dot={config.dot} pulse={config.pulse} className={cn('min-w-[80px] justify-center', className)}>
      {config.label}
    </Badge>
  );
}

export default Badge;
