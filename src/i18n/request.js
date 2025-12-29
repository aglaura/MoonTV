// Minimal server-only request config for next-intl
import { getRequestConfig } from 'next-intl/server';

// Force locales for specific routes/sources:
// - any `/douban` page or requests with `source=douban` -> zh-CN
// - any `/imdb` page or requests with `source=imdb` -> en
export default getRequestConfig(async ({ requestLocale, setRequestLocale, request }) => {
  // default to whatever the runtime resolves
  let resolved = await (typeof requestLocale === 'function' ? requestLocale() : undefined);

  try {
    // determine from request path / query when available
    if (request && request.url) {
      const url = new URL(request.url);
      const pathname = url.pathname || '';
      const srcParam = (url.searchParams.get('source') || url.searchParams.get('from') || '').toLowerCase();

      if (pathname.startsWith('/douban') || srcParam.includes('douban')) {
        resolved = 'zh-CN';
      } else if (pathname.startsWith('/imdb') || srcParam.includes('imdb')) {
        resolved = 'en';
      }
    }
  } catch (e) {
    // ignore URL parsing failures and fall back to runtime locale
    void e;
  }

  if (resolved && typeof setRequestLocale === 'function') {
    try {
      setRequestLocale(resolved);
    } catch (e) {
      // noop if runtime doesn't allow setting
    }
  }

  // messages are stored under `src/messages/<locale>.json`
  const localeToLoad = resolved ?? 'en';
  return {
    messages: (await import(`../messages/${localeToLoad}.json`)).default,
  };
});
