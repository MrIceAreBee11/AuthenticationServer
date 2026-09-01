const { User } = require('../database');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/token');
const { redisClient } = require('../redis');

const BEARER_PREFIX = 'Bearer ';
const DENYLIST_PREFIX = 'token:denylist:';

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    throw new AppError('Token tidak ditemukan', 401);
  }

  const token = authHeader.slice(BEARER_PREFIX.length).trim();

  let payload;

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
    isRevoked = await redisClient.exists(`${DENYLIST_PREFIX}${payload.jti}`);
  } catch (error) {
    console.error('[REDIS] gagal memeriksa denylist:', error.message);

    throw new AppError(
      'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.',
      503
    );
  }

  if (isRevoked) {
    throw new AppError('Token sudah tidak berlaku. Silakan login kembali.', 401);
  }

  const user = await User.findByPk(payload.sub);

  if (!user || !user.isActive) {
    throw new AppError('Akun tidak ditemukan atau tidak aktif', 401);
  }

  if (user.passwordChangedAt) {
    // iat hanya beresolusi detik, jadi perbandingan juga harus dalam detik.
    // Konsekuensi: token yang terbit pada detik yang sama dengan reset masih lolos.
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