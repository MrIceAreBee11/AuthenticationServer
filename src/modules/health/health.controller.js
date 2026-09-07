const { successResponse, errorResponse } = require('../../utils/response');
const { healthRepository } = require('../../repositories/health.repository');

class HealthController {
  constructor({ health = healthRepository } = {}) {
    this.health = health;
  }

  /**
   * Liveness — hanya menjawab bahwa prosesnya hidup, tanpa menyentuh
   * dependensi apa pun. Dipakai oleh healthcheck Docker, yang memanggilnya
   * sesering mungkin, dan harus tetap menjawab meski seluruh dependensi mati.
   */
  liveness = (req, res) =>
    successResponse(res, 200, 'Service berjalan normal', {
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });

  /**
   * Readiness — memeriksa dependensi yang benar-benar dibutuhkan.
   *
   * Kedua pemeriksaan dijalankan sampai selesai, tidak berhenti di kegagalan
   * pertama. Endpoint diagnostik harus melaporkan seluruh keadaan sekaligus;
   * kalau berhenti di yang pertama, diagnosis menjadi berlapis.
   */
  readiness = async (req, res) => {
    const [databaseUp, cacheUp] = await Promise.all([
      this.health.pingDatabase(),
      this.health.pingCache(),
    ]);

    const checks = {
      database: databaseUp ? 'up' : 'down',
      redis: cacheUp ? 'up' : 'down',
    };

    if (!databaseUp || !cacheUp) {
      return errorResponse(res, 503, 'Service belum siap', checks);
    }

    return successResponse(res, 200, 'Service siap menerima request', checks);
  };
}

module.exports = { HealthController, healthController: new HealthController() };
