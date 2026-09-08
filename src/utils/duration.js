const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86400 };

const PATTERN = /^(\d+)([smhd])$/;

/**
 * Mengubah durasi bergaya "15m" atau "7d" menjadi jumlah detik.
 *
 * Ditulis sendiri, bukan memakai paket, karena bentuk yang perlu didukung
 * hanya empat satuan dan seluruhnya sudah tercakup satu ekspresi reguler.
 *
 * Yang justru penting di sini bukan pengubahannya, melainkan penolakannya.
 * Nilai seperti "7 hari", "1w", atau "7" akan ditolak dengan pesan yang
 * menyebutkan format yang benar — dan karena fungsi ini dipanggil dari
 * pembacaan environment, penolakan itu terjadi pada detik pertama aplikasi
 * dijalankan. Tanpa pemeriksaan ini, salah tulis satu satuan menghasilkan NaN
 * yang mengalir sampai ke kolom tanggal, dan kegagalannya baru terlihat jauh
 * di kemudian hari.
 */
const parseDuration = (value, variableName = 'Durasi') => {
  const match = PATTERN.exec(String(value ?? '').trim());

  if (!match) {
    throw new Error(
      `${variableName} bernilai "${value}" yang tidak dikenali. ` +
        'Formatnya angka diikuti satuan s, m, h, atau d — contoh: 15m, 24h, 7d.'
    );
  }

  const [, amount, unit] = match;
  const seconds = Number(amount) * SECONDS_PER_UNIT[unit];

  if (seconds <= 0) {
    throw new Error(`${variableName} bernilai "${value}" yang harus lebih dari nol.`);
  }

  return seconds;
};

module.exports = { parseDuration };
