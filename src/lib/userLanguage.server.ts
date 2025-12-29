import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

// Define supported locales
const SUPPORTED_LOCALES = ['en', 'zh-Hans', 'zh-Hant'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
const DEFAULT_LOCALE: Locale = 'en'; // Changed to English as default

// Use Redis for storing user language preferences
const redis = process.env.REDIS_URL ? new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN || '',
}) : null;

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
  } catch (error) {
    return DEFAULT_LOCALE;
  }
}
