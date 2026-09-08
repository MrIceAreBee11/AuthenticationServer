/**
 * BERKAS INI: satu-satunya jenis error yang boleh dilempar logika bisnis.
 *
 * KENAPA DI utils/: dipakai seluruh lapisan, dari middleware sampai service.
 *
 * KENAPA PERLU JENIS SENDIRI: error handler harus dapat membedakan "penolakan
 * yang memang disengaja" dari "sesuatu yang rusak". AppError berarti yang
 * pertama — statusCode dan pesannya aman dikirim ke klien. Error jenis lain
 * berarti yang kedua, dan pesannya TIDAK boleh keluar karena bisa memuat nama
 * kolom, potongan query, atau isi variabel.
 *
 * KENAPA MEWARISI Error: `instanceof` menjadi cara memeriksanya, dan stack
 * trace-nya tetap utuh untuk ditelusuri.
 */

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;