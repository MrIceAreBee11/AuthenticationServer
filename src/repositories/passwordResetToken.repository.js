/**
 * BERKAS INI: penyimpanan sementara token reset password di Redis.
 *
 * KENAPA DI repositories/: satu-satunya lapisan yang menyentuh Redis, dan
 * satu-satunya yang tahu bahwa token disimpan dalam bentuk hash.
 *
 * KENAPA DI REDIS, BUKAN PostgreSQL seperti refresh token: umurnya hanya lima
 * belas menit dan ia tidak perlu meninggalkan jejak. TTL Redis membersihkannya
 * sendiri tanpa perlu penjadwal apa pun.
 *
 * KENAPA YANG DISIMPAN HASH-nya: kalau isi Redis bocor, pemegangnya tidak
 * dapat menyusun kembali token asli lalu memakainya mengganti password orang.
 *
 * KENAPA SHA-256, BUKAN BCRYPT: bcrypt sengaja lambat untuk memperlambat
 * penebakan rahasia berentropi rendah seperti password manusia. Token ini 32
 * byte acak — menebaknya mustahil berapa pun kecepatannya, jadi kelambatan
 * bcrypt hanya membebani server tanpa menambah keamanan sedikit pun.
 */

const crypto = require('node:crypto');

/**
 * Token reset password yang disimpan sementara di Redis.
 *
 * Yang disimpan adalah hasil pengacakan satu arah dari token, bukan tokennya.
 * Kalau isi Redis bocor, pemegangnya tidak dapat menyusun kembali token asli.
 *
 * SHA-256 dipakai, bukan bcrypt. Bedanya: bcrypt sengaja lambat untuk
 * memperlambat penebakan rahasia berentropi rendah seperti password manusia.
 * Token ini 32 byte acak — menebaknya mustahil berapa pun kecepatannya, jadi
 * kelambatan bcrypt hanya membebani server tanpa menambah keamanan.
 */
const { CACHE_KEYS } = require('../constants/cacheKeys');

const KEY_PREFIX = CACHE_KEYS.PASSWORD_RESET;

class PasswordResetTokenRepository {
  constructor(cache) {
    this.cache = cache;
  }

  #key(plainToken) {
    const hashed = crypto.createHash('sha256').update(plainToken).digest('hex');

    return `${KEY_PREFIX}${hashed}`;
  }

  async save(plainToken, userId, ttlSeconds) {
    await this.cache.set(this.#key(plainToken), userId, { EX: ttlSeconds });
  }

  async findUserId(plainToken) {
    return this.cache.get(this.#key(plainToken));
  }

  async remove(plainToken) {
    await this.cache.del(this.#key(plainToken));
  }
}

module.exports = { PasswordResetTokenRepository };
