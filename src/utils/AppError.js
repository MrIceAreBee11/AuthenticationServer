/**
 * BERKAS INI: satu-satunya jenis error yang boleh dilempar logika bisnis.
 *
 * KENAPA DI utils/: dipakai seluruh lapisan, dari middleware sampai service.
 *
 * KENAPA PERLU JENIS SENDIRI: error handler harus dapat membedakan "penolakan
 * yang memang disengaja" dari "sesuatu yang rusak". AppError berarti yang
 * pertama — status, kode, dan pesannya aman dikirim ke klien. Error jenis lain
 * berarti yang kedua, dan pesannya TIDAK boleh keluar karena bisa memuat nama
 * kolom, potongan query, atau isi variabel.
 *
 * KENAPA ADA KODE, BUKAN CUKUP STATUS: banyak kegagalan berbagi status yang
 * sama tetapi menuntut tindakan berbeda. Token kedaluwarsa dan token dicabut
 * dua-duanya 401, tetapi yang pertama harus diperbarui dan yang kedua harus
 * login ulang. Tanpa kode, klien menebak dari teks pesan berbahasa Indonesia.
 *
 * KENAPA SUBCLASS: `new UnauthorizedError('...')` menyatakan maksudnya di nama
 * class, dan statusnya tidak lagi bisa salah tulis. Angka 401 dan 403 gampang
 * tertukar, dan tertukarnya berarti pesan penolakan mengonfirmasi hal yang
 * seharusnya disembunyikan.
 */
const { DEFAULT_CODE_BY_STATUS, ERROR_CODES } = require('../constants/errorCodes');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code ?? DEFAULT_CODE_BY_STATUS[statusCode] ?? ERROR_CODES.INTERNAL_ERROR;

    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — permintaannya sendiri yang salah bentuk atau tidak lengkap. */
class BadRequestError extends AppError {
  constructor(message, code) {
    super(message, 400, code);
  }
}

/** 401 — identitasnya belum terbukti. Klien boleh mencoba lagi setelah login. */
class UnauthorizedError extends AppError {
  constructor(message, code) {
    super(message, 401, code);
  }
}

/** 403 — identitasnya terbukti, tetapi haknya tidak cukup. Mengulangi tidak menolong. */
class ForbiddenError extends AppError {
  constructor(message, code) {
    super(message, 403, code);
  }
}

class NotFoundError extends AppError {
  constructor(message, code) {
    super(message, 404, code);
  }
}

/** 409 — permintaannya sah, tetapi bertabrakan dengan keadaan yang ada. */
class ConflictError extends AppError {
  constructor(message, code) {
    super(message, 409, code);
  }
}

/**
 * 503 — bukan permintaannya yang bermasalah, melainkan dependensi di
 * belakangnya. Klien boleh mencoba lagi nanti; 500 akan menyesatkan.
 */
class ServiceUnavailableError extends AppError {
  constructor(message, code) {
    super(message, 503, code);
  }
}

module.exports = AppError;
module.exports.AppError = AppError;
module.exports.BadRequestError = BadRequestError;
module.exports.UnauthorizedError = UnauthorizedError;
module.exports.ForbiddenError = ForbiddenError;
module.exports.NotFoundError = NotFoundError;
module.exports.ConflictError = ConflictError;
module.exports.ServiceUnavailableError = ServiceUnavailableError;
