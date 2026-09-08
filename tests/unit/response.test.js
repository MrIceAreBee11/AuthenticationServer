const test = require('node:test');
const assert = require('node:assert/strict');

const { successResponse, errorResponse } = require('../../src/utils/response');
const { fakeResponse } = require('./fakes');

test('successResponse', async (t) => {
  await t.test('bentuk jawaban selalu sama: success, message, data', async () => {
    // Bentuk yang seragam inilah yang membuat antarmuka dapat menangani semua
    // jawaban dengan satu pembungkus fetch, tanpa cabang per endpoint.
    const res = fakeResponse();

    successResponse(res, 200, 'Berhasil', { id: 1 });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, message: 'Berhasil', data: { id: 1 } });
  });

  await t.test('data bernilai null bila tidak diberikan', async () => {
    const res = fakeResponse();

    successResponse(res, 204, 'Selesai');

    assert.equal(res.body.data, null);
    assert.ok(!('meta' in res.body), 'meta tidak boleh muncul tanpa diminta');
  });

  await t.test('meta hanya muncul bila diisi', async () => {
    const res = fakeResponse();

    successResponse(res, 200, 'Daftar', [], { total: 40, page: 1, limit: 10 });

    assert.deepEqual(res.body.meta, { total: 40, page: 1, limit: 10 });
  });
});

test('errorResponse', async (t) => {
  await t.test('data selalu null agar antarmuka tidak perlu menebak', async () => {
    const res = fakeResponse();

    errorResponse(res, 403, 'Tidak diizinkan');

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { success: false, message: 'Tidak diizinkan', data: null });
  });

  await t.test('kode error ikut dikirim bila diisi', async () => {
    // Inilah yang boleh diandalkan klien. Pesannya untuk manusia dan boleh
    // berubah kapan saja; kode ini bagian dari kontrak API.
    const res = fakeResponse();

    errorResponse(res, 401, 'Token sudah kedaluwarsa', { code: 'TOKEN_EXPIRED' });

    assert.equal(res.body.code, 'TOKEN_EXPIRED');
  });

  await t.test('details hanya muncul bila diisi', async () => {
    const res = fakeResponse();

    errorResponse(res, 503, 'Belum siap', { details: { database: 'up', redis: 'down' } });

    assert.deepEqual(res.body.details, { database: 'up', redis: 'down' });
    assert.equal(res.body.data, null);
  });

  await t.test('kode dan details boleh sama-sama tidak ada', async () => {
    const res = fakeResponse();

    errorResponse(res, 400, 'Data tidak valid');

    assert.ok(!('code' in res.body));
    assert.ok(!('details' in res.body));
  });
});
