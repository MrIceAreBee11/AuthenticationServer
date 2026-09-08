/**
 * BERKAS INI: satu-satunya deskripsi lengkap "apa yang dibutuhkan aplikasi ini
 * untuk bisa menyala".
 *
 * KENAPA DI config/: seluruh pembacaan process.env terjadi di folder ini dan
 * tidak di tempat lain. Kalau nilai environment tersebar, jawaban atas
 * pertanyaan "variabel apa saja yang harus diisi?" hanya bisa didapat dengan
 * menggerepe empat puluh berkas — biasanya pada saat deploy gagal.
 *
 * KENAPA SKEMA, BUKAN PEMERIKSAAN MANUAL: tiga hal yang tidak bisa dilakukan
 * daftar `if (!process.env.X)`.
 *
 *   1. Konversi tipe. process.env.PORT selalu string, dan process.env.DEBUG
 *      bernilai string "false" yang truthy. Keduanya bug klasik.
 *   2. Rentang dan lantai keamanan. BCRYPT_SALT_ROUNDS boleh dinaikkan operator,
 *      tidak boleh diturunkan di bawah 10.
 *   3. Invarian lintas variabel. Refresh token wajib lebih panjang umurnya
 *      daripada access token — tidak ada satu variabel pun yang bisa
 *      memvalidasi itu sendirian.
 *
 * NILAI BAWAAN ADA DI SINI, BUKAN DI .env: hanya rahasia dan hal yang memang
 * berbeda per lingkungan yang wajib ditulis di .env. Sisanya punya nilai bawaan
 * yang masuk akal, sehingga .env tetap pendek dan tetap dapat ditimpa saat
 * insiden tanpa mengubah kode.
 */
const { z } = require('zod');

const { MS, SECONDS, BYTES } = require('../constants/units');
const { parseDuration } = require('../utils/duration');

/** Bilangan bulat positif dengan nilai bawaan; coerce karena env selalu string. */
const count = (fallback) => z.coerce.number().int().positive().default(fallback);

/** Daftar dipisah koma, misalnya daftar tipe MIME yang diizinkan. */
const list = (fallback) =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean));

/** Boolean eksplisit; string "false" itu truthy, jadi tidak boleh diandalkan. */
const flag = (fallback) =>
  z.enum(['true', 'false']).default(fallback).transform((value) => value === 'true');

/**
 * Durasi bergaya "15m" atau "7d", disimpan sebagai detik.
 *
 * Kegagalannya dilaporkan lewat ctx.addIssue, bukan dibiarkan melempar. Kalau
 * ia melempar, Zod berhenti di situ dan sisa variabel yang juga salah tidak
 * ikut terlaporkan — persis kelemahan pemeriksaan manual yang mau dihilangkan.
 */
const duration = (name) =>
  z.string().transform((value, ctx) => {
    try {
      return parseDuration(value, name);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: error.message });

      return z.NEVER;
    }
  });

const MIN_JWT_SECRET_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

