'use strict';

const { PERMISSIONS } = require('../../constants/permissions');

const PERMISSION_SEED = [
  { name: PERMISSIONS.USERS_CREATE, description: 'Membuat user baru' },
  { name: PERMISSIONS.USERS_READ, description: 'Melihat daftar dan detail user' },
  { name: PERMISSIONS.USERS_UPDATE, description: 'Mengubah data user' },
  { name: PERMISSIONS.USERS_DELETE, description: 'Menghapus user' },
  { name: PERMISSIONS.ROLES_CREATE, description: 'Membuat role baru' },
  { name: PERMISSIONS.ROLES_READ, description: 'Melihat daftar role' },
  { name: PERMISSIONS.ROLES_UPDATE, description: 'Mengubah role dan permission-nya' },
  { name: PERMISSIONS.ROLES_DELETE, description: 'Menghapus role' },
  { name: PERMISSIONS.PERMISSIONS_READ, description: 'Melihat daftar permission' },
  { name: PERMISSIONS.PROFILE_READ, description: 'Melihat profil sendiri' },
  { name: PERMISSIONS.PROFILE_UPDATE, description: 'Mengubah profil sendiri' },
];

const ROLES = [
  { name: 'superadmin', description: 'Akses penuh ke seluruh sistem' },
  { name: 'admin', description: 'Mengelola user, tidak dapat mengubah role' },
  { name: 'user', description: 'Hanya dapat mengelola profil sendiri' },
];

const ROLE_PERMISSIONS = {
  superadmin: PERMISSION_SEED.map((permission) => permission.name),
  admin: [
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.PROFILE_READ,
    PERMISSIONS.PROFILE_UPDATE,
  ],
  user: [PERMISSIONS.PROFILE_READ, PERMISSIONS.PROFILE_UPDATE],
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('permissions', PERMISSION_SEED);
    await queryInterface.bulkInsert('roles', ROLES);

    const [permissionRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM permissions'
    );
    const [roleRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles'
    );

    const permissionIdByName = Object.fromEntries(
      permissionRows.map((row) => [row.name, row.id])
    );
    const roleIdByName = Object.fromEntries(
      roleRows.map((row) => [row.name, row.id])
    );

    const rolePermissionRows = Object.entries(ROLE_PERMISSIONS).flatMap(
      ([roleName, permissionNames]) =>
        permissionNames.map((permissionName) => ({
          role_id: roleIdByName[roleName],
          permission_id: permissionIdByName[permissionName],
        }))
    );

    await queryInterface.bulkInsert('role_permissions', rolePermissionRows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('role_permissions', null);
    await queryInterface.bulkDelete('roles', null);
    await queryInterface.bulkDelete('permissions', null);
  },
};