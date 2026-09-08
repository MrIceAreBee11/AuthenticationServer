/**
 * BERKAS INI: aturan login, pembaruan sesi, dan logout.
 *
 * KENAPA DI modules/auth/: seluruh isinya hanya dipakai fitur autentikasi.
 * Berkas yang melayani satu fitur tinggal di dalam fitur itu, supaya batas
 * antar fitur terbaca dari struktur folder.
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');

/**
 * Hash asli dari string acak yang tidak pernah menjadi password siapa pun.
 *
 * Dipakai agar percobaan login dengan email tak terdaftar memakan waktu yang
 * sama dengan email terdaftar. Tanpa ini, selisih waktu responsnya sendiri
 * sudah membocorkan email mana yang ada di sistem.
 *
 * COST FACTOR-nya (angka 12 setelah $2b$) WAJIB sama dengan
 * BCRYPT_SALT_ROUNDS. Kalau berbeda, perbandingan tiruan ini lebih cepat
 * daripada yang sungguhan dan celah waktunya terbuka lagi. Container
 * menyuntikkan hash yang dihitung dari konfigurasi berlaku; nilai di bawah
 * hanya cadangan untuk pengujian, dan ada unit test yang menjaga keduanya
 * tetap sepadan.
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
    users,
    denylist,
    refreshTokens,
    tokens,
    ttlSeconds,
    dummyPasswordHash = DUMMY_PASSWORD_HASH,
  }) {
    this.users = users;
    this.denylist = denylist;
    this.refreshTokens = refreshTokens;
    this.tokens = tokens;
    this.ttlSeconds = ttlSeconds;
    this.dummyPasswordHash = dummyPasswordHash;
  }

  /**
   * Menerbitkan satu refresh token baru untuk sebuah rangkaian sesi.
   * Nilai yang dikembalikan adalah token asli; yang tersimpan hash-nya.
   */
  async #issueRefreshToken(userId, familyId) {
    const plainToken = this.tokens.createOpaqueToken();

    await this.refreshTokens.create({
      plainToken,
      userId,
      familyId,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
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
      : await bcrypt.compare(password, this.dummyPasswordHash);

    // Pesan sengaja seragam untuk email tak terdaftar maupun password salah,
    // agar tidak dapat dipakai memetakan daftar pengguna.
    if (!user || !isPasswordValid) {
      throw new UnauthorizedError('Email atau password salah', ERROR_CODES.CREDENTIALS_INVALID);
    }

    // Status aktif diperiksa SETELAH password terverifikasi. Kalau dibalik,
    // pesannya mengonfirmasi bahwa email tersebut terdaftar.
    if (!user.isActive) {
      throw new ForbiddenError(
        'Akun Anda tidak aktif. Hubungi administrator.',
        ERROR_CODES.ACCOUNT_INACTIVE
      );
    }

    await this.users.update(user, { lastLoginAt: new Date() });

    const { token } = this.tokens.signAccessToken(user.id);

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
      throw new BadRequestError('Refresh token wajib diisi', ERROR_CODES.VALIDATION_FAILED);
    }

    const stored = await this.refreshTokens.findByToken(refreshToken);

    if (!stored) {
      throw new UnauthorizedError(
        PESAN_REFRESH_TIDAK_VALID,
        ERROR_CODES.REFRESH_TOKEN_INVALID
      );
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

      throw new UnauthorizedError(
        PESAN_REFRESH_TIDAK_VALID,
        ERROR_CODES.REFRESH_TOKEN_INVALID
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError(
        'Sesi Anda sudah berakhir. Silakan login kembali.',
        ERROR_CODES.SESSION_EXPIRED
      );
    }

    const user = await this.users.findById(stored.userId);

    if (!user || !user.isActive) {
      await this.refreshTokens.revokeFamily(stored.familyId);

      throw new UnauthorizedError(
        PESAN_REFRESH_TIDAK_VALID,
        ERROR_CODES.REFRESH_TOKEN_INVALID
      );
    }

    // Urutannya disengaja: yang lama dicabut lebih dulu, penggantinya dibuat
    // kemudian. Kalau dibalik dan pencabutan gagal, dua token dalam satu
    // rangkaian sama-sama berlaku dan deteksi pemakaian ulang berhenti
    // bekerja. Dengan urutan ini, kegagalan terburuk hanya memaksa pengguna
    // login kembali — merepotkan, tetapi tidak membuka celah.
    await this.refreshTokens.revoke(stored);

    const rotated = await this.#issueRefreshToken(user.id, stored.familyId);
    const { token } = this.tokens.signAccessToken(user.id);

    await this.refreshTokens.deleteExpired(user.id);

    return { token, refreshToken: rotated, user: user.toJSON() };
  }

  async getProfile(userId) {
    const user = await this.users.findById(userId, {
      includeRoles: true,
      detailedRoles: true,
    });

    if (!user) {
      throw new NotFoundError('User tidak ditemukan', ERROR_CODES.NOT_FOUND);
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

module.exports = { AuthService };
