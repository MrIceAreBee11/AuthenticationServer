/**
 * BERKAS INI: aturan pembuatan, perubahan, dan penghapusan role.
 *
 * KENAPA DI modules/roles/: melayani satu fitur.
 *
 * KENAPA ROLE SUPERADMIN DILINDUNGI: namanya dijadikan acuan oleh aturan
 * keamanan di users.service. Kalau ia dapat diganti nama, perlindungan akun
 * superadmin berhenti bekerja tanpa satu pun error — dan tidak ada yang tahu
 * sampai seseorang mencoba.
 *
 * KENAPA ROLE YANG MASIH DIPAKAI TIDAK DAPAT DIHAPUS: ON DELETE CASCADE pada
 * tabel penghubung akan mencabut wewenang sejumlah pengguna sekaligus secara
 * diam-diam. Basis data hanya menjaga integritas referensi; ia tidak tahu
 * bahwa yang baru saja terhapus itu adalah hak akses orang.
 */

const {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');
const { PROTECTED_ROLES } = require('../../constants/roles');
const { AUDIT_ACTIONS, AUDIT_RESOURCES } = require('../../constants/auditActions');

// Daftarnya ada di constants/roles.js, dibaca juga oleh users.service.
// Dulu teks 'superadmin' ditulis ulang di kedua berkas; salah ketik di salah
// satunya membuat perlindungan akun superadmin berhenti bekerja tanpa error.
const PROTECTED_ROLE_NAMES = PROTECTED_ROLES;

class RolesService {
  constructor({ roles, permissions, permissionCache, database, audit }) {
    this.database = database;
    this.audit = audit;
    this.roles = roles;
    this.permissions = permissions;
    this.permissionCache = permissionCache;
  }

  async #findOrFail(roleId) {
    const id = Number(roleId);

    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestError('ID role tidak valid', ERROR_CODES.INVALID_ID);
    }

    const role = await this.roles.findById(id, { includePermissions: true });

    if (!role) {
      throw new NotFoundError('Role tidak ditemukan', ERROR_CODES.NOT_FOUND);
    }

    return role;
  }

  #assertNotProtected(role, action) {
    if (PROTECTED_ROLE_NAMES.includes(role.name)) {
      throw new ForbiddenError(
        `Role "${role.name}" dilindungi dan tidak dapat ${action}`,
        ERROR_CODES.ROLE_PROTECTED
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
      throw new BadRequestError('permissionIds harus berupa array', ERROR_CODES.VALIDATION_FAILED);
    }

    if (permissionIds.length === 0) {
      return [];
    }

    const permissions = await this.permissions.findByIds(permissionIds);

    if (permissions.length !== new Set(permissionIds).size) {
      throw new BadRequestError(
        'Sebagian permissionIds tidak ditemukan',
        ERROR_CODES.VALIDATION_FAILED
      );
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
      throw new BadRequestError('Nama role wajib diisi', ERROR_CODES.VALIDATION_FAILED);
    }

    const permissions =
      permissionIds === undefined ? [] : await this.#resolvePermissions(permissionIds);

    const created = await this.database.runInTransaction(async (transaction) => {
      const role = await this.roles.create(
        { name: String(name).trim().toLowerCase(), description: description ?? null },
        { transaction }
      );

      if (permissions.length > 0) {
        await this.roles.setPermissions(role, permissions, { transaction });
      }

      return role;
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_CREATED,
      resourceType: AUDIT_RESOURCES.ROLE,
      resourceId: created.id,
      metadata: { name: created.name, permissionIds: permissions.map((item) => item.id) },
    });

    return this.getById(created.id);
  }

  async update(roleId, { name, description }) {
    const role = await this.#findOrFail(roleId);

    const changes = {};

    if (name !== undefined) {
      this.#assertNotProtected(role, 'diubah namanya');

      if (String(name).trim().length === 0) {
        throw new BadRequestError('Nama role tidak boleh kosong', ERROR_CODES.VALIDATION_FAILED);
      }

      changes.name = String(name).trim().toLowerCase();
    }

    if (description !== undefined) {
      changes.description = description;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestError(
        'Tidak ada data yang dikirim untuk diubah',
        ERROR_CODES.NOTHING_TO_UPDATE
      );
    }

    await this.roles.update(role, changes);

    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      resourceType: AUDIT_RESOURCES.ROLE,
      resourceId: roleId,
      metadata: { fields: Object.keys(changes) },
    });

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

    // Perubahan izin sebuah role memengaruhi seluruh pemakainya sekaligus,
    // jadi yang lama dan yang baru dicatat keduanya.
    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_PERMISSIONS_CHANGED,
      resourceType: AUDIT_RESOURCES.ROLE,
      resourceId: roleId,
      metadata: {
        from: role.permissions?.map((item) => item.name) ?? [],
        to: permissions.map((item) => item.name),
      },
    });

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
      throw new ConflictError(
        `Role ini masih dipakai oleh ${userCount} pengguna. Pindahkan mereka ke role lain terlebih dahulu.`,
        ERROR_CODES.ROLE_IN_USE
      );
    }

    await this.roles.destroy(role);
    await this.permissionCache.bumpVersion();

    await this.audit.record({
      action: AUDIT_ACTIONS.ROLE_DELETED,
      resourceType: AUDIT_RESOURCES.ROLE,
      resourceId: roleId,
      metadata: { name: role.name },
    });
  }
}

module.exports = { RolesService };
