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

  await t.test('details hanya muncul bila diisi', async () => {
    const res = fakeResponse();

    errorResponse(res, 503, 'Belum siap', { database: 'up', redis: 'down' });

    assert.deepEqual(res.body.details, { database: 'up', redis: 'down' });
    assert.equal(res.body.data, null);
  });
});
