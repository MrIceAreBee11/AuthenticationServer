'use strict';

/**
 * BERKAS INI: definisi tabel users beserta perilaku yang melekat padanya.
 *
 * KENAPA DI database/models/: jalurnya ditunjuk .sequelizerc, dan hanya
 * repository yang boleh mengimpornya.
 *
 * KENAPA ADA PERILAKU DI MODEL, BUKAN DI SERVICE: ketiga hal di bawah harus
 * berlaku pada SETIAP penyimpanan, dari mana pun asalnya — service, seeder,
 * atau migration. Menaruhnya di service berarti seeder bisa melewatinya.
 *
 *   defaultScope    membuang passwordHash dari setiap query, jadi lupa
 *                   menyaringnya tidak berujung pada kebocoran
 *   toJSON()        membuangnya lagi saat objek diubah menjadi JSON
 *   beforeSave      meng-hash password sebelum tersimpan
 *
 * KENAPA NORMALISASI DI beforeValidate DAN HASH DI beforeSave: urutannya
 * penting dan pernah salah. Validasi berjalan SEBELUM beforeSave, jadi email
 * yang dinormalkan di beforeSave akan divalidasi dalam bentuk aslinya —
 * "  TEST@Example.COM  " ditolak sebagai format email tidak valid.
 */
const { Model, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

const { config } = require('../../../config');

// Cost factor bcrypt. Dibaca dari config karena ia tombol operasional: naikkan
// saat perangkat makin cepat, dan turunkan sementara di lingkungan pengujian
// supaya suite tidak menghabiskan waktu hanya untuk menghitung hash. Lantainya
// dipasang di skema env (minimal 10), jadi tidak bisa dilemahkan sembarangan.
const SALT_ROUNDS = config.password.saltRounds;

module.exports = (sequelize) => {
  class User extends Model {
    static associate(models) {
      User.belongsToMany(models.Role, {
        through: 'user_roles',
        foreignKey: 'user_id',
        otherKey: 'role_id',
        as: 'roles',
      });
    }

    async comparePassword(plainPassword) {
      return bcrypt.compare(plainPassword, this.passwordHash);
    }

    toJSON() {
      const values = { ...this.get() };
      delete values.passwordHash;
      return values;
    }
  }

  User.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: { msg: 'Format email tidak valid' },
          notEmpty: { msg: 'Email tidak boleh kosong' },
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      fullName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'Nama lengkap tidak boleh kosong' },
          len: { args: [3, 150], msg: 'Nama lengkap minimal 3 karakter' },
        },
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      avatarKey: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      passwordChangedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      defaultScope: {
        attributes: { exclude: ['passwordHash'] },
      },
      hooks: {
        beforeValidate: (user) => {
          if (user.changed('email') && typeof user.email === 'string') {
            user.email = user.email.trim().toLowerCase();
          }
        },
        beforeSave: async (user) => {
          if (user.changed('passwordHash')) {
            user.passwordHash = await bcrypt.hash(user.passwordHash, SALT_ROUNDS);
            user.passwordChangedAt = new Date();
          }
        },
      },
    }
  );

  return User;
};
