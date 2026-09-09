/**
 * BERKAS INI: aturan seputar profil milik sendiri, termasuk foto avatar.
 *
 * KENAPA TERPISAH DARI users.service: keduanya menyentuh tabel yang sama
 * tetapi kewenangannya berbeda jauh. Berkas ini selalu bekerja pada akun
 * pemanggil sendiri — ID-nya dari token, tidak pernah dari input. users.service
 * bekerja pada akun ORANG LAIN dan karena itu penuh pemeriksaan hak akses.
 * Menyatukannya membuat perbedaan itu mudah tertukar, dan tertukarnya berarti
 * seseorang mengubah profil orang lain.
 *
 * KENAPA KEGAGALAN STORAGE DIMAAFKAN: nama, email, dan role sama sekali tidak
 * bergantung pada penyimpanan berkas. Ketika MinIO bermasalah, pengguna
 * melihat profilnya tanpa foto — bukan halaman error. Aturan itu kini tinggal
 * di services/avatar.store.js, karena modul users memerlukannya juga.
 */

const { BadRequestError, NotFoundError } = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');
const { AUDIT_ACTIONS, AUDIT_RESOURCES } = require('../../constants/auditActions');

const PHONE_PATTERN = /^[0-9+\-\s]{8,20}$/;

class ProfileService {
  constructor({ users, avatars, audit }) {
    this.users = users;
    this.avatars = avatars;
    this.audit = audit;
  }

  async #findOrFail(userId) {
    const user = await this.users.findById(userId, { includeRoles: true });

    if (!user) {
      throw new NotFoundError('User tidak ditemukan', ERROR_CODES.NOT_FOUND);
    }

    return user;
  }

  async getProfile(userId) {
    const user = await this.#findOrFail(userId);

    return {
      ...user.toJSON(),
      avatarUrl: await this.avatars.urlFor(user.avatarKey),
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
        throw new BadRequestError(
          'Nomor telepon tidak valid (8-20 digit)',
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      changes.phone = phone;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestError(
        'Tidak ada data yang dikirim untuk diubah',
        ERROR_CODES.NOTHING_TO_UPDATE
      );
    }

    await this.users.update(user, changes);

    await this.audit.record({
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: userId,
      metadata: { fields: Object.keys(changes) },
    });

    return this.getProfile(userId);
  }

  async updateAvatar(userId, file) {
    const user = await this.#findOrFail(userId);

    // Urutannya disengaja: unggah baru, perbarui basis data, baru hapus yang
    // lama. Kalau penghapusan didahulukan lalu pembaruan gagal, basis data
    // menunjuk berkas yang sudah tidak ada — dan avatar itu rusak permanen.
    const objectKey = await this.avatars.save(userId, file);

    const previousKey = user.avatarKey;

    await this.users.update(user, { avatarKey: objectKey });

    await this.audit.record({
      action: AUDIT_ACTIONS.AVATAR_UPLOADED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: userId,
      metadata: { mimeType: file.mimetype, sizeBytes: file.size },
    });

    await this.avatars.removeQuietly(previousKey, { context: 'avatar lama', userId });

    return this.getProfile(userId);
  }

  async removeAvatar(userId) {
    const user = await this.#findOrFail(userId);

    if (!user.avatarKey) {
      throw new BadRequestError('Anda belum memiliki avatar', ERROR_CODES.AVATAR_ABSENT);
    }

    const previousKey = user.avatarKey;

    await this.users.update(user, { avatarKey: null });

    await this.audit.record({
      action: AUDIT_ACTIONS.AVATAR_REMOVED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: userId,
    });
    await this.avatars.removeQuietly(previousKey, { context: 'avatar', userId });

    return this.getProfile(userId);
  }
}

module.exports = { ProfileService };
