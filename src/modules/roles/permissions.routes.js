/**
 * BERKAS INI: alamat katalog seluruh permission.
 *
 * KENAPA PABRIK, BUKAN ROUTER SIAP PAKAI: router lama dibuat sebagai efek
 * samping saat berkas di-require, dan ia mengambil controller dari singleton
 * yang diekspor modul. Sekarang ia menerima container, sehingga satu-satunya
 * tempat yang tahu implementasi konkret tetap src/container.js.
 *
 * ISINYA SENGAJA HANYA URUTAN: alamat, rantai middleware, dan handler. Tidak
 * ada satu pun `if` atas data bisnis di sini — begitu ada, ia milik service.
 */
const { Router } = require('express');

const { PERMISSIONS } = require('../../constants/permissions');

// Katalog permission tinggal di modul roles karena keduanya satu domain
// (RBAC), tetapi dipasang pada alamat sendiri agar sumber dayanya jelas
// terpisah dari role itu sendiri.
const buildPermissionsRoutes = ({ controllers, authenticate, authorize }) => {
  const router = Router();

  router.get(
    '/',
    authenticate.handle,
    authorize.require(PERMISSIONS.PERMISSIONS_READ),
    controllers.roles.listPermissions
  );

  return router;
};

module.exports = { buildPermissionsRoutes };
