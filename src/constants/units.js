/**
 * BERKAS INI: satuan ukuran — waktu dan besaran byte.
 *
 * KENAPA DI constants/: isinya fakta yang tidak pernah berubah di lingkungan
 * mana pun. Satu menit selalu 60 detik, satu MB selalu 1.048.576 byte. Nilai
 * seperti ini tidak punya alasan untuk dapat dikonfigurasi.
 *
 * Aturan pembedanya: SATUAN adalah konstanta, NILAI adalah konfigurasi.
 * `15 * MS.MINUTE` sebagai nilai bawaan skema env itu benar; `const
 * FIFTEEN_MINUTES = 900000` yang terkubur di dalam rateLimiter.js adalah
 * pelanggaran, karena tombol operasionalnya jadi tidak terjangkau.
 */
const MS = Object.freeze({
  SECOND: 1_000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
});

const SECONDS = Object.freeze({
  MINUTE: 60,
  HOUR: 3_600,
  DAY: 86_400,
});

const BYTES = Object.freeze({
  KB: 1_024,
  MB: 1_048_576,
});

module.exports = { MS, SECONDS, BYTES };
