const crypto = require('node:crypto');

const AppError = require('../../utils/AppError');
const { putObject, getPresignedUrl, removeObject } = require('../../storage');
const { userRepository } = require('../../repositories/user.repository');

const AVATAR_URL_TTL_SECONDS = 60 * 60;
const PHONE_PATTERN = /^[0-9+\-\s]{8,20}$/;

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

class ProfileService {
  constructor({ users = userRepository, storage = null } = {}) {
    this.users = users;
    this.storage = storage ?? { putObject, getPresignedUrl, removeObject };
  }

  async #findOrFail(userId) {
    const user = await this.users.findById(userId, { includeRoles: true });

    if (!user) {
      throw new AppError('User tidak ditemukan', 404);
    }

    return user;
  }

  /**
   * Kegagalan pembuatan alamat sengaja dilewati dan mengembalikan null.
   * Nama, email, dan role sama sekali tidak bergantung pada penyimpanan
   * berkas — jadi ketika MinIO bermasalah, pengguna melihat profilnya tanpa
   * foto, bukan halaman error.
   */
  async #buildAvatarUrl(avatarKey) {
    if (!avatarKey) {
      return null;
    }

    try {
      return await this.storage.getPresignedUrl(avatarKey, AVATAR_URL_TTL_SECONDS);
    } catch (error) {
      console.error('[STORAGE] gagal membuat presigned URL:', error.message);

      return null;
    }
  }

  async #removeObjectQuietly(objectKey, context) {
    try {
      await this.storage.removeObject(objectKey);
    } catch (error) {
      console.error(`[STORAGE] gagal menghapus ${context}:`, error.message);
    }
  }

  async getProfile(userId) {
    const user = await this.#findOrFail(userId);

    return {
      ...user.toJSON(),
      avatarUrl: await this.#buildAvatarUrl(user.avatarKey),
    };
  }

  async updateProfile(userId, { fullName, phone }) {
    const user = await this.#findOrFail(userId);

    const changes = {};

    if (fullName !== undefined) {
      changes.fullName = fullName;
    }

    // Diperiksa dengan !== undefined, bukan dengan nilai truthy. Pada PATCH,
    // "tidak dikirim" dan "dikirim bernilai null" adalah dua perintah berbeda:
    // yang pertama berarti jangan disentuh, yang kedua berarti hapus isinya.
    if (phone !== undefined) {
      if (phone !== null && !PHONE_PATTERN.test(String(phone))) {
        throw new AppError('Nomor telepon tidak valid (8-20 digit)', 400);
      }

      changes.phone = phone;
    }

    if (Object.keys(changes).length === 0) {
      throw new AppError('Tidak ada data yang dikirim untuk diubah', 400);
    }

    await this.users.update(user, changes);

    return this.getProfile(userId);
  }

  async updateAvatar(userId, file) {
    const user = await this.#findOrFail(userId);

    const extension = EXTENSION_BY_MIME[file.mimetype];
    const objectKey = `${userId}/${crypto.randomUUID()}.${extension}`;

    // Urutannya disengaja: unggah baru, perbarui basis data, baru hapus yang
    // lama. Kalau penghapusan didahulukan lalu pembaruan gagal, basis data
    // menunjuk berkas yang sudah tidak ada — dan avatar itu rusak permanen.
    await this.storage.putObject(objectKey, file.buffer, file.mimetype);

    const previousKey = user.avatarKey;

    await this.users.update(user, { avatarKey: objectKey });

    if (previousKey) {
      await this.#removeObjectQuietly(previousKey, 'avatar lama');
    }

    return this.getProfile(userId);
  }

  async removeAvatar(userId) {
    const user = await this.#findOrFail(userId);

    if (!user.avatarKey) {
      throw new AppError('Anda belum memiliki avatar', 400);
    }

    const previousKey = user.avatarKey;

    await this.users.update(user, { avatarKey: null });
    await this.#removeObjectQuietly(previousKey, 'avatar');

    return this.getProfile(userId);
  }
}

module.exports = { ProfileService, profileService: new ProfileService() };
