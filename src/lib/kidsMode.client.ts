'use client';

import { useEffect, useMemo, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from './auth';

const ALLOW_KEYWORDS = [
  'kids',
  'kid',
  'family',
  'cartoon',
  'animation',
  'anime',
  'animated',
  '童',
  '儿童',
  '少儿',
  '卡通',
  '动画',
  '動漫',
  '動畫',
  '親子',
  '家庭',
];

const BLOCK_KEYWORDS = [
  '恐怖',
  '惊悚',
  '驚悚',
  '血腥',
  '暴力',
  '限制',
  '成人',
  '情色',
  '色情',
  'r级',
  'r18',
  '激情',
  '黑帮',
  '黑幫',
  '犯罪',
  'thriller',
  'horror',
  'violent',
  'violence',
  'adult',
  'erotic',
  'sex',
  'nude',
  'crime',
];

const buildStorageKey = (username?: string | null) =>
  username && username.trim().length > 0
    ? `kidsMode:${username.trim()}`
    : 'kidsMode';

export function isKidSafeContent(input?: {
  title?: string;
  desc?: string;
  type?: string;
}): boolean {
  const text = `${input?.title || ''} ${input?.desc || ''}`.toLowerCase();
  if (!text.trim()) return false;

  for (const blocked of BLOCK_KEYWORDS) {
    if (text.includes(blocked)) {
      return false;
    }
  }

  if (
    (input?.type || '').toLowerCase() === 'anime' ||
    ALLOW_KEYWORDS.some((k) => text.includes(k))
  ) {
    return true;
  }

  return false;
}

export function useKidsMode() {
  const username = useMemo(() => {
    try {
      return getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      return null;
    }
  }, []);
  const storageKey = useMemo(() => buildStorageKey(username), [username]);
  const [isKidsMode, setIsKidsMode] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      setIsKidsMode(stored === 'true');
    } catch {
      setIsKidsMode(false);
    } finally {
      setReady(true);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setIsKidsMode(event.newValue === 'true');
      }
    };
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail?.key === storageKey && typeof detail?.value === 'boolean') {
        setIsKidsMode(detail.value);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('kidsModeChanged', handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('kidsModeChanged', handleCustom as EventListener);
    };
  }, [storageKey]);

  const update = (value: boolean) => {
    try {
      localStorage.setItem(storageKey, value ? 'true' : 'false');
      window.dispatchEvent(
        new CustomEvent('kidsModeChanged', {
          detail: { key: storageKey, value },
        })
      );
    } catch {
      // ignore storage errors
    }
    setIsKidsMode(value);
  };

  const enableKidsMode = () => update(true);
  const disableKidsMode = () => update(false);
  const toggleKidsMode = () => update(!isKidsMode);

  return {
    isKidsMode,
    ready,
    enableKidsMode,
    disableKidsMode,
    toggleKidsMode,
  };
}
