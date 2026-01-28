'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface FloatingContactSettings {
  enabled: boolean;
  url: string;
  iconUrl: string;
  iconBase64: string;
  size: number;
  bottom: number;
  right: number;
  tooltip: string;
  bgColor: string;
  showOnMobile: boolean;
}

export function FloatingContactButton() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<FloatingContactSettings | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showTooltipMobile, setShowTooltipMobile] = useState(false);

  useEffect(() => {
    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Fetch settings
    const fetchSettings = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await fetch(`${apiUrl}/system-settings/floating-contact`);
        const data = await response.json();

        if (data.success && data.enabled) {
          setSettings(data);
        }
      } catch (error) {
        console.error('Failed to fetch floating contact settings:', error);
      }
    };

    fetchSettings();

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Don't render on admin pages
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  // Don't render if not enabled or no settings
  if (!settings || !settings.enabled) {
    return null;
  }

  // Don't render if no URL
  if (!settings.url) {
    return null;
  }

  const iconSrc = settings.iconBase64 || settings.iconUrl;
  const hasCustomIcon = !!iconSrc;

  // Responsive sizing
  const buttonSize = isMobile ? Math.min(settings.size, 52) : settings.size;
  const bottomPosition = isMobile ? 20 : settings.bottom;
  const rightPosition = isMobile ? 16 : settings.right;

  const handleClick = () => {
    if (settings.url) {
      // Handle different URL types
      if (settings.url.startsWith('tel:')) {
        window.location.href = settings.url;
      } else if (settings.url.startsWith('line://') || settings.url.includes('line.me')) {
        window.location.href = settings.url;
      } else {
        window.open(settings.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleMobileTouch = () => {
    if (isMobile && settings.tooltip) {
      setShowTooltipMobile(true);
      setTimeout(() => setShowTooltipMobile(false), 2000);
    }
  };

  return (
    <div
      className="fixed z-[9999]"
      style={{
        bottom: `${bottomPosition}px`,
        right: `${rightPosition}px`,
      }}
    >
      {/* Tooltip */}
      <AnimatePresence>
        {((isHovered && !isMobile) || showTooltipMobile) && settings.tooltip && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.9 }}
            className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none"
          >
            <div className="bg-gray-900/95 backdrop-blur-sm text-white text-sm px-4 py-2.5 rounded-xl shadow-xl border border-white/10">
              {settings.tooltip}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rotate-45 w-2.5 h-2.5 bg-gray-900/95 border-r border-t border-white/10" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pulse ring effect */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          backgroundColor: settings.bgColor,
          width: buttonSize,
          height: buttonSize,
        }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.4, 0, 0.4],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Main button */}
      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleMobileTouch}
        className="relative rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all duration-300 hover:shadow-3xl active:scale-95 focus:outline-none focus:ring-4 focus:ring-white/30"
        style={{
          width: `${buttonSize}px`,
          height: `${buttonSize}px`,
          backgroundColor: settings.bgColor,
          boxShadow: `0 8px 32px ${settings.bgColor}50, 0 4px 16px rgba(0,0,0,0.2)`,
        }}
        whileHover={{ scale: 1.08, y: -2 }}
        whileTap={{ scale: 0.92 }}
        initial={{ opacity: 0, scale: 0, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 20,
          delay: 0.5
        }}
        aria-label={settings.tooltip || 'ติดต่อแอดมิน'}
      >
        {hasCustomIcon ? (
          <img
            src={iconSrc}
            alt={settings.tooltip || 'Contact'}
            className="rounded-full object-cover"
            style={{
              width: `${buttonSize - 8}px`,
              height: `${buttonSize - 8}px`,
            }}
            draggable={false}
          />
        ) : (
          // Default LINE-style chat icon
          <svg
            viewBox="0 0 24 24"
            fill="white"
            style={{
              width: `${buttonSize * 0.5}px`,
              height: `${buttonSize * 0.5}px`,
            }}
          >
            <path d="M12 2C6.48 2 2 5.58 2 10c0 2.03.94 3.89 2.5 5.29V20l3.88-2.13c1.09.27 2.28.41 3.62.41 5.52 0 10-3.58 10-8s-4.48-8-10-8zm-3 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
          </svg>
        )}

        {/* Shine effect on hover */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/0 via-white/20 to-white/0 pointer-events-none"
          initial={{ opacity: 0, rotate: -45 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      </motion.button>
    </div>
  );
}
