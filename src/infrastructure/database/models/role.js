'use strict';

/**
 * BERKAS INI: definisi tabel roles dan relasinya ke permissions.
 *
 * KENAPA DI database/models/: jalurnya ditunjuk .sequelizerc, dan hanya
 * repository yang boleh mengimpornya.
 *
 * KENAPA id-nya INTEGER, bukan UUID seperti users: role jumlahnya sedikit,
 * tidak pernah muncul di URL publik, dan tidak ada yang perlu disembunyikan
 * dari penomoran berurutan. UUID pada users justru mencegah orang menebak
 * jumlah pengguna dari ID akunnya sendiri.
 */
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Role extends Model {
    static associate(models) {
      Role.belongsToMany(models.User, {
        through: 'user_roles',
        foreignKey: 'role_id',
        otherKey: 'user_id',
        as: 'users',
      });

      Role.belongsToMany(models.Permission, {
        through: 'role_permissions',
        foreignKey: 'role_id',
        otherKey: 'permission_id',
        as: 'permissions',
      });
    }
  }

  Role.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: 'Nama role tidak boleh kosong' },
        },
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Role',
      tableName: 'roles',
    }
  );

  return Role;
};