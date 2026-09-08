/**
 * BERKAS INI: penerjemah HTTP untuk role dan katalog izin.
 *
 * KENAPA KATALOG IZIN IKUT DI SINI: role dan permission satu domain (RBAC),
 * dan katalognya hanya berguna untuk menyusun role. Alamatnya tetap dipisah
 * (/permissions) supaya sumber dayanya jelas berbeda.
 */
const { successResponse } = require('../../utils/response');

class RolesController {
  constructor({ roles }) {
    this.roles = roles;
  }

  list = async (req, res) => {
    const roles = await this.roles.list();

    return successResponse(res, 200, 'Daftar role berhasil diambil', { roles });
  };

  getById = async (req, res) => {
    const role = await this.roles.getById(req.params.id);

    return successResponse(res, 200, 'Detail role berhasil diambil', { role });
  };

  listPermissions = async (req, res) => {
    const { permissions, groups } = await this.roles.listPermissions();

    return successResponse(res, 200, 'Daftar permission berhasil diambil', {
      permissions,
      groups,
    });
  };

  create = async (req, res) => {
    const { name, description, permissionIds } = req.body ?? {};

    const role = await this.roles.create({ name, description, permissionIds });

    return successResponse(res, 201, 'Role berhasil dibuat', { role });
  };

  update = async (req, res) => {
    const { name, description } = req.body ?? {};

    const role = await this.roles.update(req.params.id, { name, description });

    return successResponse(res, 200, 'Role berhasil diperbarui', { role });
  };

  setPermissions = async (req, res) => {
    const { permissionIds } = req.body ?? {};

    const role = await this.roles.setPermissions(req.params.id, permissionIds);

    return successResponse(res, 200, 'Permission role berhasil diperbarui', { role });
  };

  remove = async (req, res) => {
    await this.roles.remove(req.params.id);

    return successResponse(res, 200, 'Role berhasil dihapus');
  };
}

module.exports = { RolesController };
