/**
 * BERKAS INI: aturan pengelolaan akun ORANG LAIN oleh administrator.
 *
 * KENAPA DI modules/users/: seluruh isinya melayani satu fitur.
 *
 * DUA ATURAN DI ATAS RBAC yang perlu diperhatikan. RBAC hanya menjawab "boleh
 * tidak kamu mengubah user", bukan "boleh tidak kamu mengubah user INI".
 * Selisih itu diisi oleh #assertCanManage, dan berpasangan keduanya menjamin
 * selalu ada minimal satu superadmin: superadmin boleh menghapus superadmin
 * lain tetapi tidak dirinya sendiri, dan admin biasa tidak dapat menyentuh
 * keduanya. Inilah pertahanan terhadap IDOR — dan ia harus di service, bukan
 * di middleware, karena hanya di sini identitas targetnya sudah diketahui.
 */

const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');
const { ROLES } = require('../../constants/roles');



const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UsersService {
  constructor({ users, roles, permissions, storage, policy, paging, database, logger }) {
    this.logger = logger;
    this.users = users;
    this.roles = roles;
    this.permissions = permissions;
    this.storage = storage;
    this.policy = policy;
    this.paging = paging;
    this.database = database;
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

  #isSuperadmin(user) {
    return user.roles.some((role) => role.name === ROLES.SUPERADMIN);
  }

  /**
   * Dua aturan di atas RBAC. RBAC menjawab "boleh tidak kamu mengubah user",
   * bukan "boleh tidak kamu mengubah user INI".
   *
   * Berpasangan, keduanya menjamin selalu ada minimal satu superadmin:
   * superadmin boleh menghapus superadmin lain tetapi tidak dirinya sendiri,
   * dan admin biasa tidak dapat menyentuh keduanya.
   */
  async #assertCanManage(actorId, target) {
    if (actorId === target.id) {
      throw new ForbiddenError(
        'Gunakan endpoint /profile untuk mengubah akun Anda sendiri',
        ERROR_CODES.SELF_MANAGEMENT_FORBIDDEN
      );
    }

    if (this.#isSuperadmin(target)) {
      const actor = await this.#findOrFail(actorId);

      if (!this.#isSuperadmin(actor)) {
        throw new ForbiddenError(
          'Anda tidak dapat mengelola akun superadmin',
          ERROR_CODES.SUPERADMIN_PROTECTED
        );
      }
    }
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
      throw new BadRequestError(
        'Sebagian roleIds tidak ditemukan',
        ERROR_CODES.VALIDATION_FAILED
      );
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

    if (String(password).length < this.policy.minLength) {
      throw new BadRequestError(
        `Password minimal ${this.policy.minLength} karakter`,
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

    return this.#findOrFail(created.id);
  }

  async update(actorId, userId, { fullName, phone, isActive }) {
    const target = await this.#findOrFail(userId);

    await this.#assertCanManage(actorId, target);

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

    return this.#findOrFail(userId);
  }

  async setRoles(actorId, userId, roleIds) {
    const target = await this.#findOrFail(userId);

    await this.#assertCanManage(actorId, target);

    const roles = await this.#resolveRoles(roleIds);

    if (roles === null) {
      throw new BadRequestError('roleIds wajib dikirim', ERROR_CODES.VALIDATION_FAILED);
    }

    // Urutannya wajib begini: ubah sumber kebenaran dulu, baru buang cache.
    // Kalau dibalik, ada celah di mana permintaan lain membaca role lama lalu
    // menyimpannya kembali ke cache — dan data basi itu bertahan 5 menit.
    await this.users.setRoles(target, roles);
    await this.permissions.invalidateUser(userId);

    return this.#findOrFail(userId);
  }

  async remove(actorId, userId) {
    const target = await this.#findOrFail(userId);

    await this.#assertCanManage(actorId, target);

    const { avatarKey } = target;

    // Baris user_roles ikut terhapus oleh ON DELETE CASCADE. PostgreSQL bisa
    // menjaga integritasnya sendiri, tetapi ia tidak tahu apa pun tentang
    // MinIO — berkas di luar basis data harus dibersihkan di sini.
    await this.users.destroy(target);
    await this.permissions.invalidateUser(userId);

    if (avatarKey) {
      try {
        await this.storage.removeObject(avatarKey);
      } catch (error) {
        this.logger.exception('gagal menghapus avatar user terhapus', error, {
          userId,
        });
      }
    }
  }
}

module.exports = { UsersService };
