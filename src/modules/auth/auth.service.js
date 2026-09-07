const bcrypt = require('bcryptjs');

const AppError = require('../../utils/AppError');
const { signAccessToken } = require('../../utils/token');
const { userRepository } = require('../../repositories/user.repository');
const {
  tokenDenylistRepository,
} = require('../../repositories/tokenDenylist.repository');

/**
 * Hash asli dari string acak yang tidak pernah menjadi password siapa pun.
 * Dipakai agar percobaan login dengan email tak terdaftar memakan waktu yang
 * sama dengan email terdaftar. Tanpa ini, selisih waktu responsnya sendiri
 * sudah membocorkan email mana yang ada di sistem.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$y8mnV4olFFifO8MOrq4AjOFM/mRzYnSAHz.CDpc9FhAoOx4cfCpAK';

class AuthService {
  constructor({ users = userRepository, denylist = tokenDenylistRepository } = {}) {
    this.users = users;
    this.denylist = denylist;
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

    return { token, user: user.toJSON() };
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

  async logout({ tokenId, expiresAt }) {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    await this.denylist.revoke(tokenId, expiresAt - nowInSeconds);
  }
}

module.exports = { AuthService, authService: new AuthService() };
