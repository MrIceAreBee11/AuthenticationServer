const multer = require('multer');

const AppError = require('../utils/AppError');

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new AppError('Format file tidak didukung. Gunakan JPEG, PNG, atau WebP.', 400)
      );
    }

    return callback(null, true);
  },
});

const uploadAvatar = (req, res, next) => {
  multerUpload.single('avatar')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran file maksimal 2 MB'
          : `Upload gagal: ${error.message}`;

      return next(new AppError(message, 400));
    }

    if (error) {
      return next(error);
    }

    if (!req.file) {
      return next(new AppError('File avatar wajib diunggah pada field "avatar"', 400));
    }

    return next();
  });
};

module.exports = { uploadAvatar };