const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const { redisClient, connectRedis } = require('../redis');
const { errorResponse } = require('../utils/response');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_RESET_REQUESTS = 3;

const buildStore = (prefix) =>
  new RedisStore({
    prefix,
    sendCommand: async (...args) => {
      await connectRedis();

      return redisClient.sendCommand(args);
    },
  });

const loginRateLimiter = rateLimit({
  store: buildStore('ratelimit:login:'),
  windowMs: FIFTEEN_MINUTES,
  limit: MAX_LOGIN_ATTEMPTS,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    errorResponse(
      res,
      429,
      'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.'
    ),
});

const passwordResetRateLimiter = rateLimit({
  store: buildStore('ratelimit:reset:'),
  windowMs: ONE_HOUR,
  limit: MAX_RESET_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    errorResponse(
      res,
      429,
      'Terlalu banyak permintaan reset password. Silakan coba lagi dalam 1 jam.'
    ),
});

module.exports = { loginRateLimiter, passwordResetRateLimiter };