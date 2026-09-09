/**
 * BERKAS INI: satu-satunya tempat yang tahu bagaimana berkas avatar disimpan,
 * dialamatkan, dan dihapus.
 *
 * KENAPA DI services/ DAN BUKAN DI modules/profile/: dipakai dua modul. Modul
 * profile mengunggah dan menghapus avatar milik sendiri; modul users menghapus
 * avatar milik akun yang dihapus administrator. Aturan project ini menaruh yang
 * lintas modul di sini.
 *
 * KENAPA IA ADA: sebelumnya "hapus berkas, maafkan kegagalannya, catat di log"
 * ditulis DUA KALI — sebagai method privat di profile.service dan sebagai
 * try/catch sebaris di users.service. Keduanya sepakat soal perilakunya, tetapi
 * kesepakatan itu tidak dijaga apa pun. Satu di antaranya diperbaiki tanpa yang
 * lain adalah kejadian yang tinggal menunggu waktu.
 *
 * KENAPA KEGAGALAN DIMAAFKAN, BUKAN DILEMPAR: berkas avatar berada di luar
 * basis data, jadi tidak ada transaksi yang mencakup keduanya. Kalau
 * penghapusan berkas menggagalkan seluruh operasi, menghapus pengguna menjadi
 * mustahil selama MinIO bermasalah — padahal barisnya di basis data sudah
 * terhapus. Yang tertinggal hanyalah berkas tanpa pemilik, dan itu kerugian
 * yang jauh lebih kecil.
 */
const crypto = require('node:crypto');

/**
 * Ekstensi ditentukan dari tipe MIME yang sudah divalidasi middleware unggah,
 * bukan dari nama berkas kiriman klien. Nama berkas dapat berisi apa saja,
 * termasuk penunjuk direktori induk dan ekstensi ganda yang menyesatkan.
 */
const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

class AvatarStore {
  constructor({ storage, avatar, logger }) {
    this.storage = storage;
    this.avatar = avatar;
    this.logger = logger;
  }

  /**
   * Alamat sementara untuk sebuah avatar, atau null.
   *
   * Kegagalan mengembalikan null, tidak melempar: nama, email, dan role sama
   * sekali tidak bergantung pada penyimpanan berkas. Ketika MinIO bermasalah,
   * pengguna melihat profilnya tanpa foto — bukan halaman error.
   */
  async urlFor(avatarKey) {
    if (!avatarKey) {
      return null;
    }

    try {
      return await this.storage.getPresignedUrl(avatarKey, this.avatar.urlTtlSeconds);
    } catch (error) {
      this.logger.exception('gagal membuat alamat sementara avatar', error);

      return null;
    }
  }

  /**
   * Menyimpan berkas baru dan mengembalikan kuncinya.
   *
   * Kunci diawali id pengguna supaya berkas satu orang berkumpul di satu
   * awalan, dan diakhiri UUID acak supaya unggahan baru tidak pernah menimpa
   * yang lama — itulah yang membuat urutan "unggah baru dulu, hapus lama
   * terakhir" di pemanggil benar-benar aman.
   */
  async save(userId, file) {
    const objectKey = `${userId}/${crypto.randomUUID()}.${EXTENSION_BY_MIME[file.mimetype]}`;

    await this.storage.putObject(objectKey, file.buffer, file.mimetype);

    return objectKey;
  }

  /** Menghapus berkas; kegagalannya dicatat, tidak dilempar. Lihat catatan di atas. */
  async removeQuietly(objectKey, fields = {}) {
    if (!objectKey) {
      return;
    }

    try {
      await this.storage.removeObject(objectKey);
    } catch (error) {
      this.logger.exception('gagal menghapus berkas dari penyimpanan', error, fields);
    }
  }
}

module.exports = { AvatarStore, EXTENSION_BY_MIME };
