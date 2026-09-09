/**
 * BERKAS INI: aturan pengelolaan akun ORANG LAIN oleh administrator.
 *
 * KENAPA DI modules/users/: seluruh isinya melayani satu fitur.
 *
 * DUA ATURAN DI ATAS RBAC tidak lagi berada di sini — keduanya pindah ke
 * users.policy.js, karena hanya bagian itu yang berubah karena alasan keamanan
 * dan hanya bagian itu yang perlu diuji tanpa menyentuh basis data. Yang
 * tertinggal di berkas ini murni urutan operasi.
 */

const { BadRequestError, NotFoundError } = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');
const { AUDIT_ACTIONS, AUDIT_RESOURCES } = require('../../constants/auditActions');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UsersService {
  constructor({ users, roles, permissions, avatars, policy, passwords, paging, database, audit }) {
    this.users = users;
    this.roles = roles;
    this.permissions = permissions;
    this.avatars = avatars;
    this.policy = policy;
    this.passwords = passwords;
    this.paging = paging;
    this.database = database;
    this.audit = audit;
  }

  /**
   * Bentuk UUID diperiksa lebih dulu. Tanpa ini, ID sembarang seperti "abc"
   * membuat PostgreSQL menolak query-nya dan menghasilkan 500, padahal itu
   * jelas kesalahan klien yang seharusnya 400.
   */
  async #findOrFail(userId) {
    if (!UUID_PATTERN.test(String(userId))) {
      throw new BadRequestError('ID user tidak valid', ERROR_CODES.INVALID_ID);
    }

    const user = await this.users.findById(userId, { includeRoles: true });

    if (!user) {
      throw new NotFoundError('User tidak ditemukan', ERROR_CODES.NOT_FOUND);
    }

    return user;
  }

  async #resolveRoles(roleIds) {
    if (roleIds === undefined) {
      return null;
    }

    if (!Array.isArray(roleIds)) {
      throw new BadRequestError('roleIds harus berupa array', ERROR_CODES.VALIDATION_FAILED);
    }

    if (roleIds.length === 0) {
      return [];
    }

    const roles = await this.roles.findByIds(roleIds);

    if (roles.length !== new Set(roleIds).size) {
      throw new BadRequestError('Sebagian roleIds tidak ditemukan', ERROR_CODES.VALIDATION_FAILED);
    }

    return roles;
  }

  async list({ page, limit }) {
    const safePage = Math.max(1, Number(page) || 1);

    // Batas atas ditentukan server, bukan klien. Tanpa ini, ?limit=999999
    // memaksa seluruh tabel dimuat ke memori dalam satu permintaan.
    const safeLimit = Math.min(
      this.paging.maxSize,
      Math.max(1, Number(limit) || this.paging.defaultSize)
    );

    const { rows, count } = await this.users.paginate({
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit,
    });

    return {
      users: rows,
      meta: {
        total: count,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(count / safeLimit) || 1,
      },
    };
  }

  async getById(userId) {
    return this.#findOrFail(userId);
  }

  async create({ email, password, fullName, phone, roleIds }) {
    if (!email || !password || !fullName) {
      throw new BadRequestError(
        'Email, password, dan nama lengkap wajib diisi',
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    if (String(password).length < this.passwords.minLength) {
      throw new BadRequestError(
        `Password minimal ${this.passwords.minLength} karakter`,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    const roles = await this.#resolveRoles(roleIds);

    // Menyimpan user dan menetapkan role-nya adalah dua operasi tulis yang
    // tidak bermakna secara terpisah. Tanpa transaksi, kegagalan pada
    // penetapan role meninggalkan akun tanpa role yang emailnya sudah terpakai.
    const created = await this.database.runInTransaction(async (transaction) => {
      const user = await this.users.create(
        { email, passwordHash: password, fullName, phone: phone ?? null },
        { transaction }
      );

      if (roles && roles.length > 0) {
        await this.users.setRoles(user, roles, { transaction });
      }

      return user;
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: created.id,
      metadata: { email: created.email, roleIds: roles?.map((role) => role.id) ?? [] },
    });

    return this.#findOrFail(created.id);
  }

  async update(actorId, userId, { fullName, phone, isActive }) {
    const target = await this.#findOrFail(userId);

    await this.policy.assertCanManage(actorId, target);

    const changes = {};

    if (fullName !== undefined) {
      changes.fullName = fullName;
    }

    if (phone !== undefined) {
      changes.phone = phone;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        throw new BadRequestError(
          'isActive harus bernilai true atau false',
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      changes.isActive = isActive;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestError(
        'Tidak ada data yang dikirim untuk diubah',
        ERROR_CODES.NOTHING_TO_UPDATE
      );
    }

    await this.users.update(target, changes);

    // Nama field yang berubah dicatat, ISINYA tidak. Jejak audit tidak boleh
    // menjadi tempat kedua yang menyimpan data pribadi.
    await this.audit.record({
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: userId,
      metadata: { fields: Object.keys(changes) },
    });

    return this.#findOrFail(userId);
  }

  async setRoles(actorId, userId, roleIds) {
    const target = await this.#findOrFail(userId);

    await this.policy.assertCanManage(actorId, target);

    const roles = await this.#resolveRoles(roleIds);

    if (roles === null) {
      throw new BadRequestError('roleIds wajib dikirim', ERROR_CODES.VALIDATION_FAILED);
    }

    // Urutannya wajib begini: ubah sumber kebenaran dulu, baru buang cache.
    // Kalau dibalik, ada celah di mana permintaan lain membaca role lama lalu
    // menyimpannya kembali ke cache — dan data basi itu bertahan 5 menit.
    await this.users.setRoles(target, roles);
    await this.permissions.invalidateUser(userId);

    // Perubahan wewenang: yang lama dan yang baru dicatat, supaya pertanyaan
    // "sejak kapan orang ini jadi admin" punya jawaban.
    await this.audit.record({
      action: AUDIT_ACTIONS.USER_ROLES_CHANGED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: userId,
      metadata: {
        from: target.roles.map((role) => role.name),
        to: roles.map((role) => role.name),
      },
    });

    return this.#findOrFail(userId);
  }

  async remove(actorId, userId) {
    const target = await this.#findOrFail(userId);

    await this.policy.assertCanManage(actorId, target);

    const { avatarKey } = target;

    // Baris user_roles ikut terhapus oleh ON DELETE CASCADE. PostgreSQL bisa
    // menjaga integritasnya sendiri, tetapi ia tidak tahu apa pun tentang
    // MinIO — berkas di luar basis data harus dibersihkan di sini.
    await this.users.destroy(target);
    await this.permissions.invalidateUser(userId);

    await this.audit.record({
      action: AUDIT_ACTIONS.USER_DELETED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: userId,
      metadata: { email: target.email },
    });

    await this.avatars.removeQuietly(avatarKey, { context: 'avatar user terhapus', userId });
  }
}

module.exports = { UsersService };
