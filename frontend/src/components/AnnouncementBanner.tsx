'use client';

import { useState, useEffect, useCallback } from 'react';
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

const STORAGE_KEY_PREFIX = 'announcement_dismissed_';
const SESSION_KEY_PREFIX = 'announcement_session_';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function AnnouncementBanner() {
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Check page type
  const isAdminPage = pathname?.startsWith('/admin');
  const isUserPage = pathname?.startsWith('/user');
  const isAuthPage = pathname?.startsWith('/auth') || pathname?.startsWith('/login') || pathname?.startsWith('/register');

  // Only show on user pages (after login)
  const shouldShowAnnouncements = isUserPage && !isAdminPage && !isAuthPage;

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isDismissed = useCallback((announcementId: string): boolean => {
    if (typeof window === 'undefined') return false;

    const dismissedUntil = localStorage.getItem(`${STORAGE_KEY_PREFIX}${announcementId}`);
    if (dismissedUntil) {
      const dismissedTime = parseInt(dismissedUntil, 10);
      if (Date.now() < dismissedTime) return true;
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${announcementId}`);
    }

    const sessionDismissed = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${announcementId}`);
    if (sessionDismissed) return true;

    return false;
  }, []);

  useEffect(() => {
    if (!shouldShowAnnouncements || !isClient) return;

    const fetchAnnouncements = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await fetch(`${apiUrl}/announcements/active?page=user`);
        const data = await response.json();

        if (data.success && data.announcements?.length > 0) {
          const filtered = data.announcements.filter((a: Announcement) => !isDismissed(a._id));
          setAnnouncements(filtered);

          const hasPopup = filtered.some((a: Announcement) => a.displayType === 'popup');
          if (hasPopup) {
            setTimeout(() => setShowPopup(true), 500);
          }

          filtered.forEach((a: Announcement) => {
            fetch(`${apiUrl}/announcements/${a._id}/view`, { method: 'POST' }).catch(() => {});
          });
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };

    fetchAnnouncements();
  }, [pathname, shouldShowAnnouncements, isClient, isDismissed]);

  const handleDismiss = useCallback((announcement: Announcement, forSevenDays = false) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${apiUrl}/announcements/${announcement._id}/dismiss`, { method: 'POST' }).catch(() => {});

    if (forSevenDays) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${announcement._id}`, String(Date.now() + SEVEN_DAYS_MS));
    } else {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${announcement._id}`, 'true');
    }

    setAnnouncements(prev => prev.filter(a => a._id !== announcement._id));

    if (announcement.displayType === 'popup') {
      setShowPopup(false);
    }
  }, []);

  const handleLinkClick = useCallback((url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  }, []);

  const nextBanner = useCallback(() => {
    const banners = announcements.filter(a => a.displayType === 'banner');
    setCurrentBannerIndex(prev => (prev + 1) % banners.length);
  }, [announcements]);

  const prevBanner = useCallback(() => {
    const banners = announcements.filter(a => a.displayType === 'banner');
    setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length);
  }, [announcements]);

  if (!shouldShowAnnouncements || !isClient || announcements.length === 0) {
    return null;
  }

  const bannerAnnouncements = announcements.filter(a => a.displayType === 'banner');
  const popupAnnouncement = announcements.find(a => a.displayType === 'popup');
  const currentBanner = bannerAnnouncements[currentBannerIndex];

  return (
    <>
      {/* Banner Type */}
      <AnimatePresence>
        {bannerAnnouncements.length > 0 && currentBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative w-full"
          >
            {/* Image Banner */}
            {(currentBanner.imageBase64 || currentBanner.imageUrl) ? (
              <div
                className="relative w-full"
                style={{ backgroundColor: currentBanner.backgroundColor || '#06C755' }}
              >
                {/* Image Container - Responsive sizing */}
                <div className="relative w-full flex items-center justify-center">
                  <img
                    src={currentBanner.imageBase64 || currentBanner.imageUrl}
                    alt={currentBanner.title}
                    className="w-full h-auto object-scale-down"
                    style={{
                      maxHeight: 'min(280px, 35vh)',
                      backgroundColor: currentBanner.backgroundColor || '#06C755'
                    }}
                  />
                </div>

                {/* Content Bar at Bottom */}
                <div
                  className="w-full px-4 py-3"
                  style={{
                    backgroundColor: currentBanner.backgroundColor || '#06C755',
                    color: currentBanner.textColor || '#FFFFFF'
                  }}
                >
                  <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    {/* Title & Message */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm sm:text-base truncate">
                          {currentBanner.title}
                        </p>
                        {currentBanner.message && (
                          <p className="text-xs sm:text-sm opacity-90 truncate">
                            {currentBanner.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {currentBanner.linkUrl && (
                        <button
                          onClick={() => handleLinkClick(currentBanner.linkUrl!)}
                          className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors"
                        >
                          {currentBanner.linkText || 'ดูเพิ่มเติม'}
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}

                      {currentBanner.allowDismiss && (
                        <div className="flex items-center gap-1.5">
                          {currentBanner.allowDismissFor7Days && (
                            <button
                              onClick={() => handleDismiss(currentBanner, true)}
                              className="hidden sm:flex items-center gap-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              ปิด 7 วัน
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(currentBanner, false)}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                            title="ปิด"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Navigation Dots */}
                  {bannerAnnouncements.length > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <button
                        onClick={prevBanner}
                        className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1.5">
                        {bannerAnnouncements.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentBannerIndex(idx)}
                            className={`h-2 rounded-full transition-all ${
                              idx === currentBannerIndex
                                ? 'bg-white w-6'
                                : 'bg-white/40 hover:bg-white/60 w-2'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={nextBanner}
                        className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Text-only Banner */
              <div
                className="w-full"
                style={{
                  backgroundColor: currentBanner.backgroundColor || '#06C755',
                  color: currentBanner.textColor || '#FFFFFF'
                }}
              >
                <div className="max-w-7xl mx-auto px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <Bell className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base sm:text-lg">
                          {currentBanner.title}
                        </p>
                        {currentBanner.message && (
                          <p className="text-sm opacity-90 line-clamp-2">
                            {currentBanner.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {currentBanner.linkUrl && (
                        <button
                          onClick={() => handleLinkClick(currentBanner.linkUrl!)}
                          className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-semibold transition-colors"
                        >
                          {currentBanner.linkText || 'ดูเพิ่มเติม'}
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}

                      {currentBanner.allowDismiss && (
                        <div className="flex items-center gap-1.5">
                          {currentBanner.allowDismissFor7Days && (
                            <button
                              onClick={() => handleDismiss(currentBanner, true)}
                              className="hidden sm:flex items-center gap-1 px-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-medium transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              ปิด 7 วัน
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(currentBanner, false)}
                            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                            title="ปิด"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Navigation Dots for Text Banner */}
                  {bannerAnnouncements.length > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <button
                        onClick={prevBanner}
                        className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1.5">
                        {bannerAnnouncements.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentBannerIndex(idx)}
                            className={`h-2 rounded-full transition-all ${
                              idx === currentBannerIndex
                                ? 'bg-white w-6'
                                : 'bg-white/40 hover:bg-white/60 w-2'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={nextBanner}
                        className="p-1 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popup Type */}
      <AnimatePresence>
        {showPopup && popupAnnouncement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => popupAnnouncement.allowDismiss && handleDismiss(popupAnnouncement, false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image - Full display without cropping */}
              {(popupAnnouncement.imageBase64 || popupAnnouncement.imageUrl) && (
                <div
                  className="relative w-full flex items-center justify-center"
                  style={{ backgroundColor: popupAnnouncement.backgroundColor || '#f8fafc' }}
                >
                  <img
                    src={popupAnnouncement.imageBase64 || popupAnnouncement.imageUrl}
                    alt={popupAnnouncement.title}
                    className="w-full h-auto object-scale-down"
                    style={{ maxHeight: 'min(320px, 40vh)' }}
                  />
                </div>
              )}

              {/* Content */}
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{popupAnnouncement.title}</h3>
                  {popupAnnouncement.message && (
                    <p className="mt-2 text-slate-600 text-sm leading-relaxed">
                      {popupAnnouncement.message}
                    </p>
                  )}
                </div>

                {popupAnnouncement.endDate && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      ถึงวันที่ {new Date(popupAnnouncement.endDate).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3 pt-2">
                  {popupAnnouncement.linkUrl && (
                    <button
                      onClick={() => handleLinkClick(popupAnnouncement.linkUrl!)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-2xl font-semibold transition-all shadow-lg shadow-emerald-500/25"
                    >
                      {popupAnnouncement.linkText || 'ดูเพิ่มเติม'}
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}

                  {popupAnnouncement.allowDismiss && (
                    <div className="flex gap-2">
                      {popupAnnouncement.allowDismissFor7Days && (
                        <button
                          onClick={() => handleDismiss(popupAnnouncement, true)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-medium text-sm transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                          ปิด 7 วัน
                        </button>
                      )}
                      <button
                        onClick={() => handleDismiss(popupAnnouncement, false)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-medium text-sm transition-colors"
                      >
                        ปิด
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Close button */}
              {popupAnnouncement.allowDismiss && (
                <button
                  onClick={() => handleDismiss(popupAnnouncement, false)}
                  className="absolute top-4 right-4 p-2 bg-black/5 hover:bg-black/10 rounded-full text-slate-500 hover:text-slate-700 transition-colors"
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
