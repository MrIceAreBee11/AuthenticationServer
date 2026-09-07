const { QueryTypes } = require('sequelize');

const { sequelize, Role } = require('../database');

/** Satu-satunya tempat yang menyusun query untuk tabel roles dan user_roles. */

const PERMISSION_INCLUDE = {
  association: 'permissions',
  attributes: ['id', 'name', 'description'],
  through: { attributes: [] },
};

class RoleRepository {
  async findById(roleId, { includePermissions = false } = {}) {
    return Role.findByPk(roleId, {
      include: includePermissions ? [PERMISSION_INCLUDE] : undefined,
    });
  }

  async findAll({ includePermissions = false } = {}) {
    return Role.findAll({
      include: includePermissions ? [PERMISSION_INCLUDE] : undefined,
      order: [['id', 'ASC']],
    });
  }

  async findByIds(roleIds) {
    return Role.findAll({ where: { id: roleIds } });
  }

  async create(data, options = {}) {
    return Role.create(data, options);
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
    const rows = await sequelize.query(
      'SELECT role_id, COUNT(*)::int AS total FROM user_roles GROUP BY role_id',
      { type: QueryTypes.SELECT }
    );

    return Object.fromEntries(rows.map((row) => [row.role_id, row.total]));
  }
}

module.exports = { RoleRepository, roleRepository: new RoleRepository() };
