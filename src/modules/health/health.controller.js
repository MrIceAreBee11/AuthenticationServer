/**
 * BERKAS INI: dua endpoint yang menjawab "apakah layanan ini sehat".
 *
 * KENAPA MODUL SENDIRI: keduanya tidak melayani pengguna, melainkan Docker dan
 * load balancer. Menyelipkannya ke modul lain membuat pembacanya harus menebak
 * kenapa ada endpoint tanpa autentikasi di sana.
 */
const { successResponse, errorResponse } = require('../../utils/response');

class HealthController {
  constructor({ health, environment }) {
    this.health = health;
    this.environment = environment;
  }

  /**
   * Liveness — hanya menjawab bahwa prosesnya hidup, tanpa menyentuh
   * dependensi apa pun. Dipakai oleh healthcheck Docker, yang memanggilnya
   * sesering mungkin, dan harus tetap menjawab meski seluruh dependensi mati.
   */
  liveness = (req, res) =>
    successResponse(res, 200, 'Service berjalan normal', {
      uptime: Math.floor(process.uptime()),
      environment: this.environment,
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

module.exports = { HealthController };
