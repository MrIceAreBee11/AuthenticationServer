const { Router } = require('express');

const { getProfile, updateProfile, updateAvatar, removeAvatar } = require('./profile.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { uploadAvatar } = require('../../middlewares/upload');
const { PERMISSIONS } = require('../../constants/permissions');

const router = Router();

router.get('/', authenticate, authorize(PERMISSIONS.PROFILE_READ), getProfile);
router.patch('/', authenticate, authorize(PERMISSIONS.PROFILE_UPDATE), updateProfile);
router.post('/avatar', authenticate, authorize(PERMISSIONS.PROFILE_UPDATE), uploadAvatar, updateAvatar);
router.delete('/avatar', authenticate, authorize(PERMISSIONS.PROFILE_UPDATE), removeAvatar);

module.exports = router;