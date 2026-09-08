/**
 * BERKAS INI: penerjemah HTTP untuk pengelolaan pengguna oleh administrator.
 *
 * KENAPA TERPISAH DARI profile.controller: keduanya menyentuh tabel yang sama
 * tetapi kewenangannya berbeda jauh. /profile berarti "akun saya sendiri" dan
 * identitasnya selalu dari token; /users berarti "akun orang lain" dan
 * dijaga izin. Menyatukannya membuat perbedaan itu mudah tertukar.
 */
const { successResponse } = require('../../utils/response');

class UsersController {
  constructor({ users }) {
    this.users = users;
  }

  list = async (req, res) => {
    const { page, limit } = req.query;

    const { users, meta } = await this.users.list({ page, limit });

    return successResponse(res, 200, 'Daftar user berhasil diambil', { users }, meta);
  };

  getById = async (req, res) => {
    const user = await this.users.getById(req.params.id);

    return successResponse(res, 200, 'Detail user berhasil diambil', { user });
  };

  create = async (req, res) => {
    const { email, password, fullName, phone, roleIds } = req.body ?? {};

    const user = await this.users.create({ email, password, fullName, phone, roleIds });

    return successResponse(res, 201, 'User berhasil dibuat', { user });
  };

  // req.user.id diteruskan sebagai pelaku, agar service dapat menegakkan
  // aturan "tidak boleh mengelola diri sendiri" dan "hanya superadmin boleh
  // mengelola superadmin". Identitas pelaku selalu dari token, bukan dari body.
  update = async (req, res) => {
    const { fullName, phone, isActive } = req.body ?? {};

    const user = await this.users.update(req.user.id, req.params.id, {
      fullName,
      phone,
      isActive,
    });

    return successResponse(res, 200, 'User berhasil diperbarui', { user });
  };

  setRoles = async (req, res) => {
    const { roleIds } = req.body ?? {};

    const user = await this.users.setRoles(req.user.id, req.params.id, roleIds);

    return successResponse(res, 200, 'Role user berhasil diperbarui', { user });
  };

  remove = async (req, res) => {
    await this.users.remove(req.user.id, req.params.id);

    return successResponse(res, 200, 'User berhasil dihapus');
  };
}

module.exports = { UsersController };
