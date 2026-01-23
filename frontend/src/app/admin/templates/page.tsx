'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api, banksApi, systemSettingsApi, systemResponseTemplatesApi, adminSlipTemplatesApi } from '@/lib/api';
import { Bank } from '@/types';
import toast from 'react-hot-toast';
import { Card, StatCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

// ==================== INTERFACES ====================

interface SlipTemplate {
  _id: string;
  name: string;
  description?: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  isDefault: boolean;
  isActive: boolean;
  isGlobal: boolean;
  isSystemTemplate: boolean;
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  footerLink?: string;
  footerLinkText?: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  showBankLogo: boolean;
  showCountryCode: boolean;
  showFee: boolean;
  showRefs: boolean;
  showPayload: boolean;
  showSenderBankId: boolean;
  showReceiverBankId: boolean;
  showReceiverProxy: boolean;
  showDelayWarning: boolean;
  delayWarningMinutes: number;
  showSenderAccount: boolean;
  showReceiverAccount: boolean;
  showSenderNameEn: boolean;
  showReceiverNameEn: boolean;
  showLocalAmount: boolean;
  bankId?: string;
  senderBankId?: string;
  receiverBankId?: string;
  previewSenderName?: string;
  previewReceiverName?: string;
  previewSenderBankId?: string;
  previewReceiverBankId?: string;
  previewAmount?: string;
  previewSenderAccount?: string;
  previewReceiverAccount?: string;
  themePreset?: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  amountColor?: string;
  bodyBackgroundColor?: string;
  cardBackgroundColor?: string;
  showFooterBranding?: boolean;
  footerBrandingText?: string;
  footerBrandingName?: string;
  createdAt: string;
}

interface SystemResponseTemplate {
  _id: string;
  type: string;
  name: string;
  description?: string;
  responseFormat: 'text' | 'flex';
  textMessage: string;
  title?: string;
  mainMessage?: string;
  subMessage?: string;
  customFlexTemplate?: Record<string, unknown>;
  useCustomTemplate: boolean;
  styling: {
    primaryColor: string;
    textColor: string;
    backgroundColor: string;
    icon: string;
    showIcon: boolean;
    showContactButton: boolean;
    contactButtonText: string;
    contactButtonUrl?: string;
    showRetryButton: boolean;
    retryButtonText: string;
  };
  isActive: boolean;
  sortOrder: number;
  updatedBy?: string;
  updatedAt?: string;
}

interface SlipFormData {
  name: string;
  description: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  primaryColor: string;
  headerText: string;
  footerText: string;
  footerLink: string;
  footerLinkText: string;
  showAmount: boolean;
  showSender: boolean;
  showReceiver: boolean;
  showDate: boolean;
  showTime: boolean;
  showTransRef: boolean;
  showBankLogo: boolean;
  showCountryCode: boolean;
  showFee: boolean;
  showRefs: boolean;
  showPayload: boolean;
  showSenderBankId: boolean;
  showReceiverBankId: boolean;
  showReceiverProxy: boolean;
  showDelayWarning: boolean;
  delayWarningMinutes: number;
  showSenderAccount: boolean;
  showReceiverAccount: boolean;
  showSenderNameEn: boolean;
  showReceiverNameEn: boolean;
  showLocalAmount: boolean;
  bankId: string;
  senderBankId: string;
  receiverBankId: string;
  previewSenderName: string;
  previewReceiverName: string;
  previewAmount: string;
  previewSenderAccount: string;
  previewReceiverAccount: string;
  themePreset: string;
}

interface SystemFormData {
  textMessage: string;
  title: string;
  mainMessage: string;
  subMessage: string;
  responseFormat: 'text' | 'flex';
  primaryColor: string;
  icon: string;
  showIcon: boolean;
  showContactButton: boolean;
  contactButtonText: string;
  contactButtonUrl: string;
  showRetryButton: boolean;
  retryButtonText: string;
}

interface PreviewConfig {
  senderName: string;
  receiverName: string;
  senderBankCode: string;
  receiverBankCode: string;
  amount: string;
}

// ==================== CONSTANTS ====================

// Slip Template Types
const SLIP_TYPE_OPTIONS = [
  { value: 'success', label: 'ตรวจสอบสำเร็จ', thaiName: 'ตรวจสอบสำเร็จ', color: 'emerald', icon: '✅', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/30' },
  { value: 'duplicate', label: 'สลิปซ้ำ', thaiName: 'สลิปซ้ำ', color: 'amber', icon: '⚠️', bgColor: 'bg-amber-500/10', textColor: 'text-amber-400', borderColor: 'border-amber-500/30' },
  { value: 'error', label: 'เกิดข้อผิดพลาด', thaiName: 'เกิดข้อผิดพลาด', color: 'rose', icon: '❌', bgColor: 'bg-rose-500/10', textColor: 'text-rose-400', borderColor: 'border-rose-500/30' },
  { value: 'not_found', label: 'ไม่พบข้อมูล', thaiName: 'ไม่พบข้อมูล', color: 'slate', icon: '🔍', bgColor: 'bg-slate-500/10', textColor: 'text-slate-400', borderColor: 'border-slate-500/30' },
] as const;

// System Response Types
const SYSTEM_TYPE_OPTIONS = [
  { value: 'quota_exhausted', label: 'โควต้าหมด', icon: '🔴', bgColor: 'bg-rose-500/10', textColor: 'text-rose-400', borderColor: 'border-rose-500/30', description: 'เมื่อโควต้าใช้งานหมด' },
  { value: 'quota_low', label: 'โควต้าเหลือน้อย', icon: '⚠️', bgColor: 'bg-amber-500/10', textColor: 'text-amber-400', borderColor: 'border-amber-500/30', description: 'เตือนเมื่อโควต้าใกล้หมด' },
  { value: 'package_expired', label: 'แพ็กเกจหมดอายุ', icon: '⏰', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400', borderColor: 'border-orange-500/30', description: 'เมื่อแพ็กเกจหมดอายุ' },
  { value: 'system_error', label: 'ระบบขัดข้อง', icon: '⚠️', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400', borderColor: 'border-orange-500/30', description: 'เมื่อเกิดข้อผิดพลาดในระบบ' },
  { value: 'processing', label: 'กำลังดำเนินการ', icon: '⏳', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400', borderColor: 'border-blue-500/30', description: 'ขณะรอประมวลผล' },
  { value: 'bot_disabled', label: 'บอทถูกปิด', icon: '📵', bgColor: 'bg-slate-500/10', textColor: 'text-slate-400', borderColor: 'border-slate-500/30', description: 'เมื่อบอทถูกปิดใช้งาน' },
  { value: 'slip_not_found', label: 'ไม่พบสลิป', icon: '🔍', bgColor: 'bg-slate-500/10', textColor: 'text-slate-400', borderColor: 'border-slate-500/30', description: 'เมื่อไม่พบข้อมูลสลิป' },
  { value: 'slip_disabled', label: 'ระบบตรวจสลิปปิด', icon: '🚫', bgColor: 'bg-slate-500/10', textColor: 'text-slate-400', borderColor: 'border-slate-500/30', description: 'เมื่อระบบตรวจสลิปถูกปิด' },
] as const;

// Icon Options
const ICON_OPTIONS = ['✅', '❌', '⚠️', '🔍', '🔴', '⏰', '⏳', '📵', '🚫', '💰', '📦', '🛑', '💡', '📢'];

const DEFAULT_SLIP_FORM_DATA: SlipFormData = {
  name: '',
  description: '',
  type: 'success',
  primaryColor: '#10b981',
  headerText: '',
  footerText: '',
  footerLink: '',
  footerLinkText: '',
  showAmount: true,
  showSender: true,
  showReceiver: true,
  showDate: true,
  showTime: true,
  showTransRef: true,
  showBankLogo: true,
  showCountryCode: false,
  showFee: false,
  showRefs: false,
  showPayload: false,
  showSenderBankId: false,
  showReceiverBankId: false,
  showReceiverProxy: false,
  showDelayWarning: false,
  delayWarningMinutes: 5,
  showSenderAccount: false,
  showReceiverAccount: false,
  showSenderNameEn: false,
  showReceiverNameEn: false,
  showLocalAmount: false,
  bankId: '',
  senderBankId: '',
  receiverBankId: '',
  previewSenderName: 'นาย ธันเดอร์ มานะ',
  previewReceiverName: 'นาย ธันเดอร์ มานะ',
  previewAmount: '1,000.00',
  previewSenderAccount: '1234xxxx5678',
  previewReceiverAccount: '12xxxx3456',
  themePreset: 'default',
};

const DEFAULT_SYSTEM_FORM_DATA: SystemFormData = {
  textMessage: '',
  title: '',
  mainMessage: '',
  subMessage: '',
  responseFormat: 'flex',
  primaryColor: '#FF6B6B',
  icon: '❌',
  showIcon: true,
  showContactButton: true,
  contactButtonText: 'ติดต่อผู้ดูแล',
  contactButtonUrl: '',
  showRetryButton: true,
  retryButtonText: 'ลองใหม่อีกครั้ง',
};

const SAMPLE_DATA = {
  amount: '฿1,000.00',
  fee: '฿0',
  date: '24 ม.ค. 2569',
  time: '09:41',
  transRef: '69012416324789A123456B78',
  sender: { name: 'นาย ธันเดอร์ มานะ', account: '1234xxxx5678' },
  receiver: { name: 'นาย ธันเดอร์ มานะ', account: '12xxxx3456' },
};

const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  senderName: 'นาย ธันเดอร์ มานะ',
  receiverName: 'นาย ธันเดอร์ มานะ',
  senderBankCode: '004',
  receiverBankCode: '014',
  amount: '1,000.00',
};

// ==================== COMPONENTS ====================

// Toggle Switch Component
const Toggle = memo(({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) => (
  <button
    type="button"
    onClick={onChange}
    className={cn(
      "flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border transition-all w-full text-left group min-h-[48px]",
      checked
        ? "border-emerald-200 bg-emerald-50/50"
        : "border-slate-200 bg-white hover:border-slate-300"
    )}
  >
    <div className="flex-1 min-w-0">
      <span className={cn(
        "text-xs sm:text-sm font-medium transition-colors block leading-tight",
        checked ? "text-emerald-700" : "text-slate-600 group-hover:text-slate-800"
      )}>
        {label}
      </span>
      {description && (
        <span className="text-[10px] sm:text-xs text-slate-400 mt-0.5 block leading-tight">{description}</span>
      )}
    </div>
    <div className={cn(
      "w-10 sm:w-11 h-5 sm:h-6 rounded-full relative transition-all duration-200 flex-shrink-0",
      checked ? "bg-emerald-500" : "bg-slate-300"
    )}>
      <div className={cn(
        "absolute top-0.5 sm:top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
        checked ? "left-5 sm:left-6" : "left-0.5 sm:left-1"
      )} />
    </div>
  </button>
));
Toggle.displayName = 'Toggle';

// Bank Selection Button
const BankButton = memo(({ bank, isSelected, onClick }: {
  bank: Bank;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const logo = bank.logoBase64 || bank.logoUrl;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center p-1.5 sm:p-2 md:p-3 rounded-lg sm:rounded-xl border-2 transition-all group relative min-w-0",
        isSelected
          ? "border-emerald-500 bg-emerald-50 shadow-md"
          : "border-transparent bg-slate-50 hover:bg-white hover:border-slate-200"
      )}
    >
      <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center overflow-hidden bg-white shadow-sm mb-1 group-hover:scale-105 transition-transform">
        {logo ? (
          <img src={logo} alt={bank.shortName} className="w-6 h-6 sm:w-8 sm:h-8 md:w-9 md:h-9 object-contain" />
        ) : (
          <span className="text-[10px] sm:text-xs font-bold text-slate-400">{(bank.shortName || bank.code)?.substring(0, 2)}</span>
        )}
      </div>
      <span className={cn(
        "text-[8px] sm:text-[10px] font-semibold text-center truncate w-full leading-tight",
        isSelected ? 'text-emerald-700' : 'text-slate-500'
      )}>
        {bank.shortName || bank.code}
      </span>
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-500 rounded-full flex items-center justify-center">
          <span className="text-white text-[8px] sm:text-[10px]">✓</span>
        </div>
      )}
    </button>
  );
});
BankButton.displayName = 'BankButton';

// Slip Preview Component
const SlipPreview = memo(({ config, senderBank, receiverBank, compact = false }: {
  config: SlipFormData;
  senderBank: Bank | null;
  receiverBank: Bank | null;
  compact?: boolean;
}) => {
  const isDuplicate = config.type === 'duplicate';
  const isError = config.type === 'error';
  const isNotFound = config.type === 'not_found';
  const mainColor = isDuplicate ? '#f59e0b' : isError ? '#ef4444' : isNotFound ? '#64748b' : config.primaryColor;

  const getStatusIcon = () => {
    if (isDuplicate) return '!';
    if (isError) return '✕';
    if (isNotFound) return '?';
    return '✓';
  };

  const getStatusText = () => {
    if (config.headerText) return config.headerText;
    if (isDuplicate) return 'ตรวจพบสลิปซ้ำในระบบ';
    if (isError) return 'ระบบขัดข้อง กรุณาลองใหม่';
    if (isNotFound) return 'ไม่พบข้อมูลสลิปนี้';
    return 'ตรวจสอบสลิปสำเร็จ';
  };

  const senderLogo = senderBank?.logoBase64 || senderBank?.logoUrl;
  const receiverLogo = receiverBank?.logoBase64 || receiverBank?.logoUrl;

  return (
    <div className={cn(
      "bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-3 sm:p-4 md:p-5 w-full mx-auto shadow-2xl border border-white/10 relative overflow-hidden",
      compact ? "max-w-[260px]" : "max-w-[280px] sm:max-w-[300px]"
    )}>
      <div
        className="absolute top-0 right-0 w-32 sm:w-40 h-32 sm:h-40 rounded-full blur-[40px] sm:blur-[50px] -mr-16 sm:-mr-20 -mt-16 sm:-mt-20 pointer-events-none opacity-30 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      />
      <div
        className="rounded-xl sm:rounded-2xl p-2.5 sm:p-3 md:p-4 mb-2 sm:mb-3 flex items-center gap-2 sm:gap-3 border border-white/10 backdrop-blur-sm transition-colors duration-200"
        style={{ backgroundColor: `${mainColor}15` }}
      >
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-white text-xs sm:text-sm font-bold shadow-lg transition-colors duration-200 flex-shrink-0"
          style={{ backgroundColor: mainColor }}
        >
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs sm:text-sm md:text-[15px] font-bold leading-tight transition-colors duration-200 truncate"
            style={{ color: mainColor }}
          >
            {getStatusText()}
          </p>
          <p className="text-[8px] sm:text-[9px] text-white/40 font-medium mt-0.5">ยืนยันการทำรายการแล้ว</p>
        </div>
      </div>
      <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 space-y-2 sm:space-y-3 shadow-inner relative z-10">
        {config.showAmount && (
          <div className="text-center py-1.5 sm:py-2 border-b border-slate-100">
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium mb-0.5 sm:mb-1">จำนวนเงิน</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold transition-colors duration-200" style={{ color: mainColor }}>
              ฿{config.previewAmount || SAMPLE_DATA.amount}
            </p>
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
              {config.showDate && <p className="text-[9px] sm:text-[10px] text-slate-400">{SAMPLE_DATA.date}</p>}
              {config.showDate && config.showTime && <span className="w-1 h-1 rounded-full bg-slate-300" />}
              {config.showTime && <p className="text-[9px] sm:text-[10px] text-slate-400">{SAMPLE_DATA.time}</p>}
            </div>
          </div>
        )}
        <div className="space-y-2">
          {config.showSender && (
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl">
              {config.showBankLogo && (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {senderLogo ? <img src={senderLogo} alt="Bank" className="w-5 h-5 sm:w-7 sm:h-7 object-contain" /> : <span className="text-sm sm:text-base">👤</span>}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[8px] sm:text-[9px] text-slate-400 font-medium mb-0.5">ผู้โอน</p>
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-800 truncate">{config.previewSenderName || SAMPLE_DATA.sender.name}</p>
                {config.showSenderAccount && <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono">{config.previewSenderAccount || SAMPLE_DATA.sender.account}</p>}
              </div>
            </div>
          )}
          {config.showSender && config.showReceiver && (
            <div className="flex justify-center -my-0.5 sm:-my-1 relative z-10">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center shadow-sm">
                <span className="text-slate-400 text-[10px] sm:text-xs">↓</span>
              </div>
            </div>
          )}
          {config.showReceiver && (
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl transition-colors duration-200" style={{ backgroundColor: `${mainColor}08` }}>
              {config.showBankLogo && (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                  {receiverLogo ? <img src={receiverLogo} alt="Bank" className="w-5 h-5 sm:w-7 sm:h-7 object-contain" /> : <span className="text-sm sm:text-base">🏦</span>}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[8px] sm:text-[9px] font-medium mb-0.5 transition-colors duration-200" style={{ color: mainColor }}>ผู้รับ</p>
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-800 truncate">{config.previewReceiverName || SAMPLE_DATA.receiver.name}</p>
                {config.showReceiverAccount && <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono">{config.previewReceiverAccount || SAMPLE_DATA.receiver.account}</p>}
              </div>
            </div>
          )}
        </div>
        {(config.showTransRef || config.showFee) && (
          <div className="pt-2 sm:pt-3 border-t border-dashed border-slate-200 space-y-1 sm:space-y-1.5">
            {config.showTransRef && (
              <div className="flex justify-between items-center text-[9px] sm:text-[10px]">
                <span className="text-slate-400">เลขอ้างอิง</span>
                <span className="text-slate-700 font-mono font-medium truncate ml-2">{SAMPLE_DATA.transRef.slice(0, 8)}...</span>
              </div>
            )}
            {config.showFee && (
              <div className="flex justify-between items-center text-[9px] sm:text-[10px]">
                <span className="text-slate-400">ค่าธรรมเนียม</span>
                <span className="text-emerald-600 font-medium">ฟรี</span>
              </div>
            )}
          </div>
        )}
        {config.footerText && (
          <div className="pt-2 sm:pt-3 border-t border-slate-100">
            <p className="text-[8px] sm:text-[9px] text-slate-400 text-center leading-tight">{config.footerText}</p>
          </div>
        )}
      </div>
      <div className="mt-3 sm:mt-4 flex justify-center">
        <p className="text-[8px] sm:text-[9px] text-white/20 font-medium">LINE OA System</p>
      </div>
    </div>
  );
});
SlipPreview.displayName = 'SlipPreview';

// System Response Preview Component
const SystemResponsePreview = memo(({ config, template }: {
  config: SystemFormData;
  template?: SystemResponseTemplate | null;
}) => {
  const typeInfo = SYSTEM_TYPE_OPTIONS.find(t => t.value === template?.type);

  return (
    <div className="bg-slate-900 rounded-[2rem] p-3 sm:p-4 w-full max-w-[280px] mx-auto shadow-2xl border border-white/10 relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] -mr-16 -mt-16 pointer-events-none opacity-30"
        style={{ backgroundColor: config.primaryColor }}
      />
      <div
        className="rounded-xl p-3 mb-3 flex items-center gap-3 border border-white/10 backdrop-blur-sm"
        style={{ backgroundColor: `${config.primaryColor}20` }}
      >
        {config.showIcon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg flex-shrink-0"
            style={{ backgroundColor: config.primaryColor }}
          >
            {config.icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight" style={{ color: config.primaryColor }}>
            {config.title || typeInfo?.label || 'ข้อความระบบ'}
          </p>
          <p className="text-[9px] text-white/50 font-medium mt-0.5">ระบบแจ้งเตือน</p>
        </div>
      </div>
      <div className="bg-white rounded-xl p-4 space-y-3 shadow-inner relative z-10">
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800 leading-relaxed">
            {config.mainMessage || config.textMessage || 'ข้อความหลัก'}
          </p>
          {config.subMessage && (
            <p className="text-xs text-slate-500 mt-2">{config.subMessage}</p>
          )}
        </div>
        <div className="space-y-2 pt-2">
          {config.showRetryButton && (
            <button
              className="w-full py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: config.primaryColor, color: '#fff' }}
            >
              {config.retryButtonText}
            </button>
          )}
          {config.showContactButton && (
            <button className="w-full py-2.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors">
              {config.contactButtonText}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-center">
        <p className="text-[8px] text-white/20 font-medium">LINE OA System</p>
      </div>
    </div>
  );
});
SystemResponsePreview.displayName = 'SystemResponsePreview';

// ==================== MAIN COMPONENT ====================

export default function AdminTemplatesPage() {
  // State
  const [slipTemplates, setSlipTemplates] = useState<SlipTemplate[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemResponseTemplate[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Category tab: 'slip' | 'system'
  const [categoryTab, setCategoryTab] = useState<'slip' | 'system'>('slip');

  // Slip template modal state
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [showSlipDeleteConfirm, setShowSlipDeleteConfirm] = useState(false);
  const [selectedSlipTemplate, setSelectedSlipTemplate] = useState<SlipTemplate | null>(null);
  const [slipFormData, setSlipFormData] = useState<SlipFormData>(DEFAULT_SLIP_FORM_DATA);
  const [slipFormErrors, setSlipFormErrors] = useState<{ name?: string }>({});
  const [slipActiveTab, setSlipActiveTab] = useState<'basic' | 'display' | 'banks'>('basic');

  // System template modal state
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [selectedSystemTemplate, setSelectedSystemTemplate] = useState<SystemResponseTemplate | null>(null);
  const [systemFormData, setSystemFormData] = useState<SystemFormData>(DEFAULT_SYSTEM_FORM_DATA);

  // Preview settings state
  const [pageTab, setPageTab] = useState<'templates' | 'preview-settings'>('templates');
  const [previewConfig, setPreviewConfig] = useState<PreviewConfig>(DEFAULT_PREVIEW_CONFIG);
  const [previewSettingsForm, setPreviewSettingsForm] = useState<PreviewConfig>(DEFAULT_PREVIEW_CONFIG);
  const [previewSettingsErrors, setPreviewSettingsErrors] = useState<{ senderName?: string; receiverName?: string; amount?: string }>({});
  const [isSavingPreviewSettings, setIsSavingPreviewSettings] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [slipRes, systemRes, banksRes, previewConfigRes] = await Promise.all([
        adminSlipTemplatesApi.getAll(),
        systemResponseTemplatesApi.getAll(),
        banksApi.getAll(),
        systemSettingsApi.getPreviewConfig()
      ]);

      const loadedSlipTemplates = slipRes.data.templates || [];
      setSlipTemplates(loadedSlipTemplates);
      setSystemTemplates(systemRes.data.data || []);
      setBanks(banksRes.data.banks || []);

      // If no slip templates exist, show notification
      if (loadedSlipTemplates.length === 0) {
        toast('ไม่พบ Slip Templates กรุณากดปุ่ม "สร้าง Templates เริ่มต้น"', { icon: '⚠️' });
      }

      const config = previewConfigRes.data.previewConfig;
      if (config) {
        const loadedConfig: PreviewConfig = {
          senderName: config.senderName || DEFAULT_PREVIEW_CONFIG.senderName,
          receiverName: config.receiverName || DEFAULT_PREVIEW_CONFIG.receiverName,
          senderBankCode: config.senderBankCode || DEFAULT_PREVIEW_CONFIG.senderBankCode,
          receiverBankCode: config.receiverBankCode || DEFAULT_PREVIEW_CONFIG.receiverBankCode,
          amount: config.amount || DEFAULT_PREVIEW_CONFIG.amount,
        };
        setPreviewConfig(loadedConfig);
        setPreviewSettingsForm(loadedConfig);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeBanks = useMemo(() => banks.filter(b => b.isActive), [banks]);

  const getBankByCode = useCallback((code: string) => banks.find(b => b.code === code) || null, [banks]);

  const previewSenderBank = useMemo(() => getBankByCode(previewSettingsForm.senderBankCode), [getBankByCode, previewSettingsForm.senderBankCode]);
  const previewReceiverBank = useMemo(() => getBankByCode(previewSettingsForm.receiverBankCode), [getBankByCode, previewSettingsForm.receiverBankCode]);

  const senderBank = useMemo(() => {
    if (slipFormData.senderBankId) return banks.find(b => b._id === slipFormData.senderBankId) || null;
    return activeBanks[0] || null;
  }, [banks, slipFormData.senderBankId, activeBanks]);

  const receiverBank = useMemo(() => {
    if (slipFormData.receiverBankId) return banks.find(b => b._id === slipFormData.receiverBankId) || null;
    return activeBanks[1] || activeBanks[0] || null;
  }, [banks, slipFormData.receiverBankId, activeBanks]);

  // Slip templates grouped by type
  const slipTemplatesByType = useMemo(() => slipTemplates.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, SlipTemplate[]>), [slipTemplates]);

  // ==================== SLIP TEMPLATE HANDLERS ====================

  const openSlipCreateModal = () => {
    setSelectedSlipTemplate(null);
    setSlipFormData(DEFAULT_SLIP_FORM_DATA);
    setSlipFormErrors({});
    setSlipActiveTab('basic');
    setShowSlipModal(true);
  };

  const openSlipEditModal = (template: SlipTemplate) => {
    setSelectedSlipTemplate(template);
    setSlipFormData({
      name: template.name,
      description: template.description || '',
      type: template.type,
      primaryColor: template.primaryColor || '#10b981',
      headerText: template.headerText || '',
      footerText: template.footerText || '',
      footerLink: template.footerLink || '',
      footerLinkText: template.footerLinkText || '',
      showAmount: template.showAmount,
      showSender: template.showSender,
      showReceiver: template.showReceiver,
      showDate: template.showDate,
      showTime: template.showTime,
      showTransRef: template.showTransRef,
      showBankLogo: template.showBankLogo,
      showCountryCode: template.showCountryCode ?? false,
      showFee: template.showFee ?? false,
      showRefs: template.showRefs ?? false,
      showPayload: template.showPayload ?? false,
      showSenderBankId: template.showSenderBankId ?? false,
      showReceiverBankId: template.showReceiverBankId ?? false,
      showReceiverProxy: template.showReceiverProxy ?? false,
      showDelayWarning: template.showDelayWarning,
      delayWarningMinutes: template.delayWarningMinutes || 5,
      showSenderAccount: template.showSenderAccount ?? false,
      showReceiverAccount: template.showReceiverAccount ?? false,
      showSenderNameEn: template.showSenderNameEn ?? false,
      showReceiverNameEn: template.showReceiverNameEn ?? false,
      showLocalAmount: template.showLocalAmount ?? false,
      bankId: template.bankId || '',
      senderBankId: template.senderBankId || '',
      receiverBankId: template.receiverBankId || '',
      previewSenderName: template.previewSenderName || 'นาย ธันเดอร์ มานะ',
      previewReceiverName: template.previewReceiverName || 'นาย ธันเดอร์ มานะ',
      previewAmount: template.previewAmount || '1,000.00',
      previewSenderAccount: template.previewSenderAccount || '1234xxxx5678',
      previewReceiverAccount: template.previewReceiverAccount || '12xxxx3456',
      themePreset: template.themePreset || 'default',
    });
    setSlipFormErrors({});
    setSlipActiveTab('basic');
    setShowSlipModal(true);
  };

  const validateSlipForm = (): boolean => {
    const errors: { name?: string } = {};
    if (!slipFormData.name.trim()) errors.name = 'กรุณากรอกชื่อเทมเพลต';
    setSlipFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSlipSubmit = async () => {
    if (!validateSlipForm()) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    setIsProcessing(true);
    try {
      if (selectedSlipTemplate) {
        await adminSlipTemplatesApi.update(selectedSlipTemplate._id, slipFormData);
        toast.success('อัปเดตเทมเพลตสำเร็จ');
      } else {
        await adminSlipTemplatesApi.create(slipFormData);
        toast.success('สร้างเทมเพลตสำเร็จ');
      }
      setShowSlipModal(false);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      console.error('Error saving slip template:', error);
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSlipDelete = async () => {
    if (!selectedSlipTemplate) return;
    setIsProcessing(true);
    try {
      await adminSlipTemplatesApi.delete(selectedSlipTemplate._id);
      toast.success('ลบเทมเพลตสำเร็จ');
      setShowSlipDeleteConfirm(false);
      setSelectedSlipTemplate(null);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      console.error('Error deleting slip template:', error);
      toast.error(err.response?.data?.message || 'ไม่สามารถลบได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSlipSetDefault = async (id: string) => {
    try {
      await adminSlipTemplatesApi.setDefault(id);
      toast.success('ตั้งเป็นค่าเริ่มต้นสำเร็จ');
      fetchData();
    } catch (error) {
      console.error('Error setting default:', error);
      toast.error('ไม่สามารถตั้งเป็นค่าเริ่มต้นได้');
    }
  };

  const handleRepairTemplates = async () => {
    setIsProcessing(true);
    try {
      const response = await adminSlipTemplatesApi.repair();
      toast.success(response.data.message || 'ซ่อมแซมเทมเพลตสำเร็จ');
      fetchData();
    } catch (error) {
      console.error('Error repairing templates:', error);
      toast.error('ไม่สามารถซ่อมแซมเทมเพลตได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetTemplates = async () => {
    if (!confirm('คุณต้องการรีเซ็ตเทมเพลตทั้งหมดหรือไม่?\n\nการดำเนินการนี้จะลบเทมเพลตทั้งหมดและสร้างใหม่ทั้งหมด\nไม่สามารถยกเลิกได้')) {
      return;
    }
    setIsProcessing(true);
    try {
      const response = await adminSlipTemplatesApi.reset();
      toast.success(response.data.message || 'รีเซ็ตเทมเพลตสำเร็จ');
      fetchData();
    } catch (error) {
      console.error('Error resetting templates:', error);
      toast.error('ไม่สามารถรีเซ็ตเทมเพลตได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitSlipDefaults = async () => {
    setIsProcessing(true);
    try {
      const response = await adminSlipTemplatesApi.initDefaults();
      toast.success(response.data.message || 'สร้างเทมเพลตเริ่มต้นสำเร็จ');
      fetchData();
    } catch (error) {
      console.error('Error initializing defaults:', error);
      toast.error('ไม่สามารถสร้างเทมเพลตเริ่มต้นได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateSlipField = (field: keyof SlipFormData, value: string | boolean | number) => {
    setSlipFormData(prev => ({ ...prev, [field]: value }));
    if (slipFormErrors[field as keyof typeof slipFormErrors]) {
      setSlipFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // ==================== SYSTEM TEMPLATE HANDLERS ====================

  const openSystemEditModal = (template: SystemResponseTemplate) => {
    setSelectedSystemTemplate(template);
    setSystemFormData({
      textMessage: template.textMessage || '',
      title: template.title || '',
      mainMessage: template.mainMessage || '',
      subMessage: template.subMessage || '',
      responseFormat: template.responseFormat || 'flex',
      primaryColor: template.styling?.primaryColor || '#FF6B6B',
      icon: template.styling?.icon || '❌',
      showIcon: template.styling?.showIcon ?? true,
      showContactButton: template.styling?.showContactButton ?? true,
      contactButtonText: template.styling?.contactButtonText || 'ติดต่อผู้ดูแล',
      contactButtonUrl: template.styling?.contactButtonUrl || '',
      showRetryButton: template.styling?.showRetryButton ?? true,
      retryButtonText: template.styling?.retryButtonText || 'ลองใหม่อีกครั้ง',
    });
    setShowSystemModal(true);
  };

  const handleSystemSubmit = async () => {
    if (!selectedSystemTemplate) return;
    setIsProcessing(true);
    try {
      await systemResponseTemplatesApi.update(selectedSystemTemplate.type, {
        textMessage: systemFormData.textMessage,
        title: systemFormData.title,
        mainMessage: systemFormData.mainMessage,
        subMessage: systemFormData.subMessage,
        responseFormat: systemFormData.responseFormat,
        styling: {
          primaryColor: systemFormData.primaryColor,
          icon: systemFormData.icon,
          showIcon: systemFormData.showIcon,
          showContactButton: systemFormData.showContactButton,
          contactButtonText: systemFormData.contactButtonText,
          contactButtonUrl: systemFormData.contactButtonUrl,
          showRetryButton: systemFormData.showRetryButton,
          retryButtonText: systemFormData.retryButtonText,
        },
      });
      toast.success('อัปเดตข้อความระบบสำเร็จ');
      setShowSystemModal(false);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSystemReset = async (type: string) => {
    setIsProcessing(true);
    try {
      await systemResponseTemplatesApi.reset(type);
      toast.success('รีเซ็ตเป็นค่าเริ่มต้นสำเร็จ');
      fetchData();
    } catch {
      toast.error('ไม่สามารถรีเซ็ตได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitSystemDefaults = async () => {
    setIsProcessing(true);
    try {
      await api.post('/admin/system-response-templates/initialize');
      toast.success('สร้างข้อความระบบเริ่มต้นสำเร็จ');
      fetchData();
    } catch {
      toast.error('ไม่สามารถสร้างได้');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateSystemField = (field: keyof SystemFormData, value: string | boolean) => {
    setSystemFormData(prev => ({ ...prev, [field]: value }));
  };

  // ==================== PREVIEW SETTINGS HANDLERS ====================

  const validatePreviewSettings = (): boolean => {
    const errors: { senderName?: string; receiverName?: string; amount?: string } = {};
    if (!previewSettingsForm.senderName.trim()) errors.senderName = 'กรุณากรอกชื่อผู้โอน';
    if (!previewSettingsForm.receiverName.trim()) errors.receiverName = 'กรุณากรอกชื่อผู้รับ';
    if (!previewSettingsForm.amount.trim()) {
      errors.amount = 'กรุณากรอกจำนวนเงิน';
    } else if (!/^[\d,]+\.?\d*$/.test(previewSettingsForm.amount)) {
      errors.amount = 'รูปแบบจำนวนเงินไม่ถูกต้อง';
    }
    setPreviewSettingsErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSavePreviewSettings = async () => {
    if (!validatePreviewSettings()) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    setIsSavingPreviewSettings(true);
    try {
      await systemSettingsApi.updateSystemSettings({
        previewSenderName: previewSettingsForm.senderName,
        previewReceiverName: previewSettingsForm.receiverName,
        previewSenderBankCode: previewSettingsForm.senderBankCode,
        previewReceiverBankCode: previewSettingsForm.receiverBankCode,
        previewAmount: previewSettingsForm.amount,
      });
      setPreviewConfig(previewSettingsForm);
      toast.success('บันทึกการตั้งค่าตัวอย่างสำเร็จ');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'ไม่สามารถบันทึกได้');
    } finally {
      setIsSavingPreviewSettings(false);
    }
  };

  const updatePreviewSettingsField = (field: keyof PreviewConfig, value: string) => {
    setPreviewSettingsForm(prev => ({ ...prev, [field]: value }));
    if (previewSettingsErrors[field as keyof typeof previewSettingsErrors]) {
      setPreviewSettingsErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // ==================== RENDER ====================

  if (loading) {
    return <DashboardLayout requiredRole="admin"><PageLoading message="กำลังโหลด..." /></DashboardLayout>;
  }

  return (
    <DashboardLayout requiredRole="admin">
      <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto pb-10 animate-fade">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-slate-500 text-sm mb-1">จัดการระบบ</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              ข้อความ<span className="text-[#06C755]">ตอบกลับ</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">จัดการเทมเพลตสลิปและข้อความระบบ</p>
          </div>
          {pageTab === 'templates' && (
            <div className="flex gap-3 w-full sm:w-auto">
              {categoryTab === 'slip' ? (
                <>
                  <Button variant="ghost" onClick={handleRepairTemplates} isLoading={isProcessing} className="flex-1 sm:flex-none text-amber-400 hover:text-amber-300" title="ซ่อมแซมเทมเพลตที่มีปัญหา">
                    🔧 ซ่อมแซม
                  </Button>
                  <Button variant="ghost" onClick={handleResetTemplates} isLoading={isProcessing} className="flex-1 sm:flex-none text-red-400 hover:text-red-300" title="ลบเทมเพลตทั้งหมดและสร้างใหม่">
                    🗑️ รีเซ็ตทั้งหมด
                  </Button>
                  <Button variant="primary" onClick={openSlipCreateModal} className="flex-1 sm:flex-none">
                    + สร้างเทมเพลต
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={handleInitSystemDefaults} isLoading={isProcessing} className="flex-1 sm:flex-none">
                  สร้างค่าเริ่มต้น
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Page-level Tabs */}
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit">
          <button
            onClick={() => setPageTab('templates')}
            className={cn(
              "px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              pageTab === 'templates' ? "bg-[#06C755] text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/10"
            )}
          >
            <span className="mr-2">🎨</span>จัดการเทมเพลต
          </button>
          <button
            onClick={() => setPageTab('preview-settings')}
            className={cn(
              "px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              pageTab === 'preview-settings' ? "bg-[#06C755] text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/10"
            )}
          >
            <span className="mr-2">⚙️</span>ตั้งค่าข้อมูลตัวอย่าง
          </button>
        </div>

        {/* Templates Tab Content */}
        {pageTab === 'templates' && (
          <>
            {/* Category Tabs */}
            <div className="flex gap-2 p-1.5 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl w-fit border border-white/10">
              <button
                onClick={() => setCategoryTab('slip')}
                className={cn(
                  "px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                  categoryTab === 'slip'
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                )}
              >
                <span className="text-lg">📝</span>
                <span>ตรวจสอบสลิป</span>
                <Badge variant="slate" size="sm" className="ml-1">{slipTemplates.length}</Badge>
              </button>
              <button
                onClick={() => setCategoryTab('system')}
                className={cn(
                  "px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                  categoryTab === 'system'
                    ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/25"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                )}
              >
                <span className="text-lg">💬</span>
                <span>ข้อความระบบ</span>
                <Badge variant="slate" size="sm" className="ml-1">{systemTemplates.length}</Badge>
              </button>
            </div>

            {/* Slip Templates Section */}
            {categoryTab === 'slip' && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <StatCard title="ทั้งหมด" value={slipTemplates.length} icon="🎨" color="indigo" variant="glass" />
                  <StatCard title="สำเร็จ" value={slipTemplates.filter(t => t.type === 'success').length} icon="✅" color="emerald" variant="glass" />
                  <StatCard title="ซ้ำ/ผิดพลาด" value={slipTemplates.filter(t => t.type === 'duplicate' || t.type === 'error').length} icon="⚠️" color="amber" variant="glass" />
                  <StatCard title="ค่าเริ่มต้น" value={slipTemplates.filter(t => t.isDefault).length} icon="⭐" color="blue" variant="glass" />
                </div>

                {/* Templates List */}
                {slipTemplates.length === 0 ? (
                  <Card className="p-8 sm:p-12 text-center" variant="glass">
                    <div className="text-5xl mb-4 opacity-50">🎨</div>
                    <h3 className="text-lg font-bold text-white mb-2">ยังไม่มีเทมเพลต</h3>
                    <p className="text-slate-400 mb-6 text-sm">กดปุ่ม "รีเซ็ตค่าเริ่มต้น" เพื่อสร้างเทมเพลตพื้นฐาน</p>
                    <Button onClick={handleInitSlipDefaults} variant="primary">สร้างเทมเพลตเริ่มต้น</Button>
                  </Card>
                ) : (
                  <div className="space-y-8">
                    {SLIP_TYPE_OPTIONS.map((type) => {
                      const list = slipTemplatesByType[type.value] || [];
                      if (list.length === 0) return null;
                      return (
                        <div key={type.value} className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-xl", type.bgColor, type.borderColor, "border")}>
                              {type.icon}
                            </div>
                            <div>
                              <h2 className="text-lg font-bold text-white">{type.label}</h2>
                              <p className="text-xs text-slate-400">{list.length} เทมเพลต</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {list.map((template) => (
                              <Card key={template._id} className={cn("p-5 hover:border-white/30 transition-all", type.borderColor, "border")} variant="glass">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-white truncate">{template.name}</h3>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">{template.description || 'ไม่มีคำอธิบาย'}</p>
                                  </div>
                                  {template.isDefault && <Badge variant="success" size="sm">ค่าเริ่มต้น</Badge>}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                  {template.showAmount && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">จำนวนเงิน</span>}
                                  {template.showSender && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">ผู้โอน</span>}
                                  {template.showReceiver && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">ผู้รับ</span>}
                                  {template.showBankLogo && <span className="text-[10px] px-2 py-0.5 bg-white/5 text-slate-400 rounded">โลโก้ธนาคาร</span>}
                                </div>
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => openSlipEditModal(template)}>แก้ไข</Button>
                                  {!template.isDefault && (
                                    <>
                                      <Button variant="ghost" size="sm" onClick={() => handleSlipSetDefault(template._id)}>⭐</Button>
                                      <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300" onClick={() => { setSelectedSlipTemplate(template); setShowSlipDeleteConfirm(true); }}>🗑️</Button>
                                    </>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* System Templates Section */}
            {categoryTab === 'system' && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <StatCard title="ทั้งหมด" value={systemTemplates.length} icon="💬" color="blue" variant="glass" />
                  <StatCard title="ใช้งานอยู่" value={systemTemplates.filter(t => t.isActive).length} icon="✅" color="emerald" variant="glass" />
                  <StatCard title="Flex Message" value={systemTemplates.filter(t => t.responseFormat === 'flex').length} icon="🎨" color="violet" variant="glass" />
                  <StatCard title="Text Message" value={systemTemplates.filter(t => t.responseFormat === 'text').length} icon="📝" color="indigo" variant="glass" />
                </div>

                {/* Templates Grid */}
                {systemTemplates.length === 0 ? (
                  <Card className="p-8 sm:p-12 text-center" variant="glass">
                    <div className="text-5xl mb-4 opacity-50">💬</div>
                    <h3 className="text-lg font-bold text-white mb-2">ยังไม่มีข้อความระบบ</h3>
                    <p className="text-slate-400 mb-6 text-sm">กดปุ่ม "สร้างค่าเริ่มต้น" เพื่อสร้างข้อความระบบพื้นฐาน</p>
                    <Button onClick={handleInitSystemDefaults} variant="primary">สร้างค่าเริ่มต้น</Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {systemTemplates.map((template) => {
                      const typeInfo = SYSTEM_TYPE_OPTIONS.find(t => t.value === template.type);
                      return (
                        <Card key={template._id} className={cn("p-5 hover:border-white/30 transition-all overflow-hidden", typeInfo?.borderColor || 'border-white/10', "border")} variant="glass">
                          <div className="flex items-start gap-3 mb-4">
                            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0", typeInfo?.bgColor || 'bg-slate-500/10')}>
                              {template.styling?.icon || typeInfo?.icon || '📝'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-white truncate">{template.name}</h3>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">{typeInfo?.description || template.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-4">
                            <Badge variant={template.isActive ? 'success' : 'slate'} size="sm">
                              {template.isActive ? 'ใช้งาน' : 'ปิด'}
                            </Badge>
                            <Badge variant="slate" size="sm">
                              {template.responseFormat === 'flex' ? '🎨 Flex' : '📝 Text'}
                            </Badge>
                          </div>
                          <div className="p-3 bg-white/5 rounded-lg mb-4">
                            <p className="text-xs text-slate-300 line-clamp-2">
                              {template.mainMessage || template.textMessage || 'ไม่มีข้อความ'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="flex-1" onClick={() => openSystemEditModal(template)}>แก้ไข</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleSystemReset(template.type)} title="รีเซ็ต">🔄</Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Preview Settings Tab Content */}
        {pageTab === 'preview-settings' && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Card variant="glass" className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <span className="text-lg">⚙️</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">ตั้งค่าข้อมูลตัวอย่าง</h2>
                  <p className="text-sm text-slate-400">ข้อมูลที่จะแสดงในตัวอย่างสลิป (Global)</p>
                </div>
              </div>
              <div className="space-y-5">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                  <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                    <span>👤</span> ข้อมูลผู้โอน
                  </h3>
                  <Input label="ชื่อผู้โอน" value={previewSettingsForm.senderName} onChange={(e) => updatePreviewSettingsField('senderName', e.target.value)} placeholder="นาย ธันเดอร์ มานะ" error={previewSettingsErrors.senderName} />
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">ธนาคารผู้โอน</label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-3 bg-black/20 rounded-xl border border-white/10">
                      {activeBanks.slice(0, 12).map((bank) => {
                        const logo = bank.logoBase64 || bank.logoUrl;
                        const isSelected = previewSettingsForm.senderBankCode === bank.code;
                        return (
                          <button key={bank._id} type="button" onClick={() => updatePreviewSettingsField('senderBankCode', bank.code || '')} className={cn("flex flex-col items-center p-2 rounded-lg border-2 transition-all", isSelected ? "border-emerald-500 bg-emerald-500/20" : "border-transparent bg-white/5 hover:bg-white/10")}>
                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 overflow-hidden">
                              {logo ? <img src={logo} alt={bank.shortName} className="w-6 h-6 object-contain" /> : <span className="text-xs font-bold text-slate-400">{(bank.shortName || bank.code)?.substring(0, 2)}</span>}
                            </div>
                            <span className={cn("text-[9px] font-medium truncate w-full text-center", isSelected ? 'text-emerald-400' : 'text-slate-400')}>{bank.shortName || bank.code}</span>
                          </button>
                        );
                      })}
                    </div>
                    {previewSenderBank && <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1"><span>✓</span> เลือก: {previewSenderBank.nameTh || previewSenderBank.name}</p>}
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                  <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                    <span>🏦</span> ข้อมูลผู้รับ
                  </h3>
                  <Input label="ชื่อผู้รับ" value={previewSettingsForm.receiverName} onChange={(e) => updatePreviewSettingsField('receiverName', e.target.value)} placeholder="นาย ธันเดอร์ มานะ" error={previewSettingsErrors.receiverName} />
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">ธนาคารผู้รับ</label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-3 bg-black/20 rounded-xl border border-white/10">
                      {activeBanks.slice(0, 12).map((bank) => {
                        const logo = bank.logoBase64 || bank.logoUrl;
                        const isSelected = previewSettingsForm.receiverBankCode === bank.code;
                        return (
                          <button key={bank._id} type="button" onClick={() => updatePreviewSettingsField('receiverBankCode', bank.code || '')} className={cn("flex flex-col items-center p-2 rounded-lg border-2 transition-all", isSelected ? "border-blue-500 bg-blue-500/20" : "border-transparent bg-white/5 hover:bg-white/10")}>
                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-1 overflow-hidden">
                              {logo ? <img src={logo} alt={bank.shortName} className="w-6 h-6 object-contain" /> : <span className="text-xs font-bold text-slate-400">{(bank.shortName || bank.code)?.substring(0, 2)}</span>}
                            </div>
                            <span className={cn("text-[9px] font-medium truncate w-full text-center", isSelected ? 'text-blue-400' : 'text-slate-400')}>{bank.shortName || bank.code}</span>
                          </button>
                        );
                      })}
                    </div>
                    {previewReceiverBank && <p className="text-xs text-blue-400 mt-2 flex items-center gap-1"><span>✓</span> เลือก: {previewReceiverBank.nameTh || previewReceiverBank.name}</p>}
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2 mb-4">
                    <span>💰</span> จำนวนเงิน
                  </h3>
                  <Input label="จำนวนเงินตัวอย่าง" value={previewSettingsForm.amount} onChange={(e) => { const value = e.target.value.replace(/[^0-9,.]/g, ''); updatePreviewSettingsField('amount', value); }} placeholder="1,000.00" error={previewSettingsErrors.amount} hint="รูปแบบ: 1,000.00" />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setPreviewSettingsForm(previewConfig)} disabled={isSavingPreviewSettings} className="flex-1">รีเซ็ต</Button>
                  <Button variant="primary" onClick={handleSavePreviewSettings} isLoading={isSavingPreviewSettings} className="flex-1">💾 บันทึกการตั้งค่า</Button>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <span className="text-lg">👁️</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">ตัวอย่างการแสดงผล</h2>
                  <p className="text-sm text-slate-400">อัปเดตตามการตั้งค่าแบบเรียลไทม์</p>
                </div>
              </div>
              <div className="flex justify-center py-6">
                <SlipPreview
                  config={{ ...DEFAULT_SLIP_FORM_DATA, previewSenderName: previewSettingsForm.senderName, previewReceiverName: previewSettingsForm.receiverName, previewAmount: previewSettingsForm.amount }}
                  senderBank={previewSenderBank}
                  receiverBank={previewReceiverBank}
                />
              </div>
              <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 mt-4">
                <p className="text-xs text-blue-300 leading-relaxed">
                  💡 <strong>หมายเหตุ:</strong> การตั้งค่านี้จะถูกใช้เป็นค่าเริ่มต้นสำหรับการแสดงตัวอย่างสลิปในทุกเทมเพลต
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Slip Template Modal */}
      <Modal isOpen={showSlipModal} onClose={() => !isProcessing && setShowSlipModal(false)} title={selectedSlipTemplate ? 'แก้ไขเทมเพลตสลิป' : 'สร้างเทมเพลตใหม่'} size="fullMobile">
        <div className="flex flex-col xl:flex-row gap-5 sm:gap-6 xl:gap-8">
          <div className="flex-1 space-y-4 sm:space-y-5 order-1">
            <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl min-w-max sm:min-w-0">
                {[
                  { id: 'basic', label: 'การตั้งค่าหลัก', shortLabel: 'ตั้งค่า', icon: '⚙️' },
                  { id: 'display', label: 'เลเยอร์', shortLabel: 'เลเยอร์', icon: '👁️' },
                  { id: 'banks', label: 'ข้อมูลธนาคาร', shortLabel: 'ธนาคาร', icon: '🏦' },
                ].map((tab) => (
                  <button key={tab.id} onClick={() => setSlipActiveTab(tab.id as 'basic' | 'display' | 'banks')} className={cn("flex-1 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap min-w-[90px] sm:min-w-0", slipActiveTab === tab.id ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:text-slate-700")}>
                    <span className="mr-1 sm:mr-1.5">{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 max-h-[40vh] sm:max-h-[45vh] xl:max-h-[55vh] overflow-y-auto">
              {slipActiveTab === 'basic' && (
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <Input label="ชื่อเทมเพลต" value={slipFormData.name} onChange={(e) => updateSlipField('name', e.target.value)} placeholder="เช่น เทมเพลตมาตรฐาน" error={slipFormErrors.name} />
                    {slipFormErrors.name && <p className="text-rose-500 text-xs mt-1">{slipFormErrors.name}</p>}
                  </div>
                  <Select label="สถานะการตอบกลับ" value={slipFormData.type} onChange={(e) => updateSlipField('type', e.target.value)}>
                    {SLIP_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>)}
                  </Select>
                  <Textarea label="รายละเอียด" value={slipFormData.description} onChange={(e) => updateSlipField('description', e.target.value)} placeholder="อธิบายการใช้งานเทมเพลตนี้..." rows={2} />
                  <div className="flex items-center justify-between p-3 sm:p-4 bg-white rounded-lg sm:rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg shadow-inner flex-shrink-0" style={{ backgroundColor: slipFormData.primaryColor }} />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-slate-700">สีธีมหลัก</p>
                        <p className="text-[10px] sm:text-xs text-slate-400 truncate">{slipFormData.primaryColor}</p>
                      </div>
                    </div>
                    <input type="color" value={slipFormData.primaryColor} onChange={(e) => updateSlipField('primaryColor', e.target.value)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border-2 border-white shadow cursor-pointer flex-shrink-0" />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <Input label="ข้อความหัวเรื่อง" value={slipFormData.headerText} onChange={(e) => updateSlipField('headerText', e.target.value)} placeholder="เช่น ตรวจสอบสำเร็จ" />
                    <Input label="ข้อความท้าย" value={slipFormData.footerText} onChange={(e) => updateSlipField('footerText', e.target.value)} placeholder="เช่น ขอบคุณที่ใช้บริการ" />
                  </div>
                </div>
              )}
              {slipActiveTab === 'display' && (
                <div className="space-y-4 sm:space-y-5">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">ข้อมูลการเงิน</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="จำนวนเงิน" checked={slipFormData.showAmount} onChange={() => updateSlipField('showAmount', !slipFormData.showAmount)} />
                      <Toggle label="เลขอ้างอิง" checked={slipFormData.showTransRef} onChange={() => updateSlipField('showTransRef', !slipFormData.showTransRef)} />
                      <Toggle label="วันที่" checked={slipFormData.showDate} onChange={() => updateSlipField('showDate', !slipFormData.showDate)} />
                      <Toggle label="เวลา" checked={slipFormData.showTime} onChange={() => updateSlipField('showTime', !slipFormData.showTime)} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">ข้อมูลผู้โอน</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="แสดงผู้โอน" checked={slipFormData.showSender} onChange={() => updateSlipField('showSender', !slipFormData.showSender)} />
                      <Toggle label="เลขบัญชีผู้โอน" checked={slipFormData.showSenderAccount} onChange={() => updateSlipField('showSenderAccount', !slipFormData.showSenderAccount)} />
                      <Toggle label="ชื่อภาษาอังกฤษ" checked={slipFormData.showSenderNameEn} onChange={() => updateSlipField('showSenderNameEn', !slipFormData.showSenderNameEn)} />
                      <Toggle label="รหัสธนาคาร" checked={slipFormData.showSenderBankId} onChange={() => updateSlipField('showSenderBankId', !slipFormData.showSenderBankId)} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">ข้อมูลผู้รับ</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="แสดงผู้รับ" checked={slipFormData.showReceiver} onChange={() => updateSlipField('showReceiver', !slipFormData.showReceiver)} />
                      <Toggle label="เลขบัญชีผู้รับ" checked={slipFormData.showReceiverAccount} onChange={() => updateSlipField('showReceiverAccount', !slipFormData.showReceiverAccount)} />
                      <Toggle label="รหัสธนาคารผู้รับ" checked={slipFormData.showReceiverBankId} onChange={() => updateSlipField('showReceiverBankId', !slipFormData.showReceiverBankId)} />
                      <Toggle label="พร้อมเพย์" checked={slipFormData.showReceiverProxy} onChange={() => updateSlipField('showReceiverProxy', !slipFormData.showReceiverProxy)} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">องค์ประกอบอื่นๆ</p>
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                      <Toggle label="โลโก้ธนาคาร" checked={slipFormData.showBankLogo} onChange={() => updateSlipField('showBankLogo', !slipFormData.showBankLogo)} />
                      <Toggle label="ค่าธรรมเนียม" checked={slipFormData.showFee} onChange={() => updateSlipField('showFee', !slipFormData.showFee)} />
                      <Toggle label="อ้างอิงเพิ่มเติม" checked={slipFormData.showRefs} onChange={() => updateSlipField('showRefs', !slipFormData.showRefs)} />
                      <Toggle label="รหัสประเทศ" checked={slipFormData.showCountryCode} onChange={() => updateSlipField('showCountryCode', !slipFormData.showCountryCode)} />
                    </div>
                  </div>
                </div>
              )}
              {slipActiveTab === 'banks' && (
                <div className="space-y-4 sm:space-y-6">
                  <div className="p-3 sm:p-4 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl border border-emerald-100">
                    <p className="text-xs sm:text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><span>🎨</span>ข้อมูลตัวอย่างสำหรับ Preview</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="ชื่อผู้โอน" value={slipFormData.previewSenderName} onChange={(e) => updateSlipField('previewSenderName', e.target.value)} placeholder="นาย ธันเดอร์ มานะ" className="text-sm" />
                      <Input label="เลขบัญชีผู้โอน" value={slipFormData.previewSenderAccount} onChange={(e) => updateSlipField('previewSenderAccount', e.target.value)} placeholder="1234xxxx5678" className="text-sm" />
                      <Input label="เลขบัญชีผู้รับ" value={slipFormData.previewReceiverAccount} onChange={(e) => updateSlipField('previewReceiverAccount', e.target.value)} placeholder="12xxxx3456" className="text-sm" />
                      <Input label="ชื่อผู้รับ" value={slipFormData.previewReceiverName} onChange={(e) => updateSlipField('previewReceiverName', e.target.value)} placeholder="นาย ธันเดอร์ มานะ" className="text-sm" />
                      <div className="sm:col-span-2">
                        <Input label="จำนวนเงินตัวอย่าง" value={slipFormData.previewAmount} onChange={(e) => { const value = e.target.value.replace(/[^0-9,.]/g, ''); updateSlipField('previewAmount', value); }} placeholder="1,000.00" className="text-sm" hint="รูปแบบ: 1,000.00" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap"><span className="text-sm sm:text-base">👤</span><span className="text-xs sm:text-sm font-medium text-slate-700">ธนาคารผู้โอน</span>{senderBank && <Badge variant="success" size="sm" className="text-[10px] sm:text-xs">{senderBank.shortName}</Badge>}</div>
                    <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-slate-200">
                      <button type="button" onClick={() => updateSlipField('senderBankId', '')} className={cn("flex flex-col items-center p-1.5 sm:p-2 rounded-lg border-2 transition-all", !slipFormData.senderBankId ? "border-emerald-500 bg-emerald-50" : "border-transparent bg-slate-50 hover:bg-white")}>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white shadow-sm flex items-center justify-center mb-1"><span className="text-sm sm:text-base">🔄</span></div>
                        <span className="text-[8px] sm:text-[10px] font-medium text-slate-500">อัตโนมัติ</span>
                      </button>
                      {activeBanks.slice(0, 11).map((bank) => <BankButton key={bank._id} bank={bank} isSelected={slipFormData.senderBankId === bank._id} onClick={() => updateSlipField('senderBankId', bank._id)} />)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap"><span className="text-sm sm:text-base">🏦</span><span className="text-xs sm:text-sm font-medium text-slate-700">ธนาคารผู้รับ</span>{receiverBank && <Badge variant="info" size="sm" className="text-[10px] sm:text-xs">{receiverBank.shortName}</Badge>}</div>
                    <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5 sm:gap-2 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-slate-200">
                      <button type="button" onClick={() => updateSlipField('receiverBankId', '')} className={cn("flex flex-col items-center p-1.5 sm:p-2 rounded-lg border-2 transition-all", !slipFormData.receiverBankId ? "border-blue-500 bg-blue-50" : "border-transparent bg-slate-50 hover:bg-white")}>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white shadow-sm flex items-center justify-center mb-1"><span className="text-sm sm:text-base">🔄</span></div>
                        <span className="text-[8px] sm:text-[10px] font-medium text-slate-500">อัตโนมัติ</span>
                      </button>
                      {activeBanks.slice(0, 11).map((bank) => <BankButton key={bank._id} bank={bank} isSelected={slipFormData.receiverBankId === bank._id} onClick={() => updateSlipField('receiverBankId', bank._id)} />)}
                    </div>
                  </div>
                  <div className="p-3 sm:p-4 bg-blue-50 rounded-lg sm:rounded-xl border border-blue-100">
                    <p className="text-[10px] sm:text-xs text-blue-700 leading-relaxed">💡 <strong>คำแนะนำ:</strong> เลือกธนาคารเพื่อดูตัวอย่าง เมื่อใช้งานจริงระบบจะดึงข้อมูลจากสลิปอัตโนมัติ</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="xl:w-[340px] 2xl:w-[380px] flex flex-col order-2">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm xl:sticky xl:top-4">
              <div className="text-center mb-4 sm:mb-5"><h4 className="text-xs sm:text-sm font-bold text-slate-800">ตัวอย่างการแสดงผล</h4><p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">อัปเดตตามการตั้งค่าแบบเรียลไทม์</p></div>
              <div className="flex justify-center"><div className="transform scale-90 sm:scale-100 origin-top"><SlipPreview config={slipFormData} senderBank={senderBank} receiverBank={receiverBank} compact={false} /></div></div>
              <div className="hidden xl:flex flex-col gap-2 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-100">
                <Button variant="primary" fullWidth onClick={handleSlipSubmit} isLoading={isProcessing} className="h-11 sm:h-12">{selectedSlipTemplate ? '💾 บันทึกการแก้ไข' : '🚀 สร้างเทมเพลต'}</Button>
                <Button variant="ghost" fullWidth onClick={() => setShowSlipModal(false)} disabled={isProcessing} className="text-slate-500">ยกเลิก</Button>
              </div>
            </div>
          </div>
        </div>
        <div className="xl:hidden sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 sm:py-4 bg-white border-t border-slate-200 shadow-lg mt-4 sm:mt-6">
          <div className="flex flex-col gap-2 sm:gap-3 max-w-lg mx-auto">
            <Button variant="primary" fullWidth onClick={handleSlipSubmit} isLoading={isProcessing} className="h-12 sm:h-14 text-sm sm:text-base font-semibold">{selectedSlipTemplate ? '💾 บันทึกการแก้ไข' : '🚀 สร้างเทมเพลต'}</Button>
            <Button variant="outline" fullWidth onClick={() => setShowSlipModal(false)} disabled={isProcessing} className="h-10 sm:h-12 text-sm">ยกเลิก</Button>
          </div>
        </div>
      </Modal>

      {/* System Template Modal */}
      <Modal isOpen={showSystemModal} onClose={() => !isProcessing && setShowSystemModal(false)} title={`แก้ไขข้อความ: ${selectedSystemTemplate?.name || ''}`} size="fullMobile">
        <div className="flex flex-col xl:flex-row gap-5 sm:gap-6 xl:gap-8">
          <div className="flex-1 space-y-4 sm:space-y-5 order-1">
            <div className="bg-slate-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 max-h-[50vh] xl:max-h-[60vh] overflow-y-auto space-y-4">
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">📝 ข้อความ</h3>
                <Select label="รูปแบบการตอบกลับ" value={systemFormData.responseFormat} onChange={(e) => updateSystemField('responseFormat', e.target.value as 'text' | 'flex')}>
                  <option value="flex">🎨 Flex Message (แนะนำ)</option>
                  <option value="text">📝 Text Message</option>
                </Select>
                {systemFormData.responseFormat === 'flex' ? (
                  <>
                    <Input label="หัวข้อ (Title)" value={systemFormData.title} onChange={(e) => updateSystemField('title', e.target.value)} placeholder="เช่น โควต้าหมด" />
                    <Textarea label="ข้อความหลัก" value={systemFormData.mainMessage} onChange={(e) => updateSystemField('mainMessage', e.target.value)} placeholder="ข้อความที่จะแสดงในส่วนหลัก" rows={3} />
                    <Textarea label="ข้อความรอง" value={systemFormData.subMessage} onChange={(e) => updateSystemField('subMessage', e.target.value)} placeholder="ข้อความเสริม (ถ้ามี)" rows={2} />
                  </>
                ) : (
                  <Textarea label="ข้อความ" value={systemFormData.textMessage} onChange={(e) => updateSystemField('textMessage', e.target.value)} placeholder="ข้อความที่จะส่ง" rows={4} />
                )}
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">🎨 การตกแต่ง</h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg shadow-inner flex-shrink-0" style={{ backgroundColor: systemFormData.primaryColor }} />
                    <div><p className="text-sm font-medium text-slate-700">สีหลัก</p><p className="text-xs text-slate-400">{systemFormData.primaryColor}</p></div>
                  </div>
                  <input type="color" value={systemFormData.primaryColor} onChange={(e) => updateSystemField('primaryColor', e.target.value)} className="w-10 h-10 rounded-lg border-2 border-white shadow cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-2">ไอคอน</label>
                  <div className="flex flex-wrap gap-2">
                    {ICON_OPTIONS.map((icon) => (
                      <button key={icon} type="button" onClick={() => updateSystemField('icon', icon)} className={cn("w-10 h-10 rounded-lg text-lg flex items-center justify-center transition-all", systemFormData.icon === icon ? "bg-emerald-100 border-2 border-emerald-500" : "bg-slate-100 border-2 border-transparent hover:border-slate-300")}>{icon}</button>
                    ))}
                  </div>
                </div>
                <Toggle label="แสดงไอคอน" checked={systemFormData.showIcon} onChange={() => updateSystemField('showIcon', !systemFormData.showIcon)} />
              </div>
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">🔘 ปุ่มกด</h3>
                <Toggle label="แสดงปุ่มลองใหม่" checked={systemFormData.showRetryButton} onChange={() => updateSystemField('showRetryButton', !systemFormData.showRetryButton)} />
                {systemFormData.showRetryButton && <Input label="ข้อความปุ่มลองใหม่" value={systemFormData.retryButtonText} onChange={(e) => updateSystemField('retryButtonText', e.target.value)} placeholder="ลองใหม่อีกครั้ง" />}
                <Toggle label="แสดงปุ่มติดต่อ" checked={systemFormData.showContactButton} onChange={() => updateSystemField('showContactButton', !systemFormData.showContactButton)} />
                {systemFormData.showContactButton && (
                  <>
                    <Input label="ข้อความปุ่มติดต่อ" value={systemFormData.contactButtonText} onChange={(e) => updateSystemField('contactButtonText', e.target.value)} placeholder="ติดต่อผู้ดูแล" />
                    <Input label="URL ลิงก์" value={systemFormData.contactButtonUrl} onChange={(e) => updateSystemField('contactButtonUrl', e.target.value)} placeholder="https://..." />
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="xl:w-[340px] 2xl:w-[380px] flex flex-col order-2">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm xl:sticky xl:top-4">
              <div className="text-center mb-4 sm:mb-5"><h4 className="text-xs sm:text-sm font-bold text-slate-800">ตัวอย่างการแสดงผล</h4><p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">อัปเดตตามการตั้งค่าแบบเรียลไทม์</p></div>
              <div className="flex justify-center"><div className="transform scale-90 sm:scale-100 origin-top"><SystemResponsePreview config={systemFormData} template={selectedSystemTemplate} /></div></div>
              <div className="hidden xl:flex flex-col gap-2 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-100">
                <Button variant="primary" fullWidth onClick={handleSystemSubmit} isLoading={isProcessing} className="h-11 sm:h-12">💾 บันทึกการแก้ไข</Button>
                <Button variant="ghost" fullWidth onClick={() => setShowSystemModal(false)} disabled={isProcessing} className="text-slate-500">ยกเลิก</Button>
              </div>
            </div>
          </div>
        </div>
        <div className="xl:hidden sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 sm:py-4 bg-white border-t border-slate-200 shadow-lg mt-4 sm:mt-6">
          <div className="flex flex-col gap-2 sm:gap-3 max-w-lg mx-auto">
            <Button variant="primary" fullWidth onClick={handleSystemSubmit} isLoading={isProcessing} className="h-12 sm:h-14 text-sm sm:text-base font-semibold">💾 บันทึกการแก้ไข</Button>
            <Button variant="outline" fullWidth onClick={() => setShowSystemModal(false)} disabled={isProcessing} className="h-10 sm:h-12 text-sm">ยกเลิก</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal isOpen={showSlipDeleteConfirm} onClose={() => setShowSlipDeleteConfirm(false)} onConfirm={handleSlipDelete} title="ยืนยันการลบ" message={`คุณแน่ใจหรือไม่ที่จะลบเทมเพลต "${selectedSlipTemplate?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้`} confirmText="ลบเทมเพลต" cancelText="ยกเลิก" type="danger" isLoading={isProcessing} />
    </DashboardLayout>
  );
}
