'use client';

import { useEffect, useCallback, ReactNode } from 'react';
import { IconButton, Button } from './Button';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'fullMobile';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  footer,
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    full: 'max-w-[95vw]',
    fullMobile: 'max-w-[95vw] md:max-w-2xl', // Fullscreen on mobile, normal on desktop
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-all duration-500 animate-fade"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />

      {/* Modal Container */}
      <div
        className={cn(
          'relative w-full overflow-hidden bg-white rounded-2xl sm:rounded-[2rem] shadow-2xl transition-all animate-scale-in',
          sizeClasses[size],
          'flex flex-col max-h-[85vh] sm:max-h-[90vh]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-4 sm:py-6 border-b border-slate-50 bg-white sticky top-0 z-10">
            <div className="space-y-1">
              {title && <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{title}</h3>}
              {subtitle && <p className="text-sm font-medium text-slate-500">{subtitle}</p>}
            </div>
            {showCloseButton && (
              <IconButton
                onClick={onClose}
                variant="ghost"
                size="md"
                className="hover:rotate-90 transition-transform duration-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IconButton>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 px-4 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 overflow-y-auto no-scrollbar scroll-smooth">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 sticky bottom-0 z-10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Confirm Modal
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  type = 'info',
  isLoading = false,
}: ConfirmModalProps) {
  const typeConfigs = {
    danger: {
      color: 'rose' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      buttonVariant: 'danger' as const
    },
    warning: {
      color: 'amber' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      buttonVariant: 'warning' as const
    },
    info: {
      color: 'blue' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      buttonVariant: 'primary' as const
    },
    success: {
      color: 'emerald' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      buttonVariant: 'success' as const
    },
  };

  const config = typeConfigs[type];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showCloseButton={false}>
      <div className="flex flex-col items-center text-center">
        <div className={cn(
          'w-20 h-20 rounded-3xl flex items-center justify-center mb-6 animate-bounce-slow',
          type === 'danger' ? 'bg-rose-50 text-rose-500' :
            type === 'warning' ? 'bg-amber-50 text-amber-500' :
              type === 'success' ? 'bg-emerald-50 text-emerald-500' :
                'bg-blue-50 text-blue-500'
        )}>
          {config.icon}
        </div>
        <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h3>
        <p className="mt-3 text-slate-500 font-medium leading-relaxed">{message}</p>

        <div className="mt-10 flex flex-col w-full gap-3">
          <Button
            onClick={onConfirm}
            isLoading={isLoading}
            variant={config.buttonVariant}
            size="lg"
            fullWidth
          >
            {confirmText}
          </Button>
          <Button
            onClick={onClose}
            disabled={isLoading}
            variant="ghost"
            size="lg"
            fullWidth
            className="text-slate-400 font-bold hover:text-slate-600"
          >
            {cancelText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default Modal;
