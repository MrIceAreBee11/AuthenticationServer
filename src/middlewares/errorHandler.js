/**
 * BERKAS INI: satu-satunya tempat error diubah menjadi jawaban HTTP.
 *
 * KENAPA TERPUSAT: kalau setiap controller menangani error-nya sendiri, bentuk
 * jawaban gagal akan berbeda-beda dan cepat atau lambat ada yang membocorkan
 * stack trace atau pesan driver basis data. Dengan satu pintu, kebocoran
 * seperti itu hanya mungkin terjadi di satu berkas — dan berkas itu ini.
 *
 * KENAPA CLASS: ia mengimpor config secara langsung untuk memutuskan apakah
 * stack trace ikut dikirim. Keputusan itu keputusan lingkungan, dan sebuah
 * berkas yang membaca lingkungannya sendiri tidak dapat diuji untuk kedua
 * kemungkinan tanpa mengubah environment global.
 *
 * KENAPA HARUS TERDAFTAR PALING AKHIR: Express mengenali error handler dari
 * jumlah parameternya (empat), dan hanya memanggil yang terdaftar setelah
 * seluruh route.
 *
 * URUTAN PEMERIKSAAN dari yang paling spesifik ke paling umum. Error yang tidak
 * dikenali jatuh ke 500 — dan hanya di situlah pesan aslinya dicatat, karena
 * hanya error tak terduga yang perlu ditelusuri.
 */
const { ValidationError, UniqueConstraintError, ConnectionError } = require('sequelize');

const AppError = require('../utils/AppError');
const { errorResponse } = require('../utils/response');

class ErrorHandler {
  constructor({ exposeStack }) {
    this.exposeStack = exposeStack;
  }

  handle = (err, req, res, next) => {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, err.message);
    }

    if (err instanceof ConnectionError) {
      console.error('[DATABASE] koneksi bermasalah:', err.message);

      // 503 dan bukan 500: masalahnya bukan pada permintaannya, dan klien
      // boleh mencoba lagi nanti.
      return errorResponse(
        res,
        503,
        'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.'
      );
    }

    if (err instanceof UniqueConstraintError) {
      // Nama kolomnya disebut, isinya tidak. "Email sudah digunakan" cukup
      // untuk pengguna; nilai yang bertabrakan justru membocorkan data lain.
      return errorResponse(res, 409, 'Data sudah digunakan oleh akun lain', {
        fields: err.errors.map((item) => item.path),
      });
    }

    if (err instanceof ValidationError) {
      return errorResponse(res, 400, err.errors[0]?.message || 'Data tidak valid', {
        errors: err.errors.map((item) => ({ field: item.path, message: item.message })),
      });
    }

    console.error('[UNEXPECTED ERROR]', err);

    return errorResponse(
      res,
      500,
      'Terjadi kesalahan pada server',
      this.exposeStack ? { stack: err.stack } : null
    );
  };
}

module.exports = { ErrorHandler };
