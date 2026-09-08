const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const { redisClient, connectRedis } = require('../redis');
const { errorResponse } = require('../utils/response');
const { config } = require('../config');
const { CACHE_KEYS } = require('../constants/cacheKeys');
const { MS } = require('../constants/units');



const buildStore = (prefix) =>
  new RedisStore({
    prefix,
    sendCommand: async (...args) => {
      await connectRedis();

      return redisClient.sendCommand(args);
    },
  });

const loginRateLimiter = rateLimit({
  store: buildStore(CACHE_KEYS.RATE_LIMIT_LOGIN),
  windowMs: config.rateLimit.login.windowMs,
  limit: config.rateLimit.login.maxAttempts,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    errorResponse(
      res,
      429,
      `Terlalu banyak percobaan login. Silakan coba lagi dalam ${config.rateLimit.login.windowMs / MS.MINUTE} menit.`
    ),
});

const passwordResetRateLimiter = rateLimit({
  store: buildStore(CACHE_KEYS.RATE_LIMIT_PASSWORD_RESET),
  windowMs: config.rateLimit.passwordReset.windowMs,
  limit: config.rateLimit.passwordReset.maxAttempts,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    errorResponse(
      res,
      429,
      `Terlalu banyak permintaan reset password. Silakan coba lagi dalam ${config.rateLimit.passwordReset.windowMs / MS.HOUR} jam.`
    ),
});

module.exports = { loginRateLimiter, passwordResetRateLimiter };