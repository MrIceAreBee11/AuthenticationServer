/**
 * Penyimpan jawaban permintaan yang sudah pernah diproses, berdasarkan kunci
 * idempotensi dari klien.
 *
 * Di Redis, bukan PostgreSQL: umurnya terbatas dan ia memang boleh
 * hilang. Kalau isinya lenyap, akibat terburuknya adalah permintaan ulang
 * diproses lagi — sama seperti keadaan sebelum fitur ini ada.
 */
const { CACHE_KEYS } = require('../constants/cacheKeys');

/** Ditulis saat pemrosesan dimulai, sebelum jawabannya diketahui. */
const IN_PROGRESS = 'sedang-diproses';

class IdempotencyRepository {
  constructor(cache) {
    this.cache = cache;
  }

  #key(scope, idempotencyKey) {
    return `${CACHE_KEYS.IDEMPOTENCY}${scope}:${idempotencyKey}`;
  }

  /**
   * Memesan kunci secara atomik. Mengembalikan true kalau pemesanannya
   * berhasil, artinya pemanggil inilah yang pertama.
   *
   * SET NX dipakai, bukan GET lalu SET: dua permintaan bersamaan dengan kunci
   * yang sama akan sama-sama melihat "belum ada" pada pola GET-lalu-SET, dan
   * keduanya lanjut diproses — persis hal yang seharusnya dicegah.
   */
  async reserve(scope, idempotencyKey, ttlSeconds) {
    const result = await this.cache.set(this.#key(scope, idempotencyKey), IN_PROGRESS, {
      NX: true,
      EX: ttlSeconds,
    });

    return result === 'OK';
  }

  /**
   * Mengembalikan jawaban tersimpan, atau null kalau kuncinya masih
   * berstatus sedang diproses.
   */
  async findResponse(scope, idempotencyKey) {
    const stored = await this.cache.get(this.#key(scope, idempotencyKey));

    if (!stored || stored === IN_PROGRESS) {
      return null;
    }

    return JSON.parse(stored);
  }

  async saveResponse(scope, idempotencyKey, response, ttlSeconds) {
    await this.cache.set(this.#key(scope, idempotencyKey), JSON.stringify(response), {
      EX: ttlSeconds,
    });
  }

  /**
   * Melepas pesanan ketika pemrosesannya gagal.
   *
   * Tanpa ini, permintaan yang gagal karena gangguan sementara akan terkunci
   * sepanjang masa berlaku kunci: percobaan ulang dianggap duplikat padahal
   * tidak ada jawaban yang pernah tersimpan.
   */
  async release(scope, idempotencyKey) {
    await this.cache.del(this.#key(scope, idempotencyKey));
  }
}

module.exports = { IdempotencyRepository };
