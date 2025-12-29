// Minimal server-only request config for next-intl
import { getRequestConfig } from 'next-intl/server';

// Use the new requestLocale/setRequestLocale API so pages can be rendered statically.
export default getRequestConfig(async ({ requestLocale, setRequestLocale }) => {
  // `requestLocale` is an async getter that returns the resolved locale for the request
  const locale = await requestLocale();
  // debug: print types to help trace runtime errors during prerender
  try {
    // eslint-disable-next-line no-console
    console.debug('[i18n] requestLocale type:', typeof requestLocale, 'setRequestLocale type:', typeof setRequestLocale, 'resolved locale:', locale);
  } catch (e) {}

  if (locale && typeof setRequestLocale === 'function') setRequestLocale(locale);

  // messages are stored under `src/messages/<locale>.json`
  return {
    messages: (await import(`../messages/${locale ?? 'en'}.json`)).default,
  };
});
