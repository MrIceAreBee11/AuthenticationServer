'use strict';

/**
 * BERKAS INI: definisi tabel refresh_tokens.
 *
 * KENAPA DI database/models/: jalurnya ditunjuk .sequelizerc, dan hanya
 * repository yang boleh mengimpornya.
 *
 * KENAPA ADA KOLOM family_id: penanda satu rangkaian token yang berasal dari
 * satu kali login. Setiap rotasi mewarisinya, sehingga seluruh keturunan
 * sebuah sesi dapat dicabut sekaligus ketika terdeteksi ada yang memakai token
 * lama — tanpa ikut mencabut sesi pengguna di perangkat lain.
 *
 * KENAPA revoked_at TIDAK MENGHAPUS BARISNYA: baris yang sudah dicabut itulah
 * yang membuat pemakaian ulang dapat dikenali. Menghapusnya justru membuang
 * barang bukti yang dibutuhkan.
 */
const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RefreshToken extends Model {}

  RefreshToken.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
        unique: true,
      },
      familyId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'RefreshToken',
      tableName: 'refresh_tokens',
    }
  );

  return RefreshToken;
};
