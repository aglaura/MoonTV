'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { UiLocale } from '@/lib/home.types';
import { convertToTraditional } from '@/lib/locale';

export const useHomeAnnouncement = (
  announcement: string | null | undefined,
  uiLocale: UiLocale
) => {
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !announcement) return;
    const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
    if (hasSeenAnnouncement !== announcement) {
      setShowAnnouncement(true);
    } else {
      setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
    }
  }, [announcement]);

  const handleCloseAnnouncement = useCallback((announcementStr: string) => {
    setShowAnnouncement(false);
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('hasSeenAnnouncement', announcementStr);
    } catch {
      // ignore storage failures
    }
  }, []);

  const formattedAnnouncement = useMemo(() => {
    if (!announcement) return '';
    if (uiLocale === 'zh-Hant') {
      return convertToTraditional(announcement);
    }
    return announcement;
  }, [announcement, uiLocale]);

  return { showAnnouncement, handleCloseAnnouncement, formattedAnnouncement };
};
