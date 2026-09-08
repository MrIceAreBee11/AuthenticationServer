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
const { ERROR_CODES, DEFAULT_CODE_BY_STATUS } = require('../constants/errorCodes');

/**
 * Kegagalan body-parser, dipetakan per err.type.
 *
 * Pesannya sengaja ditulis ulang, TIDAK diteruskan dari error aslinya: pesan
 * bawaan body-parser memantulkan potongan body permintaan
 * ("{\"email\": rusak" is not valid JSON) balik ke klien. Selain tidak
 * berguna bagi pengguna, memantulkan masukan mentah bukan kebiasaan yang layak
 * dipelihara.
 */
const BODY_PARSER_ERRORS = Object.freeze({
  'entity.parse.failed': {
    status: 400,
    code: ERROR_CODES.MALFORMED_JSON,
    message: 'Body permintaan bukan JSON yang valid',
  },
  'entity.too.large': {
    status: 413,
    code: ERROR_CODES.PAYLOAD_TOO_LARGE,
    message: 'Ukuran body permintaan melebihi batas',
  },
  'encoding.unsupported': {
    status: 415,
    code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    message: 'Encoding body permintaan tidak didukung',
  },
  'charset.unsupported': {
    status: 415,
    code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    message: 'Charset body permintaan tidak didukung',
  },
});

class ErrorHandler {
  constructor({ exposeStack, logger }) {
    this.exposeStack = exposeStack;
    this.logger = logger;
  }

  /**
   * Kesalahan yang berasal dari KLIEN, bukan dari kode kita.
   *
   * Pustaka yang memakai http-errors menandai error 4xx dengan expose: true,
   * artinya ia sendiri menganggapnya aman disampaikan ke klien. Penanda itu
   * dipakai sebagai jaring: jenis yang belum terdaftar di atas tetap menjadi
   * 4xx yang benar, bukan berubah menjadi 500 dan mengotori log error.
   */
  #asClientError(err) {
    const known = BODY_PARSER_ERRORS[err.type];

    if (known) {
      return known;
    }

    const status = err.status ?? err.statusCode;

    if (err.expose === true && Number.isInteger(status) && status >= 400 && status < 500) {
      return {
        status,
        code: DEFAULT_CODE_BY_STATUS[status] ?? ERROR_CODES.VALIDATION_FAILED,
        message: 'Permintaan tidak dapat diproses',
      };
    }

    return null;
  }

  handle = (err, req, res, next) => {
    if (err instanceof AppError) {
      return errorResponse(res, err.statusCode, err.message, {
        code: err.code,
        details: err.details,
      });
    }

    // Diperiksa lebih awal, sebelum cabang 500. Sebelum ini, JSON rusak dari
    // klien dijawab 500 DAN dicatat sebagai "error tak tertangani" — jadi
    // kesalahan klien mengotori log error, dan di development stack trace-nya
    // ikut terkirim balik.
    const clientError = this.#asClientError(err);

    if (clientError) {
      return errorResponse(res, clientError.status, clientError.message, {
        code: clientError.code,
      });
    }

    if (err instanceof ConnectionError) {
      this.logger.exception('koneksi database bermasalah', err);

      // 503 dan bukan 500: masalahnya bukan pada permintaannya, dan klien
      // boleh mencoba lagi nanti.
      return errorResponse(res, 503, 'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.', {
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      });
    }

    if (err instanceof UniqueConstraintError) {
      // Nama kolomnya disebut, isinya tidak. "Email sudah digunakan" cukup
      // untuk pengguna; nilai yang bertabrakan justru membocorkan data lain.
      return errorResponse(res, 409, 'Data sudah digunakan oleh akun lain', {
        code: ERROR_CODES.ALREADY_EXISTS,
        details: { fields: err.errors.map((item) => item.path) },
      });
    }

    if (err instanceof ValidationError) {
      return errorResponse(res, 400, err.errors[0]?.message || 'Data tidak valid', {
        code: ERROR_CODES.VALIDATION_FAILED,
        details: {
          errors: err.errors.map((item) => ({ field: item.path, message: item.message })),
        },
      });
    }

    // Hanya error TAK TERDUGA yang dicatat. Penolakan yang disengaja
    // (AppError) sudah tercatat sebagai status 4xx oleh requestLogger, dan
    // mencatatnya dua kali membuat log penuh kejadian normal.
    this.logger.exception('error tak tertangani', err, {
      method: req.method,
      path: req.originalUrl,
    });

    return errorResponse(res, 500, 'Terjadi kesalahan pada server', {
      code: ERROR_CODES.INTERNAL_ERROR,
      details: this.exposeStack ? { stack: err.stack } : null,
    });
  };
}

module.exports = { ErrorHandler };
