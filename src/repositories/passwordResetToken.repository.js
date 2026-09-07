const crypto = require('node:crypto');

const { redisClient } = require('../redis');

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
const KEY_PREFIX = 'password-reset:';

class PasswordResetTokenRepository {
  constructor(cache = redisClient) {
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

module.exports = {
  PasswordResetTokenRepository,
  passwordResetTokenRepository: new PasswordResetTokenRepository(),
};
