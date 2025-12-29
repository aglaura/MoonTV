import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

// Define supported locales
const SUPPORTED_LOCALES = ['en', 'zh-Hans', 'zh-Hant'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
const DEFAULT_LOCALE: Locale = 'en';

// Use Redis for storing user language preferences when config is valid
const REDIS_URL = process.env.REDIS_URL;
const REDIS_TOKEN = process.env.REDIS_TOKEN;
const canUseRedis =
  typeof REDIS_URL === 'string' &&
  REDIS_URL.startsWith('https://') &&
  typeof REDIS_TOKEN === 'string' &&
  REDIS_TOKEN.length > 0;

const redis = canUseRedis
  ? new Redis({
      url: REDIS_URL,
      token: REDIS_TOKEN,
    })
  : null;

/**
 * Get user's preferred language from Redis based on request
 * @param request The Next.js request object
 * @returns The user's preferred locale or default
 */
export async function getUserPreferredLocale(request: NextRequest): Promise<Locale> {
  if (!redis) {
    return DEFAULT_LOCALE;
  }

  // Try to get user ID from auth cookie
  try {
    const authCookie = request.cookies.get('auth');
    if (!authCookie) {
      return DEFAULT_LOCALE;
    }

    // Assuming the auth cookie contains username
    // Parse the cookie value to extract username
    let username = null;
    try {
      const authData = JSON.parse(decodeURIComponent(authCookie.value));
      username = authData.username;
    } catch {
      // If JSON parsing fails, try to extract username from the raw value
      username = authCookie.value;
    }

    if (!username) {
      return DEFAULT_LOCALE;
    }

    const storedLocale = await redis.get(`user:lang:${username}`);
    if (typeof storedLocale === 'string' && SUPPORTED_LOCALES.includes(storedLocale as Locale)) {
      return storedLocale as Locale;
    }
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
