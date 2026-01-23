'use client';

import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'white' | 'gray' | 'currentColor';
  className?: string;
}

export function Spinner({ size = 'md', color = 'primary', className = '' }: SpinnerProps) {
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const colorClasses = {
    primary: 'text-emerald-500',
    white: 'text-white',
    gray: 'text-slate-400',
    currentColor: 'text-current',
  };

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        className={cn('animate-spin', sizeClasses[size], colorClasses[color])}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-100"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
  variant?: 'glass' | 'white' | 'dark';
}

export function LoadingOverlay({
  message = 'กำลังโหลด...',
  variant = 'glass'
}: LoadingOverlayProps) {
  const variantClasses = {
    glass: 'bg-white/40 backdrop-blur-md',
    white: 'bg-white/80',
    dark: 'bg-slate-900/60 backdrop-blur-md',
  };

  return (
    <div className={cn('fixed inset-0 z-[100] flex items-center justify-center animate-fade', variantClasses[variant])}>
      <div className="flex flex-col items-center gap-6 p-10 rounded-3xl bg-white shadow-2xl border border-white/20 animate-scale-in">
        <div className="relative">
          <Spinner size="xl" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-slate-900 font-bold text-xl tracking-tight">{message}</p>
          <p className="text-slate-400 text-sm font-medium animate-pulse uppercase tracking-widest">กรุณารอสักครู่</p>
        </div>
      </div>
    </div>
  );
}

interface LoadingCardProps {
  rows?: number;
  className?: string;
}

export function LoadingCard({ rows = 3, className = '' }: LoadingCardProps) {
  return (
    <div className={cn('bg-white rounded-2xl shadow-sm p-6 border border-slate-100 animate-pulse', className)}>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <div className="h-5 bg-slate-100 rounded-lg w-1/3" />
          <div className="h-4 bg-slate-100 rounded-lg w-1/4" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 bg-slate-50 rounded-lg w-full" />
        ))}
      </div>
    </div>
  );
}

interface LoadingTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function LoadingTable({ rows = 5, cols = 4, className = '' }: LoadingTableProps) {
  return (
    <div className={cn('bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100 animate-pulse', className)}>
      <div className="p-6 border-b border-slate-50 bg-slate-50/50">
        <div className="h-6 bg-slate-100 rounded-lg w-48" />
      </div>
      <div className="divide-y divide-slate-50">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="p-5 flex gap-6 items-center">
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div
                key={colIndex}
                className={cn(
                  'h-4 bg-slate-100 rounded-lg',
                  colIndex === 0 ? 'w-1/4' : 'flex-1'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PageLoadingProps {
  message?: string;
  transparent?: boolean;
}

export function PageLoading({ message = 'กำลังโหลดข้อมูล...', transparent = false }: PageLoadingProps) {
  return (
    <div className={cn(
      "min-h-[60vh] flex flex-col items-center justify-center animate-fade",
      transparent ? "bg-transparent" : "min-h-screen bg-slate-50/50 backdrop-blur-xl"
    )}>
      <div className="relative mb-8">
        <Spinner size="xl" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin-slow" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{message}</h2>
        <p className="text-slate-400 font-medium uppercase tracking-[0.2em] text-xs">กำลังเตรียมระบบ</p>
      </div>
    </div>
  );
}

export default Spinner;
