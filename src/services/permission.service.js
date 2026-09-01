const { User } = require('../database');
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

module.exports = {
  getUserPermissions,
  invalidateUserPermissions,
  bumpPermissionVersion,
};
