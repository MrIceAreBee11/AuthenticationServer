const crypto = require('node:crypto');

const { User } = require('../../database');
const { redisClient } = require('../../redis');
const AppError = require('../../utils/AppError');

const RESET_KEY_PREFIX = 'password-reset:';
const RESET_TTL_SECONDS = 15 * 60;
const TOKEN_BYTES = 32;
const MIN_PASSWORD_LENGTH = 12;

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const requestPasswordReset = async ({ email }) => {
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({ where: { email: normalizedEmail } });

  if (!user || !user.isActive) {
    return null;
  }

  const resetToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');

  await redisClient.set(`${RESET_KEY_PREFIX}${hashToken(resetToken)}`, user.id, {
    EX: RESET_TTL_SECONDS,
  });

  return { user, resetToken };
};

const resetPassword = async ({ token, newPassword }) => {
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter`,
      400
    );
  }

  const cacheKey = `${RESET_KEY_PREFIX}${hashToken(token)}`;
  const userId = await redisClient.get(cacheKey);

  if (!userId) {
    throw new AppError('Token reset tidak valid atau sudah kedaluwarsa', 400);
  }

  const user = await User.unscoped().findByPk(userId);

  if (!user || !user.isActive) {
    await redisClient.del(cacheKey);
    throw new AppError('Token reset tidak valid atau sudah kedaluwarsa', 400);
  }

  await user.update({ passwordHash: newPassword });
  await redisClient.del(cacheKey);

  return user;
};

module.exports = { requestPasswordReset, resetPassword };