'use client';

import { ButtonHTMLAttributes, ReactNode, useState, useCallback } from 'react';
import { Spinner } from './Loading';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility to merge tailwind classes safely
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
    primary: 'btn-primary hover-glow',
    secondary: 'btn-secondary',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 hover-glow',
    danger: 'btn-danger shadow-lg shadow-rose-500/20',
    warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20',
    ghost: 'btn-ghost',
    outline: 'bg-transparent border-2 border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600 bg-white/50 backdrop-blur-sm',
  };

  const sizeClasses = {
    xs: 'px-2 py-1 text-xs gap-1 rounded-lg',
    sm: 'px-3 py-1.5 text-sm gap-1.5 rounded-xl',
    md: 'px-5 py-2.5 text-sm font-semibold gap-2 rounded-xl',
    lg: 'px-8 py-4 text-base font-bold gap-3 rounded-2xl',
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
        <div className="flex items-center justify-center gap-2">
          <Spinner size="sm" color="currentColor" />
          <span>{loadingText || children}</span>
        </div>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0 opacity-80 group-hover:scale-110 transition-transform">{leftIcon}</span>}
          <span className="relative z-10">{children}</span>
          {rightIcon && <span className="flex-shrink-0 opacity-80 group-hover:scale-110 transition-transform">{rightIcon}</span>}
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
    primary: 'btn-primary shadow-lg shadow-emerald-500/20',
    secondary: 'btn-secondary',
    danger: 'btn-danger shadow-lg shadow-rose-500/20',
    ghost: 'btn-ghost',
    glass: 'glass-dark hover:bg-white/10 border-white/5 text-white',
    outline: 'bg-white/50 border-2 border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600 backdrop-blur-md shadow-sm',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20',
  };

  const sizeClasses = {
    sm: 'p-1.5 rounded-lg',
    md: 'p-2.5 rounded-xl',
    lg: 'p-4 rounded-2xl',
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
