// utils/logger.js (Production-ready version)
const pino = require('pino');

// In production, use simple JSON logging (no pino-pretty transport)
const isProduction = process.env.NODE_ENV === 'production' || process.env.WEBSITE_SITE_NAME;

const logger = isProduction
  ? pino({ level: 'info' })
  : pino({
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
    level: 'info',
  });

module.exports = logger;
