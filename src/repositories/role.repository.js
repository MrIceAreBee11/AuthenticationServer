/**
 * BERKAS INI: seluruh query untuk tabel roles dan user_roles.
 *
 * KENAPA DI repositories/: inilah SATU-SATUNYA lapisan yang boleh menyebut
 * Sequelize atau klien Redis. Service memanggil repository dan tidak pernah
 * menyentuh model. Aturan itu yang membuat service dapat diuji tanpa basis
 * data, dan membuat penggantian ORM hanya menyentuh folder ini.
 *
 * KENAPA DEPENDENSINYA MASUK LEWAT CONSTRUCTOR: sebelumnya berkas ini
 * meng-import model di baris atas. Ikatan itu terjadi saat berkas di-require,
 * jadi tidak ada cara memasang model lain — dan tidak ada cara mengujinya.
 */
const { QueryTypes } = require('sequelize');

const PERMISSION_INCLUDE = {
  association: 'permissions',
  attributes: ['id', 'name', 'description'],
  through: { attributes: [] },
};

class RoleRepository {
  constructor({ Role, database }) {
    this.Role = Role;
    this.database = database;
  }

  async findById(roleId, { includePermissions = false } = {}) {
    return this.Role.findByPk(roleId, {
      include: includePermissions ? [PERMISSION_INCLUDE] : undefined,
    });
  }

  async findAll({ includePermissions = false } = {}) {
    return this.Role.findAll({
      include: includePermissions ? [PERMISSION_INCLUDE] : undefined,
      order: [['id', 'ASC']],
    });
  }

  async findByIds(roleIds) {
    return this.Role.findAll({ where: { id: roleIds } });
  }

  async create(data, options = {}) {
    return this.Role.create(data, options);
  }

  async update(role, changes, options = {}) {
    return role.update(changes, options);
  }

  async destroy(role, options = {}) {
    return role.destroy(options);
  }

  async setPermissions(role, permissions, options = {}) {
    return role.setPermissions(permissions, options);
  }

  /**
   * Jumlah pengguna per role, dikembalikan sebagai peta { roleId: jumlah }.
   * Memakai query agregat langsung karena menghitungnya lewat include akan
   * memuat seluruh baris pengguna hanya untuk diambil jumlahnya.
   */
  async countUsersPerRole() {
    const rows = await this.database.query(
      'SELECT role_id, COUNT(*)::int AS total FROM user_roles GROUP BY role_id',
      { type: QueryTypes.SELECT }
    );

    return Object.fromEntries(rows.map((row) => [row.role_id, row.total]));
  }
}

module.exports = { RoleRepository };
