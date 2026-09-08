/**
 * Middleware yang memberi setiap permintaan satu identitas, lalu mencatat
 * hasilnya.
 *
 * Harus dipasang PALING AWAL. Middleware apa pun yang berjalan sebelum ini
 * belum punya requestId, jadi log-nya tidak dapat dihubungkan ke permintaan
 * mana pun.
 *
 * Header x-request-id dihormati kalau klien mengirimnya, supaya jejaknya
 * nyambung dengan reverse proxy atau layanan pemanggil. Kalau tidak ada, dibuat
 * baru.
 */
const crypto = require('node:crypto');

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_ID_LENGTH = 64;
const SLOW_REQUEST_MS = 1000;

class RequestLoggerMiddleware {
  constructor({ logger, context }) {
    this.logger = logger;
    this.context = context;
  }

  /**
   * Nilai dari klien dipangkas dan disaring. Header ini masuk ke setiap baris
   * log, jadi menerimanya apa adanya berarti pihak luar dapat menyuntikkan
   * baris palsu ke dalam log — atau mengirim satu megabyte teks.
   */
  #resolveId(headerValue) {
    const candidate = String(headerValue ?? '').trim().slice(0, MAX_ID_LENGTH);

    return /^[\w.:-]+$/.test(candidate) ? candidate : crypto.randomUUID();
  }

  handle = (req, res, next) => {
    const requestId = this.#resolveId(req.headers[REQUEST_ID_HEADER]);
    const startedAt = process.hrtime.bigint();

    req.requestId = requestId;

    // Dikembalikan ke klien supaya pengguna yang melaporkan masalah dapat
    // menyebutkan satu nilai yang langsung menunjuk ke log yang tepat.
    res.setHeader(REQUEST_ID_HEADER, requestId);

    // Dicatat saat 'finish', bukan di awal. Satu baris per permintaan yang
    // sudah memuat status dan durasinya jauh lebih berguna daripada dua baris
    // yang harus dijodohkan sendiri.
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      const fields = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: req.user?.id ?? null,
      };

      if (res.statusCode >= 500) {
        this.logger.error('permintaan gagal', fields);
      } else if (res.statusCode >= 400 || durationMs > SLOW_REQUEST_MS) {
        this.logger.warn('permintaan perlu diperhatikan', fields);
      } else {
        this.logger.info('permintaan selesai', fields);
      }
    });

    // Seluruh sisa rantai berjalan di dalam store ini, jadi service dan
    // repository beberapa lapis di bawah tetap mencantumkan requestId yang
    // benar tanpa menerimanya lewat argumen.
    this.context.run({ requestId }, () => next());
  };
}

module.exports = { RequestLoggerMiddleware, REQUEST_ID_HEADER };
