const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { AuthorizeMiddleware } = require('../../src/middlewares/authorize');
const { captureError, fakePermissionCache } = require('./fakes');

const build = (owned = []) => {
  const permissions = fakePermissionCache({ permissions: owned });

  return { middleware: new AuthorizeMiddleware({ permissions }), permissions };
};

const fakeRequest = (userId = 'u1') => ({ user: userId ? { id: userId } : undefined });

test('AuthorizeMiddleware — pemeriksaan izin', async (t) => {
  await t.test('pemilik izin diteruskan', async () => {
    const { middleware } = build(['users.read', 'users.create']);
    const handler = middleware.require('users.read');
    const next = mock.fn();

    await handler(fakeRequest(), {}, next);

    assert.equal(next.mock.callCount(), 1);
  });

  await t.test('tanpa izin ditolak dengan 403', async () => {
    const { middleware } = build(['users.read']);
    const handler = middleware.require('users.delete');

    const error = await captureError(() => handler(fakeRequest(), {}, () => {}));

    assert.equal(error.statusCode, 403);
  });

  await t.test('beberapa izin sekaligus berarti DAN, bukan ATAU', async () => {
    // Satu izin yang kurang sudah cukup untuk menolak. Kalau ia berarti ATAU,
    // penjagaan ganda pada sebuah route jadi tidak ada artinya.
    const { middleware } = build(['users.read']);
    const handler = middleware.require('users.read', 'users.delete');

    const error = await captureError(() => handler(fakeRequest(), {}, () => {}));

    assert.equal(error.statusCode, 403);
  });

  await t.test('daftar izin ditempelkan ke req untuk dipakai controller', async () => {
    const { middleware } = build(['users.read']);
    const req = fakeRequest();

    await middleware.require('users.read')(req, {}, () => {});

    assert.deepEqual(req.permissions, ['users.read']);
  });
});

test('AuthorizeMiddleware — penjagaan terhadap salah pakai', async (t) => {
  await t.test('dipanggil tanpa satu pun izin langsung ditolak', async () => {
    const { middleware } = build();

    assert.throws(() => middleware.require(), /minimal satu permission/);
  });

  await t.test('konstanta salah ketik tertangkap saat route didefinisikan', async () => {
    // PERMISSIONS.SALAH_KETIK bernilai undefined. Tanpa penjagaan ini, salah
    // ketik hanya menghasilkan 403 yang senyap — dan senyapnya bertahan sampai
    // ada yang mengeluh. Sekarang aplikasi menolak dimuat.
    const { middleware } = build();

    for (const buruk of [undefined, null, '', '   ', 42, {}]) {
      assert.throws(() => middleware.require(buruk), /tidak valid/, `nilai ${buruk}`);
    }
  });

  await t.test('dipasang tanpa authenticate lebih dulu ditolak keras', async () => {
    const { middleware } = build(['users.read']);
    const handler = middleware.require('users.read');

    const error = await captureError(() => handler(fakeRequest(null), {}, () => {}));

    assert.match(error.message, /setelah authenticate/);
  });
});

test('AuthorizeMiddleware — registri izin', async (t) => {
  await t.test('setiap izin yang diminta route ikut tercatat', async () => {
    // Daftar inilah yang dibandingkan server.js dengan isi tabel permissions
    // saat start. Ada yang tidak cocok, aplikasi menolak menyala.
    const { middleware } = build();

    middleware.require('users.read');
    middleware.require('users.create', 'roles.read');

    assert.deepEqual(middleware.requiredPermissions.sort(), [
      'roles.read',
      'users.create',
      'users.read',
    ]);
  });

  await t.test('izin yang sama dari dua route hanya tercatat sekali', async () => {
    const { middleware } = build();

    middleware.require('users.read');
    middleware.require('users.read');

    assert.deepEqual(middleware.requiredPermissions, ['users.read']);
  });

  await t.test('registri milik instance, bukan modul', async () => {
    // Inilah yang diperbaiki refactor ini. Dulu registrinya `const registry =
    // new Set()` di module scope: isinya menumpuk seumur proses, tidak bisa
    // direset, dan satu berkas pengujian mencemari berkas berikutnya.
    const pertama = build().middleware;
    const kedua = build().middleware;

    pertama.require('users.read');

    assert.deepEqual(pertama.requiredPermissions, ['users.read']);
    assert.deepEqual(kedua.requiredPermissions, [], 'instance lain harus tetap bersih');
  });
});
