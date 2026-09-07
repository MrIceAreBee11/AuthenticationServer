'use strict';

/**
 * Seeder ini hanya mengurus role dan pemetaan role ke izin.
 *
 * Katalog izin itu sendiri berada di migration add-permissions-catalog,
 * karena kode aplikasi bergantung padanya dan migration dijamin jalan di
 * setiap environment. Lihat komentar di migration tersebut.
 *
 * Nama izin di bawah ditulis sebagai teks literal, tidak mengambil dari
 * src/constants/permissions.js. Seeder adalah catatan sejarah: kalau ia
 * mengimpor konstanta, perilakunya akan ikut berubah secara retroaktif setiap
 * kali konstanta diubah — padahal yang seharusnya ia gambarkan adalah keadaan
 * saat ia pertama dijalankan.
 */

const ROLES = [
  { name: 'superadmin', description: 'Akses penuh ke seluruh sistem' },
  { name: 'admin', description: 'Mengelola user, tidak dapat mengubah role' },
  { name: 'user', description: 'Hanya dapat mengelola profil sendiri' },
];

const ROLE_PERMISSIONS = {
  admin: [
    'users.create',
    'users.read',
    'users.update',
    'users.delete',
    'roles.read',
    'profile.read',
    'profile.update',
  ],
  user: ['profile.read', 'profile.update'],
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('roles', ROLES, { ignoreDuplicates: true });

    const [permissionRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions'
    );
    const [roleRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles'
    );

    if (permissionRows.length === 0) {
      throw new Error(
        'Tabel permissions masih kosong. Jalankan "npm run db:migrate" terlebih dahulu.'
      );
    }

    const permissionIdByName = Object.fromEntries(
      permissionRows.map((row) => [row.name, row.id])
    );
    const roleIdByName = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));

    // superadmin mendapat SELURUH izin yang ada di database, bukan daftar yang
    // ditulis ulang di sini. Dengan begitu izin yang ditambahkan lewat
    // migration baru tidak mungkin terlewat dari superadmin.
    const assignments = {
      superadmin: permissionRows.map((row) => row.name),
      ...ROLE_PERMISSIONS,
    };

    const rolePermissionRows = Object.entries(assignments).flatMap(
      ([roleName, permissionNames]) =>
        permissionNames.map((permissionName) => {
          const permissionId = permissionIdByName[permissionName];

          if (!permissionId) {
            throw new Error(
              `Izin "${permissionName}" tidak ada di database. Periksa migration katalog izin.`
            );
          }

          return { role_id: roleIdByName[roleName], permission_id: permissionId };
        })
    );

    await queryInterface.bulkInsert('role_permissions', rolePermissionRows, {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    // Izin tidak dihapus di sini — penghapusannya menjadi tanggung jawab
    // migration yang membuatnya.
    await queryInterface.bulkDelete('role_permissions', null);
    await queryInterface.bulkDelete('roles', null);
  },
};
