'use client';

import { ButtonHTMLAttributes, ReactNode, useState, useCallback } from 'react';
import { Spinner } from './Loading';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  preventDoubleClick?: boolean;
  debounceMs?: number;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  leftIcon,
  rightIcon,
  fullWidth = false,
  preventDoubleClick = true,
  debounceMs = 1000,
  disabled,
  onClick,
  className = '',
  ...props
}: ButtonProps) {
  const [isDebouncing, setIsDebouncing] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (preventDoubleClick && isDebouncing && props.type !== 'submit') {
        e.preventDefault();
        return;
      }

      if (preventDoubleClick && !isDebouncing) {
        setIsDebouncing(true);
        setTimeout(() => setIsDebouncing(false), debounceMs);
      }

      onClick?.(e);
    },
    [onClick, preventDoubleClick, isDebouncing, debounceMs, props.type]
  );

  const variantClasses = {
    primary: 'btn-primary hover-glow focus:ring-4 focus:ring-emerald-500/20 outline-none',
    secondary: 'btn-secondary focus:ring-4 focus:ring-slate-200 outline-none',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 hover-glow focus:ring-4 focus:ring-emerald-500/20 outline-none',
    danger: 'btn-danger shadow-lg shadow-rose-500/20 focus:ring-4 focus:ring-rose-500/20 outline-none',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20 focus:ring-4 focus:ring-amber-500/20 outline-none',
    ghost: 'btn-ghost focus:ring-4 focus:ring-slate-200/50 outline-none',
    outline: 'bg-transparent border-2 border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600 bg-white/50 backdrop-blur-sm focus:ring-4 focus:ring-emerald-500/10 outline-none',
  };

  const sizeClasses = {
    xs: 'px-3 py-2 text-xs gap-1 rounded-lg min-h-[44px]',
    sm: 'px-4 py-2 text-sm gap-1.5 rounded-xl min-h-[44px]',
    md: 'px-5 py-2.5 text-sm font-semibold gap-2 rounded-xl min-h-[44px]',
    lg: 'px-8 py-4 text-base font-bold gap-3 rounded-2xl min-h-[48px]',
  };

  const isDisabled = disabled || isLoading || (isDebouncing && props.type !== 'submit');

  return (
    <button
      className={cn(
        'btn',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={isDisabled}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2.5">
          <Spinner size="sm" color="currentColor" />
          <span className="opacity-90">{loadingText || children}</span>
        </div>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0 opacity-90 group-hover:scale-110 transition-transform duration-300">{leftIcon}</span>}
          <span className="relative z-10">{children}</span>
          {rightIcon && <span className="flex-shrink-0 opacity-90 group-hover:translate-x-0.5 transition-transform duration-300">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

// Icon Button
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  preventDoubleClick?: boolean;
}

export function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  preventDoubleClick = true,
  disabled,
  onClick,
  className = '',
  ...props
}: IconButtonProps) {
  const [isDebouncing, setIsDebouncing] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (preventDoubleClick && isDebouncing) {
        e.preventDefault();
        return;
      }

      if (preventDoubleClick) {
        setIsDebouncing(true);
        setTimeout(() => setIsDebouncing(false), 500);
      }

      onClick?.(e);
    },
    [onClick, preventDoubleClick, isDebouncing]
  );

  const variantClasses = {
    primary: 'btn-primary shadow-lg shadow-emerald-500/20 hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-emerald-500/20 outline-none',
    secondary: 'btn-secondary hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-slate-200 outline-none',
    danger: 'btn-danger shadow-lg shadow-rose-500/20 hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-rose-500/20 outline-none',
    ghost: 'btn-ghost hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-slate-200/50 outline-none',
    glass: 'glass-dark hover:bg-white/10 border-white/5 text-white hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-white/10 outline-none',
    outline: 'bg-white/50 border-2 border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600 backdrop-blur-md shadow-sm hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-emerald-500/10 outline-none',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 hover:scale-110 active:scale-95 transition-all duration-300 focus:ring-4 focus:ring-emerald-500/20 outline-none',
  };

  const sizeClasses = {
    sm: 'p-2.5 rounded-lg min-h-[44px] min-w-[44px]',
    md: 'p-2.5 rounded-xl min-h-[44px] min-w-[44px]',
    lg: 'p-4 rounded-2xl min-h-[48px] min-w-[48px]',
  };

  return (
    <button
      className={cn(
        'btn p-0 aspect-square',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || isLoading || isDebouncing}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? <Spinner size="sm" color="currentColor" /> : children}
    </button>
  );
}

export default Button;
