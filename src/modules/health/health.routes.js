/**
 * BERKAS INI: alamat endpoint kesehatan.
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

// Liveness sengaja TIDAK menyentuh dependensi apa pun: ia dipanggil Docker
// sesering mungkin dan harus tetap menjawab meski seluruh dependensi mati.
// Readiness yang memeriksa basis data dan cache.
const buildHealthRoutes = ({ controllers }) => {
  const router = Router();

  router.get('/', controllers.health.liveness);
  router.get('/ready', controllers.health.readiness);

  return router;
};

module.exports = { buildHealthRoutes };
