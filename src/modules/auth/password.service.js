/**
 * BERKAS INI: alur lupa password dan penggantiannya.
 *
 * KENAPA TERPISAH DARI auth.service: keduanya sama-sama di modules/auth,
 * tetapi alurnya berbeda — yang ini melibatkan antrean email dan token
 * berumur pendek, dan memisahkannya menjaga kedua class tetap kecil.
 */
const { BadRequestError } = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');
const { AUDIT_ACTIONS, AUDIT_RESOURCES } = require('../../constants/auditActions');

class PasswordService {
  /**
   * `policy` adalah irisan config.password — { minLength, resetTtlSeconds }.
   * Disuntikkan, bukan dibaca dari environment di dalam sini, supaya pengujian
   * dapat menyerahkan kebijakan lain tanpa menyentuh process.env global.
   */
  constructor({ users, resetTokens, refreshTokens, tokens, policy, audit }) {
    this.audit = audit;
    this.users = users;
    this.resetTokens = resetTokens;
    this.refreshTokens = refreshTokens;
    this.tokens = tokens;
    this.policy = policy;
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

    const resetToken = this.tokens.createOpaqueToken();

    await this.resetTokens.save(resetToken, user.id, this.policy.resetTtlSeconds);

    return { user, resetToken };
  }

  async resetPassword({ token, newPassword }) {
    // Divalidasi sebelum token diperiksa, supaya permintaan yang pasti gagal
    // tidak membuang satu operasi baca ke Redis.
    if (typeof newPassword !== 'string' || newPassword.length < this.policy.minLength) {
      throw new BadRequestError(
        `Password baru minimal ${this.policy.minLength} karakter`,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    const userId = await this.resetTokens.findUserId(token);

    // Pesan sengaja sama untuk token tidak ada, kedaluwarsa, maupun akun
    // nonaktif — ketiganya tidak boleh dapat dibedakan oleh pemanggil.
    if (!userId) {
      throw new BadRequestError(
        'Token reset tidak valid atau sudah kedaluwarsa',
        ERROR_CODES.RESET_TOKEN_INVALID
      );
    }

    const user = await this.users.findById(userId, { includePassword: true });

    if (!user || !user.isActive) {
      await this.resetTokens.remove(token);
      throw new BadRequestError(
        'Token reset tidak valid atau sudah kedaluwarsa',
        ERROR_CODES.RESET_TOKEN_INVALID
      );
    }

    // Urutannya disengaja: password diubah dulu, token dihapus kemudian.
    // Kalau dibalik dan pembaruan gagal, token sudah lenyap sementara password
    // belum berubah — pengguna terjebak dengan tautan yang sudah mati.
    await this.users.update(user, { passwordHash: newPassword });

    // Ganti password harus mengeluarkan seluruh sesi yang sedang berjalan,
    // termasuk milik pihak yang mungkin sudah masuk tanpa hak. Access token
    // sudah tertangani oleh perbandingan passwordChangedAt di middleware
    // authenticate, tetapi refresh token tersimpan di basis data dan tidak
    // ikut terpengaruh — ia harus dicabut secara eksplisit di sini.
    //
    // Dilakukan sebelum token reset dihapus. Kalau pencabutan gagal,
    // permintaannya berakhir dengan error dan tautan resetnya masih dapat
    // dipakai lagi; kalau urutannya dibalik, kegagalan yang sama meninggalkan
    // password baru berikut sesi-sesi lama yang masih hidup.
    await this.refreshTokens.revokeAllForUser(user.id);

    await this.resetTokens.remove(token);

    // Dicatat tanpa pelaku: reset password dijalankan tanpa autentikasi, jadi
    // yang diketahui hanya akun mana yang terpengaruh. Justru itu yang membuat
    // ia perlu dicatat — perubahan password tanpa sesi yang terbukti.
    await this.audit.record({
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: user.id,
      metadata: { sessionsRevoked: true },
    });

    return user;
  }
}

module.exports = { PasswordService };
