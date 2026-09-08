const test = require('node:test');
const assert = require('node:assert/strict');

const { ValidationError, UniqueConstraintError, ConnectionError } = require('sequelize');

const { ErrorHandler } = require('../../src/middlewares/errorHandler');
const AppError = require('../../src/utils/AppError');
const { ERROR_CODES } = require('../../src/constants/errorCodes');
const { fakeResponse, fakeLogger } = require('./fakes');

const handle = (error, { exposeStack = false } = {}) => {
  const res = fakeResponse();
  const logger = fakeLogger();
  const req = { method: 'GET', originalUrl: '/api/v1/users' };

  new ErrorHandler({ exposeStack, logger }).handle(error, req, res, () => {});

  return { res, logger };
};

test('ErrorHandler — error yang dikenali', async (t) => {
  await t.test('AppError memakai status, pesan, dan kodenya sendiri', async () => {
    const { res } = handle(new AppError('Anda tidak memiliki izin', 403));

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, 'Anda tidak memiliki izin');
    assert.equal(res.body.code, ERROR_CODES.PERMISSION_DENIED);
    assert.equal(res.body.success, false);
  });

  await t.test('penolakan yang disengaja TIDAK dicatat sebagai error', async () => {
    // Sudah tercatat sebagai status 4xx oleh requestLogger. Mencatatnya dua
    // kali membuat log penuh kejadian normal, dan error yang sungguhan
    // tenggelam di antaranya.
    const { logger } = handle(new AppError('Token tidak ditemukan', 401));

    assert.equal(logger.entries.length, 0);
  });

  await t.test('kegagalan koneksi basis data jadi 503, bukan 500', async () => {
    // 503 berarti "coba lagi nanti". 500 berarti "permintaan Anda salah", dan
    // itu menyesatkan ketika yang bermasalah justru infrastrukturnya.
    const { res, logger } = handle(new ConnectionError(new Error('ECONNREFUSED')));

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, ERROR_CODES.DEPENDENCY_UNAVAILABLE);
    assert.equal(logger.at('exception').length, 1, 'infrastruktur bermasalah wajib tercatat');
  });

  await t.test('email ganda jadi 409 dan menyebut kolomnya, bukan isinya', async () => {
    // Nama kolom cukup untuk pengguna. Menyertakan nilai yang bertabrakan
    // justru membocorkan data akun orang lain.
    const { res } = handle(
      new UniqueConstraintError({ errors: [{ path: 'email', message: 'harus unik' }] })
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, ERROR_CODES.ALREADY_EXISTS);
    assert.deepEqual(res.body.details.fields, ['email']);
    assert.ok(!JSON.stringify(res.body).includes('harus unik'));
  });

  await t.test('ValidationError jadi 400 beserta daftar field-nya', async () => {
    const { res } = handle(
      new ValidationError('gagal', [
        { path: 'email', message: 'Format email tidak valid' },
        { path: 'fullName', message: 'Nama lengkap minimal 3 karakter' },
      ])
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Format email tidak valid');
    assert.equal(res.body.code, ERROR_CODES.VALIDATION_FAILED);
    assert.equal(res.body.details.errors.length, 2);
  });
});

test('ErrorHandler — error tak terduga', async (t) => {
  await t.test('jadi 500 dengan pesan generik, tanpa membocorkan aslinya', async () => {
    const { res } = handle(
      new TypeError('Cannot read properties of undefined (reading secretKey)')
    );

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'Terjadi kesalahan pada server');
    assert.equal(res.body.code, ERROR_CODES.INTERNAL_ERROR);
    assert.ok(
      !JSON.stringify(res.body).includes('secretKey'),
      'pesan asli tidak boleh sampai ke klien'
    );
  });

  await t.test('pesan aslinya tetap masuk log, beserta alamat permintaannya', async () => {
    // Inilah pertukarannya: klien menerima pesan generik, operator menerima
    // keterangan lengkap. Tanpa yang kedua, 500 tidak dapat ditelusuri.
    const { logger } = handle(new TypeError('rincian internal'));
    const [entry] = logger.at('exception');

    assert.equal(entry.fieldsOrError.message, 'rincian internal');
    assert.equal(entry.fields.path, '/api/v1/users');
    assert.equal(entry.fields.method, 'GET');
  });

  await t.test('stack trace hanya ikut ke klien kalau memang diizinkan', async () => {
    const tanpaStack = handle(new Error('rahasia'), { exposeStack: false });
    const denganStack = handle(new Error('rahasia'), { exposeStack: true });

    assert.equal(tanpaStack.res.body.details, undefined);
    assert.ok(denganStack.res.body.details.stack.includes('Error: rahasia'));
  });

  await t.test('bentuk jawaban gagal selalu sama', async () => {
    // Keseragaman inilah yang membuat antarmuka bisa menangani seluruh
    // kegagalan dengan satu pembungkus fetch.
    for (const error of [
      new AppError('a', 400),
      new ConnectionError(new Error('b')),
      new Error('c'),
    ]) {
      const { res } = handle(error);

      assert.equal(res.body.success, false);
      assert.equal(res.body.data, null);
      assert.equal(typeof res.body.message, 'string');
      assert.equal(typeof res.body.code, 'string');
    }
  });
});
