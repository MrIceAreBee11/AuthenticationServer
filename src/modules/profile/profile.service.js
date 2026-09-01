const crypto = require('node:crypto');

const { User } = require('../../database');
const AppError = require('../../utils/AppError');
const { putObject, getPresignedUrl, removeObject } = require('../../storage');

const AVATAR_URL_TTL_SECONDS = 60 * 60;
const PHONE_PATTERN = /^[0-9+\-\s]{8,20}$/;

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const findUserOrFail = async (userId) => {
  const user = await User.findByPk(userId, {
    include: [
      {
        association: 'roles',
        attributes: ['id', 'name'],
        through: { attributes: [] },
      },
    ],
  });

  if (!user) {
    throw new AppError('User tidak ditemukan', 404);
  }

  return user;
};

const buildAvatarUrl = async (avatarKey) => {
  if (!avatarKey) {
    return null;
  }

  try {
    return await getPresignedUrl(avatarKey, AVATAR_URL_TTL_SECONDS);
  } catch (error) {
    console.error('[STORAGE] gagal membuat presigned URL:', error.message);
    return null;
  }
};

const getProfile = async (userId) => {
  const user = await findUserOrFail(userId);

  return { ...user.toJSON(), avatarUrl: await buildAvatarUrl(user.avatarKey) };
};

const updateProfile = async (userId, { fullName, phone }) => {
  const user = await findUserOrFail(userId);

  const changes = {};

  if (fullName !== undefined) {
    changes.fullName = fullName;
  }

  if (phone !== undefined) {
    if (phone !== null && !PHONE_PATTERN.test(String(phone))) {
      throw new AppError('Nomor telepon tidak valid (8-20 digit)', 400);
    }

    changes.phone = phone;
  }

  if (Object.keys(changes).length === 0) {
    throw new AppError('Tidak ada data yang dikirim untuk diubah', 400);
  }

  await user.update(changes);

  return getProfile(userId);
};

const updateAvatar = async (userId, file) => {
  const user = await findUserOrFail(userId);

  const extension = EXTENSION_BY_MIME[file.mimetype];
  const objectKey = `${userId}/${crypto.randomUUID()}.${extension}`;

  await putObject(objectKey, file.buffer, file.mimetype);

  const previousKey = user.avatarKey;

  await user.update({ avatarKey: objectKey });

  if (previousKey) {
    try {
      await removeObject(previousKey);
    } catch (error) {
      console.error('[STORAGE] gagal menghapus avatar lama:', error.message);
    }
  }

  return getProfile(userId);
};

const removeAvatar = async (userId) => {
  const user = await findUserOrFail(userId);

  if (!user.avatarKey) {
    throw new AppError('Anda belum memiliki avatar', 400);
  }

  const previousKey = user.avatarKey;

  await user.update({ avatarKey: null });

  try {
    await removeObject(previousKey);
  } catch (error) {
    console.error('[STORAGE] gagal menghapus avatar:', error.message);
  }

  return getProfile(userId);
};

module.exports = { getProfile, updateProfile, updateAvatar, removeAvatar };