const envSchema = z
  .object({
    // ---------- Runtime ----------
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_URL: z.url(),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    SHUTDOWN_TIMEOUT_MS: count(10 * MS.SECOND),
    JSON_BODY_LIMIT: z.string().default('10kb'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

    // ---------- PostgreSQL ----------
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().min(1).max(65535),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1), // RAHASIA
    DB_POOL_MAX: count(10),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DB_POOL_IDLE_MS: count(10 * MS.SECOND),

    // ---------- Redis ----------
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535),
    REDIS_PASSWORD: z.string().min(1), // RAHASIA
    REDIS_CONNECT_TIMEOUT_MS: count(3 * MS.SECOND),
    REDIS_READY_TIMEOUT_MS: count(3 * MS.SECOND),
    REDIS_RECONNECT_STEP_MS: count(250),
    REDIS_RECONNECT_MAX_MS: count(5 * MS.SECOND),

    // ---------- Token ----------
    JWT_SECRET: z.string().min(MIN_JWT_SECRET_LENGTH, {
      message: `minimal ${MIN_JWT_SECRET_LENGTH} karakter`,
    }), // RAHASIA
    JWT_EXPIRES_IN: duration('JWT_EXPIRES_IN'),
    REFRESH_TOKEN_EXPIRES_IN: duration('REFRESH_TOKEN_EXPIRES_IN'),
    OPAQUE_TOKEN_BYTES: z.coerce.number().int().min(32).default(32),

    // Penanda penerbit dan penerima token. Tanpa keduanya, token yang
    // diterbitkan layanan LAIN yang memakai secret yang sama akan diterima
    // apa adanya — dan sebaliknya, token milik layanan ini dapat dipakai di
    // tempat yang bukan tujuannya.
    JWT_ISSUER: z.string().min(1).default('auth-service'),
    JWT_AUDIENCE: z.string().min(1).default('auth-service-api'),

    // ---------- Kebijakan password ----------
    // Lantai dipasang di skema, bukan diserahkan pada niat baik operator:
    // nilai boleh diperketat, tidak boleh dilemahkan.
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(MIN_PASSWORD_LENGTH).default(12),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    PASSWORD_RESET_TTL_SECONDS: count(15 * SECONDS.MINUTE),

    // ---------- Pembatas laju ----------
    LOGIN_RATE_LIMIT_WINDOW_MS: count(15 * MS.MINUTE),
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: count(5),
    PASSWORD_RESET_WINDOW_MS: count(1 * MS.HOUR),
    PASSWORD_RESET_MAX_REQUESTS: count(3),

    // ---------- Cache izin ----------
    PERMISSION_CACHE_TTL_SECONDS: count(5 * SECONDS.MINUTE),

    // ---------- Kunci idempotensi ----------
    // Batas waktu berlakunya jaminan "permintaan ulang menerima jawaban yang
    // sama". Terlalu pendek membuat percobaan ulang klien kelewat jendela dan
    // kembali menerima 409; terlalu panjang menyimpan jawaban lama lebih lama
    // dari yang berguna.
    IDEMPOTENCY_TTL_SECONDS: count(24 * SECONDS.HOUR),

    // ---------- Unggahan & penyimpanan objek ----------
    AVATAR_MAX_SIZE_BYTES: count(2 * BYTES.MB),
    AVATAR_ALLOWED_MIME_TYPES: list('image/jpeg,image/png,image/webp'),
    AVATAR_URL_TTL_SECONDS: count(1 * SECONDS.HOUR),

    // ---------- Pembagian halaman ----------
    USERS_DEFAULT_PAGE_SIZE: count(20),
    USERS_MAX_PAGE_SIZE: count(100),

    // ---------- RabbitMQ ----------
    RABBITMQ_HOST: z.string().min(1),
    RABBITMQ_PORT: z.coerce.number().int().min(1).max(65535),
    RABBITMQ_USER: z.string().min(1),
    RABBITMQ_PASSWORD: z.string().min(1), // RAHASIA

    // ---------- MinIO ----------
    MINIO_HOST: z.string().min(1),
    MINIO_PORT: z.coerce.number().int().min(1).max(65535),
    MINIO_ROOT_USER: z.string().min(1),
    MINIO_ROOT_PASSWORD: z.string().min(1), // RAHASIA
    MINIO_BUCKET: z.string().min(1),
    MINIO_USE_SSL: flag('false'),

    // ---------- SMTP ----------
    // Sebelumnya divalidasi terpisah di dalam worker, sehingga ada dua daftar
    // "variabel wajib" yang bisa berbeda isi. Sekarang satu.
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURE: flag('false'),
    SMTP_USER: z.string().min(1),
    SMTP_PASSWORD: z.string().min(1), // RAHASIA
    MAIL_FROM: z.string().min(1),

    // ---------- Akun awal ----------
    // Dibaca langsung dari process.env oleh seeder dan tidak pernah divalidasi.
    // Password kosong membuat seeder menyimpan hash dari string "undefined".
    SUPERADMIN_EMAIL: z.email(),
    SUPERADMIN_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH), // RAHASIA
    SUPERADMIN_FULL_NAME: z.string().min(3),
  })
  .refine((c) => c.REFRESH_TOKEN_EXPIRES_IN > c.JWT_EXPIRES_IN, {
    message:
      'REFRESH_TOKEN_EXPIRES_IN harus lebih panjang dari JWT_EXPIRES_IN — ' +
      'kalau tidak, sesi mati sebelum sempat diperbarui',
    path: ['REFRESH_TOKEN_EXPIRES_IN'],
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.APP_URL.startsWith('http://')), {
    message: 'APP_URL wajib memakai HTTPS di production — tautan reset password melewatinya',
    path: ['APP_URL'],
  })
  .refine((c) => !(c.NODE_ENV === 'production' && c.TRUST_PROXY === 0), {
    message:
      'TRUST_PROXY masih 0 di production — pembatas laju akan melihat IP proxy, ' +
      'bukan IP pengguna, sehingga seluruh pengguna berbagi satu jatah',
    path: ['TRUST_PROXY'],
  });

module.exports = { envSchema };
