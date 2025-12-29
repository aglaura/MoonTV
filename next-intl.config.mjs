import {getRequestConfig} from 'next-intl/server';

const SUPPORTED_LOCALES = ['en', 'zh-Hans', 'zh-Hant'];

// Central next-intl config for Next.js app router
export default getRequestConfig(async ({locale}) => {
  // Validate the locale and fallback to 'en' if not supported
  const resolvedLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  
  return {
    messages: (await import(`./src/messages/${resolvedLocale}.json`)).default
  };
});