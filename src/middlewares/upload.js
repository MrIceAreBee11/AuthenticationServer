/**
 * BERKAS INI: penerimaan berkas avatar sebelum sampai ke controller.
 *
 * KENAPA DI middlewares/: ia mengubah bentuk permintaan (mengisi req.file) dan
 * berjalan sebelum logika apa pun. Controller tidak perlu tahu apa-apa soal
 * multipart.
 *
 * KENAPA CLASS: batas ukuran dan daftar tipe MIME dulu ditulis di dalam berkas
 * ini, dan angka 2 MB muncul DUA kali — sebagai batas multer dan sebagai teks
 * pesan kesalahan. Mengubah salah satunya menghasilkan pesan yang berbohong
 * kepada pengguna. Sekarang keduanya diturunkan dari satu nilai yang sama.
 *
 * KENAPA memoryStorage: berkasnya diteruskan ke MinIO, bukan disimpan di disk
 * aplikasi. Menulis ke disk lebih dulu hanya menambah satu langkah yang harus
 * dibersihkan, dan menyisakan sampah kalau prosesnya mati di tengah.
 */
const multer = require('multer');

const { BadRequestError } = require('../utils/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');
const { BYTES } = require('../constants/units');

const FIELD_NAME = 'avatar';

class UploadMiddleware {
  constructor({ avatar }) {
    this.maxSizeBytes = avatar.maxSizeBytes;

    this.multer = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: avatar.maxSizeBytes, files: 1 },
      fileFilter: (req, file, callback) => {
        if (!avatar.allowedMimeTypes.includes(file.mimetype)) {
          callback(
            new BadRequestError(
              `Format file tidak didukung. Gunakan ${avatar.allowedMimeTypes
                .map((type) => type.replace('image/', '').toUpperCase())
                .join(', ')}.`,
              ERROR_CODES.FILE_TYPE_UNSUPPORTED
            )
          );

          return;
        }

        callback(null, true);
      },
    });
  }

  #translateError(error) {
    if (!(error instanceof multer.MulterError)) {
      return error;
    }

    const maxMb = Math.round(this.maxSizeBytes / BYTES.MB);

    const tooLarge = error.code === 'LIMIT_FILE_SIZE';

    return new BadRequestError(
      tooLarge ? `Ukuran file maksimal ${maxMb} MB` : `Upload gagal: ${error.message}`,
      tooLarge ? ERROR_CODES.FILE_TOO_LARGE : ERROR_CODES.VALIDATION_FAILED
    );
  }

  /**
   * Multer memakai gaya callback, bukan promise, jadi ia tidak bisa langsung
   * dipasang sebagai handler async. Pembungkus ini juga menerjemahkan
   * MulterError menjadi AppError, supaya seluruh kegagalan melewati satu jalur
   * penanganan error yang sama.
   */
  handle = (req, res, next) => {
    this.multer.single(FIELD_NAME)(req, res, (error) => {
      if (error) {
        next(this.#translateError(error));

        return;
      }

      if (!req.file) {
        next(
          new BadRequestError(
            `File avatar wajib diunggah pada field "${FIELD_NAME}"`,
            ERROR_CODES.FILE_MISSING
          )
        );

        return;
      }

      next();
    });
  };
}

module.exports = { UploadMiddleware };
