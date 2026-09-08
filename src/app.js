/**
 * BERKAS INI: penyusun aplikasi Express — middleware global, route, penutup.
 *
 * KENAPA TERPISAH DARI server.js: berkas ini hanya MERAKIT aplikasi dan tidak
 * pernah membuka port. Itulah yang membuat pengujian end-to-end dapat memanggil
 * app.listen(0) pada port acak tanpa bertabrakan dengan server yang sedang
 * berjalan, dan tanpa ikut menyalakan penanganan SIGTERM.
 *
 * KENAPA PABRIK, BUKAN INSTANCE: `const app = express()` di module scope
 * berarti aplikasinya terbentuk sebagai efek samping saat berkas di-require —
 * termasuk seluruh koneksi yang dipakai middleware-nya. Sekarang container yang
 * menentukan kapan itu terjadi.
 *
 * URUTAN PEMASANGAN PENTING dan tidak boleh diacak:
 *   helmet & cors -> header keamanan sebelum apa pun sempat menjawab
 *   parser        -> req.body harus terisi sebelum controller dipanggil
 *   route API     -> didaftarkan SEBELUM berkas statis, supaya /api/v1 menang
 *   berkas statis -> antarmuka demo
 *   404           -> apa pun yang tidak cocok di atas
 *   errorHandler  -> Express hanya mengenalinya kalau terdaftar paling akhir
 */
const path = require('node:path');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { buildRoutes } = require('./routes');
const AppError = require('./utils/AppError');

const API_PREFIX = '/api/v1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const createApp = (container, settings) => {
  const app = express();

  // trust proxy hanya dinyalakan kalau memang ada proxy di depan. Menyalakannya
  // tanpa proxy membuat header X-Forwarded-For dari klien dipercaya, dan
  // pembatas laju bisa dielakkan hanya dengan mengarang header.
  if (settings.app.trustProxy > 0) {
    app.set('trust proxy', settings.app.trustProxy);
  }

  // Avatar disajikan langsung oleh MinIO pada port terpisah, sehingga
  // origin-nya berbeda dari aplikasi. Tanpa pengecualian ini, CSP bawaan
  // helmet memblokir gambarnya.
  const minioOrigins = [
    `http://localhost:${settings.storage.port}`,
    `http://127.0.0.1:${settings.storage.port}`,
  ];

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'blob:', ...minioOrigins],
        },
      },
    })
  );

  app.use(cors());

  // Batas ukuran body: tanpa ini, satu permintaan JSON raksasa cukup untuk
  // menghabiskan memori proses.
  app.use(express.json({ limit: settings.app.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: settings.app.jsonBodyLimit }));

  if (settings.app.isDevelopment) {
    app.use(morgan('dev'));
  }

  app.use(API_PREFIX, buildRoutes(container));
  app.use(express.static(PUBLIC_DIR));

  app.use((req, res, next) => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} tidak ditemukan`, 404));
  });

  app.use(container.errorHandler.handle);

  return app;
};

module.exports = { createApp };
