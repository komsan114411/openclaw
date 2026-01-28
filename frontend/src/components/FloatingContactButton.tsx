'use client';

import { useState, useEffect } from 'react';
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
  const [settings, setSettings] = useState<FloatingContactSettings | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  // Don't render if not enabled or no settings
  if (!settings || !settings.enabled) {
    return null;
  }

  // Don't render on mobile if disabled
  if (isMobile && !settings.showOnMobile) {
    return null;
  }

  // Don't render if no URL
  if (!settings.url) {
    return null;
  }

  const iconSrc = settings.iconBase64 || settings.iconUrl;
  const hasCustomIcon = !!iconSrc;

  const handleClick = () => {
    if (settings.url) {
      window.open(settings.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="fixed z-50"
      style={{
        bottom: `${settings.bottom}px`,
        right: `${settings.right}px`,
      }}
    >
      <AnimatePresence>
        {isHovered && settings.tooltip && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap"
          >
            <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg">
              {settings.tooltip}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rotate-45 w-2 h-2 bg-gray-900" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95"
        style={{
          width: `${settings.size}px`,
          height: `${settings.size}px`,
          backgroundColor: settings.bgColor,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        {hasCustomIcon ? (
          <img
            src={iconSrc}
            alt={settings.tooltip || 'Contact'}
            className="rounded-full object-cover"
            style={{
              width: `${settings.size - 8}px`,
              height: `${settings.size - 8}px`,
            }}
          />
        ) : (
          // Default chat icon
          <svg
            viewBox="0 0 24 24"
            fill="white"
            style={{
              width: `${settings.size * 0.5}px`,
              height: `${settings.size * 0.5}px`,
            }}
          >
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
            <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
          </svg>
        )}
      </motion.button>

      {/* Pulse animation ring */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          backgroundColor: settings.bgColor,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
