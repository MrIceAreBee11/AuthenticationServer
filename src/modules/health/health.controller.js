/**
 * BERKAS INI: dua endpoint yang menjawab "apakah layanan ini sehat".
 *
 * KENAPA MODUL SENDIRI: keduanya tidak melayani pengguna, melainkan Docker dan
 * load balancer. Menyelipkannya ke modul lain membuat pembacanya harus menebak
 * kenapa ada endpoint tanpa autentikasi di sana.
 */
const { successResponse, errorResponse } = require('../../utils/response');
const { ERROR_CODES } = require('../../constants/errorCodes');

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
   * Readiness — penerjemahan murni. Yang MENILAI siap atau tidak adalah
   * health.service; di sini hanya penilaian itu yang dipetakan ke status HTTP.
   */
  readiness = async (req, res) => {
    const { ready, checks } = await this.health.readiness();

    if (!ready) {
      return errorResponse(res, 503, 'Service belum siap', {
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        details: checks,
      });
    }

    return successResponse(res, 200, 'Service siap menerima request', checks);
  };
}

module.exports = { HealthController };
