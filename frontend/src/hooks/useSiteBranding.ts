'use client';

import { useState, useEffect } from 'react';
import { systemSettingsApi } from '@/lib/api';

const CACHE_KEY = 'site_branding_cache';

interface SiteBranding {
  siteLogoBase64: string;
  siteName: string;
  siteTagline: string;
}

const defaultBranding: SiteBranding = {
  siteLogoBase64: '',
  siteName: '',
  siteTagline: '',
};

function getCached(): SiteBranding {
  if (typeof window === 'undefined') return defaultBranding;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as SiteBranding;
  } catch { /* ignore */ }
  return defaultBranding;
}

export function useSiteBranding(): SiteBranding {
  const [branding, setBranding] = useState<SiteBranding>(getCached);

  useEffect(() => {
    systemSettingsApi.getSiteBranding()
      .then((res) => {
        if (res.data?.success) {
          const fresh: SiteBranding = {
            siteLogoBase64: res.data.siteLogoBase64 || '',
            siteName: res.data.siteName || '',
            siteTagline: res.data.siteTagline || '',
          };
          setBranding(fresh);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* keep cached / default */ });
  }, []);

  return branding;
}
