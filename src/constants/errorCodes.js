/**
 * BERKAS INI: kode error yang dapat dibaca mesin.
 *
 * KENAPA DI constants/: himpunan tertutup, tidak pernah berbeda per lingkungan.
 *
 * KENAPA PERLU ADA SAMA SEKALI: sebelum ini, satu-satunya cara klien
 * membedakan jenis kegagalan adalah mencocokkan teks pesannya. Itu rapuh dari
 * dua arah — pesan diubah untuk memperbaiki bahasanya dan klien langsung
 * rusak, atau klien mencocokkan potongan teks yang ternyata muncul juga di
 * pesan lain. Kode ini stabil dan boleh diandalkan; pesannya boleh berubah
 * kapan saja karena ia untuk manusia.
 *
 * KENAPA PENTING DI SINI SPESIFIKNYA: banyak kegagalan berbagi status HTTP
 * yang sama tetapi menuntut tindakan berbeda dari klien.
 *
 *   401 TOKEN_EXPIRED   -> perbarui token, lalu ulangi permintaannya
 *   401 TOKEN_REVOKED   -> jangan diulangi, minta pengguna login
 *   401 PASSWORD_CHANGED-> sama, tetapi pesannya untuk pengguna berbeda
 *
 * Ketiganya 401. Tanpa kode, klien harus menebak dari teks bahasa Indonesia.
 *
 * ATURAN PENAMAAN: huruf besar dengan garis bawah, menyatakan APA yang terjadi
 * dan bukan apa yang harus dilakukan. Sekali sebuah kode dipakai klien, ia
 * bagian dari kontrak API — boleh ditambah, tidak boleh diganti nama.
 */
const ERROR_CODES = Object.freeze({
  // ---------- 400 ----------
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_ID: 'INVALID_ID',
  NOTHING_TO_UPDATE: 'NOTHING_TO_UPDATE',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_UNSUPPORTED: 'FILE_TYPE_UNSUPPORTED',
  FILE_MISSING: 'FILE_MISSING',
  AVATAR_ABSENT: 'AVATAR_ABSENT',

  // ---------- 401 ----------
  CREDENTIALS_INVALID: 'CREDENTIALS_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ACCOUNT_UNKNOWN: 'ACCOUNT_UNKNOWN',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // ---------- 403 ----------
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SELF_MANAGEMENT_FORBIDDEN: 'SELF_MANAGEMENT_FORBIDDEN',
  SUPERADMIN_PROTECTED: 'SUPERADMIN_PROTECTED',
  ROLE_PROTECTED: 'ROLE_PROTECTED',

  // ---------- 404 ----------
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',

  // ---------- 409 ----------
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  ROLE_IN_USE: 'ROLE_IN_USE',

  // ---------- 429 / 5xx ----------
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/**
 * Kode bawaan per status HTTP.
 *
 * Ada supaya penambahan kode ini tidak memaksa lima puluh titik throw disunting
 * sekaligus. Titik yang kodenya membawa keterangan LEBIH dari statusnya
 * menyebutkannya sendiri; sisanya cukup mewarisi bawaan ini.
 */
const DEFAULT_CODE_BY_STATUS = Object.freeze({
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.TOKEN_INVALID,
  403: ERROR_CODES.PERMISSION_DENIED,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.ALREADY_EXISTS,
  429: ERROR_CODES.RATE_LIMITED,
  503: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
});

module.exports = { ERROR_CODES, DEFAULT_CODE_BY_STATUS };
