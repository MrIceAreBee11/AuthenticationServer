'use strict';

/**
 * Tabel penyimpan refresh token.
 *
 * Kenapa di PostgreSQL, bukan di Redis seperti token reset password:
 *
 *   1. Umurnya panjang (tujuh hari, bukan lima belas menit). Redis di sini
 *      diperlakukan sebagai cache yang boleh hilang; kalau ia dikosongkan,
 *      seluruh pengguna langsung terlempar keluar.
 *   2. Deteksi pemakaian ulang memerlukan jejak. Token yang sudah dirotasi
 *      harus tetap tersimpan sampai kedaluwarsa, supaya kemunculannya kembali
 *      dapat dikenali. Baris yang menghilang sendiri lewat TTL justru
 *      menghapus barang bukti yang dibutuhkan.
 *   3. Mencabut seluruh sesi seorang pengguna cukup satu perintah UPDATE.
 *      Di Redis itu berarti menyapu keyspace.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('refresh_tokens', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // Yang disimpan hasil SHA-256 dari token, bukan tokennya. Alasannya sama
      // dengan token reset password: kalau basis data bocor, isinya tidak
      // dapat dipakai untuk menyamar sebagai siapa pun.
      token_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true,
      },
      // Penanda satu rangkaian token yang berasal dari satu kali login.
      // Setiap rotasi mewarisi penanda ini, sehingga seluruh keturunan sebuah
      // sesi dapat dicabut sekaligus ketika terdeteksi ada yang memakai token
      // lama — tanpa ikut mencabut sesi pengguna di perangkat lain.
      family_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      // Diisi saat token dirotasi atau dicabut. Barisnya sengaja tidak dihapus
      // sampai kedaluwarsa, karena baris inilah yang membuat pemakaian ulang
      // dapat dikenali.
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Dipakai saat mencabut seluruh sesi seorang pengguna dan saat membersihkan
    // baris yang sudah kedaluwarsa.
    await queryInterface.addIndex('refresh_tokens', ['user_id']);

    // Dipakai saat mencabut satu rangkaian sesi akibat pemakaian ulang.
    await queryInterface.addIndex('refresh_tokens', ['family_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
  },
};
