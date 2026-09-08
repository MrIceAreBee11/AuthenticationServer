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
const { validate } = require('../../middlewares/validate');
const {
  roleIdParamSchema,
  createRoleSchema,
  updateRoleSchema,
  setRolePermissionsSchema,
} = require('./roles.schema');

const buildRolesRoutes = ({ controllers, authenticate, authorize }) => {
  const router = Router();
  const roles = controllers.roles;
  const requireToken = authenticate.handle;
  const canUpdate = authorize.require(PERMISSIONS.ROLES_UPDATE);

  const canRead = authorize.require(PERMISSIONS.ROLES_READ);
  const withId = validate(roleIdParamSchema, 'params');

  router.get('/', requireToken, canRead, roles.list);

  router.post(
    '/',
    requireToken,
    authorize.require(PERMISSIONS.ROLES_CREATE),
    validate(createRoleSchema),
    roles.create
  );

  router.get('/:id', requireToken, canRead, withId, roles.getById);
  router.patch('/:id', requireToken, canUpdate, withId, validate(updateRoleSchema), roles.update);

  router.delete(
    '/:id',
    requireToken,
    authorize.require(PERMISSIONS.ROLES_DELETE),
    withId,
    roles.remove
  );

  router.put(
    '/:id/permissions',
    requireToken,
    canUpdate,
    withId,
    validate(setRolePermissionsSchema),
    roles.setPermissions
  );

  return router;
};

module.exports = { buildRolesRoutes };
