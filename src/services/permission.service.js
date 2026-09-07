const { User, Permission } = require('../database');
const { redisClient } = require('../redis');

const CACHE_PREFIX = 'permissions:user:';
const VERSION_KEY = 'permissions:version';
const CACHE_TTL_SECONDS = 300;

const fetchFromDatabase = async (userId) => {
  const user = await User.findByPk(userId, {
    include: [
      {
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
      },
    ],
  });

  if (!user) {
    return [];
  }

  const permissionNames = user.roles.flatMap((role) =>
    role.permissions.map((permission) => permission.name)
  );

  return [...new Set(permissionNames)];
};

/**
 * Nomor versi disisipkan ke dalam kunci cache. Menaikkan versinya membuat
 * SELURUH cache lama tidak terjangkau sekaligus, tanpa perlu menghapusnya
 * satu per satu. Sisa kunci lama hilang sendiri lewat TTL.
 * Mengembalikan null bila Redis bermasalah, yang berarti "jangan pakai cache".
 */
const getCacheVersion = async () => {
  try {
    const version = await redisClient.get(VERSION_KEY);

    if (version) {
      return version;
    }

    await redisClient.set(VERSION_KEY, '1');

    return '1';
  } catch (error) {
    console.error('[REDIS] versi cache permission tidak terbaca:', error.message);

    return null;
  }
};

const bumpPermissionVersion = async () => {
  try {
    const next = await redisClient.incr(VERSION_KEY);

    console.log(`[RBAC] versi cache permission dinaikkan menjadi ${next}`);

    return String(next);
  } catch (error) {
    console.error('[REDIS] gagal menaikkan versi cache permission:', error.message);

    return null;
  }
};

const buildCacheKey = (version, userId) => `${CACHE_PREFIX}v${version}:${userId}`;

const getUserPermissions = async (userId) => {
  const version = await getCacheVersion();

  if (!version) {
    return fetchFromDatabase(userId);
  }

  const cacheKey = buildCacheKey(version, userId);

  try {
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('[REDIS] cache permission tidak terbaca, membaca database:', error.message);

    return fetchFromDatabase(userId);
  }

  const permissions = await fetchFromDatabase(userId);

  try {
    await redisClient.set(cacheKey, JSON.stringify(permissions), {
      EX: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.error('[REDIS] cache permission gagal disimpan:', error.message);
  }

  return permissions;
};

const invalidateUserPermissions = async (userId) => {
  const version = await getCacheVersion();

  if (!version) {
    return;
  }

  try {
    await redisClient.del(buildCacheKey(version, userId));
  } catch (error) {
    console.error('[REDIS] gagal menghapus cache permission:', error.message);
  }
};

/**
 * Memastikan setiap izin yang diperiksa oleh route benar-benar ada barisnya di
 * database. Dipanggil sekali saat aplikasi start.
 *
 * Tanpa pemeriksaan ini, izin yang ada di kode tetapi tidak ada di database
 * membuat endpoint-nya menjawab 403 untuk semua orang — termasuk superadmin,
 * karena izin superadmin berasal dari baris database, bukan dari kode.
 * Kegagalannya senyap: tidak ada error, tidak ada log.
 *
 * @param {string[]} requiredNames nama izin yang dipakai seluruh route
 */
const verifyPermissionCatalog = async (requiredNames) => {
  if (requiredNames.length === 0) {
    return { required: 0, available: 0 };
  }

  const rows = await Permission.findAll({ attributes: ['name'] });
  const availableNames = new Set(rows.map((row) => row.name));
  const missingNames = requiredNames.filter((name) => !availableNames.has(name));

  if (missingNames.length > 0) {
    throw new Error(
      `Izin berikut diperiksa oleh route tetapi tidak ada di database: ${missingNames.join(', ')}. ` +
        'Jalankan "npm run db:migrate", lalu "npm run gen:permissions".'
    );
  }

  return { required: requiredNames.length, available: availableNames.size };
};

module.exports = {
  getUserPermissions,
  invalidateUserPermissions,
  bumpPermissionVersion,
  verifyPermissionCatalog,
};
