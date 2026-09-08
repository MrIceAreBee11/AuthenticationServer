/**
 * Penjamin idempotensi untuk operasi tulis yang rawan diulang.
 *
 * MASALAH YANG DIPECAHKAN, dan bukan yang biasa disangka.
 *
 * Kolom email dan nama role sudah unik, jadi permintaan ulang TIDAK membuat
 * data ganda. Yang terjadi justru lebih membingungkan: percobaan pertama
 * berhasil tetapi jawabannya tidak sampai (jaringan terputus, klien timeout),
 * klien mengulang, dan yang kedua dijawab 409 "sudah digunakan". Dari sisi
 * klien tampak seperti gagal, padahal datanya sudah terbuat.
 *
 * Dengan kunci idempotensi, percobaan ulang menerima JAWABAN ASLI — 201
 * beserta data yang terbuat — bukan 409 yang menyesatkan.
 *
 * OPSIONAL, BUKAN WAJIB. Permintaan tanpa header Idempotency-Key diteruskan
 * apa adanya. Mewajibkannya akan memutus setiap klien yang sudah ada, dan
 * jaminan ini memang hanya berguna bagi klien yang melakukan percobaan ulang
 * otomatis.
 *
 * KUNCINYA DIBATASI PER PENGGUNA. Tanpa itu, dua pengguna berbeda yang
 * kebetulan memakai kunci sama akan saling menerima jawaban milik orang lain —
 * kebocoran data yang parah dan sangat sulit dilacak.
 */
const { ConflictError } = require('../utils/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');

const HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 128;
const KEY_PATTERN = /^[\w.:-]+$/;

class IdempotencyMiddleware {
  constructor({ store, ttlSeconds, logger }) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
    this.logger = logger;
  }

  /**
   * Cakupan kunci: pengguna + metode + alamat.
   *
   * Alamatnya ikut supaya satu kunci yang dipakai ulang pada endpoint berbeda
   * tidak mengembalikan jawaban endpoint sebelumnya.
   */
  #scope(req) {
    return `${req.user?.id ?? 'anon'}:${req.method}:${req.baseUrl}${req.path}`;
  }

  #readKey(req) {
    const raw = String(req.headers[HEADER] ?? '').trim();

    if (raw.length === 0) {
      return null;
    }

    // Kunci dari klien masuk ke kunci Redis, jadi bentuknya dibatasi. Tanpa
    // ini, nilai sembarang dapat menabrak ruang kunci lain.
    return raw.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(raw) ? raw : null;
  }

  handle = async (req, res, next) => {
    const key = this.#readKey(req);

    if (!key) {
      return next();
    }

    const scope = this.#scope(req);
    const tersimpan = await this.store.findResponse(scope, key);

    if (tersimpan) {
      this.logger.info('permintaan diulang, jawaban tersimpan dikirim kembali', {
        idempotencyKey: key,
      });

      res.setHeader('idempotent-replay', 'true');

      return res.status(tersimpan.status).json(tersimpan.body);
    }

    if (!(await this.store.reserve(scope, key, this.ttlSeconds))) {
      // Kunci sudah dipesan tetapi jawabannya belum tersimpan: permintaan
      // pertama masih berjalan. Memprosesnya sekarang berarti dua operasi
      // tulis berjalan bersamaan — persis yang seharusnya dicegah.
      throw new ConflictError(
        'Permintaan dengan kunci idempotensi yang sama sedang diproses',
        ERROR_CODES.ALREADY_EXISTS
      );
    }

    // res.json dibungkus untuk menangkap jawabannya. Express tidak menyediakan
    // cara lain untuk mengetahui apa yang dikirim controller.
    const kirimAsli = res.json.bind(res);

    res.json = (body) => {
      // Hanya jawaban BERHASIL yang disimpan. Menyimpan kegagalan berarti
      // percobaan ulang atas gangguan sementara selamanya menerima kegagalan
      // yang sama.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        this.store
          .saveResponse(scope, key, { status: res.statusCode, body }, this.ttlSeconds)
          .catch((error) => this.logger.exception('gagal menyimpan jawaban idempotensi', error));
      } else {
        this.store.release(scope, key).catch(() => {});
      }

      return kirimAsli(body);
    };

    // Pesanan dilepas juga ketika permintaannya berakhir tanpa res.json —
    // error yang dilempar controller melewati jalur error handler, bukan ini.
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        this.store.release(scope, key).catch(() => {});
      }
    });

    return next();
  };
}

module.exports = { IdempotencyMiddleware, HEADER };
