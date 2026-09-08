/**
 * BERKAS INI: alamat endpoint profil sendiri.
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
const { updateProfileSchema } = require('./profile.schema');

const buildProfileRoutes = ({ controllers, authenticate, authorize, upload }) => {
  const router = Router();
  const profile = controllers.profile;
  const requireToken = authenticate.handle;
  const canRead = authorize.require(PERMISSIONS.PROFILE_READ);
  const canUpdate = authorize.require(PERMISSIONS.PROFILE_UPDATE);

  router.get('/', requireToken, canRead, profile.get);
  router.patch('/', requireToken, canUpdate, validate(updateProfileSchema), profile.update);

  // upload diletakkan SETELAH authenticate dan authorize. Multer membaca
  // seluruh body ke memori; kalau ia dipasang lebih dulu, permintaan tanpa
  // izin pun memaksa server menyerap 2 MB sebelum akhirnya ditolak.
  router.post('/avatar', requireToken, canUpdate, upload.handle, profile.uploadAvatar);
  router.delete('/avatar', requireToken, canUpdate, profile.removeAvatar);

  return router;
};

module.exports = { buildProfileRoutes };
