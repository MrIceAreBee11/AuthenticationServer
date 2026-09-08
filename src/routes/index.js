/**
 * BERKAS INI: pengumpul seluruh route menjadi satu router ber-awalan /api/v1.
 *
 * KENAPA ADA BERKAS TERSENDIRI: app.js jadi tidak perlu tahu ada modul apa
 * saja. Menambah modul baru menyentuh satu baris di sini, bukan mengubah
 * berkas yang juga mengatur helmet, CORS, dan penanganan error.
 *
 * URUTANNYA BUKAN SELERA: /health didaftarkan pertama supaya pemeriksaan
 * kesehatan tetap terjawab paling murah, dan seluruhnya didaftarkan sebelum
 * berkas statis di app.js agar alamat API selalu menang atas nama berkas.
 */
const { Router } = require('express');

const { buildHealthRoutes } = require('../modules/health/health.routes');
const { buildAuthRoutes } = require('../modules/auth/auth.routes');
const { buildProfileRoutes } = require('../modules/profile/profile.routes');
const { buildUsersRoutes } = require('../modules/users/users.routes');
const { buildRolesRoutes } = require('../modules/roles/roles.routes');
const { buildPermissionsRoutes } = require('../modules/roles/permissions.routes');

const buildRoutes = (container) => {
  const router = Router();

  router.use('/health', buildHealthRoutes(container));
  router.use('/auth', buildAuthRoutes(container));
  router.use('/profile', buildProfileRoutes(container));
  router.use('/users', buildUsersRoutes(container));
  router.use('/roles', buildRolesRoutes(container));
  router.use('/permissions', buildPermissionsRoutes(container));

  return router;
};

module.exports = { buildRoutes };
