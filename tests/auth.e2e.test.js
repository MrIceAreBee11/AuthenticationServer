const test = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { sequelize } = require('../src/database');
const { redisClient, connectRedis } = require('../src/redis');
const { closeQueue } = require('../src/queue');

let server;
let baseUrl;
let accessToken;

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
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeQueue().catch(() => {});
  await redisClient.quit().catch(() => {});
  await sequelize.close();
});

test('health endpoint membalas 200', async () => {
  const { status, body } = await call('/health');

  assert.equal(status, 200);
  assert.equal(body.success, true);
});

test('login dengan password salah ditolak dengan pesan generik', async () => {
  const { status, body } = await call('/auth/login', {
    method: 'POST',
    body: { email: process.env.SUPERADMIN_EMAIL, password: 'password-yang-salah' },
  });

  assert.equal(status, 401);
  assert.equal(body.message, 'Email atau password salah');
});

test('login dengan email tak terdaftar memberi pesan yang sama', async () => {
  const { body } = await call('/auth/login', {
    method: 'POST',
    body: { email: 'tidakada@example.com', password: 'password-yang-salah' },
  });

  assert.equal(body.message, 'Email atau password salah');
});

test('login yang benar mengembalikan token tanpa membocorkan hash', async () => {
  const { status, body } = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    },
  });

  assert.equal(status, 200);
  assert.ok(body.data.token, 'token harus ada');
  assert.equal(body.data.token.split('.').length, 3, 'token harus berformat JWT');
  assert.ok(!JSON.stringify(body).includes('passwordHash'), 'passwordHash tidak boleh keluar');

  accessToken = body.data.token;
});

test('endpoint terlindungi menolak request tanpa token', async () => {
  const { status } = await call('/auth/me');

  assert.equal(status, 401);
});

test('endpoint terlindungi menerima token yang sah', async () => {
  const { status, body } = await call('/auth/me', { token: accessToken });

  assert.equal(status, 200);
  assert.ok(body.data.user.roles.some((role) => role.name === 'superadmin'));
});

test('RBAC mengizinkan superadmin membaca daftar permission', async () => {
  const { status, body } = await call('/auth/permissions', { token: accessToken });

  assert.equal(status, 200);
  assert.ok(body.data.permissions.includes('permissions.read'));
});

test('logout mencabut token sehingga tidak bisa dipakai lagi', async () => {
  const logout = await call('/auth/logout', { method: 'POST', token: accessToken });

  assert.equal(logout.status, 200);

  const afterLogout = await call('/auth/me', { token: accessToken });

  assert.equal(afterLogout.status, 401);
  assert.match(afterLogout.body.message, /tidak berlaku/);
});