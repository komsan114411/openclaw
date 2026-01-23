'use client';

import { cn } from '@/lib/utils';

interface MetricBarProps {
  percentage: number; // 0-100
  height?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export default function MetricBar({ percentage, height = 'md', showLabel = false, className }: MetricBarProps) {
  const heightClass = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  }[height];

  const gradientColor =
    percentage > 50 ? 'from-emerald-500 to-emerald-400' : percentage > 20 ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-pink-500';

  return (
    <div className={cn('w-full bg-white/10 rounded-full overflow-hidden', className)}>
      <div
        className={cn('bg-gradient-to-r', gradientColor, heightClass, 'relative transition-all duration-1000 ease-out')}
        style={{ width: `${Math.max(percentage, 2)}%` }}
      >
        {showLabel && (
          <span className="absolute right-0 -top-4 text-[9px] font-semibold text-slate-400">{percentage}%</span>
        )}
      </div>
    </div>
  );
}

