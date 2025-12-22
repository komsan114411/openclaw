'use client';

import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'default' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'md', dot = false, className = '' }: BadgeProps) {
  const variantClasses = {
    success: 'bg-green-100 text-green-800 border-green-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    default: 'bg-gray-100 text-gray-800 border-gray-200',
    primary: 'bg-green-500 text-white border-green-500',
    secondary: 'bg-gray-200 text-gray-600 border-gray-300',
  };

  const dotColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
    default: 'bg-gray-500',
    primary: 'bg-white',
    secondary: 'bg-gray-400',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

// Status Badge with predefined statuses
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'approved' | 'rejected' | 'expired' | 'success' | 'error';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    active: { label: 'ใช้งาน', variant: 'success' as const },
    inactive: { label: 'ปิดใช้งาน', variant: 'default' as const },
    pending: { label: 'รอดำเนินการ', variant: 'warning' as const },
    approved: { label: 'อนุมัติแล้ว', variant: 'success' as const },
    rejected: { label: 'ปฏิเสธ', variant: 'error' as const },
    expired: { label: 'หมดอายุ', variant: 'error' as const },
    success: { label: 'สำเร็จ', variant: 'success' as const },
    error: { label: 'ผิดพลาด', variant: 'error' as const },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}

export default Badge;
