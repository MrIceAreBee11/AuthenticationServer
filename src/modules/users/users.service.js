const AppError = require('../../utils/AppError');
const { runInTransaction } = require('../../database');
const { removeObject } = require('../../storage');
const { userRepository } = require('../../repositories/user.repository');
const { roleRepository } = require('../../repositories/role.repository');
const { permissionService } = require('../../services/permission.service');
const { config } = require('../../config');
const { ROLES } = require('../../constants/roles');



const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UsersService {
  constructor({
    users = userRepository,
    roles = roleRepository,
    permissions = permissionService,
    storage = null,
    policy = config.password,
    paging = config.pagination.users,
  } = {}) {
    this.policy = policy;
    this.paging = paging;
    this.users = users;
    this.roles = roles;
    this.permissions = permissions;
    this.storage = storage ?? { removeObject };
  }

  /**
   * Bentuk UUID diperiksa lebih dulu. Tanpa ini, ID sembarang seperti "abc"
   * membuat PostgreSQL menolak query-nya dan menghasilkan 500, padahal itu
   * jelas kesalahan klien yang seharusnya 400.
   */
  async #findOrFail(userId) {
    if (!UUID_PATTERN.test(String(userId))) {
      throw new AppError('ID user tidak valid', 400);
    }

    const user = await this.users.findById(userId, { includeRoles: true });

    if (!user) {
      throw new AppError('User tidak ditemukan', 404);
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
      throw new AppError(
        'Gunakan endpoint /profile untuk mengubah akun Anda sendiri',
        403
      );
    }

    if (this.#isSuperadmin(target)) {
      const actor = await this.#findOrFail(actorId);

      if (!this.#isSuperadmin(actor)) {
        throw new AppError('Anda tidak dapat mengelola akun superadmin', 403);
      }
    }
  }

  async #resolveRoles(roleIds) {
    if (roleIds === undefined) {
      return null;
    }

    if (!Array.isArray(roleIds)) {
      throw new AppError('roleIds harus berupa array', 400);
    }

    if (roleIds.length === 0) {
      return [];
    }

    const roles = await this.roles.findByIds(roleIds);

    if (roles.length !== new Set(roleIds).size) {
      throw new AppError('Sebagian roleIds tidak ditemukan', 400);
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
      throw new AppError('Email, password, dan nama lengkap wajib diisi', 400);
    }

    if (String(password).length < this.policy.minLength) {
      throw new AppError(`Password minimal ${this.policy.minLength} karakter`, 400);
    }

    const roles = await this.#resolveRoles(roleIds);

    // Menyimpan user dan menetapkan role-nya adalah dua operasi tulis yang
    // tidak bermakna secara terpisah. Tanpa transaksi, kegagalan pada
    // penetapan role meninggalkan akun tanpa role yang emailnya sudah terpakai.
    const created = await runInTransaction(async (transaction) => {
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
        throw new AppError('isActive harus bernilai true atau false', 400);
      }

      changes.isActive = isActive;
    }

    if (Object.keys(changes).length === 0) {
      throw new AppError('Tidak ada data yang dikirim untuk diubah', 400);
    }

    await this.users.update(target, changes);

    return this.#findOrFail(userId);
  }

  async setRoles(actorId, userId, roleIds) {
    const target = await this.#findOrFail(userId);

    await this.#assertCanManage(actorId, target);

    const roles = await this.#resolveRoles(roleIds);

    if (roles === null) {
      throw new AppError('roleIds wajib dikirim', 400);
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
        console.error(
          '[STORAGE] gagal menghapus avatar user terhapus:',
          error.message
        );
      }
    }
  }
}

module.exports = { UsersService, usersService: new UsersService() };
