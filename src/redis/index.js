const { once } = require('node:events');
const { createClient } = require('redis');

const env = require('../config/env');

const RECONNECT_STEP_MS = 250;
const RECONNECT_MAX_MS = 5000;
const READY_TIMEOUT_MS = 3000;

const redisClient = createClient({
  socket: {
    host: env.redis.host,
    port: env.redis.port,
    connectTimeout: 3000,
    reconnectStrategy: (retries) =>
      Math.min(retries * RECONNECT_STEP_MS, RECONNECT_MAX_MS),
  },
  password: env.redis.password,
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