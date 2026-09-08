const AppError = require('../../utils/AppError');
const { successResponse } = require('../../utils/response');
const env = require('../../config/env');
const { QUEUES, publish } = require('../../queue');
const { authService } = require('./auth.service');
const { passwordService } = require('./password.service');
const { permissionService } = require('../../services/permission.service');

/**
 * Method ditulis sebagai class field bergaya arrow agar `this` tetap terikat
 * ketika method-nya diserahkan langsung ke router sebagai handler.
 */
class AuthController {
  constructor({
    auth = authService,
    passwords = passwordService,
    permissions = permissionService,
  } = {}) {
    this.auth = auth;
    this.passwords = passwords;
    this.permissions = permissions;
  }

  login = async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw new AppError('Email dan password wajib diisi', 400);
    }

    const result = await this.auth.login({ email, password });

    return successResponse(res, 200, 'Login berhasil', result);
  };

  /**
   * Sengaja tidak memakai middleware authenticate. Justru inilah gunanya:
   * dipanggil ketika access token sudah kedaluwarsa, jadi mensyaratkan access
   * token yang masih hidup membuat endpoint ini tidak ada artinya.
   * Refresh token di dalam body yang menjadi bukti identitasnya.
   */
  refresh = async (req, res) => {
    const { refreshToken } = req.body ?? {};

    const result = await this.auth.refresh({ refreshToken });

    return successResponse(res, 200, 'Token berhasil diperbarui', result);
  };

  me = async (req, res) => {
    const user = await this.auth.getProfile(req.user.id);

    return successResponse(res, 200, 'Data profil berhasil diambil', { user });
  };

  logout = async (req, res) => {
    // refreshToken opsional. Kalau dikirim, rangkaian sesinya ikut dicabut
    // sehingga perangkat itu benar-benar keluar; kalau tidak, hanya access
    // token yang dicabut dan sesinya masih dapat diperbarui.
    const { refreshToken } = req.body ?? {};

    await this.auth.logout({
      tokenId: req.token.id,
      expiresAt: req.token.expiresAt,
      refreshToken,
      userId: req.user.id,
    });

    return successResponse(res, 200, 'Logout berhasil');
  };

  permissionsOfCurrentUser = async (req, res) => {
    // Diambil sendiri, bukan mengandalkan req.permissions dari middleware
    // authorize. Controller yang bergantung pada middleware otorisasi untuk
    // DATANYA akan ikut rusak begitu penjagaan route-nya diubah.
    const ownedPermissions = await this.permissions.getUserPermissions(req.user.id);

    return successResponse(res, 200, 'Daftar izin berhasil diambil', {
      permissions: ownedPermissions,
    });
  };

  forgotPassword = async (req, res) => {
    const { email } = req.body ?? {};

    if (!email) {
      throw new AppError('Email wajib diisi', 400);
    }

    const result = await this.passwords.requestReset({ email });

    if (result) {
      const resetUrl = `${env.appUrl}/reset-password?token=${encodeURIComponent(result.resetToken)}`;

      try {
        await publish(QUEUES.PASSWORD_RESET_EMAIL, {
          to: result.user.email,
          fullName: result.user.fullName,
          resetUrl,
        });
      } catch (error) {
        // Kegagalan antrean TIDAK boleh mengubah bentuk response. Kalau ia
        // menjadi 500, maka email terdaftar dijawab 500 sementara yang tidak
        // terdaftar dijawab 200 — dan perbedaan itu membocorkan keberadaannya.
        console.error('[QUEUE] gagal mempublikasikan email reset:', error.message);
      }
    }

    return successResponse(
      res,
      200,
      'Jika email terdaftar, instruksi reset password telah dikirim.'
    );
  };

  resetPassword = async (req, res) => {
    const { token, newPassword } = req.body ?? {};

    if (!token || !newPassword) {
      throw new AppError('Token dan password baru wajib diisi', 400);
    }

    await this.passwords.resetPassword({ token, newPassword });

    return successResponse(
      res,
      200,
      'Password berhasil diubah. Silakan login kembali.'
    );
  };
}

module.exports = { AuthController, authController: new AuthController() };
