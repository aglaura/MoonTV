import {getRequestConfig} from 'next-intl/server';

const SUPPORTED = ['en', 'zh-Hans', 'zh-Hant'];
const DEFAULT_LOCALE = 'en'; // Changed to English as default

// Central next-intl config for Next.js app router
export default getRequestConfig(async ({locale}) => {
  const resolvedLocale = SUPPORTED.includes(locale) ? locale : DEFAULT_LOCALE;

  // Load messages for the resolved locale
  const messages = (await import(`./src/messages/${resolvedLocale}.json`)).default;
  
  return {
    messages,
    locale: resolvedLocale
  };
});