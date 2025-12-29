import { useState, useEffect } from 'react';

// Client-side hook for managing user language preferences
export function useUserLanguage() {
  const [userLocale, setUserLocale] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user's language preference
  useEffect(() => {
    const loadUserLanguage = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/change-language');
        if (!response.ok) {
          throw new Error('Failed to load user language preference');
        }
        
        const { locale } = await response.json();
        setUserLocale(locale);
      } catch (err) {
        console.error('Error loading user language:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadUserLanguage();
  }, []);

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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change language');
      }

      // Update local state
      setUserLocale(locale);
      
      // Reload the page to apply the new locale
      // This is needed because next-intl uses server-side locale detection
      window.location.reload();
    } catch (err) {
      console.error('Error changing language:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  return {
    userLocale,
    changeLanguage,
    loading,
    error,
  };
}