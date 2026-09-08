const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/token');
const { userRepository } = require('../repositories/user.repository');
const { tokenDenylistRepository } = require('../repositories/tokenDenylist.repository');

const { BEARER_PREFIX } = require('../constants/cacheKeys');

/**
 * Lima pemeriksaan, disusun dari yang termurah ke yang termahal. Permintaan
 * yang akan ditolak sebaiknya ditolak secepat mungkin — bukan sekadar demi
 * kecepatan, tetapi supaya server tetap bertahan ketika sedang diserang.
 *
 *   1. Header ada dan berformat Bearer   -> cek teks
 *   2. Tanda tangan token sah            -> hitung HMAC
 *   3. Token tidak ada di daftar cabut   -> Redis
 *   4. Pengguna ada dan berstatus aktif  -> PostgreSQL
 *   5. Token terbit setelah ganti password -> perbandingan angka
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    throw new AppError('Token tidak ditemukan', 401);
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();

  let payload;

  // try/catch sengaja hanya melingkupi verifikasi token. Kalau ia membungkus
  // seluruh fungsi, kegagalan koneksi database akan dilaporkan sebagai
  // "token tidak valid" — dan pencarian bug-nya jadi salah arah.
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Token sudah kedaluwarsa'
        : 'Token tidak valid';

    throw new AppError(message, 401);
  }

  let isRevoked;

  try {
    isRevoked = await tokenDenylistRepository.isRevoked(payload.jti);
  } catch (error) {
    console.error('[REDIS] gagal memeriksa denylist:', error.message);

    // Redis adalah satu-satunya sumber kebenaran untuk "token ini sudah
    // dicabut atau belum". Kalau tidak terbaca, kita tidak tahu — dan
    // melanjutkan berarti menerima token yang mungkin sudah di-logout.
    throw new AppError(
      'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.',
      503
    );
  }

  if (isRevoked) {
    throw new AppError('Token sudah tidak berlaku. Silakan login kembali.', 401);
  }

  const user = await userRepository.findById(payload.sub);

  if (!user || !user.isActive) {
    throw new AppError('Akun tidak ditemukan atau tidak aktif', 401);
  }

  if (user.passwordChangedAt) {
    // iat hanya beresolusi detik, jadi perbandingan juga harus dalam detik.
    // Konsekuensi: token yang terbit pada detik yang sama dengan reset masih
    // lolos — jendela yang terlalu sempit untuk dapat dimanfaatkan, dan jauh
    // lebih baik daripada salah menolak token yang baru saja diterbitkan.
    const passwordChangedAtSeconds = Math.floor(
      user.passwordChangedAt.getTime() / 1000
    );

    if (payload.iat < passwordChangedAtSeconds) {
      throw new AppError('Password telah diubah. Silakan login kembali.', 401);
    }
  }

  req.user = user;
  req.token = { id: payload.jti, expiresAt: payload.exp };

  return next();
};

module.exports = authenticate;
