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
const { validate } = require('../../middlewares/validate');
const {
  listUsersQuerySchema,
  userIdParamSchema,
  createUserSchema,
  updateUserSchema,
  setUserRolesSchema,
} = require('./users.schema');

const buildUsersRoutes = ({ controllers, authenticate, authorize, idempotency }) => {
  const router = Router();
  const users = controllers.users;
  const requireToken = authenticate.handle;

  const canRead = authorize.require(PERMISSIONS.USERS_READ);
  const withId = validate(userIdParamSchema, 'params');

  router.get('/', requireToken, canRead, validate(listUsersQuerySchema, 'query'), users.list);

  // Idempotensi hanya dipasang pada POST. PATCH dan PUT di sini sudah
  // idempoten dengan sendirinya — mengirimnya dua kali menghasilkan keadaan
  // akhir yang sama. Yang tidak, dan karena itu perlu dijaga, adalah
  // pembuatan data baru.
  router.post(
    '/',
    requireToken,
    authorize.require(PERMISSIONS.USERS_CREATE),
    idempotency.handle,
    validate(createUserSchema),
    users.create
  );

  router.get('/:id', requireToken, canRead, withId, users.getById);

  router.patch(
    '/:id',
    requireToken,
    authorize.require(PERMISSIONS.USERS_UPDATE),
    withId,
    validate(updateUserSchema),
    users.update
  );

  router.delete(
    '/:id',
    requireToken,
    authorize.require(PERMISSIONS.USERS_DELETE),
    withId,
    users.remove
  );

  // Dijaga roles.update, BUKAN users.update. Kalau dijaga users.update, setiap
  // pemegang izin itu dapat memberikan role superadmin kepada dirinya sendiri
  // dan seluruh pembatasan RBAC hilang dalam satu permintaan.
  router.put(
    '/:id/roles',
    requireToken,
    authorize.require(PERMISSIONS.ROLES_UPDATE),
    withId,
    validate(setUserRolesSchema),
    users.setRoles
  );

  return router;
};

module.exports = { buildUsersRoutes };
