import {getRequestConfig} from 'next-intl/server';

const SUPPORTED = ['en', 'zh-Hans', 'zh-Hant'];
const DEFAULT_LOCALE = 'zh-Hant';

// Central next-intl config for Next.js app router
export default getRequestConfig(async ({locale}) => {
  const resolvedLocale = SUPPORTED.includes(locale) ? locale : DEFAULT_LOCALE;

  return {
    locales: SUPPORTED,
    defaultLocale: DEFAULT_LOCALE,
    locale: resolvedLocale,
    messages: (await import(`./src/messages/${resolvedLocale}.json`)).default
  };
});
