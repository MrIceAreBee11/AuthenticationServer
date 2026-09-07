const { Router } = require('express');

const { profileController } = require('./profile.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { uploadAvatar } = require('../../middlewares/upload');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.PROFILE_READ), profileController.get);
router.patch('/', authenticate, authorize(PERMISSIONS.PROFILE_UPDATE), profileController.update);

// uploadAvatar diletakkan SETELAH authenticate dan authorize. Multer membaca
// seluruh body ke memori; kalau ia dipasang lebih dulu, permintaan tanpa izin
// pun memaksa server menyerap 2 MB sebelum akhirnya ditolak.
router.post(
  '/avatar',
  authenticate,
  authorize(PERMISSIONS.PROFILE_UPDATE),
  uploadAvatar,
  profileController.uploadAvatar
);

router.delete(
  '/avatar',
  authenticate,
  authorize(PERMISSIONS.PROFILE_UPDATE),
  profileController.removeAvatar
);

module.exports = router;
