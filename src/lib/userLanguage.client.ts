import { useEffect, useMemo, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from './auth';

const normalizeLocale = (raw?: string | null): string => {
  const val = (raw || '').toLowerCase();
  if (val.startsWith('zh-hant') || val.startsWith('zh-tw') || val.startsWith('zh-hk')) {
    return 'zh-Hant';
  }
  if (val.startsWith('zh-hans') || val.startsWith('zh-cn') || val === 'zh') {
    return 'zh-Hans';
  }
  return 'en';
};

// Define TypeScript interfaces for better type safety
interface LanguageResponse {
  locale: string;
}

interface ErrorData {
  error?: string;
}

const getStorageKey = (username?: string | null) =>
  username && username.trim().length > 0
    ? `userLocale:${username.trim()}`
    : 'userLocale';

// Client-side hook for managing user language preferences (per-user)
export function useUserLanguage() {
  const username = useMemo(() => {
    try {
      return getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      return null;
    }
  }, []);
  const storageKey = useMemo(() => getStorageKey(username), [username]);
  const [userLocale, setUserLocale] = useState<string | null>(() => {
    try {
      const saved =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(storageKey)
          : null;
      if (saved) return normalizeLocale(saved);
      if (typeof navigator !== 'undefined') {
        return normalizeLocale(navigator.language || '');
      }
    } catch {
      // ignore
    }
    return 'en';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user's language preference
  useEffect(() => {
    const loadUserLanguage = async () => {
      try {
        setLoading(true);

        // Prefer locally saved locale first (works even before login)
        try {
          const savedLocale = localStorage.getItem(storageKey);
          if (savedLocale) {
              const normalized = normalizeLocale(savedLocale);
              setUserLocale(normalized);
              setLoading(false);
              return;
          }
        } catch {
          // ignore localStorage failures
        }

        const response = await fetch('/api/change-language');

        // Not logged in: keep local/previous selection without showing errors
        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to load user language preference');
        }

        const data: LanguageResponse = await response.json();
        setUserLocale(normalizeLocale(data.locale));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadUserLanguage();
  }, [storageKey]);

  // Function to change user's language preference
  const changeLanguage = async (locale: string) => {
    try {
      setError(null);
      
      const response = await fetch('/api/change-language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locale }),
      });

      // Not logged in: fall back to local selection
      if (response.status === 401) {
        setUserLocale(normalizeLocale(locale));
        localStorage.setItem(storageKey, locale);
        window.location.reload();
        return;
      }

      if (!response.ok) {
        const errorData: ErrorData = await response.json();
        throw new Error(errorData.error || 'Failed to change language');
      }

      // Update local state
      setUserLocale(normalizeLocale(locale));
      
      // Persist the language preference locally
      localStorage.setItem(storageKey, locale);
      
      // Reload the page to apply the new locale
      // This is needed because next-intl uses server-side locale detection
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  // Check localStorage for a saved preference on initial load
  useEffect(() => {
    const savedLocale = localStorage.getItem(storageKey);
    if (savedLocale) {
      setUserLocale(normalizeLocale(savedLocale));
    }
  }, [storageKey]);

  return {
    userLocale,
    changeLanguage,
    loading,
    error,
  };
}
