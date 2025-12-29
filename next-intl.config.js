const {getRequestConfig} = require('next-intl/server');

const SUPPORTED = ['en', 'zh-Hans', 'zh-Hant'];
const DEFAULT_LOCALE = 'zh-Hant';

module.exports = getRequestConfig(async ({locale}) => {
  const resolved = SUPPORTED.includes(locale) ? locale : DEFAULT_LOCALE;

  return {
    locales: SUPPORTED,
    defaultLocale: DEFAULT_LOCALE,
    locale: resolved,
    messages: (await import(`./src/messages/${resolved}.json`)).default
  };
});
