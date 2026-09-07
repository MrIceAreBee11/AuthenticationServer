const crypto = require('node:crypto');

const AppError = require('../../utils/AppError');
const { userRepository } = require('../../repositories/user.repository');
const {
  passwordResetTokenRepository,
} = require('../../repositories/passwordResetToken.repository');

const RESET_TTL_SECONDS = 15 * 60;
const TOKEN_BYTES = 32;
const MIN_PASSWORD_LENGTH = 12;

class PasswordService {
  constructor({ users = userRepository, resetTokens = passwordResetTokenRepository } = {}) {
    this.users = users;
    this.resetTokens = resetTokens;
  }

  /**
   * Mengembalikan null bila email tidak terdaftar atau akunnya nonaktif —
   * bukan melempar error. Dengan begitu controller dapat membalas pesan yang
   * sama untuk semua kemungkinan, sehingga endpoint ini tidak bisa dipakai
   * memeriksa apakah sebuah email terdaftar.
   */
  async requestReset({ email }) {
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await this.users.findByEmail(normalizedEmail);

    if (!user || !user.isActive) {
      return null;
    }

    const resetToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');

    await this.resetTokens.save(resetToken, user.id, RESET_TTL_SECONDS);

    return { user, resetToken };
  }

  async resetPassword({ token, newPassword }) {
    // Divalidasi sebelum token diperiksa, supaya permintaan yang pasti gagal
    // tidak membuang satu operasi baca ke Redis.
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(`Password baru minimal ${MIN_PASSWORD_LENGTH} karakter`, 400);
    }

    const userId = await this.resetTokens.findUserId(token);

    // Pesan sengaja sama untuk token tidak ada, kedaluwarsa, maupun akun
    // nonaktif — ketiganya tidak boleh dapat dibedakan oleh pemanggil.
    if (!userId) {
      throw new AppError('Token reset tidak valid atau sudah kedaluwarsa', 400);
    }

    const user = await this.users.findById(userId, { includePassword: true });

    if (!user || !user.isActive) {
      await this.resetTokens.remove(token);
      throw new AppError('Token reset tidak valid atau sudah kedaluwarsa', 400);
    }

    // Urutannya disengaja: password diubah dulu, token dihapus kemudian.
    // Kalau dibalik dan pembaruan gagal, token sudah lenyap sementara password
    // belum berubah — pengguna terjebak dengan tautan yang sudah mati.
    await this.users.update(user, { passwordHash: newPassword });
    await this.resetTokens.remove(token);

    return user;
  }
}

module.exports = { PasswordService, passwordService: new PasswordService() };
