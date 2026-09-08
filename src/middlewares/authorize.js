/**
 * BERKAS INI: pemeriksaan "boleh tidak Anda melakukan ini".
 *
 * KENAPA TERPISAH DARI authenticate: keduanya menjawab pertanyaan berbeda.
 * Autentikasi menjawab "siapa Anda", otorisasi menjawab "apa hak Anda". Route
 * yang cukup butuh token sah memakai yang pertama saja, dan memisahkannya
 * membuat itu terbaca langsung dari definisi route.
 *
 * KENAPA CLASS SEKARANG: berkas ini dulu menyimpan `const
 * requiredPermissionRegistry = new Set()` di module scope. Isinya menumpuk
 * seumur proses dan tidak dapat direset antar berkas pengujian, jadi satu tes
 * mencemari tes berikutnya. Sekarang ia field instance. Selain itu
 * permissionService dulu di-require langsung, sehingga otorisasi tidak bisa
 * diuji tanpa Redis dan PostgreSQL hidup.
 *
 * REGISTRI IZIN: setiap nama izin yang diminta route dicatat saat route
 * didefinisikan, yaitu ketika aplikasi dimuat. Hasilnya daftar "izin apa saja
 * yang benar-benar dipakai kode", tanpa perlu dirawat manusia. server.js
 * membandingkannya dengan isi tabel permissions saat start; kalau ada yang
 * tidak cocok, aplikasi menolak menyala — jauh lebih baik daripada endpoint
 * yang menjawab 403 selamanya tanpa penjelasan.
 */
const AppError = require('../utils/AppError');

class AuthorizeMiddleware {
  #required = new Set();

  constructor({ permissions }) {
    this.permissions = permissions;
  }

  /**
   * Menangkap authorize(PERMISSIONS.SALAH_KETIK) yang bernilai undefined.
   * Tanpa pemeriksaan ini, salah ketik hanya menghasilkan 403 yang senyap —
   * dan senyapnya bertahan sampai ada yang mengeluh.
   */
  #record(names) {
    if (names.length === 0) {
      throw new Error('authorize() harus dipanggil dengan minimal satu permission');
    }

    names.forEach((name) => {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error(
          `authorize() menerima nama izin yang tidak valid (${JSON.stringify(name)}). ` +
            'Kemungkinan salah ketik pada konstanta PERMISSIONS.'
        );
      }

      this.#required.add(name);
    });
  }

  /** Pabrik middleware: dipanggil saat route didefinisikan. */
  require(...names) {
    this.#record(names);

    return async (req, res, next) => {
      if (!req.user) {
        throw new Error('authorize() harus dipasang setelah authenticate()');
      }

      const owned = await this.permissions.getUserPermissions(req.user.id);

      if (names.some((name) => !owned.includes(name))) {
        throw new AppError('Anda tidak memiliki izin untuk mengakses sumber daya ini', 403);
      }

      req.permissions = owned;

      return next();
    };
  }

  /** Daftar izin yang dipakai seluruh route yang sudah termuat. */
  get requiredPermissions() {
    return [...this.#required];
  }
}

module.exports = { AuthorizeMiddleware };
