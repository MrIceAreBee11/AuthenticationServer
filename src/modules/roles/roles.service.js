const AppError = require('../../utils/AppError');
const { runInTransaction } = require('../../database');
const { roleRepository } = require('../../repositories/role.repository');
const { permissionRepository } = require('../../repositories/permission.repository');
const { permissionService } = require('../../services/permission.service');
const { PROTECTED_ROLES } = require('../../constants/roles');

// Daftarnya ada di constants/roles.js, dibaca juga oleh users.service.
// Dulu teks 'superadmin' ditulis ulang di kedua berkas; salah ketik di salah
// satunya membuat perlindungan akun superadmin berhenti bekerja tanpa error.
const PROTECTED_ROLE_NAMES = PROTECTED_ROLES;

class RolesService {
  constructor({
    roles = roleRepository,
    permissions = permissionRepository,
    permissionCache = permissionService,
  } = {}) {
    this.roles = roles;
    this.permissions = permissions;
    this.permissionCache = permissionCache;
  }

  async #findOrFail(roleId) {
    const id = Number(roleId);

    if (!Number.isInteger(id) || id < 1) {
      throw new AppError('ID role tidak valid', 400);
    }

    const role = await this.roles.findById(id, { includePermissions: true });

    if (!role) {
      throw new AppError('Role tidak ditemukan', 404);
    }

    return role;
  }

  #assertNotProtected(role, action) {
    if (PROTECTED_ROLE_NAMES.includes(role.name)) {
      throw new AppError(
        `Role "${role.name}" dilindungi dan tidak dapat ${action}`,
        403
      );
    }
  }

  #decorate(role, userCounts) {
    return {
      ...role.toJSON(),
      userCount: userCounts[role.id] ?? 0,
      isProtected: PROTECTED_ROLE_NAMES.includes(role.name),
    };
  }

  async #resolvePermissions(permissionIds) {
    if (!Array.isArray(permissionIds)) {
      throw new AppError('permissionIds harus berupa array', 400);
    }

    if (permissionIds.length === 0) {
      return [];
    }

    const permissions = await this.permissions.findByIds(permissionIds);

    if (permissions.length !== new Set(permissionIds).size) {
      throw new AppError('Sebagian permissionIds tidak ditemukan', 400);
    }

    return permissions;
  }

  async list() {
    const [roles, userCounts] = await Promise.all([
      this.roles.findAll({ includePermissions: true }),
      this.roles.countUsersPerRole(),
    ]);

    return roles.map((role) => this.#decorate(role, userCounts));
  }

  async getById(roleId) {
    const role = await this.#findOrFail(roleId);
    const userCounts = await this.roles.countUsersPerRole();

    return this.#decorate(role, userCounts);
  }

  async listPermissions() {
    const permissions = await this.permissions.findAll();

    // Dikelompokkan berdasarkan bagian pertama nama, misalnya "users" dari
    // "users.create", supaya antarmuka dapat menampilkannya per sumber daya.
    const groups = {};

    permissions.forEach((permission) => {
      const [resource] = permission.name.split('.');

      groups[resource] = groups[resource] ?? [];
      groups[resource].push(permission.toJSON());
    });

    return { permissions: permissions.map((item) => item.toJSON()), groups };
  }

  async create({ name, description, permissionIds }) {
    if (!name || String(name).trim().length === 0) {
      throw new AppError('Nama role wajib diisi', 400);
    }

    const permissions =
      permissionIds === undefined ? [] : await this.#resolvePermissions(permissionIds);

    const created = await runInTransaction(async (transaction) => {
      const role = await this.roles.create(
        { name: String(name).trim().toLowerCase(), description: description ?? null },
        { transaction }
      );

      if (permissions.length > 0) {
        await this.roles.setPermissions(role, permissions, { transaction });
      }

      return role;
    });

    return this.getById(created.id);
  }

  async update(roleId, { name, description }) {
    const role = await this.#findOrFail(roleId);

    const changes = {};

    if (name !== undefined) {
      this.#assertNotProtected(role, 'diubah namanya');

      if (String(name).trim().length === 0) {
        throw new AppError('Nama role tidak boleh kosong', 400);
      }

      changes.name = String(name).trim().toLowerCase();
    }

    if (description !== undefined) {
      changes.description = description;
    }

    if (Object.keys(changes).length === 0) {
      throw new AppError('Tidak ada data yang dikirim untuk diubah', 400);
    }

    await this.roles.update(role, changes);

    return this.getById(roleId);
  }

  async setPermissions(roleId, permissionIds) {
    const role = await this.#findOrFail(roleId);
    const permissions = await this.#resolvePermissions(permissionIds);

    await this.roles.setPermissions(role, permissions);

    // Perubahan izin sebuah role memengaruhi SEMUA pemakainya sekaligus, dan
    // penghapusan cache per pengguna tidak menjangkau itu. Menaikkan versi
    // membuat seluruh cache lama tidak terjangkau dalam satu operasi.
    await this.permissionCache.bumpVersion();

    return this.getById(roleId);
  }

  async remove(roleId) {
    const role = await this.#findOrFail(roleId);

    this.#assertNotProtected(role, 'dihapus');

    const userCounts = await this.roles.countUsersPerRole();
    const userCount = userCounts[role.id] ?? 0;

    // Kalau dibiarkan, ON DELETE CASCADE akan mencabut wewenang sejumlah
    // pengguna sekaligus secara diam-diam.
    if (userCount > 0) {
      throw new AppError(
        `Role ini masih dipakai oleh ${userCount} pengguna. Pindahkan mereka ke role lain terlebih dahulu.`,
        409
      );
    }

    await this.roles.destroy(role);
    await this.permissionCache.bumpVersion();
  }
}

module.exports = { RolesService, rolesService: new RolesService() };
