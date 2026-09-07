const { successResponse } = require('../../utils/response');
const { profileService } = require('./profile.service');

class ProfileController {
  constructor({ profiles = profileService } = {}) {
    this.profiles = profiles;
  }

  // Seluruh method memakai req.user.id, tidak pernah menerima ID dari klien.
  // Endpoint yang bermakna "milik saya sendiri" harus mengambil identitas dari
  // token; kalau ID datang dari input, siapa pun bisa mengubah profil orang lain.

  get = async (req, res) => {
    const profile = await this.profiles.getProfile(req.user.id);

    return successResponse(res, 200, 'Profil berhasil diambil', { profile });
  };

  update = async (req, res) => {
    const { fullName, phone } = req.body ?? {};

    const profile = await this.profiles.updateProfile(req.user.id, { fullName, phone });

    return successResponse(res, 200, 'Profil berhasil diperbarui', { profile });
  };

  uploadAvatar = async (req, res) => {
    const profile = await this.profiles.updateAvatar(req.user.id, req.file);

    return successResponse(res, 200, 'Avatar berhasil diunggah', { profile });
  };

  removeAvatar = async (req, res) => {
    const profile = await this.profiles.removeAvatar(req.user.id);

    return successResponse(res, 200, 'Avatar berhasil dihapus', { profile });
  };
}

module.exports = { ProfileController, profileController: new ProfileController() };
