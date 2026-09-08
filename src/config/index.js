/**
 * BERKAS INI: titik tunggal tempat process.env dibaca, divalidasi, lalu
 * dipotong menjadi irisan (slice) yang siap disuntikkan.
 *
 * KENAPA DI config/ DAN SATU-SATUNYA: begitu ada berkas kedua yang menyentuh
 * process.env, jaminannya hilang — konfigurasi bisa dibaca sebelum divalidasi,
 * dengan tipe yang salah, di tengah siklus permintaan.
 *
 * KENAPA DIPOTONG JADI IRISAN: sebuah class sebaiknya menerima persis yang ia
 * butuhkan. `new PasswordService({ policy: config.password })` membuat
 * dependensinya terbaca dari tanda tangan constructor, dan di pengujian cukup
 * `{ minLength: 12, resetTtlSeconds: 900 }`. Menyuntikkan seluruh objek config
 * menyembunyikan apa yang sebenarnya dipakai dan membuat setiap pengujian harus
 * menyusun konfigurasi lengkap.
 *
 * KENAPA process.exit, BUKAN throw: kegagalan konfigurasi bukan error yang
 * pantas ditangani siapa pun. Aplikasi yang menyala dengan JWT_SECRET kosong
 * jauh lebih berbahaya daripada aplikasi yang menolak menyala.
 */
// Satu-satunya pemanggilan dotenv di seluruh project. Diletakkan di sini,
// bukan di server.js, karena sequelize-cli masuk lewat src/config/database.js
// dan tidak pernah melewati server.js sama sekali.
require('dotenv').config({ quiet: true });

const { envSchema } = require('./env.schema');

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Sengaja console.error dan bukan logger: logger sendiri dibangun dari
  // konfigurasi yang barusan gagal divalidasi.
  //
  // Seluruh masalah dicetak sekaligus, bukan berhenti di yang pertama. Dengan
  // begitu .env diperbaiki dalam satu putaran, bukan sepuluh kali restart.
  console.error('[config] Environment tidak valid:');

  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.') || '(lintas variabel)'}: ${issue.message}`);
  });

  process.exit(1);
}

const raw = parsed.data;

const config = Object.freeze({
  app: Object.freeze({
    env: raw.NODE_ENV,
    port: raw.PORT,
    url: raw.APP_URL,
    trustProxy: raw.TRUST_PROXY,
    shutdownTimeoutMs: raw.SHUTDOWN_TIMEOUT_MS,
    jsonBodyLimit: raw.JSON_BODY_LIMIT,
    isDevelopment: raw.NODE_ENV === 'development',
    isProduction: raw.NODE_ENV === 'production',
  }),

  database: Object.freeze({
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    name: raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD,
    pool: Object.freeze({
      max: raw.DB_POOL_MAX,
      min: raw.DB_POOL_MIN,
      idle: raw.DB_POOL_IDLE_MS,
    }),
  }),

  cache: Object.freeze({
    host: raw.REDIS_HOST,
    port: raw.REDIS_PORT,
    password: raw.REDIS_PASSWORD,
    connectTimeoutMs: raw.REDIS_CONNECT_TIMEOUT_MS,
    readyTimeoutMs: raw.REDIS_READY_TIMEOUT_MS,
    reconnectStepMs: raw.REDIS_RECONNECT_STEP_MS,
    reconnectMaxMs: raw.REDIS_RECONNECT_MAX_MS,
  }),

  token: Object.freeze({
    secret: raw.JWT_SECRET,
    accessTtlSeconds: raw.JWT_EXPIRES_IN,
    refreshTtlSeconds: raw.REFRESH_TOKEN_EXPIRES_IN,
    opaqueBytes: raw.OPAQUE_TOKEN_BYTES,
  }),

  password: Object.freeze({
    minLength: raw.PASSWORD_MIN_LENGTH,
    saltRounds: raw.BCRYPT_SALT_ROUNDS,
    resetTtlSeconds: raw.PASSWORD_RESET_TTL_SECONDS,
  }),

  rateLimit: Object.freeze({
    login: Object.freeze({
      windowMs: raw.LOGIN_RATE_LIMIT_WINDOW_MS,
      maxAttempts: raw.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    }),
    passwordReset: Object.freeze({
      windowMs: raw.PASSWORD_RESET_WINDOW_MS,
      maxAttempts: raw.PASSWORD_RESET_MAX_REQUESTS,
    }),
  }),

  permission: Object.freeze({ cacheTtlSeconds: raw.PERMISSION_CACHE_TTL_SECONDS }),

  upload: Object.freeze({
    avatar: Object.freeze({
      maxSizeBytes: raw.AVATAR_MAX_SIZE_BYTES,
      allowedMimeTypes: Object.freeze(raw.AVATAR_ALLOWED_MIME_TYPES),
      urlTtlSeconds: raw.AVATAR_URL_TTL_SECONDS,
    }),
  }),

  pagination: Object.freeze({
    users: Object.freeze({
      defaultSize: raw.USERS_DEFAULT_PAGE_SIZE,
      maxSize: raw.USERS_MAX_PAGE_SIZE,
    }),
  }),

  queue: Object.freeze({
    url: `amqp://${encodeURIComponent(raw.RABBITMQ_USER)}:${encodeURIComponent(
      raw.RABBITMQ_PASSWORD
    )}@${raw.RABBITMQ_HOST}:${raw.RABBITMQ_PORT}`,
  }),

  storage: Object.freeze({
    host: raw.MINIO_HOST,
    port: raw.MINIO_PORT,
    useSSL: raw.MINIO_USE_SSL,
    accessKey: raw.MINIO_ROOT_USER,
    secretKey: raw.MINIO_ROOT_PASSWORD,
    bucket: raw.MINIO_BUCKET,
  }),

  mail: Object.freeze({
    host: raw.SMTP_HOST,
    port: raw.SMTP_PORT,
    secure: raw.SMTP_SECURE,
    user: raw.SMTP_USER,
    password: raw.SMTP_PASSWORD,
    from: raw.MAIL_FROM,
  }),

  seed: Object.freeze({
    email: raw.SUPERADMIN_EMAIL,
    password: raw.SUPERADMIN_PASSWORD,
    fullName: raw.SUPERADMIN_FULL_NAME,
  }),
});

module.exports = { config };
