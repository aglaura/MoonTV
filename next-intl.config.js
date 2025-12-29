const { getRequestConfig } = require('next-intl/server');

module.exports = getRequestConfig(({ locale }) => ({
  messages: require(`./src/messages/${locale}.json`),
}));
