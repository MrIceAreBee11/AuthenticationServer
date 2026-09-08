/**
 * BERKAS INI: seluruh query untuk tabel users.
 *
 * KENAPA DI repositories/: inilah SATU-SATUNYA lapisan yang boleh menyebut
 * Sequelize atau klien Redis. Service memanggil repository dan tidak pernah
 * menyentuh model. Aturan itu yang membuat service dapat diuji tanpa basis
 * data, dan membuat penggantian ORM hanya menyentuh folder ini.
 *
 * KENAPA DEPENDENSINYA MASUK LEWAT CONSTRUCTOR: sebelumnya berkas ini
 * meng-import model di baris atas. Ikatan itu terjadi saat berkas di-require,
 * jadi tidak ada cara memasang model lain — dan tidak ada cara mengujinya.
 *
 * KEPUTUSAN SADAR — repository ini mengembalikan instance model, bukan objek
 * biasa. Perilaku yang melekat pada instance masih dibutuhkan:
 * comparePassword() untuk verifikasi, toJSON() yang membuang passwordHash, dan
 * hook beforeSave yang meng-hash password. Kalau pembaruan dilakukan lewat
 * User.update() statis, hook itu TIDAK berjalan dan password tersimpan sebagai
 * teks polos tanpa satu pun error. Karena itu setiap penulisan memakai
 * instance.update().
 */

const ROLE_INCLUDE_BASIC = {
  association: 'roles',
  attributes: ['id', 'name'],
  through: { attributes: [] },
};

const ROLE_INCLUDE_DETAILED = {
  association: 'roles',
  attributes: ['id', 'name', 'description'],
  through: { attributes: [] },
};

const ROLE_WITH_PERMISSIONS_INCLUDE = {
  association: 'roles',
  attributes: ['id'],
  through: { attributes: [] },
  include: [
    {
      association: 'permissions',
      attributes: ['name'],
      through: { attributes: [] },
    },
  ],
};

class UserRepository {
  constructor({ User }) {
    this.User = User;
  }

  /** Scope bawaan membuang passwordHash; unscoped dipakai hanya saat hash memang diperlukan. */
  #scoped(includePassword) {
    return includePassword ? this.User.unscoped() : this.User;
  }

  #roleInclude(detailed) {
    return detailed ? ROLE_INCLUDE_DETAILED : ROLE_INCLUDE_BASIC;
  }

  async findByEmail(email, { includePassword = false } = {}) {
    return this.#scoped(includePassword).findOne({ where: { email } });
  }

  async findById(userId, { includePassword = false, includeRoles = false, detailedRoles = false } = {}) {
    return this.#scoped(includePassword).findByPk(userId, {
      include: includeRoles ? [this.#roleInclude(detailedRoles)] : undefined,
    });
  }

  /** Dipakai pemeriksaan izin: user -> roles -> permissions dalam satu query. */
  async findWithRolePermissions(userId) {
    return this.User.findByPk(userId, { include: [ROLE_WITH_PERMISSIONS_INCLUDE] });
  }

  async paginate({ limit, offset }) {
    // distinct wajib ada: tanpanya count menghitung baris hasil JOIN, sehingga
    // user dengan dua role terhitung dua kali dan total menjadi salah.
    return this.User.findAndCountAll({
      include: [ROLE_INCLUDE_BASIC],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });
  }

  async create(data, options = {}) {
    return this.User.create(data, options);
  }

  async update(user, changes, options = {}) {
    return user.update(changes, options);
  }

  async destroy(user, options = {}) {
    return user.destroy(options);
  }

  async setRoles(user, roles, options = {}) {
    return user.setRoles(roles, options);
  }
}

module.exports = { UserRepository };
