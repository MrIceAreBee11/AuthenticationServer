// ============================================================
// BERKAS INI DIBUAT OTOMATIS — JANGAN DIEDIT MANUAL
//
// Sumber kebenaran: tabel "permissions" di database.
// Menambah izin: buat migration baru berisi izin tersebut, lalu jalankan
//   npm run db:migrate && npm run gen:permissions
//
// Suntingan manual di berkas ini akan hilang saat generator dijalankan, dan
// izin yang ditulis tangan tanpa baris di database akan membuat aplikasi
// menolak menyala.
// ============================================================

const PERMISSIONS = {
  // permissions
  PERMISSIONS_READ: 'permissions.read',

  // profile
  PROFILE_READ: 'profile.read',
  PROFILE_UPDATE: 'profile.update',

  // roles
  ROLES_CREATE: 'roles.create',
  ROLES_DELETE: 'roles.delete',
  ROLES_READ: 'roles.read',
  ROLES_UPDATE: 'roles.update',

  // users
  USERS_CREATE: 'users.create',
  USERS_DELETE: 'users.delete',
  USERS_READ: 'users.read',
  USERS_UPDATE: 'users.update',
};

module.exports = { PERMISSIONS };
