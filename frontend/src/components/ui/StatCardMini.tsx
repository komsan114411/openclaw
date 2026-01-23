'use client';

import { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface StatCardMiniProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  /** สีพื้นหลัง icon box */
  color?: 'emerald' | 'amber' | 'blue' | 'violet' | 'rose' | 'indigo';
  /** badge text เช่น +2 ใหม่ */
  badgeText?: string;
  badgeVariant?: 'success' | 'warning' | 'info' | 'secondary';
  className?: string;
}

export default function StatCardMini({
  icon,
  value,
  label,
  color = 'emerald',
  badgeText,
  badgeVariant = 'success',
  className,
}: StatCardMiniProps) {
  const colorMap: Record<typeof color, string> = {
    emerald: 'bg-emerald-500/10',
    amber: 'bg-amber-500/10',
    blue: 'bg-blue-500/10',
    violet: 'bg-violet-500/10',
    rose: 'bg-rose-500/10',
    indigo: 'bg-indigo-500/10',
  } as const;

  return (
    <Card
      variant="glass"
      className={cn(
        'p-4 sm:p-6 rounded-2xl border border-white/5 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/20 transition-all',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div
          className={cn(
            'w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center',
            colorMap[color],
          )}
        >
          <span className="text-xl sm:text-2xl">{icon}</span>
        </div>
        {badgeText && (
          <span
            className={cn(
              'text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg font-semibold',
              badgeVariant === 'success'
                ? 'bg-emerald-500/20 text-emerald-400'
                : badgeVariant === 'warning'
                ? 'bg-amber-500/20 text-amber-400'
                : badgeVariant === 'info'
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-white/10 text-slate-400',
            )}
          >
            {badgeText}
          </span>
        )}
      </div>
      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 mb-1">{label}</p>
      <p className="text-xl sm:text-2xl font-black text-white">{value}</p>
    </Card>
  );
}

