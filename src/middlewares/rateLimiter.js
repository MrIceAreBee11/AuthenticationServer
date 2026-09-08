/**
 * BERKAS INI: pabrik pembatas laju untuk endpoint yang rawan dicoba berulang.
 *
 * KENAPA DI middlewares/: ia berjalan sebelum controller dan tidak tahu apa pun
 * tentang isi permintaannya. Batasnya juga bukan aturan bisnis — ia perlindungan
 * infrastruktur.
 *
 * KENAPA CLASS: sebelumnya berkas ini mengimpor redisClient dan config
 * langsung, lalu membuat kedua pembatas laju sebagai efek samping saat
 * di-require. Keduanya jadi tidak mungkin diuji, dan angkanya tertanam di kode.
 *
 * KENAPA PENYIMPANANNYA REDIS, BUKAN MEMORI: penghitung di memori berlaku per
 * proses. Dua container berarti dua penghitung, dan batas lima percobaan
 * berubah menjadi sepuluh. Redis membuat penghitungnya satu, berapa pun jumlah
 * instance-nya.
 *
 * KENAPA ANGKANYA DARI CONFIG: saat serangan credential-stuffing sedang
 * berjalan, batasnya perlu diperketat sekarang — bukan setelah build berikutnya
 * selesai.
 */
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const { errorResponse } = require('../utils/response');
const { CACHE_KEYS } = require('../constants/cacheKeys');
const { ERROR_CODES } = require('../constants/errorCodes');
const { MS } = require('../constants/units');

class RateLimiterFactory {
  constructor({ cache, limits }) {
    this.cache = cache;
    this.limits = limits;
  }

  #build({ prefix, windowMs, maxAttempts, message, skipSuccessfulRequests = false }) {
    return rateLimit({
      store: new RedisStore({
        prefix,
        // Dibungkus, bukan diserahkan langsung: pembatas laju dipasang saat
        // route didefinisikan, jauh sebelum server memanggil connect().
        // Memanggil Redis pada saat itu menghasilkan ClientOfflineError.
        sendCommand: (...args) => this.cache.sendCommand(args),
      }),
      windowMs,
      limit: maxAttempts,
      skipSuccessfulRequests,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) =>
        errorResponse(res, 429, message, { code: ERROR_CODES.RATE_LIMITED }),
    });
  }

  /**
   * Hanya percobaan yang GAGAL yang dihitung. Kalau yang berhasil ikut
   * dihitung, pengguna yang login berkali-kali dari perangkat berbeda akan
   * terkena batas padahal tidak melakukan kesalahan apa pun.
   */
  login() {
    const { windowMs, maxAttempts } = this.limits.login;

    return this.#build({
      prefix: CACHE_KEYS.RATE_LIMIT_LOGIN,
      windowMs,
      maxAttempts,
      skipSuccessfulRequests: true,
      message: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${
        windowMs / MS.MINUTE
      } menit.`,
    });
  }

  passwordReset() {
    const { windowMs, maxAttempts } = this.limits.passwordReset;

    return this.#build({
      prefix: CACHE_KEYS.RATE_LIMIT_PASSWORD_RESET,
      windowMs,
      maxAttempts,
      message: `Terlalu banyak permintaan reset password. Silakan coba lagi dalam ${
        windowMs / MS.HOUR
      } jam.`,
    });
  }
}

module.exports = { RateLimiterFactory };
