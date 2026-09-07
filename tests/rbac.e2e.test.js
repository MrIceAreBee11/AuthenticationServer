const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { sequelize } = require('../src/database');
const { redisClient, connectRedis } = require('../src/redis');
const { closeQueue } = require('../src/queue');

let server;
let baseUrl;
let accessToken;
let temporaryRoleId;

const call = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/**
 * Penghitung pembatas laju dibersihkan sebelum pengujian dimulai.
 *
 * Setiap kali berkas ini dijalankan, ia sengaja melakukan beberapa percobaan
 * login yang gagal. Batasnya lima kegagalan per lima belas menit, jadi tanpa
 * pembersihan ini, menjalankan pengujian tiga kali berturut-turut akan membuat
 * separuhnya gagal dengan status 429 — kegagalan yang tampak seperti bug
 * padahal murni akibat pengujian sebelumnya.
 */
const resetRateLimiter = async () => {
  const keys = await redisClient.keys('ratelimit:*');

  if (keys.length > 0) {
    await redisClient.del(keys);
  }
};

test.before(async () => {
  await connectRedis();
  await resetRateLimiter();

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  const login = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    },
  });

  accessToken = login.body.data.token;
});

test.after(async () => {
  if (temporaryRoleId) {
    await call(`/roles/${temporaryRoleId}`, { method: 'DELETE', token: accessToken }).catch(() => {});
  }

  await new Promise((resolve) => server.close(resolve));
  await closeQueue().catch(() => {});
  await redisClient.quit().catch(() => {});
  await sequelize.close();
});

test('katalog permission dikelompokkan per sumber daya', async () => {
  const { status, body } = await call('/permissions', { token: accessToken });

  assert.equal(status, 200);
  assert.ok(body.data.permissions.length >= 11);
  assert.ok(body.data.groups.users, 'grup "users" harus ada');
  assert.ok(body.data.groups.roles, 'grup "roles" harus ada');
});

test('daftar role menyertakan izin dan jumlah pemakainya', async () => {
  const { status, body } = await call('/roles', { token: accessToken });

  assert.equal(status, 200);

  const superadmin = body.data.roles.find((role) => role.name === 'superadmin');

  assert.ok(superadmin, 'role superadmin harus ada');
  assert.ok(superadmin.permissions.length >= 11);
  assert.equal(superadmin.isProtected, true);
  assert.ok(superadmin.userCount >= 1);
});

test('role superadmin tidak dapat dihapus maupun diganti nama', async () => {
  const roles = await call('/roles', { token: accessToken });
  const superadmin = roles.body.data.roles.find((role) => role.name === 'superadmin');

  const removed = await call(`/roles/${superadmin.id}`, { method: 'DELETE', token: accessToken });
  assert.equal(removed.status, 403);

  const renamed = await call(`/roles/${superadmin.id}`, {
    method: 'PATCH', token: accessToken, body: { name: 'bos-besar' },
  });
  assert.equal(renamed.status, 403);
});

test('role dapat dibuat, izinnya diubah, lalu dihapus', async () => {
  const catalog = await call('/permissions', { token: accessToken });
  const readOnlyIds = catalog.body.data.permissions
    .filter((permission) => permission.name.endsWith('.read'))
    .map((permission) => permission.id);

  const created = await call('/roles', {
    method: 'POST', token: accessToken,
    body: { name: 'uji-otomatis', description: 'Dibuat oleh pengujian', permissionIds: readOnlyIds },
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.role.permissions.length, readOnlyIds.length);

  temporaryRoleId = created.body.data.role.id;

  const narrowed = await call(`/roles/${temporaryRoleId}/permissions`, {
    method: 'PUT', token: accessToken, body: { permissionIds: [readOnlyIds[0]] },
  });

  assert.equal(narrowed.status, 200);
  assert.equal(narrowed.body.data.role.permissions.length, 1);

  const removed = await call(`/roles/${temporaryRoleId}`, { method: 'DELETE', token: accessToken });

  assert.equal(removed.status, 200);
  temporaryRoleId = null;
});

test('permissionIds yang tidak ada ditolak dan role tidak terbentuk', async () => {
  const { status, body } = await call('/roles', {
    method: 'POST', token: accessToken,
    body: { name: 'role-gagal', permissionIds: [999999] },
  });

  assert.equal(status, 400);
  assert.match(body.message, /tidak ditemukan/i);

  const roles = await call('/roles', { token: accessToken });

  assert.equal(roles.body.data.roles.some((role) => role.name === 'role-gagal'), false);
});

test('role yang masih dipakai pengguna tidak dapat dihapus', async () => {
  const roles = await call('/roles', { token: accessToken });
  const inUse = roles.body.data.roles.find((role) => !role.isProtected && role.userCount > 0);

  if (!inUse) {
    return; // tidak ada role non-protected yang sedang dipakai, lewati
  }

  const { status, body } = await call(`/roles/${inUse.id}`, { method: 'DELETE', token: accessToken });

  assert.equal(status, 409);
  assert.match(body.message, /masih dipakai/i);
});

test('ID role yang bukan angka ditolak sebagai 400, bukan 500', async () => {
  const { status } = await call('/roles/bukan-angka', { token: accessToken });

  assert.equal(status, 400);
});
