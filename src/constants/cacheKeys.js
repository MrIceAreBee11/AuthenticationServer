/**
 * BERKAS INI: awalan kunci Redis dan nama antrean RabbitMQ.
 *
 * KENAPA DI constants/ DAN BUKAN DI .env: ini format data, bukan konfigurasi.
 * Mengubah awalan kunci di production tidak "mengatur ulang" apa pun — ia
 * membuat seluruh kunci lama menjadi sampah yang tidak lagi terjangkau. Token
 * yang sudah dicabut akan berlaku kembali, dan cache izin lama menggantung
 * sampai TTL-nya habis. Nilai seperti ini justru harus sulit diubah.
 *
 * KENAPA DIKUMPULKAN DI SATU BERKAS: awalan token:denylist: dulu ditulis di dua
 * berkas terpisah, dan ketidakcocokannya tidak menghasilkan error — hanya
 * logout yang berhenti bekerja. Sekarang setiap awalan hanya punya satu sumber.
 */
const CACHE_KEYS = Object.freeze({
  TOKEN_DENYLIST: 'token:denylist:',
  PASSWORD_RESET: 'password-reset:',
  PERMISSION_USER: 'permissions:user:',
  PERMISSION_VERSION: 'permissions:version',
  RATE_LIMIT_LOGIN: 'ratelimit:login:',
  RATE_LIMIT_PASSWORD_RESET: 'ratelimit:reset:',
  IDEMPOTENCY: 'idem:',
});

const QUEUES = Object.freeze({
  PASSWORD_RESET_EMAIL: 'password.reset.email',
});

/** Awalan skema Authorization yang diterima middleware autentikasi. */
const BEARER_PREFIX = 'Bearer ';

module.exports = { CACHE_KEYS, QUEUES, BEARER_PREFIX };
