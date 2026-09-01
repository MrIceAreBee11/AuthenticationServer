const profileService = require('./profile.service');
const { successResponse } = require('../../utils/response');

const getProfile = async (req, res) => {
  const profile = await profileService.getProfile(req.user.id);

  return successResponse(res, 200, 'Profil berhasil diambil', { profile });
};

const updateProfile = async (req, res) => {
  const { fullName, phone } = req.body ?? {};

  const profile = await profileService.updateProfile(req.user.id, { fullName, phone });

  return successResponse(res, 200, 'Profil berhasil diperbarui', { profile });
};

const updateAvatar = async (req, res) => {
  const profile = await profileService.updateAvatar(req.user.id, req.file);

  return successResponse(res, 200, 'Avatar berhasil diunggah', { profile });
};

const removeAvatar = async (req, res) => {
  const profile = await profileService.removeAvatar(req.user.id);

  return successResponse(res, 200, 'Avatar berhasil dihapus', { profile });
};

module.exports = { getProfile, updateProfile, updateAvatar, removeAvatar };