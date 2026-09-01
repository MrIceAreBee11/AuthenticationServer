'use strict';

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const SUPERADMIN_ROLE = 'superadmin';

module.exports = {
  async up(queryInterface) {
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;
    const fullName = process.env.SUPERADMIN_FULL_NAME;

    if (!email || !password || !fullName) {
      throw new Error(
        'SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, dan SUPERADMIN_FULL_NAME wajib diisi di .env'
      );
    }

    if (password.length < 12) {
      throw new Error('SUPERADMIN_PASSWORD minimal 12 karakter');
    }

    const [roleRows] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = '${SUPERADMIN_ROLE}'`
    );

    if (roleRows.length === 0) {
      throw new Error(
        `Role "${SUPERADMIN_ROLE}" tidak ditemukan. Jalankan seeder RBAC terlebih dahulu.`
      );
    }

    const userId = crypto.randomUUID();

    await queryInterface.bulkInsert('users', [
      {
        id: userId,
        email: email.trim().toLowerCase(),
        password_hash: await bcrypt.hash(password, SALT_ROUNDS),
        full_name: fullName,
        is_active: true,
      },
    ]);

    await queryInterface.bulkInsert('user_roles', [
      { user_id: userId, role_id: roleRows[0].id },
    ]);
  },

  async down(queryInterface) {
    const email = process.env.SUPERADMIN_EMAIL;

    if (!email) {
      return;
    }

    await queryInterface.bulkDelete('users', {
      email: email.trim().toLowerCase(),
    });
  },
};