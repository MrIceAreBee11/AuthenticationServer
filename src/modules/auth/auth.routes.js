const { Router } = require('express');

const { authController } = require('./auth.controller');
const authenticate = require('../../middlewares/authenticate');
const {
  loginRateLimiter,
  passwordResetRateLimiter,
} = require('../../middlewares/rateLimiter');

const router = Router();

router.post('/login', loginRateLimiter, authController.login);

// Tanpa authenticate: endpoint ini justru dipakai saat access token sudah
// kedaluwarsa. Tanpa rate limiter juga, alasannya sama dengan reset-password
// di bawah — token 32 byte acak tidak ada yang bisa ditebak.
router.post('/refresh', authController.refresh);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);

// Ini daftar izin MILIK SENDIRI, jadi cukup butuh token yang sah.
// Izin permissions.read menjaga katalog seluruh permission di GET /permissions.
router.get('/permissions', authenticate, authController.permissionsOfCurrentUser);

router.post('/forgot-password', passwordResetRateLimiter, authController.forgotPassword);

// Tanpa rate limiter: tidak ada yang bisa ditebak di sini. Menebak token 32
// byte butuh 2^256 percobaan, dan tiap percobaan hanya satu operasi baca Redis.
router.post('/reset-password', authController.resetPassword);

module.exports = router;
