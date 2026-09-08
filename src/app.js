const path = require('node:path');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const AppError = require('./utils/AppError');
const { config } = require('./config');

const app = express();

if (config.app.trustProxy > 0) {
  app.set('trust proxy', config.app.trustProxy);
}

// Avatar disajikan langsung oleh MinIO pada port terpisah, sehingga origin-nya
// berbeda dari aplikasi. Tanpa pengecualian ini, CSP bawaan helmet memblokirnya.
const minioOrigins = [
  `http://localhost:${config.storage.port}`,
  `http://127.0.0.1:${config.storage.port}`,
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
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

if (config.app.isDevelopment) {
  app.use(morgan('dev'));
}

app.use('/api/v1', routes);

// Antarmuka demo. Diletakkan setelah API agar alamat /api/v1 selalu menang.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} tidak ditemukan`, 404));
});

app.use(errorHandler);

module.exports = app;
