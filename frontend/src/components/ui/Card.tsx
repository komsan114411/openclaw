'use client';

import { ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
  variant?: 'white' | 'glass' | 'glass-dark' | 'outline' | 'ghost';
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({
  children,
  className = '',
  padding = 'md',
  hover = false,
  variant = 'white',
  style,
  onClick
}: CardProps) {
  const paddingClasses = {
    none: '',
    xs: 'p-2',
    sm: 'p-3 md:p-4',
    md: 'p-4 md:p-6',
    lg: 'p-5 md:p-6 lg:p-8',
    xl: 'p-6 md:p-8 lg:p-10',
  };

  const variantClasses = {
    white: 'bg-white/[0.03] backdrop-blur-xl border-white/[0.08] shadow-2xl shadow-black/10',
    glass: 'glass-card',
    'glass-dark': 'bg-slate-900/60 backdrop-blur-2xl border-white/5 shadow-2xl',
    outline: 'bg-transparent border border-white/10 shadow-none',
    ghost: 'bg-white/5 border-transparent shadow-none hover:bg-white/10 transition-colors',
  };

  return (
    <div
      className={cn(
        'card',
        paddingClasses[padding],
        variantClasses[variant],
        hover && 'hover:-translate-y-1 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)] hover:border-emerald-500/20 transition-all duration-300',
        onClick && 'cursor-pointer',
        className
      )}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, icon, className = '' }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div className="flex items-center gap-4">
        {icon && (
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform shadow-sm">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500 font-medium mt-1">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="animate-in fade-in slide-in-from-right-4 duration-500">{action}</div>}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number | string;
    label?: string;
    isUp?: boolean;
  };
  color?: 'emerald' | 'blue' | 'amber' | 'rose' | 'indigo' | 'violet';
  variant?: 'simple' | 'gradient' | 'glass';
  isLoading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  color = 'emerald',
  variant = 'simple',
  isLoading = false,
  className = '',
}: StatCardProps) {
  const colorConfigs = {
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-400',
      gradient: 'from-emerald-500 to-teal-600',
      shadow: 'shadow-emerald-500/20',
      iconBg: 'bg-emerald-500/20'
    },
    blue: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-400',
      gradient: 'from-blue-500 to-cyan-600',
      shadow: 'shadow-blue-500/20',
      iconBg: 'bg-blue-500/20'
    },
    amber: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-400',
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-500/20',
      iconBg: 'bg-amber-500/20'
    },
    rose: {
      bg: 'bg-rose-500/20',
      text: 'text-rose-400',
      gradient: 'from-rose-500 to-pink-600',
      shadow: 'shadow-rose-500/20',
      iconBg: 'bg-rose-500/20'
    },
    indigo: {
      bg: 'bg-indigo-500/20',
      text: 'text-indigo-400',
      gradient: 'from-indigo-500 to-blue-600',
      shadow: 'shadow-indigo-500/20',
      iconBg: 'bg-indigo-500/20'
    },
    violet: {
      bg: 'bg-violet-500/20',
      text: 'text-violet-400',
      gradient: 'from-violet-500 to-purple-600',
      shadow: 'shadow-violet-500/20',
      iconBg: 'bg-violet-500/20'
    },
  };

  const config = colorConfigs[color];

  if (isLoading) {
    return (
      <Card className={cn("relative overflow-hidden group animate-pulse", className)} variant={variant === 'glass' ? 'glass' : 'white'}>
        <div className="flex items-center justify-between">
          <div className="space-y-3 flex-1">
            <div className="h-4 bg-slate-200 rounded w-24"></div>
            <div className="h-8 bg-slate-200 rounded w-16"></div>
          </div>
          <div className="w-12 h-12 bg-slate-200 rounded-2xl"></div>
        </div>
      </Card>
    );
  }

  if (variant === 'gradient') {
    return (
      <Card className={cn('border-none text-white overflow-hidden group', config.gradient, 'bg-gradient-to-br', config.shadow, className)}>
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500">
          {icon}
        </div>
        <div className="relative z-10">
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="text-3xl font-bold mt-2 tracking-tight">{value}</p>
          {trend && (
            <div className="flex items-center gap-1.5 mt-4 bg-white/10 w-fit px-2 py-1 rounded-lg backdrop-blur-md">
              <span className="text-xs font-bold">
                {trend.isUp !== undefined ? (trend.isUp ? '↑' : '↓') : ''} {trend.value} {trend.label}
              </span>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("relative overflow-hidden group transition-all", variant === 'glass' ? '' : '', className)} variant={variant === 'glass' ? 'glass' : 'white'} hover={true}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm text-slate-400 font-semibold uppercase tracking-wider">{title}</p>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight leading-none">{value}</p>
          {trend && (
            <div className="flex items-center gap-1.5 mt-3">
              <span
                className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1',
                  trend.isUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                )}
              >
                {trend.isUp !== undefined ? (trend.isUp ? '↑' : '↓') : ''} {trend.value}
              </span>
              {trend.label && <span className="text-[10px] text-slate-500 font-medium uppercase">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('p-4 rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-lg group-hover:shadow-emerald-500/10', config.bg, config.text)}>
            {icon}
          </div>
        )}
      </div>
      <div
        className={cn('absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r transition-all duration-500 group-hover:h-1.5', config.gradient)}
      />
    </Card>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: 'white' | 'glass';
  className?: string;
}

export function EmptyState({ icon, title, description, action, variant = 'white', className = '' }: EmptyStateProps) {
  return (
    <Card className={cn("text-center py-10 md:py-16 px-4 flex flex-col items-center justify-center animate-fade", className)} variant={variant}>
      {icon && (
        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mb-6 group-hover:scale-110 transition-transform">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h3>
      {description && <p className="text-slate-500 mt-2 max-w-sm mx-auto font-medium leading-relaxed">{description}</p>}
      {action && <div className="mt-8">{action}</div>}
    </Card>
  );
}

export default Card;
