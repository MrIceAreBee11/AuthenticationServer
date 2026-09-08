/**
 * Logger terstruktur: satu baris JSON per kejadian.
 *
 * Ditulis sendiri, bukan pakai pino/winston, karena yang dibutuhkan hanya
 * empat level + redaksi + child binding (~80 baris). Ganti ke pino kalau
 * volume log jadi tinggi — ia menulis lewat worker thread sehingga tidak
 * memblokir event loop, dan punya serializer JSON yang jauh lebih cepat.
 *
 * Kenapa JSON, bukan teks: log yang dikirim ke sistem pengumpul terpusat harus
 * bisa difilter per field. `grep` pada teks bebas tidak bisa menjawab
 * "tampilkan semua error milik requestId X".
 *
 * Semua ke stdout, termasuk error. Di container, dua stream terpisah bisa
 * saling mendahului sehingga urutan log jadi tidak dapat dipercaya.
 */
const LEVELS = Object.freeze({ error: 50, warn: 40, info: 30, debug: 20 });

/** Field yang isinya tidak boleh masuk log dalam keadaan apa pun. */
const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'passwordHash',
  'token',
  'refreshToken',
  'resetToken',
  'accessToken',
  'authorization',
  'secret',
  'jwt_secret',
]);

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const MAX_DEPTH = 4;

/**
 * Redaksi rekursif.
 *
 * Di batas kedalaman ia mengembalikan PENANDA, bukan objeknya. Mengembalikan
 * objeknya membuat JSON.stringify tetap menabrak siklus pada objek yang
 * menunjuk dirinya sendiri — dan logger, bagian yang seharusnya paling bisa
 * diandalkan, justru melempar error saat sedang mencatat error lain.
 */
const redact = (value, depth = 0) => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return TRUNCATED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      REDACTED_KEYS.has(key) ? REDACTED : redact(item, depth + 1),
    ])
  );
};

class Logger {
  /**
   * @param {object} options
   * @param {string} options.level      level minimum yang dicetak
   * @param {object} [options.context]  RequestContext; requestId dibaca saat menulis
   * @param {object} [options.bindings] field tetap yang selalu ikut
   * @param {object} [options.stream]   tujuan tulis; diganti objek palsu saat pengujian
   */
  constructor({ level = 'info', context = null, bindings = {}, stream = process.stdout }) {
    this.threshold = LEVELS[level] ?? LEVELS.info;
    this.context = context;
    this.bindings = bindings;
    this.stream = stream;
  }

  /** Logger baru dengan field tambahan; induknya tidak tersentuh. */
  child(bindings) {
    return new Logger({
      level: Object.keys(LEVELS).find((name) => LEVELS[name] === this.threshold) ?? 'info',
      context: this.context,
      bindings: { ...this.bindings, ...bindings },
      stream: this.stream,
    });
  }

  #write(level, message, fields) {
    if (LEVELS[level] < this.threshold) {
      return;
    }

    // requestId dibaca saat menulis, bukan saat logger dibuat. Itu yang
    // membuat satu logger bersama tetap dapat menandai baris dengan
    // permintaan yang benar tanpa perlu diteruskan lewat setiap pemanggilan.
    const requestId = this.context?.requestId ?? null;

    this.stream.write(
      `${JSON.stringify({
        time: new Date().toISOString(),
        level,
        msg: message,
        ...(requestId && { requestId }),
        ...this.bindings,
        ...redact(fields ?? {}),
      })}\n`
    );
  }

  error(message, fields) {
    this.#write('error', message, fields);
  }

  warn(message, fields) {
    this.#write('warn', message, fields);
  }

  info(message, fields) {
    this.#write('info', message, fields);
  }

  debug(message, fields) {
    this.#write('debug', message, fields);
  }

  /**
   * Error dicatat sebagai field terstruktur, bukan digabung ke pesan.
   * Stack trace utuh hanya berguna kalau ia berada di field tersendiri —
   * disisipkan ke dalam teks pesan, ia merusak parsing barisnya.
   */
  exception(message, error, fields) {
    this.#write('error', message, {
      ...fields,
      err: { name: error?.name, message: error?.message, stack: error?.stack },
    });
  }
}

module.exports = { Logger, LEVELS, REDACTED_KEYS, MAX_DEPTH };
