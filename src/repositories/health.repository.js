const { sequelize } = require('../database');
const { redisClient } = require('../redis');

/**
 * Pemeriksaan ketersediaan infrastruktur.
 *
 * Diletakkan di lapisan repository karena inilah satu-satunya lapisan yang
 * boleh menyentuh objek sequelize dan klien Redis secara langsung. Controller
 * kesehatan hanya menyusun jawabannya.
 */
class HealthRepository {
  constructor({ database = sequelize, cache = redisClient } = {}) {
    this.database = database;
    this.cache = cache;
  }

  async pingDatabase() {
    try {
      await this.database.authenticate();

      return true;
    } catch (error) {
      console.error('[READINESS] database:', error.message);

      return false;
    }
  }

  async pingCache() {
    try {
      await this.cache.ping();

      return true;
    } catch (error) {
      console.error('[READINESS] redis:', error.message);

      return false;
    }
  }
}

module.exports = { HealthRepository, healthRepository: new HealthRepository() };
