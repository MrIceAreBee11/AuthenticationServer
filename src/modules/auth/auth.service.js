const bcrypt = require('bcryptjs');

const { User } = require('../../database');
const AppError = require('../../utils/AppError');
const { signAccessToken } = require('../../utils/token');
const { redisClient } = require('../../redis');

const DENYLIST_PREFIX = 'token:denylist:';

const DUMMY_PASSWORD_HASH =
  '$2b$12$y8mnV4olFFifO8MOrq4AjOFM/mRzYnSAHz.CDpc9FhAoOx4cfCpAK';

const login = async ({ email, password }) => {
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.unscoped().findOne({
    where: { email: normalizedEmail },
  });

  const isPasswordValid = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);

  if (!user || !isPasswordValid) {
    throw new AppError('Email atau password salah', 401);
  }

  if (!user.isActive) {
    throw new AppError('Akun Anda tidak aktif. Hubungi administrator.', 403);
  }

  await user.update({ lastLoginAt: new Date() });

  const { token } = signAccessToken(user.id);

  return { token, user: user.toJSON() };
};

const getProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    include: [
      {
        association: 'roles',
        attributes: ['id', 'name', 'description'],
        through: { attributes: [] },
      },
    ],
  });

  if (!user) {
    throw new AppError('User tidak ditemukan', 404);
  }

  return user;
};

const logout = async ({ tokenId, expiresAt }) => {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = expiresAt - nowInSeconds;

  if (remainingSeconds <= 0) {
    return;
  }

  await redisClient.set(`${DENYLIST_PREFIX}${tokenId}`, '1', {
    EX: remainingSeconds,
  });
};

module.exports = { login, getProfile, logout };