const AppError = require('../utils/AppError');
const { errorResponse } = require('../utils/response');
const { config } = require('../config');
const { ValidationError, UniqueConstraintError, ConnectionError } = require('sequelize');

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return errorResponse(res, err.statusCode, err.message);
  }
  
  if (err instanceof ConnectionError) {
    console.error('[DATABASE] koneksi bermasalah:', err.message);

    return errorResponse(
      res,
      503,
      'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.'
    );
  }
  
  if (err instanceof UniqueConstraintError) {
    return errorResponse(res, 409, 'Data sudah digunakan oleh akun lain', {
      fields: err.errors.map((item) => item.path),
    });
  }

  if (err instanceof ValidationError) {
    return errorResponse(res, 400, err.errors[0]?.message || 'Data tidak valid', {
      errors: err.errors.map((item) => ({
        field: item.path,
        message: item.message,
      })),
    });
  }

  console.error('[UNEXPECTED ERROR]', err);

  return errorResponse(
    res,
    500,
    'Terjadi kesalahan pada server',
    config.app.isDevelopment ? { stack: err.stack } : null
  );
};

module.exports = errorHandler;