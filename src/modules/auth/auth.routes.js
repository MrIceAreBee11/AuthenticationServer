/**
 * BERKAS INI: alamat endpoint autentikasi.
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

const { validate } = require('../../middlewares/validate');
const {
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('./auth.schema');

const buildAuthRoutes = ({ controllers, authenticate, rateLimiters }) => {
  const router = Router();
  const auth = controllers.auth;
  const requireToken = authenticate.handle;

  router.post('/login', rateLimiters.login(), validate(loginSchema), auth.login);

  // Tanpa authenticate: endpoint ini justru dipakai saat access token sudah
  // kedaluwarsa. Tanpa pembatas laju juga, alasannya sama dengan
  // reset-password di bawah — token 32 byte acak tidak ada yang bisa ditebak.
  router.post('/refresh', validate(refreshSchema), auth.refresh);

  router.get('/me', requireToken, auth.me);
  router.post('/logout', requireToken, validate(logoutSchema), auth.logout);

  // Ini daftar izin MILIK SENDIRI, jadi cukup butuh token yang sah. Izin
  // permissions.read menjaga katalog seluruh permission di GET /permissions.
  router.get('/permissions', requireToken, auth.permissionsOfCurrentUser);

  router.post(
    '/forgot-password',
    rateLimiters.passwordReset(),
    validate(forgotPasswordSchema),
    auth.forgotPassword
  );

  // Tanpa pembatas laju: tidak ada yang bisa ditebak di sini. Menebak token 32
  // byte butuh 2^256 percobaan, dan tiap percobaan hanya satu operasi baca.
  router.post('/reset-password', validate(resetPasswordSchema), auth.resetPassword);

  return router;
};

module.exports = { buildAuthRoutes };
