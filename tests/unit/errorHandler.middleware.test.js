const test = require('node:test');
const assert = require('node:assert/strict');

const { ValidationError, UniqueConstraintError, ConnectionError } = require('sequelize');

const { ErrorHandler } = require('../../src/middlewares/errorHandler');
const AppError = require('../../src/utils/AppError');
const { fakeResponse, silenceErrorLog } = require('./fakes');

const handle = (error, { exposeStack = false } = {}) => {
  const res = fakeResponse();

  new ErrorHandler({ exposeStack }).handle(error, {}, res, () => {});

  return res;
};

test('ErrorHandler — error yang dikenali', async (t) => {
  await t.test('AppError memakai status dan pesannya sendiri', async () => {
    const res = handle(new AppError('Anda tidak memiliki izin', 403));

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, 'Anda tidak memiliki izin');
    assert.equal(res.body.success, false);
  });

  await t.test('kegagalan koneksi basis data jadi 503, bukan 500', async (subtest) => {
    subtest.mock.restoreAll();
    silenceErrorLog();

    // 503 berarti "coba lagi nanti". 500 berarti "permintaan Anda salah", dan
    // itu menyesatkan ketika yang bermasalah justru infrastrukturnya.
    const res = handle(new ConnectionError(new Error('ECONNREFUSED')));

    assert.equal(res.statusCode, 503);
    assert.match(res.body.message, /tidak tersedia/);
  });

  await t.test('email ganda jadi 409 dan menyebut kolomnya, bukan isinya', async () => {
    // Nama kolom cukup untuk pengguna. Menyertakan nilai yang bertabrakan
    // justru membocorkan data akun orang lain.
    const error = new UniqueConstraintError({
      errors: [{ path: 'email', message: 'harus unik' }],
    });

    const res = handle(error);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body.details.fields, ['email']);
    assert.ok(!JSON.stringify(res.body).includes('harus unik'));
  });

  await t.test('ValidationError jadi 400 beserta daftar field-nya', async () => {
    const error = new ValidationError('gagal', [
      { path: 'email', message: 'Format email tidak valid' },
      { path: 'fullName', message: 'Nama lengkap minimal 3 karakter' },
    ]);

    const res = handle(error);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Format email tidak valid');
    assert.equal(res.body.details.errors.length, 2);
  });
});

test('ErrorHandler — error tak terduga', async (t) => {
  await t.test('jadi 500 dengan pesan generik, tanpa membocorkan aslinya', async (subtest) => {
    subtest.mock.restoreAll();
    silenceErrorLog();

    const res = handle(new TypeError('Cannot read properties of undefined (reading secretKey)'));

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'Terjadi kesalahan pada server');
    assert.ok(
      !JSON.stringify(res.body).includes('secretKey'),
      'pesan asli tidak boleh sampai ke klien'
    );
  });

  await t.test('stack trace hanya ikut kalau memang diizinkan', async (subtest) => {
    subtest.mock.restoreAll();
    silenceErrorLog();

    // Keputusan ini dulu dibaca sendiri dari environment oleh berkas ini, jadi
    // kedua kemungkinannya tidak bisa diuji dalam satu proses.
    const tanpaStack = handle(new Error('rahasia'), { exposeStack: false });
    const denganStack = handle(new Error('rahasia'), { exposeStack: true });

    assert.equal(tanpaStack.body.details, undefined);
    assert.ok(denganStack.body.details.stack.includes('Error: rahasia'));
  });

  await t.test('bentuk jawaban gagal selalu sama', async (subtest) => {
    subtest.mock.restoreAll();
    silenceErrorLog();

    // Keseragaman inilah yang membuat antarmuka bisa menangani seluruh
    // kegagalan dengan satu pembungkus fetch.
    for (const error of [
      new AppError('a', 400),
      new ConnectionError(new Error('b')),
      new Error('c'),
    ]) {
      const res = handle(error);

      assert.equal(res.body.success, false);
      assert.equal(res.body.data, null);
      assert.equal(typeof res.body.message, 'string');
    }
  });
});
