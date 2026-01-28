'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Clock, Bell } from 'lucide-react';

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
}

const STORAGE_KEY_PREFIX = 'announcement_dismissed_';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function AnnouncementBanner() {
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [showPopup, setShowPopup] = useState(false);

  // Don't show on admin pages
  const isAdminPage = pathname?.startsWith('/admin');

  useEffect(() => {
    if (isAdminPage) return;

    const fetchAnnouncements = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const page = pathname?.startsWith('/user') ? 'user' : 'public';
        const response = await fetch(`${apiUrl}/announcements/active?page=${page}`);
        const data = await response.json();

        if (data.success && data.announcements?.length > 0) {
          // Filter out dismissed announcements
          const filteredAnnouncements = data.announcements.filter((a: Announcement) => {
            const dismissedUntil = localStorage.getItem(`${STORAGE_KEY_PREFIX}${a._id}`);
            if (dismissedUntil) {
              const dismissedTime = parseInt(dismissedUntil, 10);
              if (Date.now() < dismissedTime) {
                return false;
              }
              // Expired, remove from storage
              localStorage.removeItem(`${STORAGE_KEY_PREFIX}${a._id}`);
            }
            return true;
          });

          setAnnouncements(filteredAnnouncements);

          // Show popup if any announcement is popup type
          const hasPopup = filteredAnnouncements.some((a: Announcement) => a.displayType === 'popup');
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
  }, [pathname, isAdminPage]);

  const handleDismiss = (announcement: Announcement, forSevenDays = false) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${apiUrl}/announcements/${announcement._id}/dismiss`, { method: 'POST' }).catch(() => {});

    if (forSevenDays) {
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${announcement._id}`,
        String(Date.now() + SEVEN_DAYS_MS)
      );
    } else {
      // Dismiss for session only - use sessionStorage
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${announcement._id}`, 'true');
    }

    // Remove from current list
    setAnnouncements(prev => prev.filter(a => a._id !== announcement._id));

    if (announcement.displayType === 'popup') {
      setShowPopup(false);
    }
  };

  const handleLinkClick = (url: string) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  };

  if (isAdminPage || announcements.length === 0) {
    return null;
  }

  const currentAnnouncement = announcements[currentIndex];
  const bannerAnnouncements = announcements.filter(a => a.displayType === 'banner');
  const popupAnnouncement = announcements.find(a => a.displayType === 'popup');
  const imageSrc = currentAnnouncement?.imageBase64 || currentAnnouncement?.imageUrl;

  return (
    <>
      {/* Banner Type */}
      <AnimatePresence>
        {bannerAnnouncements.length > 0 && isVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative overflow-hidden"
          >
            {bannerAnnouncements.map((announcement, index) => (
              <div
                key={announcement._id}
                className={`relative ${index !== 0 ? 'hidden' : ''}`}
                style={{
                  backgroundColor: announcement.backgroundColor || '#06C755',
                  color: announcement.textColor || '#FFFFFF',
                }}
              >
                {/* Background Image */}
                {(announcement.imageBase64 || announcement.imageUrl) && (
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={announcement.imageBase64 || announcement.imageUrl}
                      alt=""
                      className="w-full h-full object-cover opacity-20"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/50" />
                  </div>
                )}

                <div className="relative max-w-7xl mx-auto px-4 py-3 sm:py-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Content */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm sm:text-base truncate">
                          {announcement.title}
                        </p>
                        {announcement.message && (
                          <p className="text-xs sm:text-sm opacity-90 truncate">
                            {announcement.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {announcement.linkUrl && (
                        <button
                          onClick={() => handleLinkClick(announcement.linkUrl!)}
                          className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
                        >
                          {announcement.linkText || 'ดูเพิ่มเติม'}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}

                      {announcement.allowDismiss && (
                        <div className="flex items-center gap-1">
                          {announcement.allowDismissFor7Days && (
                            <button
                              onClick={() => handleDismiss(announcement, true)}
                              className="hidden sm:flex items-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-medium transition-colors"
                            >
                              <Clock className="w-3 h-3" />
                              ปิด 7 วัน
                            </button>
                          )}
                          <button
                            onClick={() => handleDismiss(announcement, false)}
                            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar for multiple announcements */}
                {bannerAnnouncements.length > 1 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                    <div className="h-full bg-white/60 transition-all duration-300" style={{ width: `${((index + 1) / bannerAnnouncements.length) * 100}%` }} />
                  </div>
                )}
              </div>
            ))}
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
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => popupAnnouncement.allowDismiss && handleDismiss(popupAnnouncement, false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image */}
              {(popupAnnouncement.imageBase64 || popupAnnouncement.imageUrl) && (
                <div className="relative w-full aspect-[16/9] overflow-hidden">
                  <img
                    src={popupAnnouncement.imageBase64 || popupAnnouncement.imageUrl}
                    alt={popupAnnouncement.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                </div>
              )}

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">{popupAnnouncement.title}</h3>
                    {popupAnnouncement.message && (
                      <p className="mt-2 text-slate-400 text-sm leading-relaxed">
                        {popupAnnouncement.message}
                      </p>
                    )}
                  </div>
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
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#06C755] hover:bg-[#05B048] text-white rounded-xl font-semibold transition-colors"
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
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-sm transition-colors"
                        >
                          <Clock className="w-4 h-4" />
                          ปิด 7 วัน
                        </button>
                      )}
                      <button
                        onClick={() => handleDismiss(popupAnnouncement, false)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-sm transition-colors"
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
                  className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white/80 hover:text-white transition-colors"
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
