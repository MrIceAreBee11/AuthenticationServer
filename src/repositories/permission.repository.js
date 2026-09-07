const { Permission } = require('../database');

/** Satu-satunya tempat yang menyusun query untuk tabel permissions. */
class PermissionRepository {
  async findAll() {
    return Permission.findAll({
      attributes: ['id', 'name', 'description'],
      order: [['name', 'ASC']],
    });
  }

  async findByIds(permissionIds) {
    return Permission.findAll({ where: { id: permissionIds } });
  }

  /** Hanya nama, dipakai verifikasi katalog saat aplikasi start. */
  async findAllNames() {
    const rows = await Permission.findAll({
      attributes: ['name'],
      order: [['name', 'ASC']],
    });

    return rows.map((row) => row.name);
  }
}

module.exports = {
  PermissionRepository,
  permissionRepository: new PermissionRepository(),
};
