'use strict';

/**
 * BERKAS INI: definisi tabel permissions.
 *
 * KENAPA DI database/models/: jalurnya ditunjuk .sequelizerc, dan hanya
 * repository yang boleh mengimpornya.
 *
 * KENAPA IZIN MELEKAT PADA ROLE, BUKAN LANGSUNG PADA PENGGUNA: kalau izin
 * diberikan per pengguna, menambah satu jenis izin baru berarti menyentuh
 * setiap baris pengguna yang membutuhkannya. Dengan role sebagai perantara,
 * perubahan itu satu baris.
 */
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Permission extends Model {
    static associate(models) {
      Permission.belongsToMany(models.Role, {
        through: 'role_permissions',
        foreignKey: 'permission_id',
        otherKey: 'role_id',
        as: 'roles',
      });
    }
  }

  Permission.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: 'Nama permission tidak boleh kosong' },
        },
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Permission',
      tableName: 'permissions',
    }
  );

  return Permission;
};
