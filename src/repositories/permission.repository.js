/**
 * BERKAS INI: seluruh query untuk tabel permissions.
 *
 * KENAPA DI repositories/: inilah SATU-SATUNYA lapisan yang boleh menyebut
 * Sequelize atau klien Redis. Service memanggil repository dan tidak pernah
 * menyentuh model. Aturan itu yang membuat service dapat diuji tanpa basis
 * data, dan membuat penggantian ORM hanya menyentuh folder ini.
 *
 * KENAPA DEPENDENSINYA MASUK LEWAT CONSTRUCTOR: sebelumnya berkas ini
 * meng-import model di baris atas. Ikatan itu terjadi saat berkas di-require,
 * jadi tidak ada cara memasang model lain — dan tidak ada cara mengujinya.
 */
class PermissionRepository {
  constructor({ Permission }) {
    this.Permission = Permission;
  }

  async findAll() {
    return this.Permission.findAll({
      attributes: ['id', 'name', 'description'],
      order: [['name', 'ASC']],
    });
  }

  async findByIds(permissionIds) {
    return this.Permission.findAll({ where: { id: permissionIds } });
  }

  /** Hanya nama, dipakai verifikasi katalog saat aplikasi start. */
  async findAllNames() {
    const rows = await this.Permission.findAll({
      attributes: ['name'],
      order: [['name', 'ASC']],
    });

    return rows.map((row) => row.name);
  }
}

module.exports = { PermissionRepository };
