/**
 * BERKAS INI: penerjemah HTTP untuk seluruh endpoint autentikasi.
 *
 * KENAPA DI modules/auth/: isinya hanya melayani fitur ini.
 *
 * KENAPA ANTREAN DISUNTIKKAN, BUKAN DI-IMPORT: berkas ini dulu meng-require
 * publish() langsung dari adapter antrean. Akibatnya controller terikat pada RabbitMQ
 * dan tidak bisa diuji tanpa broker hidup, padahal yang benar-benar ia
 * butuhkan hanya "sesuatu yang bisa dititipi pesan".
 */
const { successResponse } = require('../../utils/response');
const { QUEUES } = require('../../constants/cacheKeys');
const { toUserDto } = require('../../mappers/user.mapper');

/**
 * Method ditulis sebagai class field bergaya arrow agar `this` tetap terikat
 * ketika method-nya diserahkan langsung ke router sebagai handler.
 */
class AuthController {
  constructor({ auth, passwords, permissions, queue, appUrl, logger }) {
    this.logger = logger;
    this.auth = auth;
    this.passwords = passwords;
    this.permissions = permissions;
    this.queue = queue;
    this.appUrl = appUrl;
  }

  // req.valid, bukan req.body: bentuknya sudah dijamin middleware validate,
  // dan membacanya dari sini membuktikan validasinya memang berjalan.
  login = async (req, res) => {
    const { email, password } = req.valid.body;

    const { token, refreshToken, user } = await this.auth.login({ email, password });

    return successResponse(res, 200, 'Login berhasil', {
      token,
      refreshToken,
      user: toUserDto(user),
    });
  };

  /**
   * Sengaja tidak memakai middleware authenticate. Justru inilah gunanya:
   * dipanggil ketika access token sudah kedaluwarsa, jadi mensyaratkan access
   * token yang masih hidup membuat endpoint ini tidak ada artinya.
   * Refresh token di dalam body yang menjadi bukti identitasnya.
   */
  refresh = async (req, res) => {
    const { refreshToken } = req.valid.body;

    const rotated = await this.auth.refresh({ refreshToken });

    return successResponse(res, 200, 'Token berhasil diperbarui', {
      token: rotated.token,
      refreshToken: rotated.refreshToken,
      user: toUserDto(rotated.user),
    });
  };

  me = async (req, res) => {
    const user = await this.auth.getProfile(req.user.id);

    return successResponse(res, 200, 'Data profil berhasil diambil', {
      user: toUserDto(user),
    });
  };

  logout = async (req, res) => {
    // refreshToken opsional. Kalau dikirim, rangkaian sesinya ikut dicabut
    // sehingga perangkat itu benar-benar keluar; kalau tidak, hanya access
    // token yang dicabut dan sesinya masih dapat diperbarui.
    const { refreshToken } = req.valid.body;

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
    const { email } = req.valid.body;

    const result = await this.passwords.requestReset({ email });

    if (result) {
      const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(result.resetToken)}`;

      try {
        await this.queue.publish(QUEUES.PASSWORD_RESET_EMAIL, {
          to: result.user.email,
          fullName: result.user.fullName,
          resetUrl,
        });
      } catch (error) {
        // Kegagalan antrean TIDAK boleh mengubah bentuk response. Kalau ia
        // menjadi 500, maka email terdaftar dijawab 500 sementara yang tidak
        // terdaftar dijawab 200 — dan perbedaan itu membocorkan keberadaannya.
        this.logger.exception('gagal menitipkan email reset ke antrean', error);
      }
    }

    return successResponse(
      res,
      200,
      'Jika email terdaftar, instruksi reset password telah dikirim.'
    );
  };

  resetPassword = async (req, res) => {
    const { token, newPassword } = req.valid.body;

    await this.passwords.resetPassword({ token, newPassword });

    return successResponse(
      res,
      200,
      'Password berhasil diubah. Silakan login kembali.'
    );
  };
}

module.exports = { AuthController };
