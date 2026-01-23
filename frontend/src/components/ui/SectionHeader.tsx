'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  /** คำหัวข้อหลัก เช่น "แดชบอร์ด" */
  title: string;
  /** คำเน้นพิเศษต่อท้ายหัวข้อหลัก เช่น "LINE OA"  */
  highlight?: string;
  /** คำอธิบายใต้หัวข้อ */
  subtitle?: string;
  /** ปุ่ม / เมนู ด้านขวา */
  actions?: ReactNode;
  /** แสดงบอลแสงพื้นหลังหรือไม่ */
  showGlow?: boolean;
  className?: string;
}

export default function SectionHeader({
  title,
  highlight,
  subtitle,
  actions,
  showGlow = true,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'relative z-10 flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6 w-full',
        className,
      )}
    >
      {showGlow && (
        <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
      )}
      {/* Title */}
      <div className="space-y-1 sm:space-y-2 text-left flex-1">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
          {title} {highlight && <span className="text-emerald-400">{highlight}</span>}
        </h1>
        {subtitle && (
          <p className="text-slate-400 font-medium text-xs sm:text-sm">{subtitle}</p>
        )}
      </div>

      {/* Actions */}
      {actions && (
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full lg:w-auto">{actions}</div>
      )}
    </div>
  );
}

