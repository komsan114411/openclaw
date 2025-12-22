'use client';

import { ButtonHTMLAttributes, ReactNode, useState, useCallback } from 'react';
import { Spinner } from './Loading';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  // ป้องกันการกดซ้ำ
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
      if (preventDoubleClick && isDebouncing) {
        e.preventDefault();
        return;
      }

      if (preventDoubleClick) {
        setIsDebouncing(true);
        setTimeout(() => setIsDebouncing(false), debounceMs);
      }

      onClick?.(e);
    },
    [onClick, preventDoubleClick, isDebouncing, debounceMs]
  );

  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 focus:ring-green-500 shadow-lg shadow-green-500/30 hover:shadow-green-500/40',
    secondary:
      'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500 border border-gray-200',
    danger:
      'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 focus:ring-red-500 shadow-lg shadow-red-500/30',
    success:
      'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 focus:ring-emerald-500 shadow-lg shadow-emerald-500/30',
    warning:
      'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white hover:from-yellow-600 hover:to-yellow-700 focus:ring-yellow-500 shadow-lg shadow-yellow-500/30',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2.5',
  };

  const isDisabled = disabled || isLoading || isDebouncing;

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={isDisabled}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner size="sm" color={variant === 'secondary' || variant === 'ghost' ? 'gray' : 'white'} />
          {loadingText || children}
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}

// Icon Button
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
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

  const baseClasses =
    'inline-flex items-center justify-center rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
    ghost: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:ring-gray-500',
  };

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading || isDebouncing}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? <Spinner size="sm" color={variant === 'ghost' ? 'gray' : 'white'} /> : children}
    </button>
  );
}

export default Button;
