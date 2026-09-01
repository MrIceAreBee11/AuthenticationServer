const { successResponse } = require('../../utils/response');
const { sequelize } = require('../../database');
const { redisClient } = require('../../redis');
const { errorResponse } = require('../../utils/response');

const checkHealth = (req, res) => {
  return successResponse(res, 200, 'Service berjalan normal', {
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
};

const checkReadiness = async (req, res) => {
  const checks = { database: 'down', redis: 'down' };

  try {
    await sequelize.authenticate();
    checks.database = 'up';
  } catch (error) {
    console.error('[READINESS] database:', error.message);
  }

  try {
    await redisClient.ping();
    checks.redis = 'up';
  } catch (error) {
    console.error('[READINESS] redis:', error.message);
  }

  const isReady = Object.values(checks).every((status) => status === 'up');

  if (!isReady) {
    return errorResponse(res, 503, 'Service belum siap', checks);
  }

  return successResponse(res, 200, 'Service siap menerima request', checks);
};

module.exports = { checkHealth, checkReadiness };