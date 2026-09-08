/**
 * BERKAS INI: daftar access token yang sudah dicabut lewat logout.
 *
 * KENAPA DI repositories/: satu-satunya lapisan yang boleh menyentuh klien
 * Redis. Yang memakainya — service logout dan middleware autentikasi — tidak
 * tahu apa pun tentang bentuk kuncinya.
 *
 * KENAPA HARUS ADA DAFTAR INI: access token berupa JWT, yang dapat diperiksa
 * tanpa menyentuh penyimpanan. Konsekuensinya ia tidak punya tempat untuk
 * ditandai sebagai "sudah tidak berlaku". Daftar ini yang menyediakannya.
 *
 * KENAPA AWALAN KUNCINYA HANYA ADA DI SINI: dulu ia ditulis di dua berkas
 * terpisah — service logout dan middleware autentikasi. Kalau salah satu
 * diubah, token yang di-logout tetap diterima TANPA error apa pun: dicabut
 * dengan kunci A, diperiksa dengan kunci B.
 */

/**
 * Daftar token yang sudah dicabut lewat logout.
 *
 * Sebelumnya prefix kunci ini ditulis di dua berkas terpisah — service logout
 * dan middleware authenticate. Kalau salah satu diubah dan yang lain tidak,
 * token yang di-logout tetap diterima, tanpa error apa pun. Sekarang prefix
 * itu hanya ada di sini.
 */
const { CACHE_KEYS } = require('../constants/cacheKeys');

const KEY_PREFIX = CACHE_KEYS.TOKEN_DENYLIST;

class TokenDenylistRepository {
  constructor(cache) {
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

module.exports = { TokenDenylistRepository };
