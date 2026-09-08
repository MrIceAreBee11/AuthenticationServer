const test = require('node:test');
const assert = require('node:assert/strict');

const AppError = require('../../src/utils/AppError');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
} = require('../../src/utils/AppError');
const { ERROR_CODES, DEFAULT_CODE_BY_STATUS } = require('../../src/constants/errorCodes');

test('AppError', async (t) => {
  await t.test('kode mengikuti status bila tidak disebut', async () => {
    // Nilai bawaan ini yang membuat penambahan kode error tidak memaksa lima
    // puluh titik throw disunting sekaligus.
    assert.equal(new AppError('x', 404).code, ERROR_CODES.NOT_FOUND);
    assert.equal(new AppError('x', 403).code, ERROR_CODES.PERMISSION_DENIED);
  });

  await t.test('kode eksplisit menang atas bawaan', async () => {
    const error = new AppError('x', 401, ERROR_CODES.TOKEN_EXPIRED);

    assert.equal(error.code, ERROR_CODES.TOKEN_EXPIRED);
  });

  await t.test('status yang tidak terdaftar jatuh ke INTERNAL_ERROR', async () => {
    assert.equal(new AppError('x', 418).code, ERROR_CODES.INTERNAL_ERROR);
  });

  await t.test('name terisi nama class-nya, bukan "Error"', async () => {
    // Berguna di log: satu baris sudah menyatakan jenis penolakannya.
    assert.equal(new AppError('x', 400).name, 'AppError');
    assert.equal(new NotFoundError('x').name, 'NotFoundError');
  });

  await t.test('stack trace tidak menyertakan constructor AppError sendiri', async () => {
    const error = new BadRequestError('x');

    assert.ok(!error.stack.split('\n')[1].includes('AppError.js'));
  });
});

test('Subclass', async (t) => {
  await t.test('setiap subclass memakai status yang benar', async () => {
    // Angka 401 dan 403 gampang tertukar, dan tertukarnya berarti pesan
    // penolakan mengonfirmasi hal yang seharusnya disembunyikan. Nama class
    // membuat itu tidak lagi bisa salah tulis.
    assert.equal(new BadRequestError('x').statusCode, 400);
    assert.equal(new UnauthorizedError('x').statusCode, 401);
    assert.equal(new ForbiddenError('x').statusCode, 403);
    assert.equal(new NotFoundError('x').statusCode, 404);
    assert.equal(new ConflictError('x').statusCode, 409);
    assert.equal(new ServiceUnavailableError('x').statusCode, 503);
  });

  await t.test('semuanya tetap instanceof AppError', async () => {
    // Error handler mengenali penolakan yang disengaja lewat pemeriksaan ini.
    // Kalau ada subclass yang lepas, pesannya akan jatuh ke 500 generik.
    for (const error of [
      new BadRequestError('x'),
      new UnauthorizedError('x'),
      new ForbiddenError('x'),
      new NotFoundError('x'),
      new ConflictError('x'),
      new ServiceUnavailableError('x'),
    ]) {
      assert.ok(error instanceof AppError, error.name);
      assert.ok(error instanceof Error, error.name);
    }
  });
});

test('Katalog kode error', async (t) => {
  await t.test('tidak ada kode yang nilainya berbeda dari namanya', async () => {
    // Kunci dan nilai sengaja sama. Kalau berbeda, membaca log yang memuat
    // nilainya tidak langsung menunjuk ke konstanta mana yang dipakai.
    Object.entries(ERROR_CODES).forEach(([key, value]) => {
      assert.equal(key, value);
    });
  });

  await t.test('tidak ada nilai yang terduplikasi', async () => {
    const values = Object.values(ERROR_CODES);

    assert.equal(new Set(values).size, values.length);
  });

  await t.test('katalognya beku, tidak bisa ditambah saat runtime', async () => {
    assert.ok(Object.isFrozen(ERROR_CODES));
    assert.ok(Object.isFrozen(DEFAULT_CODE_BY_STATUS));
  });

  await t.test('setiap kode bawaan benar-benar ada di katalog', async () => {
    Object.values(DEFAULT_CODE_BY_STATUS).forEach((code) => {
      assert.ok(Object.values(ERROR_CODES).includes(code), code);
    });
  });

  await t.test('tiga kegagalan 401 dapat dibedakan', async () => {
    // Inilah alasan utama kode ini ada. Ketiganya 401, tetapi tindakan klien
    // berbeda: perbarui token, jangan diulangi, atau minta pengguna login.
    const kodeUnik = new Set([
      ERROR_CODES.TOKEN_EXPIRED,
      ERROR_CODES.TOKEN_REVOKED,
      ERROR_CODES.PASSWORD_CHANGED,
    ]);

    assert.equal(kodeUnik.size, 3);
  });
});
