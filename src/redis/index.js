const { once } = require('node:events');
const { createClient } = require('redis');

const { config } = require('../config');

const {
  connectTimeoutMs,
  readyTimeoutMs,
  reconnectStepMs: RECONNECT_STEP_MS,
  reconnectMaxMs: RECONNECT_MAX_MS,
} = config.cache;

const READY_TIMEOUT_MS = readyTimeoutMs;

const redisClient = createClient({
  socket: {
    host: config.cache.host,
    port: config.cache.port,
    connectTimeout: connectTimeoutMs,
    reconnectStrategy: (retries) =>
      Math.min(retries * RECONNECT_STEP_MS, RECONNECT_MAX_MS),
  },
  password: config.cache.password,
  disableOfflineQueue: true,
});

redisClient.on('error', (error) => {
  console.error('[REDIS ERROR]', error.message || error.code || 'unknown');
});

let connectPromise = null;

const connectRedis = async () => {
  if (redisClient.isReady) {
    return;
  }

  if (!redisClient.isOpen && !connectPromise) {
    connectPromise = redisClient.connect().finally(() => {
      connectPromise = null;
    });
  }

  if (connectPromise) {
    await connectPromise;
  }

  if (redisClient.isReady) {
    return;
  }

  const readyTimeout = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Redis belum siap dalam ${READY_TIMEOUT_MS} ms`)),
      READY_TIMEOUT_MS
    );

    timer.unref();
  });

  await Promise.race([once(redisClient, 'ready'), readyTimeout]);
};

module.exports = { redisClient, connectRedis };