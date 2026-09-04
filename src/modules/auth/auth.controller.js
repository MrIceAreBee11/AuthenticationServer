const authService = require('./auth.service');
const AppError = require('../../utils/AppError');
const { successResponse } = require('../../utils/response');
const passwordService = require('./password.service');
const { getUserPermissions } = require('../../services/permission.service');
const { QUEUES, publish } = require('../../queue');
const env = require('../../config/env');

const login = async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new AppError('Email dan password wajib diisi', 400);
  }

  const result = await authService.login({ email, password });

  return successResponse(res, 200, 'Login berhasil', result);
};

const me = async (req, res) => {
  const user = await authService.getProfile(req.user.id);

  return successResponse(res, 200, 'Data profil berhasil diambil', { user });
};

const logout = async (req, res) => {
  await authService.logout({
    tokenId: req.token.id,
    expiresAt: req.token.expiresAt,
  });

  return successResponse(res, 200, 'Logout berhasil');
};

const permissions = async (req, res) => {
  // Diambil sendiri, bukan mengandalkan req.permissions dari middleware authorize.
  // Controller yang bergantung pada middleware otorisasi untuk DATANYA akan
  // ikut rusak begitu penjagaan route-nya diubah.
  const ownedPermissions = await getUserPermissions(req.user.id);

  return successResponse(res, 200, 'Daftar izin berhasil diambil', {
    permissions: ownedPermissions,
  });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body ?? {};

  if (!email) {
    throw new AppError('Email wajib diisi', 400);
  }

  const result = await passwordService.requestPasswordReset({ email });

  if (result) {
    const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(result.resetToken)}`;

    try {
      await publish(QUEUES.PASSWORD_RESET_EMAIL, {
        to: result.user.email,
        fullName: result.user.fullName,
        resetUrl,
      });
    } catch (error) {
      // Kegagalan antrean TIDAK boleh mengubah response — lihat penjelasan di bawah.
      console.error('[QUEUE] gagal mempublikasikan email reset:', error.message);
    }
  }

  return successResponse(
    res,
    200,
    'Jika email terdaftar, instruksi reset password telah dikirim.'
  );
};

const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body ?? {};

  if (!token || !newPassword) {
    throw new AppError('Token dan password baru wajib diisi', 400);
  }

  await passwordService.resetPassword({ token, newPassword });

  return successResponse(
    res,
    200,
    'Password berhasil diubah. Silakan login kembali.'
  );
};

module.exports = { login, me, logout, permissions, forgotPassword, resetPassword };