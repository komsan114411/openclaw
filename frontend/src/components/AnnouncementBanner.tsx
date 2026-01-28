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

  // Only show on user pages (after login), not on admin, auth, or public pages
  const shouldShowAnnouncements = isUserPage && !isAdminPage && !isAuthPage;

  // Set client-side flag
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if announcement is dismissed
  const isDismissed = useCallback((announcementId: string): boolean => {
    if (typeof window === 'undefined') return false;

    // Check localStorage for 7-day dismiss
    const dismissedUntil = localStorage.getItem(`${STORAGE_KEY_PREFIX}${announcementId}`);
    if (dismissedUntil) {
      const dismissedTime = parseInt(dismissedUntil, 10);
      if (Date.now() < dismissedTime) {
        return true;
      }
      // Expired, remove from storage
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${announcementId}`);
    }

    // Check sessionStorage for session dismiss
    const sessionDismissed = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${announcementId}`);
    if (sessionDismissed) {
      return true;
    }

    return false;
  }, []);

  // Fetch announcements
  useEffect(() => {
    if (!shouldShowAnnouncements || !isClient) return;

    const fetchAnnouncements = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        // Always request 'user' page type since we only show on user pages
        const response = await fetch(`${apiUrl}/announcements/active?page=user`);
        const data = await response.json();

        if (data.success && data.announcements?.length > 0) {
          // Filter out dismissed announcements
          const filteredAnnouncements = data.announcements.filter(
            (a: Announcement) => !isDismissed(a._id)
          );

          setAnnouncements(filteredAnnouncements);

          // Show popup if any announcement is popup type
          const hasPopup = filteredAnnouncements.some(
            (a: Announcement) => a.displayType === 'popup'
          );
          if (hasPopup) {
            setTimeout(() => setShowPopup(true), 500);
          }

          // Track view for each announcement
          filteredAnnouncements.forEach((a: Announcement) => {
            fetch(`${apiUrl}/announcements/${a._id}/view`, { method: 'POST' }).catch(() => {});
          });
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };

    fetchAnnouncements();
  }, [pathname, shouldShowAnnouncements, isClient, isDismissed]);

  // Handle dismiss
  const handleDismiss = useCallback((announcement: Announcement, forSevenDays = false) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${apiUrl}/announcements/${announcement._id}/dismiss`, { method: 'POST' }).catch(() => {});

    if (forSevenDays) {
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${announcement._id}`,
        String(Date.now() + SEVEN_DAYS_MS)
      );
    } else {
      // Dismiss for session only
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${announcement._id}`, 'true');
    }

    // Remove from current list
    setAnnouncements(prev => prev.filter(a => a._id !== announcement._id));

    if (announcement.displayType === 'popup') {
      setShowPopup(false);
    }
  }, []);

  // Handle link click
  const handleLinkClick = useCallback((url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  }, []);

  // Navigate banners
  const nextBanner = useCallback(() => {
    const banners = announcements.filter(a => a.displayType === 'banner');
    setCurrentBannerIndex(prev => (prev + 1) % banners.length);
  }, [announcements]);

  const prevBanner = useCallback(() => {
    const banners = announcements.filter(a => a.displayType === 'banner');
    setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length);
  }, [announcements]);

  // Don't render on non-user pages or if no announcements
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
            <div
              className="relative w-full"
              style={{
                backgroundColor: currentBanner.backgroundColor || '#06C755',
                color: currentBanner.textColor || '#FFFFFF',
              }}
            >
              {/* If has image, show image-focused banner */}
              {(currentBanner.imageBase64 || currentBanner.imageUrl) ? (
                <div className="relative">
                  {/* Full width image container */}
                  <div className="relative w-full">
                    <img
                      src={currentBanner.imageBase64 || currentBanner.imageUrl}
                      alt={currentBanner.title}
                      className="w-full h-auto max-h-[200px] sm:max-h-[250px] object-contain"
                      style={{ backgroundColor: currentBanner.backgroundColor || '#06C755' }}
                    />

                    {/* Overlay gradient for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* Content overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm sm:text-base text-white drop-shadow-md">
                              {currentBanner.title}
                            </p>
                            {currentBanner.message && (
                              <p className="text-xs sm:text-sm text-white/90 truncate drop-shadow-md">
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
                              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-sm font-semibold transition-colors"
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
                                  className="hidden sm:flex items-center gap-1 px-3 py-2 bg-black/30 hover:bg-black/40 backdrop-blur-sm rounded-lg text-xs font-medium transition-colors"
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  ปิด 7 วัน
                                </button>
                              )}
                              <button
                                onClick={() => handleDismiss(currentBanner, false)}
                                className="p-2 bg-black/30 hover:bg-black/40 backdrop-blur-sm rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4 sm:w-5 sm:h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Navigation for multiple banners */}
                  {bannerAnnouncements.length > 1 && (
                    <>
                      <button
                        onClick={prevBanner}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={nextBanner}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>

                      {/* Dots indicator */}
                      <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                        {bannerAnnouncements.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentBannerIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              idx === currentBannerIndex
                                ? 'bg-white w-4'
                                : 'bg-white/50 hover:bg-white/70'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Text-only banner */
                <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm sm:text-base">
                          {currentBanner.title}
                        </p>
                        {currentBanner.message && (
                          <p className="text-xs sm:text-sm opacity-90 truncate">
                            {currentBanner.message}
                          </p>
                        )}
                      </div>
                    </div>

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
                          >
                            <X className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Navigation dots for text-only */}
                  {bannerAnnouncements.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                      {bannerAnnouncements.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentBannerIndex(idx)}
                          className={`w-1.5 h-1.5 rounded-full transition-all ${
                            idx === currentBannerIndex
                              ? 'bg-white w-3'
                              : 'bg-white/50 hover:bg-white/70'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
              className="relative w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image - show full image without cropping */}
              {(popupAnnouncement.imageBase64 || popupAnnouncement.imageUrl) && (
                <div
                  className="relative w-full"
                  style={{ backgroundColor: popupAnnouncement.backgroundColor || '#f1f5f9' }}
                >
                  <img
                    src={popupAnnouncement.imageBase64 || popupAnnouncement.imageUrl}
                    alt={popupAnnouncement.title}
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
              )}

              {/* Content */}
              <div className="p-5 sm:p-6 space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{popupAnnouncement.title}</h3>
                  {popupAnnouncement.message && (
                    <p className="mt-2 text-slate-600 text-sm leading-relaxed">
                      {popupAnnouncement.message}
                    </p>
                  )}
                </div>

                {/* End date info */}
                {popupAnnouncement.endDate && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    ถึงวันที่ {new Date(popupAnnouncement.endDate).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {popupAnnouncement.linkUrl && (
                    <button
                      onClick={() => handleLinkClick(popupAnnouncement.linkUrl!)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#06C755] hover:bg-[#05B048] text-white rounded-xl font-semibold transition-colors shadow-lg shadow-emerald-500/20"
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
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium text-sm transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                          ปิด 7 วัน
                        </button>
                      )}
                      <button
                        onClick={() => handleDismiss(popupAnnouncement, false)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-medium text-sm transition-colors"
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
                  className="absolute top-3 right-3 p-2 bg-black/10 hover:bg-black/20 rounded-full text-slate-600 hover:text-slate-800 transition-colors"
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
