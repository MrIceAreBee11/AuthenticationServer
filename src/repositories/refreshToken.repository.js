const crypto = require('node:crypto');
const { Op } = require('sequelize');

const { RefreshToken } = require('../database');

/**
 * Satu-satunya tempat yang menyusun query untuk tabel refresh_tokens, dan
 * satu-satunya tempat yang tahu bahwa token disimpan dalam bentuk hash.
 *
 * SHA-256 dipakai, bukan bcrypt — pertimbangannya sama dengan token reset
 * password: token ini 32 byte acak, jadi kelambatan bcrypt hanya membebani
 * server tanpa menambah keamanan. Bedanya dengan token reset, di sini hash
 * juga menjadi kunci pencarian, sehingga ia wajib bersifat deterministik.
 * Bcrypt yang memakai salt acak justru tidak bisa dipakai untuk itu.
 */
class RefreshTokenRepository {
  #hash(plainToken) {
    return crypto.createHash('sha256').update(plainToken).digest('hex');
  }

  async create({ plainToken, userId, familyId, expiresAt }, options = {}) {
    return RefreshToken.create(
      { userId, familyId, expiresAt, tokenHash: this.#hash(plainToken) },
      options
    );
  }

  async findByToken(plainToken) {
    return RefreshToken.findOne({ where: { tokenHash: this.#hash(plainToken) } });
  }

  async revoke(row, options = {}) {
    return row.update({ revokedAt: new Date() }, options);
  }

  /** Mencabut satu rangkaian sesi — dipakai saat logout dan saat pemakaian ulang. */
  async revokeFamily(familyId) {
    const [affected] = await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { familyId, revokedAt: null } }
    );

    return affected;
  }

  /** Mencabut seluruh sesi seorang pengguna — dipakai setelah reset password. */
  async revokeAllForUser(userId) {
    const [affected] = await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null } }
    );

    return affected;
  }

  /**
   * Membuang baris yang sudah kedaluwarsa milik satu pengguna.
   *
   * Hanya yang sudah kedaluwarsa. Baris yang sudah dicabut tetapi belum
   * kedaluwarsa harus tetap ada — baris itulah yang membuat pemakaian ulang
   * token dapat dikenali.
   *
   * Dipanggil saat login dan saat rotasi, jadi tidak perlu ada penjadwal
   * terpisah yang harus dirawat sendiri.
   */
  async deleteExpired(userId) {
    return RefreshToken.destroy({
      where: { userId, expiresAt: { [Op.lt]: new Date() } },
    });
  }
}

module.exports = {
  RefreshTokenRepository,
  refreshTokenRepository: new RefreshTokenRepository(),
};
