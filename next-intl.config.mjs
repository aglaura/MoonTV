import {getRequestConfig} from 'next-intl/server';

// Central next-intl config for Next.js app router
export default getRequestConfig(async ({locale}) => ({
  locales: ['en', 'zh-Hans', 'zh-Hant'],
  defaultLocale: 'zh-Hant',
  messages: (await import(`./src/messages/${locale}.json`)).default
}));
