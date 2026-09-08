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

test('ErrorHandler — kesalahan dari klien', async (t) => {
  /** Meniru bentuk error body-parser: type, status, expose. */
  const bodyParserError = (type, status, message) =>
    Object.assign(new SyntaxError(message), { type, status, statusCode: status, expose: true });

  await t.test('JSON rusak jadi 400, bukan 500', async () => {
    // Sebelum perbaikan ini jawabannya 500 — kesalahan klien dilaporkan
    // sebagai kesalahan server, dan di development stack trace-nya ikut
    // terkirim balik ke klien.
    const { res } = handle(
      bodyParserError('entity.parse.failed', 400, 'Unexpected token r in JSON')
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, ERROR_CODES.MALFORMED_JSON);
  });

  await t.test('pesan tidak memantulkan isi body permintaan', async () => {
    // Pesan bawaan body-parser menyertakan potongan body yang gagal diparse,
    // jadi ia memantulkan masukan mentah klien balik ke klien. Selain tidak
    // berguna bagi pengguna, itu bukan kebiasaan yang layak dipelihara.
    const pesanAsli = [
      'Unexpected token ',
      String.fromCharCode(39),
      'r',
      String.fromCharCode(39),
      ', "{"email": rusak" is not valid JSON',
    ].join('');

    const { res } = handle(bodyParserError('entity.parse.failed', 400, pesanAsli));

    assert.ok(!JSON.stringify(res.body).includes('rusak'));
    assert.equal(res.body.message, 'Body permintaan bukan JSON yang valid');
  });

  await t.test('tidak dicatat sebagai error tak tertangani', async () => {
    // Kesalahan klien tidak boleh mengotori log error. requestLogger sudah
    // mencatatnya sebagai 4xx.
    const { logger } = handle(bodyParserError('entity.parse.failed', 400, 'x'));

    assert.equal(logger.entries.length, 0);
  });

  await t.test('body terlalu besar jadi 413', async () => {
    const { res } = handle(bodyParserError('entity.too.large', 413, 'request entity too large'));

    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, ERROR_CODES.PAYLOAD_TOO_LARGE);
  });

  await t.test('charset dan encoding tak didukung jadi 415', async () => {
    for (const type of ['encoding.unsupported', 'charset.unsupported']) {
      const { res } = handle(bodyParserError(type, 415, 'unsupported'));

      assert.equal(res.statusCode, 415, type);
      assert.equal(res.body.code, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, type);
    }
  });

  await t.test('jenis 4xx yang belum terdaftar tetap 4xx, bukan jatuh ke 500', async () => {
    // Jaring pengaman. Pustaka yang memakai http-errors menandai error 4xx
    // dengan expose: true; penanda itu dipakai supaya jenis baru dari versi
    // berikutnya tidak berubah menjadi 500 tanpa ada yang menyadarinya.
    const { res, logger } = handle(
      Object.assign(new Error('parameters.too.many'), {
        type: 'parameters.too.many',
        status: 413,
        expose: true,
      })
    );

    assert.equal(res.statusCode, 413);
    assert.equal(logger.entries.length, 0);
  });

  await t.test('error 5xx dengan expose true TETAP jatuh ke 500 generik', async () => {
    // expose hanya dipercaya untuk 4xx. Error 5xx dari pustaka mana pun tetap
    // masalah sisi kita, dan pesan aslinya tidak boleh keluar.
    const { res, logger } = handle(
      Object.assign(new Error('rincian internal bocor'), { status: 503, expose: true })
    );

    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify(res.body).includes('rincian internal bocor'));
    assert.equal(logger.at('exception').length, 1);
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
