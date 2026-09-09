'use strict';

/**
 * BERKAS INI: seeder yang membuat satu akun superadmin awal.
 *
 * KENAPA DI database/seeders/: ia mengisi data, bukan mengubah struktur.
 * Struktur adalah urusan migration dan selalu dijalankan; data awal dijalankan
 * terpisah karena isi setiap lingkungan bisa berbeda.
 *
 * KENAPA MEMBACA config, BUKAN process.env: sebelumnya berkas ini mengambil
 * kredensial langsung dari process.env dan memeriksanya sendiri. Akibatnya ada
 * dua tempat yang memeriksa hal sama dengan aturan yang bisa berbeda — dan
 * yang di sini tidak pernah tahu kalau password aslinya kosong sampai ia
 * benar-benar meng-hash string "undefined". Sekarang skema env yang menjamin
 * email berformat sah, password minimal 12 karakter, dan nama tidak kosong.
 * Seeder ini tidak akan pernah sampai berjalan kalau salah satunya tidak
 * terpenuhi.
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const { config } = require('../../../config');
const { ROLES } = require('../../../constants/roles');

module.exports = {
  async up(queryInterface) {
    const { email, password, fullName } = config.seed;

    const [roleRows] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = '${ROLES.SUPERADMIN}'`
    );

    if (roleRows.length === 0) {
      throw new Error(
        `Role "${ROLES.SUPERADMIN}" tidak ditemukan. Jalankan seeder RBAC terlebih dahulu.`
      );
    }

    const userId = crypto.randomUUID();

    await queryInterface.bulkInsert('users', [
      {
        id: userId,
        email: email.trim().toLowerCase(),
        // Cost factor diambil dari config, bukan ditulis ulang di sini.
        // Dulu angka 12 muncul di seeder ini DAN di model User; kalau salah
        // satunya dinaikkan, akun superadmin dan akun biasa akan punya kekuatan
        // hash yang berbeda tanpa ada yang menyadarinya.
        password_hash: await bcrypt.hash(password, config.password.saltRounds),
        full_name: fullName,
        is_active: true,
      },
    ]);

    await queryInterface.bulkInsert('user_roles', [
      { user_id: userId, role_id: roleRows[0].id },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: config.seed.email.trim().toLowerCase(),
    });
  },
};
