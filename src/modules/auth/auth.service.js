const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const AppError = require('../../utils/AppError');
const env = require('../../config/env');
const { signAccessToken, createOpaqueToken } = require('../../utils/token');
const { userRepository } = require('../../repositories/user.repository');
const {
  tokenDenylistRepository,
} = require('../../repositories/tokenDenylist.repository');
const {
  refreshTokenRepository,
} = require('../../repositories/refreshToken.repository');

/**
 * Hash asli dari string acak yang tidak pernah menjadi password siapa pun.
 * Dipakai agar percobaan login dengan email tak terdaftar memakan waktu yang
 * sama dengan email terdaftar. Tanpa ini, selisih waktu responsnya sendiri
 * sudah membocorkan email mana yang ada di sistem.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$y8mnV4olFFifO8MOrq4AjOFM/mRzYnSAHz.CDpc9FhAoOx4cfCpAK';

/**
 * Pesan seragam untuk seluruh kegagalan refresh: token tidak dikenal, token
 * sudah dicabut, akun sudah nonaktif. Ketiganya berarti hal yang sama bagi
 * pemanggil — ambil token baru dengan login — dan membedakannya hanya
 * memberi keterangan tambahan kepada pihak yang memegang token curian.
 */
const PESAN_REFRESH_TIDAK_VALID = 'Refresh token tidak valid. Silakan login kembali.';

class AuthService {
  constructor({
    users = userRepository,
    denylist = tokenDenylistRepository,
    refreshTokens = refreshTokenRepository,
  } = {}) {
    this.users = users;
    this.denylist = denylist;
    this.refreshTokens = refreshTokens;
  }

  /**
   * Menerbitkan satu refresh token baru untuk sebuah rangkaian sesi.
   * Nilai yang dikembalikan adalah token asli; yang tersimpan hash-nya.
   */
  async #issueRefreshToken(userId, familyId) {
    const plainToken = createOpaqueToken();

    await this.refreshTokens.create({
      plainToken,
      userId,
      familyId,
      expiresAt: new Date(Date.now() + env.refreshToken.expiresInSeconds * 1000),
    });

    return plainToken;
  }

  async login({ email, password }) {
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await this.users.findByEmail(normalizedEmail, {
      includePassword: true,
    });

    const isPasswordValid = user
      ? await user.comparePassword(password)
      : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

    // Pesan sengaja seragam untuk email tak terdaftar maupun password salah,
    // agar tidak dapat dipakai memetakan daftar pengguna.
    if (!user || !isPasswordValid) {
      throw new AppError('Email atau password salah', 401);
    }

    // Status aktif diperiksa SETELAH password terverifikasi. Kalau dibalik,
    // pesannya mengonfirmasi bahwa email tersebut terdaftar.
    if (!user.isActive) {
      throw new AppError('Akun Anda tidak aktif. Hubungi administrator.', 403);
    }

    await this.users.update(user, { lastLoginAt: new Date() });

    const { token } = signAccessToken(user.id);

    // Setiap login memulai rangkaian sesi baru dengan penandanya sendiri.
    // Dengan begitu logout di satu perangkat tidak menyentuh perangkat lain.
    const refreshToken = await this.#issueRefreshToken(
      user.id,
      crypto.randomUUID()
    );

    await this.refreshTokens.deleteExpired(user.id);

    return { token, refreshToken, user: user.toJSON() };
  }

  /**
   * Menukar refresh token dengan sepasang token baru.
   *
   * Rotasi wajib: token yang dipakai langsung dicabut dan penggantinya dibuat
   * dalam rangkaian yang sama. Akibatnya, satu refresh token hanya dapat
   * dipakai sekali — dan itulah yang membuat pencurian token dapat dikenali.
   */
  async refresh({ refreshToken }) {
    if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
      throw new AppError('Refresh token wajib diisi', 400);
    }

    const stored = await this.refreshTokens.findByToken(refreshToken);

    if (!stored) {
      throw new AppError(PESAN_REFRESH_TIDAK_VALID, 401);
    }

    if (stored.revokedAt) {
      // Token yang sudah dirotasi, tetapi dipakai lagi. Pada pemakaian normal
      // ini tidak mungkin terjadi: klien membuang token lamanya begitu
      // menerima yang baru. Jadi kemunculannya berarti ada salinan token itu
      // di tangan orang lain — dan tidak ada cara mengetahui mana yang asli.
      //
      // Karena itu seluruh rangkaian dicabut, bukan hanya token ini. Pemilik
      // yang sah harus login kembali, sementara pencurinya kehilangan akses.
      // Rangkaian lain milik pengguna yang sama tidak tersentuh.
      await this.refreshTokens.revokeFamily(stored.familyId);

      console.warn(
        `[AUTH] refresh token dipakai ulang, rangkaian sesi dicabut (user ${stored.userId})`
      );

      throw new AppError(PESAN_REFRESH_TIDAK_VALID, 401);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Sesi Anda sudah berakhir. Silakan login kembali.', 401);
    }

    const user = await this.users.findById(stored.userId);

    if (!user || !user.isActive) {
      await this.refreshTokens.revokeFamily(stored.familyId);

      throw new AppError(PESAN_REFRESH_TIDAK_VALID, 401);
    }

    // Urutannya disengaja: yang lama dicabut lebih dulu, penggantinya dibuat
    // kemudian. Kalau dibalik dan pencabutan gagal, dua token dalam satu
    // rangkaian sama-sama berlaku dan deteksi pemakaian ulang berhenti
    // bekerja. Dengan urutan ini, kegagalan terburuk hanya memaksa pengguna
    // login kembali — merepotkan, tetapi tidak membuka celah.
    await this.refreshTokens.revoke(stored);

    const rotated = await this.#issueRefreshToken(user.id, stored.familyId);
    const { token } = signAccessToken(user.id);

    await this.refreshTokens.deleteExpired(user.id);

    return { token, refreshToken: rotated, user: user.toJSON() };
  }

  async getProfile(userId) {
    const user = await this.users.findById(userId, {
      includeRoles: true,
      detailedRoles: true,
    });

    if (!user) {
      throw new AppError('User tidak ditemukan', 404);
    }

    return user;
  }

  /**
   * Logout mencabut dua hal sekaligus, karena keduanya bekerja dengan cara
   * yang berbeda: access token masuk ke daftar cabut di Redis sampai
   * kedaluwarsa, sedangkan refresh token dicabut lewat barisnya di basis data.
   *
   * Refresh token bersifat opsional. Kalau klien tidak mengirimkannya, hanya
   * access token yang dicabut — dan sesi itu masih dapat diperbarui sampai
   * refresh token-nya kedaluwarsa sendiri.
   */
  async logout({ tokenId, expiresAt, refreshToken, userId }) {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    await this.denylist.revoke(tokenId, expiresAt - nowInSeconds);

    if (!refreshToken) {
      return;
    }

    const stored = await this.refreshTokens.findByToken(refreshToken);

    // Kepemilikan wajib diperiksa. Tanpa ini, siapa pun yang memegang refresh
    // token orang lain dapat mencabut sesi orang tersebut hanya dengan
    // menyertakannya di permintaan logout miliknya sendiri.
    //
    // Ketidakcocokan diabaikan tanpa error: logout harus selalu berhasil dari
    // sudut pandang pemanggil, dan pesan penolakan di sini hanya akan
    // memberitahu pengirimnya bahwa token itu milik orang lain.
    if (stored && stored.userId === userId) {
      await this.refreshTokens.revokeFamily(stored.familyId);
    }
  }
}

module.exports = { AuthService, authService: new AuthService() };
