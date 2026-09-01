const { Router } = require('express');

const { login, me, logout, permissions, forgotPassword, resetPassword } = require('./auth.controller');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { PERMISSIONS } = require('../../constants/permissions');
const { loginRateLimiter, passwordResetRateLimiter } = require('../../middlewares/rateLimiter');

const router = Router();

router.post('/login', loginRateLimiter, login);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.get('/permissions', authenticate, authorize(PERMISSIONS.PERMISSIONS_READ ), permissions);
router.post('/forgot-password', passwordResetRateLimiter, forgotPassword);
router.post('/reset-password',resetPassword);
module.exports = router;