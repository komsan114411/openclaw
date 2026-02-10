'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Clock, Bell, ChevronLeft, ChevronRight } from 'lucide-react';

interface Announcement {
  _id: string;
  title: string;
  message?: string;
  imageUrl?: string;
  imageBase64?: string;
  linkUrl?: string;
  linkText?: string;
  displayType: 'banner' | 'popup' | 'slide';
  position: 'top' | 'center' | 'bottom';
  backgroundColor?: string;
  textColor?: string;
  allowDismiss: boolean;
  allowDismissFor7Days: boolean;
  startDate?: string;
  endDate?: string;
  targetPages?: string[];
}

// Storage keys - แยกตาม browser ของแต่ละ user
const DISMISS_7DAYS_KEY = 'dooslip_ann_7d_';
const DISMISS_SESSION_KEY = 'dooslip_ann_session_';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function AnnouncementBanner() {
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({});
  const fetchedRef = useRef(false);
  const autoSlideRef = useRef<NodeJS.Timeout | null>(null);

  // ตรวจสอบประเภทหน้า
  const isAdminPage = pathname?.startsWith('/admin');
  const isUserPage = pathname?.startsWith('/user');
  const isAuthPage = pathname?.startsWith('/auth') || pathname?.startsWith('/login') || pathname?.startsWith('/register');

  // แสดงเฉพาะหน้า user (หลังล็อกอิน)
  const shouldShow = isUserPage && !isAdminPage && !isAuthPage;

  // Mount check
  useEffect(() => {
    setMounted(true);
    return () => {
      if (autoSlideRef.current) {
        clearInterval(autoSlideRef.current);
      }
    };
  }, []);

  // ตรวจสอบว่าประกาศถูกปิดหรือยัง
  const checkDismissed = useCallback((id: string): boolean => {
    if (typeof window === 'undefined') return false;

    try {
      // ตรวจสอบ localStorage (ปิด 7 วัน)
      const stored = localStorage.getItem(`${DISMISS_7DAYS_KEY}${id}`);
      if (stored) {
        const expiry = parseInt(stored, 10);
        if (!isNaN(expiry) && Date.now() < expiry) {
          return true;
        }
        localStorage.removeItem(`${DISMISS_7DAYS_KEY}${id}`);
      }

      // ตรวจสอบ sessionStorage (ปิดชั่วคราว)
      if (sessionStorage.getItem(`${DISMISS_SESSION_KEY}${id}`) === '1') {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  // Fetch ประกาศ
  useEffect(() => {
    if (!shouldShow || !mounted || fetchedRef.current) return;

    const fetchData = async () => {
      setFetchStatus('loading');

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) {
          console.warn('NEXT_PUBLIC_API_URL not configured');
          setFetchStatus('error');
          return;
        }

        const res = await fetch(`${apiUrl}/announcements/active?page=user`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`API Error: ${res.status}`);
        }

        const data = await res.json();

        if (data.success && Array.isArray(data.announcements)) {
          // กรองประกาศที่ยังไม่ถูกปิด
          const visible = data.announcements.filter((a: Announcement) => !checkDismissed(a._id));

          setAnnouncements(visible);
          fetchedRef.current = true;
          setFetchStatus('success');

          // แสดง popup ถ้ามี
          const popup = visible.find((a: Announcement) => a.displayType === 'popup');
          if (popup) {
            setTimeout(() => setShowPopup(true), 800);
          }

          // Track views
          visible.forEach((a: Announcement) => {
            fetch(`${apiUrl}/announcements/${a._id}/view`, { method: 'POST' }).catch(() => {});
          });
        } else {
          setAnnouncements([]);
          setFetchStatus('success');
        }
      } catch (err) {
        console.error('Announcement fetch error:', err);
        setFetchStatus('error');
      }
    };

    fetchData();
  }, [shouldShow, mounted, checkDismissed]);

  // Auto-slide banners ทุก 5 วินาที
  useEffect(() => {
    const banners = announcements.filter(a => a.displayType === 'banner');
    if (banners.length <= 1) return;

    autoSlideRef.current = setInterval(() => {
      setCurrentBannerIndex(prev => (prev + 1) % banners.length);
    }, 5000);

    return () => {
      if (autoSlideRef.current) {
        clearInterval(autoSlideRef.current);
      }
    };
  }, [announcements]);

  // Handle dismiss
  const dismiss = useCallback((announcement: Announcement, sevenDays = false) => {
    try {
      if (sevenDays) {
        localStorage.setItem(`${DISMISS_7DAYS_KEY}${announcement._id}`, String(Date.now() + SEVEN_DAYS_MS));
      } else {
        sessionStorage.setItem(`${DISMISS_SESSION_KEY}${announcement._id}`, '1');
      }

      // Track dismiss (สถิติเท่านั้น)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (apiUrl) {
        fetch(`${apiUrl}/announcements/${announcement._id}/dismiss`, { method: 'POST' }).catch(() => {});
      }

      setAnnouncements(prev => prev.filter(a => a._id !== announcement._id));

      if (announcement.displayType === 'popup') {
        setShowPopup(false);
      }
    } catch (err) {
      console.error('Dismiss error:', err);
    }
  }, []);

  // Link click
  const openLink = useCallback((url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  }, []);

  // Navigation
  const goPrev = useCallback(() => {
    const count = announcements.filter(a => a.displayType === 'banner').length;
    if (count > 1) {
      setCurrentBannerIndex(prev => (prev - 1 + count) % count);
    }
  }, [announcements]);

  const goNext = useCallback(() => {
    const count = announcements.filter(a => a.displayType === 'banner').length;
    if (count > 1) {
      setCurrentBannerIndex(prev => (prev + 1) % count);
    }
  }, [announcements]);

  // Image load handler
  const handleImageLoad = useCallback((id: string) => {
    setImageLoaded(prev => ({ ...prev, [id]: true }));
  }, []);

  // ไม่แสดงถ้าไม่ใช่หน้า user หรือยังไม่ mount
  if (!shouldShow || !mounted) return null;

  // ไม่แสดงถ้าไม่มีประกาศ
  if (fetchStatus === 'success' && announcements.length === 0) return null;

  // ยังโหลดอยู่
  if (fetchStatus === 'loading' || fetchStatus === 'idle') return null;

  const banners = announcements.filter(a => a.displayType === 'banner');
  const popup = announcements.find(a => a.displayType === 'popup');
  const currentBanner = banners[currentBannerIndex] || banners[0];
  const hasImage = currentBanner && (currentBanner.imageBase64 || currentBanner.imageUrl);

  return (
    <>
      {/* Banner */}
      <AnimatePresence mode="wait">
        {banners.length > 0 && currentBanner && (
          <motion.div
            key={currentBanner._id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div
              className="relative w-full overflow-hidden"
              style={{ backgroundColor: currentBanner.backgroundColor || '#06C755' }}
            >
              {/* รูปภาพ - แสดง 100% ไม่ตัดขอบ */}
              {hasImage && (
                <div className="relative w-full">
                  <div
                    className="relative w-full flex items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: currentBanner.backgroundColor || '#06C755',
                      minHeight: '100px'
                    }}
                  >
                    {/* Loading spinner */}
                    {!imageLoaded[currentBanner._id] && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </div>
                    )}

                    {/* รูปภาพ - ใช้ contain เพื่อแสดงเต็มรูปไม่ตัดขอบ */}
                    <img
                      src={currentBanner.imageBase64 || currentBanner.imageUrl}
                      alt={currentBanner.title}
                      onLoad={() => handleImageLoad(currentBanner._id)}
                      className={`w-full h-auto transition-opacity duration-300 ${
                        imageLoaded[currentBanner._id] ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{
                        maxHeight: 'clamp(100px, 25vh, 280px)',
                        objectFit: 'contain',
                        objectPosition: 'center',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Content Bar */}
              <div
                className="w-full"
                style={{
                  backgroundColor: currentBanner.backgroundColor || '#06C755',
                  color: currentBanner.textColor || '#FFFFFF',
                }}
              >
                <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
                  <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
                    {/* ข้อความ */}
                    <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white/15 flex items-center justify-center mt-0.5 sm:mt-0">
                        <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs sm:text-sm md:text-base leading-tight line-clamp-2 sm:truncate">
                          {currentBanner.title}
                        </p>
                        {currentBanner.message && (
                          <p className="text-[10px] sm:text-xs md:text-sm opacity-85 leading-tight line-clamp-2 sm:truncate mt-0.5">
                            {currentBanner.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ปุ่ม */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                      {currentBanner.linkUrl && (
                        <button
                          onClick={() => openLink(currentBanner.linkUrl!)}
                          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 rounded-lg text-[10px] sm:text-xs md:text-sm font-medium transition-colors min-h-[36px] sm:min-h-0"
                        >
                          <span className="hidden xs:inline">{currentBanner.linkText || 'ดูเพิ่มเติม'}</span>
                          <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      )}

                      {currentBanner.allowDismiss && (
                        <div className="flex items-center gap-1">
                          {currentBanner.allowDismissFor7Days && (
                            <button
                              onClick={() => dismiss(currentBanner, true)}
                              className="hidden sm:flex items-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] font-medium transition-colors"
                            >
                              <Clock className="w-3 h-3" />
                              ปิด 7 วัน
                            </button>
                          )}
                          <button
                            onClick={() => dismiss(currentBanner, false)}
                            className="p-1.5 sm:p-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg transition-colors min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                            aria-label="ปิด"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile: 7-day dismiss option as inline text */}
                  {currentBanner.allowDismiss && currentBanner.allowDismissFor7Days && (
                    <button
                      onClick={() => dismiss(currentBanner, true)}
                      className="sm:hidden flex items-center gap-1 mx-auto mt-1.5 px-2 py-1 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg text-[10px] font-medium transition-colors"
                    >
                      <Clock className="w-3 h-3" />
                      ไม่แสดงอีก 7 วัน
                    </button>
                  )}

                  {/* Navigation dots */}
                  {banners.length > 1 && (
                    <div className="flex items-center justify-center gap-2 sm:gap-2 mt-2 sm:mt-2.5">
                      <button
                        onClick={goPrev}
                        className="p-1.5 sm:p-1 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                        aria-label="ก่อนหน้า"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5 sm:gap-1.5">
                        {banners.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentBannerIndex(i)}
                            className={`rounded-full transition-all duration-300 min-h-[8px] ${
                              i === currentBannerIndex
                                ? 'bg-white w-5 h-2 sm:h-1.5'
                                : 'bg-white/40 hover:bg-white/60 w-2 h-2 sm:w-1.5 sm:h-1.5'
                            }`}
                            aria-label={`ประกาศที่ ${i + 1}`}
                          />
                        ))}
                      </div>

                      <button
                        onClick={goNext}
                        className="p-1.5 sm:p-1 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-w-[32px] min-h-[32px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                        aria-label="ถัดไป"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popup Modal */}
      <AnimatePresence>
        {showPopup && popup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => popup.allowDismiss && dismiss(popup, false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* รูปภาพ Popup - แสดงเต็มไม่ตัดขอบ */}
              {(popup.imageBase64 || popup.imageUrl) && (
                <div
                  className="relative w-full flex items-center justify-center"
                  style={{
                    backgroundColor: popup.backgroundColor || '#f1f5f9',
                    minHeight: '120px'
                  }}
                >
                  {!imageLoaded[popup._id] && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    </div>
                  )}
                  <img
                    src={popup.imageBase64 || popup.imageUrl}
                    alt={popup.title}
                    onLoad={() => handleImageLoad(popup._id)}
                    className={`w-full h-auto transition-opacity duration-300 ${
                      imageLoaded[popup._id] ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{
                      maxHeight: 'clamp(150px, 32vh, 320px)',
                      objectFit: 'contain',
                      objectPosition: 'center',
                    }}
                  />
                </div>
              )}

              {/* Content */}
              <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
                    {popup.title}
                  </h3>
                  {popup.message && (
                    <p className="mt-1.5 sm:mt-2 text-slate-600 text-xs sm:text-sm leading-relaxed break-words">
                      {popup.message}
                    </p>
                  )}
                </div>

                {popup.endDate && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                    <Clock className="w-3 h-3" />
                    ถึง {new Date(popup.endDate).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  {popup.linkUrl && (
                    <button
                      onClick={() => openLink(popup.linkUrl!)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:from-emerald-700 active:to-teal-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20"
                    >
                      {popup.linkText || 'ดูเพิ่มเติม'}
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}

                  {popup.allowDismiss && (
                    <div className="flex gap-2">
                      {popup.allowDismissFor7Days && (
                        <button
                          onClick={() => dismiss(popup, true)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 rounded-xl text-xs sm:text-sm font-medium transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                          ปิด 7 วัน
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(popup, false)}
                        className="flex-1 flex items-center justify-center px-3 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 rounded-xl text-xs sm:text-sm font-medium transition-colors"
                      >
                        ปิด
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Close button */}
              {popup.allowDismiss && (
                <button
                  onClick={() => dismiss(popup, false)}
                  className="absolute top-2 right-2 sm:top-3 sm:right-3 p-2 min-w-[40px] min-h-[40px] bg-black/5 hover:bg-black/10 active:bg-black/20 rounded-full text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-center"
                  aria-label="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
