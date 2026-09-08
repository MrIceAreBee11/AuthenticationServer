/**
 * BERKAS INI: alamat endpoint pengelolaan pengguna.
 *
 * KENAPA PABRIK, BUKAN ROUTER SIAP PAKAI: router lama dibuat sebagai efek
 * samping saat berkas di-require, dan ia mengambil controller dari singleton
 * yang diekspor modul. Sekarang ia menerima container, sehingga satu-satunya
 * tempat yang tahu implementasi konkret tetap src/container.js.
 *
 * ISINYA SENGAJA HANYA URUTAN: alamat, rantai middleware, dan handler. Tidak
 * ada satu pun `if` atas data bisnis di sini — begitu ada, ia milik service.
 */
const { Router } = require('express');

const { PERMISSIONS } = require('../../constants/permissions');

const buildUsersRoutes = ({ controllers, authenticate, authorize }) => {
  const router = Router();
  const users = controllers.users;
  const requireToken = authenticate.handle;

  router.get('/', requireToken, authorize.require(PERMISSIONS.USERS_READ), users.list);
  router.post('/', requireToken, authorize.require(PERMISSIONS.USERS_CREATE), users.create);
  router.get('/:id', requireToken, authorize.require(PERMISSIONS.USERS_READ), users.getById);
  router.patch('/:id', requireToken, authorize.require(PERMISSIONS.USERS_UPDATE), users.update);
  router.delete('/:id', requireToken, authorize.require(PERMISSIONS.USERS_DELETE), users.remove);

  // Dijaga roles.update, BUKAN users.update. Kalau dijaga users.update, setiap
  // pemegang izin itu dapat memberikan role superadmin kepada dirinya sendiri
  // dan seluruh pembatasan RBAC hilang dalam satu permintaan.
  router.put(
    '/:id/roles',
    requireToken,
    authorize.require(PERMISSIONS.ROLES_UPDATE),
    users.setRoles
  );

  return router;
};

module.exports = { buildUsersRoutes };
