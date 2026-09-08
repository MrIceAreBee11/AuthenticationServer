/**
 * BERKAS INI: pemeriksaan "siapa Anda" pada setiap permintaan terlindungi.
 *
 * KENAPA DI middlewares/ DAN BUKAN modules/auth/: ia dipakai oleh SELURUH
 * modul — profile, users, roles. Berkas yang dipakai lintas fitur tidak boleh
 * tinggal di dalam salah satu fitur, karena itu membuat modules/users
 * bergantung pada modules/auth tanpa alasan.
 *
 * KENAPA CLASS SEKARANG: sebelumnya berkas ini meng-require userRepository dan
 * tokenDenylistRepository langsung di baris atas. Akibatnya lima pemeriksaan di
 * bawah — inti keamanan seluruh aplikasi — tidak bisa diuji tanpa PostgreSQL
 * dan Redis yang benar-benar hidup, dan karena itu nol pengujiannya.
 *
 * LIMA PEMERIKSAAN, disusun dari termurah ke termahal. Permintaan yang akan
 * ditolak sebaiknya ditolak secepat mungkin — bukan demi kecepatan, tetapi
 * supaya server tetap bertahan ketika sedang diserang.
 *
 *   1. Header ada dan berformat Bearer     -> cek teks
 *   2. Tanda tangan token sah              -> hitung HMAC
 *   3. Token tidak ada di daftar cabut     -> Redis
 *   4. Pengguna ada dan berstatus aktif    -> PostgreSQL
 *   5. Token terbit setelah ganti password -> perbandingan angka
 */
const AppError = require('../utils/AppError');
const { BEARER_PREFIX } = require('../constants/cacheKeys');

class AuthenticateMiddleware {
  constructor({ users, denylist, tokens }) {
    this.users = users;
    this.denylist = denylist;
    this.tokens = tokens;
  }

  #readToken(authHeader) {
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      throw new AppError('Token tidak ditemukan', 401);
    }

    return authHeader.slice(BEARER_PREFIX.length).trim();
  }

  /**
   * try/catch sengaja hanya melingkupi verifikasi token. Kalau ia membungkus
   * seluruh method, kegagalan koneksi basis data akan dilaporkan sebagai
   * "token tidak valid" — dan pencarian bug-nya jadi salah arah.
   */
  #verify(token) {
    try {
      return this.tokens.verifyAccessToken(token);
    } catch (error) {
      throw new AppError(
        error.name === 'TokenExpiredError' ? 'Token sudah kedaluwarsa' : 'Token tidak valid',
        401
      );
    }
  }

  async #assertNotRevoked(tokenId) {
    let isRevoked;

    try {
      isRevoked = await this.denylist.isRevoked(tokenId);
    } catch (error) {
      console.error('[REDIS] gagal memeriksa denylist:', error.message);

      // Redis adalah satu-satunya sumber kebenaran untuk "token ini sudah
      // dicabut atau belum". Kalau tidak terbaca, kita tidak tahu — dan
      // melanjutkan berarti menerima token yang mungkin sudah di-logout.
      throw new AppError('Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.', 503);
    }

    if (isRevoked) {
      throw new AppError('Token sudah tidak berlaku. Silakan login kembali.', 401);
    }
  }

  /**
   * iat hanya beresolusi detik, jadi perbandingannya juga harus dalam detik.
   * Konsekuensi: token yang terbit pada detik yang sama dengan reset masih
   * lolos — jendela yang terlalu sempit untuk dapat dimanfaatkan, dan jauh
   * lebih baik daripada salah menolak token yang baru saja diterbitkan.
   */
  #assertIssuedAfterPasswordChange(user, issuedAtSeconds) {
    if (!user.passwordChangedAt) {
      return;
    }

    if (issuedAtSeconds < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new AppError('Password telah diubah. Silakan login kembali.', 401);
    }
  }

  /** Arrow field: `this` tetap terikat saat handler diserahkan ke router. */
  handle = async (req, res, next) => {
    const payload = this.#verify(this.#readToken(req.headers.authorization));

    await this.#assertNotRevoked(payload.jti);

    const user = await this.users.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new AppError('Akun tidak ditemukan atau tidak aktif', 401);
    }

    this.#assertIssuedAfterPasswordChange(user, payload.iat);

    req.user = user;
    req.token = { id: payload.jti, expiresAt: payload.exp };

    return next();
  };
}

module.exports = { AuthenticateMiddleware };
