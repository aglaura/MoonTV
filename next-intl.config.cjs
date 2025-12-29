const { getRequestConfig } = require('next-intl/server');

// Compatibility wrapper (CommonJS) for environments that don't resolve .mjs
module.exports = getRequestConfig(({ locale }) => ({
  messages: require(`./src/messages/${locale}.json`),
}));
