/**
 * BERKAS INI: penerjemah HTTP untuk profil milik sendiri.
 *
 * KENAPA DI modules/profile/: hanya fitur ini yang memakainya.
 *
 * TUGASNYA CUMA TIGA: baca permintaan, panggil SATU method service, susun
 * jawaban. Tidak ada aturan bisnis, tidak ada query, tidak ada try/catch per
 * handler — kegagalan diteruskan ke error handler terpusat.
 */
const { successResponse } = require('../../utils/response');
const { toProfileDto } = require('../../mappers/user.mapper');

class ProfileController {
  constructor({ profiles }) {
    this.profiles = profiles;
  }

  // Seluruh method memakai req.user.id, tidak pernah menerima ID dari klien.
  // Endpoint yang bermakna "milik saya sendiri" harus mengambil identitas dari
  // token; kalau ID datang dari input, siapa pun bisa mengubah profil orang lain.

  get = async (req, res) => {
    const profile = await this.profiles.getProfile(req.user.id);

    return successResponse(res, 200, 'Profil berhasil diambil', {
      profile: toProfileDto(profile),
    });
  };

  update = async (req, res) => {
    const { fullName, phone } = req.valid.body;

    const profile = await this.profiles.updateProfile(req.user.id, { fullName, phone });

    return successResponse(res, 200, 'Profil berhasil diperbarui', {
      profile: toProfileDto(profile),
    });
  };

  uploadAvatar = async (req, res) => {
    const profile = await this.profiles.updateAvatar(req.user.id, req.file);

    return successResponse(res, 200, 'Avatar berhasil diunggah', {
      profile: toProfileDto(profile),
    });
  };

  removeAvatar = async (req, res) => {
    const profile = await this.profiles.removeAvatar(req.user.id);

    return successResponse(res, 200, 'Avatar berhasil dihapus', {
      profile: toProfileDto(profile),
    });
  };
}

module.exports = { ProfileController };
