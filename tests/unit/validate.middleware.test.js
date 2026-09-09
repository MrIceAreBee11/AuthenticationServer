const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const { z } = require('zod');

const { validate } = require('../../src/middlewares/validate');
const { captureError } = require('./fakes');
const { ERROR_CODES } = require('../../src/constants/errorCodes');

const skema = z
  .object({
    email: z
      .string({ error: 'Email wajib diisi' })
      .trim()
      .toLowerCase()
      .email('Format email tidak valid'),
    umur: z.coerce.number().int().positive().optional(),
  })
  .strict();

const jalankan = (schema, source, payload) => {
  const req = { body: undefined, query: undefined, params: undefined, [source]: payload };
  const next = mock.fn();

  return { req, next, jalan: () => validate(schema, source)(req, {}, next) };
};

test('validate — permintaan yang sah', async (t) => {
  await t.test('hasil parse ditaruh di req.valid, bukan menimpa req.body', async () => {
    // Awalnya middleware ini menimpa req[source]. Untuk query itu TIDAK
    // bekerja: Express 5 mendefinisikan req.query sebagai getter, jadi
    // penugasan padanya tidak melempar apa pun dan juga tidak berlaku —
    // hasil konversi terbuang diam-diam.
    const { req, next, jalan } = jalankan(skema, 'body', { email: '  A@B.TEST ' });

    jalan();

    assert.equal(req.valid.body.email, 'a@b.test');
    assert.deepEqual(req.body, { email: '  A@B.TEST ' }, 'aslinya tidak disentuh');
    assert.equal(next.mock.callCount(), 1);
  });

  await t.test('query string dikonversi menjadi angka', async () => {
    // Tanpa konversi, ?umur=30 sampai ke service sebagai teks "30" dan
    // perbandingan angka apa pun jadi salah tanpa error.
    const { req, jalan } = jalankan(skema, 'query', { email: 'a@b.test', umur: '30' });

    jalan();

    assert.equal(req.valid.query.umur, 30);
    assert.equal(typeof req.valid.query.umur, 'number');
  });

  await t.test('dua pemeriksaan pada satu route saling menumpuk', async () => {
    // params diperiksa lebih dulu, lalu body. Yang kedua tidak boleh
    // menghapus hasil yang pertama.
    const paramSkema = z.object({ id: z.coerce.number().int() }).strict();
    const req = { params: { id: '7' }, body: { email: 'a@b.test' } };
    const next = mock.fn();

    validate(paramSkema, 'params')(req, {}, next);
    validate(skema, 'body')(req, {}, next);

    assert.equal(req.valid.params.id, 7);
    assert.equal(req.valid.body.email, 'a@b.test');
    assert.equal(next.mock.callCount(), 2);
  });

  await t.test('field yang tidak dideklarasikan tidak sampai ke service', async () => {
    // Inti perlindungan mass assignment: apa pun yang lolos ke req.valid
    // hanyalah field yang memang dideklarasikan.
    const lunak = z.object({ email: z.string() });
    const { req, jalan } = jalankan(lunak, 'body', { email: 'a@b.test', isAdmin: true });

    jalan();

    assert.deepEqual(Object.keys(req.valid.body), ['email']);
  });
});

test('validate — permintaan yang ditolak', async (t) => {
  await t.test('seluruh field yang salah dilaporkan sekaligus', async () => {
    // Bukan yang pertama saja. Klien memperbaiki formulirnya dalam satu
    // putaran, bukan satu field per percobaan.
    const error = await captureError(async () =>
      jalankan(skema, 'body', { email: 'bukan-email', umur: -1 }).jalan()
    );

    assert.equal(error.statusCode, 400);
    assert.equal(error.code, ERROR_CODES.VALIDATION_FAILED);
    assert.equal(error.details.errors.length, 2);
    assert.deepEqual(error.details.errors.map((e) => e.field).sort(), ['email', 'umur']);
  });

  await t.test('field asing membuat permintaan DITOLAK, bukan diabaikan', async () => {
    // Salah ketik nama field jadi terlihat sebagai 400 yang menyebut
    // kuncinya, bukan sebagai "kenapa perubahan saya tidak tersimpan".
    const error = await captureError(async () =>
      jalankan(skema, 'body', { email: 'a@b.test', isAdmin: true }).jalan()
    );

    assert.equal(error.statusCode, 400);
    assert.match(JSON.stringify(error.details), /isAdmin/);
  });

  await t.test('next tidak dipanggil saat validasi gagal', async () => {
    const { next, jalan } = jalankan(skema, 'body', {});

    await captureError(async () => jalan());

    assert.equal(next.mock.callCount(), 0);
  });

  await t.test('body yang tidak ada sama sekali diperlakukan sebagai objek kosong', async () => {
    // Permintaan tanpa Content-Type membuat req.body undefined. Tanpa
    // penjagaan ini, Zod menerima undefined dan pesannya jadi tentang tipe
    // objek, bukan tentang field mana yang kurang.
    const req = {};
    const error = await captureError(async () => validate(skema)(req, {}, () => {}));

    assert.deepEqual(
      error.details.errors.map((e) => e.field),
      ['email']
    );
  });

  await t.test('error di akar objek dilaporkan sebagai (body)', async () => {
    const wajibAdaSatu = z
      .object({ a: z.string().optional() })
      .refine((body) => Object.keys(body).length > 0, {
        message: 'Tidak ada data yang dikirim untuk diubah',
      });

    const error = await captureError(async () =>
      validate(wajibAdaSatu)({ body: {} }, {}, () => {})
    );

    assert.equal(error.details.errors[0].field, '(body)');
    assert.match(error.details.errors[0].message, /Tidak ada data/);
  });
});
