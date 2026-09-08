const multer = require('multer');

const AppError = require('../utils/AppError');

const { config } = require('../config');
const { BYTES } = require('../constants/units');

const { maxSizeBytes, allowedMimeTypes } = config.upload.avatar;

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxSizeBytes, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
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
      // Angkanya diturunkan dari batas yang sama, bukan ditulis ulang.
      // Sebelumnya "2 MB" ada di dua tempat, dan mengubah salah satunya
      // menghasilkan pesan yang berbohong kepada pengguna.
      const maxMb = Math.round(maxSizeBytes / BYTES.MB);
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Ukuran file maksimal ${maxMb} MB`
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