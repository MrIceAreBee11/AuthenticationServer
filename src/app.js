/**  Merakit aplikasi Express: middleware global, routes, dan error handler.
 * app ini tidak membuka port. server.js yang menangani proses tersebut, jadi
 * app bisa dipakai untuk testing tanpa ikut menyalakan server atau SIGTERM handler.
 * createApp menerima container supaya dependency dan waktu inisialisasi tetap
 * dikontrol dari luar, bukan dibuat sebagai side effect saat module di-load.
 * Urutan middleware penting:
 * helmet & cors -> header keamanan
 * parser -> isi req.body sebelum masuk controller
 * route API -> harus dipasang sebelum static file
 * static file -> halaman demo
 * 404 -> menangani route yang tidak ditemukan
 * errorHandler -> harus selalu dipasang paling akhir */
const path = require('node:path');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { buildRoutes } = require('./routes');
const { NotFoundError } = require('./utils/AppError');
const { ERROR_CODES } = require('./constants/errorCodes');

const API_PREFIX = '/api/v1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const createApp = (container, settings) => {
  const app = express();

  // Hanya enable jika ada reverse proxy di depan. Jika aktif tanpa proxy,
  // client bisa spoof header X-Forwarded-For untuk bypass rate limiter.
  if (settings.app.trustProxy > 0) {
    app.set('trust proxy', settings.app.trustProxy);
  }

  // MinIO jalan di port berbeda. Whitelist origin-nya di img-src
  // agar avatar tidak diblokir oleh default CSP Helmet.
  const minioOrigins = [
    `http://localhost:${settings.storage.port}`,
    `http://127.0.0.1:${settings.storage.port}`,
  ];

  // Paling awal: middleware di atasnya belum punya requestId, jadi log-nya
  // tidak dapat dihubungkan ke permintaan mana pun. Ia juga menggantikan
  // morgan — satu baris JSON dengan status dan durasi lebih berguna daripada
  // teks bebas, dan bisa difilter per field.
  app.use(container.requestLogger.handle);

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

  // Cegah DoS via payload JSON/form berukuran besar
  app.use(express.json({ limit: settings.app.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: settings.app.jsonBodyLimit }));

  // Route API harus didaftarkan sebelum static files agar prefix /api/v1 diprioritaskan
  app.use(API_PREFIX, buildRoutes(container));
  app.use(express.static(PUBLIC_DIR));

  // Fallback 404 untuk endpoint yang tidak terdaftar
  app.use((req, res, next) => {
    next(
      new NotFoundError(
        `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
        ERROR_CODES.ROUTE_NOT_FOUND
      )
    );
  });
  // Global error handler harus selalu berada di urutan paling akhir
  app.use(container.errorHandler.handle);

  return app;
};

module.exports = { createApp };
