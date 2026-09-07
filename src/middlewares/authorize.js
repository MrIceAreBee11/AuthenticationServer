const AppError = require('../utils/AppError');
const { getUserPermissions } = require('../services/permission.service');

/**
 * Setiap nama izin yang diminta oleh route dicatat di sini saat route
 * didefinisikan, yaitu ketika aplikasi dimuat. Isinya menjadi daftar
 * "izin apa saja yang benar-benar dipakai kode" tanpa perlu dirawat manusia.
 *
 * server.js membandingkan daftar ini dengan isi tabel permissions saat start.
 * Kalau ada yang tidak cocok, aplikasi menolak menyala — jauh lebih baik
 * daripada endpoint yang menjawab 403 selamanya tanpa penjelasan.
 */
const requiredPermissionRegistry = new Set();

const authorize = (...requiredPermissions) => {
  if (requiredPermissions.length === 0) {
    throw new Error('authorize() harus dipanggil dengan minimal satu permission');
  }

  requiredPermissions.forEach((permission) => {
    // Menangkap authorize(PERMISSIONS.SALAH_KETIK) yang bernilai undefined.
    // Tanpa pemeriksaan ini, salah ketik hanya menghasilkan 403 yang senyap.
    if (typeof permission !== 'string' || permission.trim().length === 0) {
      throw new Error(
        `authorize() menerima nama izin yang tidak valid (${JSON.stringify(permission)}). ` +
          'Kemungkinan salah ketik pada konstanta PERMISSIONS.'
      );
    }

    requiredPermissionRegistry.add(permission);
  });

  return async (req, res, next) => {
    if (!req.user) {
      throw new Error('authorize() harus dipasang setelah authenticate()');
    }

    const ownedPermissions = await getUserPermissions(req.user.id);

    const missingPermissions = requiredPermissions.filter(
      (permission) => !ownedPermissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      throw new AppError(
        'Anda tidak memiliki izin untuk mengakses sumber daya ini',
        403
      );
    }

    req.permissions = ownedPermissions;

    return next();
  };
};

/** Daftar izin yang dipakai seluruh route yang sudah termuat. */
authorize.getRequiredPermissions = () => [...requiredPermissionRegistry];

module.exports = authorize;
