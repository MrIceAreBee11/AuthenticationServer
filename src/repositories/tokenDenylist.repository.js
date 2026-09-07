const { redisClient } = require('../redis');

/**
 * Daftar token yang sudah dicabut lewat logout.
 *
 * Sebelumnya prefix kunci ini ditulis di dua berkas terpisah — service logout
 * dan middleware authenticate. Kalau salah satu diubah dan yang lain tidak,
 * token yang di-logout tetap diterima, tanpa error apa pun. Sekarang prefix
 * itu hanya ada di sini.
 */
const KEY_PREFIX = 'token:denylist:';

class TokenDenylistRepository {
  constructor(cache = redisClient) {
    this.cache = cache;
  }

  #key(tokenId) {
    return `${KEY_PREFIX}${tokenId}`;
  }

  /**
   * Masa simpan harus sama dengan sisa umur token. Kalau lebih pendek, token
   * yang sudah di-logout akan berlaku kembali setelah entri ini hilang.
   */
  async revoke(tokenId, ttlSeconds) {
    if (ttlSeconds <= 0) {
      return;
    }

    await this.cache.set(this.#key(tokenId), '1', { EX: ttlSeconds });
  }

  async isRevoked(tokenId) {
    const exists = await this.cache.exists(this.#key(tokenId));

    return exists === 1;
  }
}

module.exports = {
  TokenDenylistRepository,
  tokenDenylistRepository: new TokenDenylistRepository(),
};
