/**
 * BERKAS INI: alamat endpoint role.
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

const buildRolesRoutes = ({ controllers, authenticate, authorize }) => {
  const router = Router();
  const roles = controllers.roles;
  const requireToken = authenticate.handle;
  const canUpdate = authorize.require(PERMISSIONS.ROLES_UPDATE);

  router.get('/', requireToken, authorize.require(PERMISSIONS.ROLES_READ), roles.list);
  router.post('/', requireToken, authorize.require(PERMISSIONS.ROLES_CREATE), roles.create);
  router.get('/:id', requireToken, authorize.require(PERMISSIONS.ROLES_READ), roles.getById);
  router.patch('/:id', requireToken, canUpdate, roles.update);
  router.delete('/:id', requireToken, authorize.require(PERMISSIONS.ROLES_DELETE), roles.remove);
  router.put('/:id/permissions', requireToken, canUpdate, roles.setPermissions);

  return router;
};

module.exports = { buildRolesRoutes };
