'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
  variant?: 'default' | 'glass';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className = '', containerClassName = '', ...props }, ref) => {
    return (
      <div className={cn('w-full group', containerClassName)}>
        {label && (
          <label className="label mb-1.5 flex items-center justify-between">
            <span>
              {label}
              {props.required && <span className="text-rose-500 ml-1 opacity-70">*</span>}
            </span>
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'input shadow-sm backdrop-blur-sm transition-all duration-300',
              leftIcon && 'pl-11',
              rightIcon && 'pr-11',
              error 
                ? 'border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 bg-rose-50/10 text-rose-900 placeholder:text-rose-300' 
                : 'hover:border-emerald-400/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10',
              props.variant === 'glass' && 'bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-white/20 focus:ring-white/5 hover:bg-white/10',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-xs font-bold text-rose-500 animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-rose-500/20" /> {error}
        </p>}
        {hint && !error && <p className="mt-2 text-xs text-slate-400 font-medium px-1 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-slate-400" /> {hint}
        </p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
  variant?: 'default' | 'glass';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', containerClassName = '', ...props }, ref) => {
    return (
      <div className={cn('w-full group', containerClassName)}>
        {label && (
          <label className="label">
            {label}
            {props.required && <span className="text-rose-500 ml-1 opacity-70">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'input min-h-[120px] py-3 resize-none shadow-sm backdrop-blur-sm transition-all duration-300',
            error 
              ? 'border-rose-500 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 bg-rose-50/10 text-rose-900 placeholder:text-rose-300'
              : 'hover:border-emerald-400/50 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10',
            props.variant === 'glass' && 'bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/20 focus:ring-white/5 hover:bg-white/10',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs font-bold text-rose-500 animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 uppercase tracking-wide">
          <span className="w-1 h-1 rounded-full bg-rose-500" /> {error}
        </p>}
        {hint && !error && <p className="mt-1.5 text-xs text-slate-400 font-medium px-1 italic">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  children?: React.ReactNode;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, children, className = '', containerClassName = '', ...props }, ref) => {
    return (
      <div className={cn('w-full group', containerClassName)}>
        {label && (
          <label className="label">
            {label}
            {props.required && <span className="text-rose-500 ml-1 opacity-70">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'input appearance-none bg-no-repeat bg-[right_1rem_center] bg-[length:1em_1em]',
              'pr-10', // Room for custom arrow if needed, but styling default arrow for now
              error && 'border-rose-500 focus:ring-rose-500/10 focus:border-rose-500',
              className
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")` }}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children ? children : options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="mt-1.5 text-xs font-bold text-rose-500 animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 uppercase tracking-wide">
          <span className="w-1 h-1 rounded-full bg-rose-500" /> {error}
        </p>}
        {hint && !error && <p className="mt-1.5 text-xs text-slate-400 font-medium px-1 italic">{hint}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps) {
  return (
    <label className={cn(
      'flex items-center justify-between p-3 rounded-2xl border-2 transition-all duration-300 group',
      checked ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50 border-slate-100',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-emerald-200'
    )}>
      {(label || description) && (
        <div className="mr-4">
          {label && <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{label}</span>}
          {description && <p className="text-xs text-slate-500 mt-0.5 font-medium italic">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ring-offset-4',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner',
          checked ? 'bg-emerald-500' : 'bg-slate-300',
          disabled ? 'cursor-not-allowed' : ''
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-xl transition-all duration-300 ease-spring',
            checked ? 'translate-x-6 scale-110' : 'translate-x-1'
          )}
        />
      </button>
    </label>
  );
}

// Alias for backward compatibility
export const TextArea = Textarea;

export default Input;
