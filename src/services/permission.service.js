/**
 * BERKAS INI: penentu daftar izin seorang pengguna, beserta cache-nya.
 *
 * KENAPA DI services/ DAN BUKAN modules/roles/: ia dipakai lintas fitur —
 * middleware otorisasi memakainya pada setiap permintaan terlindungi, dan
 * modul users memakainya saat role seseorang berubah. Menaruhnya di dalam
 * modules/roles/ akan membuat seluruh modul lain bergantung pada modul roles.
 *
 * KENAPA CACHE-nya BERVERSI, BUKAN DIHAPUS SATU-SATU: mengubah izin sebuah
 * role memengaruhi SEMUA pemakainya sekaligus. Menghapus cache per pengguna
 * berarti menyapu keyspace Redis untuk mencari siapa saja yang terdampak.
 * Menaikkan satu angka versi membuat seluruh cache lama tidak terjangkau dalam
 * satu operasi, dan sisa kunci lamanya hilang sendiri lewat TTL.
 *
 * KENAPA KEGAGALAN REDIS DILEWATI, BUKAN MENJATUHKAN PERMINTAAN: di sini Redis
 * hanya salinan cepat; sumber kebenarannya PostgreSQL yang masih hidup.
 * Berbeda dengan daftar token cabut, yang tidak punya sumber lain sama sekali
 * dan karena itu harus fail closed.
 */

const { CACHE_KEYS } = require('../constants/cacheKeys');

const CACHE_PREFIX = CACHE_KEYS.PERMISSION_USER;
const VERSION_KEY = CACHE_KEYS.PERMISSION_VERSION;

class PermissionService {
  /**
   * Repository disuntikkan lewat constructor agar dapat digantikan objek
   * palsu saat pengujian unit, tanpa perlu database maupun Redis sungguhan.
   */
  constructor({ users, permissions, cache, ttlSeconds, logger }) {
    this.logger = logger;
    this.users = users;
    this.permissions = permissions;
    this.cache = cache;
    this.ttlSeconds = ttlSeconds;
  }

  async #fetchFromDatabase(userId) {
    const user = await this.users.findWithRolePermissions(userId);

    if (!user) {
      return [];
    }

    const permissionNames = user.roles.flatMap((role) =>
      role.permissions.map((permission) => permission.name)
    );

    // Dua role bisa memberi izin yang sama; Set membuang duplikatnya.
    return [...new Set(permissionNames)];
  }

  /**
   * Nomor versi disisipkan ke dalam kunci cache. Menaikkan versinya membuat
   * SELURUH cache lama tidak terjangkau sekaligus, tanpa perlu menghapusnya
   * satu per satu. Sisa kunci lama hilang sendiri lewat TTL.
   * Mengembalikan null bila Redis bermasalah, yang berarti "jangan pakai cache".
   */
  async #getCacheVersion() {
    try {
      const version = await this.cache.get(VERSION_KEY);

      if (version) {
        return version;
      }

      await this.cache.set(VERSION_KEY, '1');

      return '1';
    } catch (error) {
      this.logger.exception('versi cache izin tidak terbaca', error);

      return null;
    }
  }

  #buildCacheKey(version, userId) {
    return `${CACHE_PREFIX}v${version}:${userId}`;
  }

  async bumpVersion() {
    try {
      const next = await this.cache.incr(VERSION_KEY);

      this.logger.info('versi cache izin dinaikkan', { version: next });

      return String(next);
    } catch (error) {
      this.logger.exception('gagal menaikkan versi cache izin', error);

      return null;
    }
  }

  async getUserPermissions(userId) {
    const version = await this.#getCacheVersion();

    if (!version) {
      return this.#fetchFromDatabase(userId);
    }

    const cacheKey = this.#buildCacheKey(version, userId);

    try {
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.exception('cache izin tidak terbaca, membaca database', error);

      // Redis di sini hanya salinan cepat; sumber kebenarannya PostgreSQL yang
      // masih hidup. Jadi kegagalannya dilewati, bukan menjatuhkan permintaan.
      return this.#fetchFromDatabase(userId);
    }

    const permissions = await this.#fetchFromDatabase(userId);

    try {
      await this.cache.set(cacheKey, JSON.stringify(permissions), {
        EX: this.ttlSeconds,
      });
    } catch (error) {
      this.logger.exception('cache izin gagal disimpan', error);
    }

    return permissions;
  }

  async invalidateUser(userId) {
    const version = await this.#getCacheVersion();

    if (!version) {
      return;
    }

    try {
      await this.cache.del(this.#buildCacheKey(version, userId));
    } catch (error) {
      this.logger.exception('gagal menghapus cache izin', error);
    }
  }

  /**
   * Memastikan setiap izin yang diperiksa route benar-benar ada barisnya di
   * database. Dipanggil sekali saat aplikasi start.
   *
   * Tanpa pemeriksaan ini, izin yang ada di kode tetapi tidak ada di database
   * membuat endpoint-nya menjawab 403 untuk semua orang — termasuk superadmin,
   * karena izin superadmin berasal dari baris database, bukan dari kode.
   * Kegagalannya senyap: tidak ada error, tidak ada log.
   */
  async verifyCatalog(requiredNames) {
    if (requiredNames.length === 0) {
      return { required: 0, available: 0 };
    }

    const availableNames = new Set(await this.permissions.findAllNames());
    const missingNames = requiredNames.filter((name) => !availableNames.has(name));

    if (missingNames.length > 0) {
      throw new Error(
        `Izin berikut diperiksa oleh route tetapi tidak ada di database: ${missingNames.join(', ')}. ` +
          'Jalankan "npm run db:migrate", lalu "npm run gen:permissions".'
      );
    }

    return { required: requiredNames.length, available: availableNames.size };
  }
}

module.exports = { PermissionService };
