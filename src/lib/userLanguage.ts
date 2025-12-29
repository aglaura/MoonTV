import { kv } from '@vercel/kv';
import { Redis } from '@upstash/redis';

// Define supported locales
const SUPPORTED_LOCALES = ['en', 'zh-Hans', 'zh-Hant'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
const DEFAULT_LOCALE: Locale = 'en'; // Changed to English as default

// Use Redis for storing user language preferences
// If not available, fallback to environment-based default
const redis = process.env.REDIS_URL ? new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN || '',
}) : null;

/**
 * Get user's preferred language from Redis
 * @param userId The user identifier
 * @returns The user's preferred locale or default
 */
export async function getUserLanguage(userId: string): Promise<Locale> {
  if (!redis) {
    return DEFAULT_LOCALE;
  }

  try {
    const storedLocale = await redis.get(`user:lang:${userId}`);
    if (typeof storedLocale === 'string' && SUPPORTED_LOCALES.includes(storedLocale as Locale)) {
      return storedLocale as Locale;
    }
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Set user's preferred language in Redis
 * @param userId The user identifier
 * @param locale The locale to set
 */
export async function setUserLanguage(userId: string, locale: Locale): Promise<void> {
  if (!redis) {
    return;
  }

  if (!SUPPORTED_LOCALES.includes(locale)) {
    return;
  }

  try {
    // Store the user's language preference with a 1-year expiration
    await redis.setex(`user:lang:${userId}`, 365 * 24 * 60 * 60, locale);
  } catch {
  }
}

/**
 * Get the default locale based on environment or fallback
 * @returns The default locale
 */
export function getDefaultLocale(): Locale {
  // Check for a global default from environment, fallback to our default
  const envDefault = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || process.env.LOCALE;
  if (envDefault && SUPPORTED_LOCALES.includes(envDefault as Locale)) {
    return envDefault as Locale;
  }
  return DEFAULT_LOCALE;
}