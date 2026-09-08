const test = require('node:test');
const assert = require('node:assert/strict');

const { IdempotencyRepository } = require('../../src/repositories/idempotency.repository');
const { IdempotencyMiddleware } = require('../../src/middlewares/idempotency');
const { fakeCache, fakeResponse, fakeLogger, captureError } = require('./fakes');

const TTL = 3600;

const build = ({ cache = fakeCache() } = {}) => {
  const logger = fakeLogger();
  const store = new IdempotencyRepository(cache);

  return {
    cache,
    store,
    logger,
    middleware: new IdempotencyMiddleware({ store, ttlSeconds: TTL, logger }),
  };
};

const fakeRequest = ({ key, userId = 'user-1', method = 'POST' } = {}) => ({
  method,
  baseUrl: '/api/users',
  path: '/',
  headers: key === undefined ? {} : { 'idempotency-key': key },
  user: userId ? { id: userId } : undefined,
});

test('IdempotencyRepository', async (t) => {
  await t.test('pemesanan pertama berhasil, yang kedua tidak', async () => {
    // Inilah seluruh inti fitur ini. Kalau pemesanan kedua ikut berhasil,
    // dua operasi tulis berjalan bersamaan dan jaminannya kosong.
    const { store } = build();

    assert.equal(await store.reserve('s', 'k', TTL), true);
    assert.equal(await store.reserve('s', 'k', TTL), false);
  });

  await t.test('selagi diproses, findResponse menjawab null', async () => {
    // Bukan undefined dan bukan string penanda: pemanggil membedakan "belum
    // ada jawaban" dari "ada jawaban" hanya lewat nilai ini.
    const { store } = build();

    await store.reserve('s', 'k', TTL);

    assert.equal(await store.findResponse('s', 'k'), null);
  });

  await t.test('jawaban tersimpan dapat dibaca kembali utuh', async () => {
    const { store } = build();

    await store.reserve('s', 'k', TTL);
    await store.saveResponse('s', 'k', { status: 201, body: { data: { id: 'u1' } } }, TTL);

    assert.deepEqual(await store.findResponse('s', 'k'), {
      status: 201,
      body: { data: { id: 'u1' } },
    });
  });

  await t.test('release membuat kuncinya dapat dipesan lagi', async () => {
    const { store } = build();

    await store.reserve('s', 'k', TTL);
    await store.release('s', 'k');

    assert.equal(await store.reserve('s', 'k', TTL), true);
  });

  await t.test('cakupan yang berbeda tidak saling menabrak', async () => {
    // Kunci dari klien tidak pernah dipakai sendirian. Tanpa cakupan, satu
    // kunci yang dipakai ulang di endpoint lain akan menerima jawaban lama.
    const { store } = build();

    await store.reserve('user-1:POST:/api/users', 'k', TTL);

    assert.equal(await store.reserve('user-1:POST:/api/roles', 'k', TTL), true);
    assert.equal(await store.reserve('user-2:POST:/api/users', 'k', TTL), true);
  });

  await t.test('kunci Redis-nya berawalan idem:', async () => {
    const { store, cache } = build();

    await store.reserve('s', 'k', TTL);

    assert.deepEqual([...cache.store.keys()], ['idem:s:k']);
  });

  await t.test('masa berlaku diteruskan ke Redis, bukan dibiarkan abadi', async () => {
    // Tanpa EX, setiap kunci idempotensi menetap selamanya dan Redis
    // perlahan penuh oleh data yang tidak pernah dibaca lagi.
    const { store, cache } = build();

    await store.reserve('s', 'k', TTL);
    await store.saveResponse('s', 'k', { status: 201, body: {} }, TTL);

    cache.set.mock.calls.forEach((call) => {
      assert.equal(call.arguments[2].EX, TTL);
    });
  });
});

test('IdempotencyMiddleware — tanpa header', async (t) => {
  await t.test('permintaan diteruskan apa adanya', async () => {
    // Fiturnya opsional. Mewajibkan header akan memutus setiap klien yang
    // sudah ada sekarang.
    const { middleware, cache } = build();
    let lanjut = false;

    await middleware.handle(fakeRequest(), fakeResponse(), () => {
      lanjut = true;
    });

    assert.equal(lanjut, true);
    assert.equal(cache.store.size, 0);
  });

  await t.test('header kosong dianggap tidak ada', async () => {
    const { middleware, cache } = build();
    let lanjut = false;

    await middleware.handle(fakeRequest({ key: '   ' }), fakeResponse(), () => {
      lanjut = true;
    });

    assert.equal(lanjut, true);
    assert.equal(cache.store.size, 0);
  });

  await t.test('kunci berbentuk aneh diabaikan, bukan dipakai', async () => {
    // Kunci dari klien masuk ke kunci Redis. Nilai seperti "a:*" atau kunci
    // sepanjang satu kilobyte tidak boleh menyentuh ruang kunci sama sekali.
    const { middleware, cache } = build();

    for (const key of ['a b', 'a*', 'a\nb', 'x'.repeat(129)]) {
      let lanjut = false;

      await middleware.handle(fakeRequest({ key }), fakeResponse(), () => {
        lanjut = true;
      });

      assert.equal(lanjut, true, key);
    }

    assert.equal(cache.store.size, 0);
  });
});

test('IdempotencyMiddleware — permintaan pertama', async (t) => {
  await t.test('diteruskan, dan jawaban berhasil disimpan', async () => {
    const { middleware, store } = build();
    const res = fakeResponse();

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {});

    res.status(201).json({ data: { id: 'u1' } });

    assert.deepEqual(await store.findResponse('user-1:POST:/api/users/', 'abc'), {
      status: 201,
      body: { data: { id: 'u1' } },
    });
  });

  await t.test('jawaban gagal TIDAK disimpan, dan kuncinya dilepas', async () => {
    // Kalau kegagalan ikut tersimpan, percobaan ulang atas gangguan sementara
    // selamanya menerima kegagalan yang sama — kebalikan dari tujuan fitur.
    const { middleware, store, cache } = build();
    const res = fakeResponse();

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {});

    res.status(500).json({ message: 'gagal' });

    assert.equal(cache.store.size, 0);
    assert.equal(await store.reserve('user-1:POST:/api/users/', 'abc', TTL), true);
  });

  await t.test('kuncinya dilepas juga ketika permintaannya berakhir 4xx', async () => {
    // Validasi yang gagal melempar error dan tidak pernah melewati res.json,
    // jadi pelepasannya harus ikut bergantung pada event finish.
    const { middleware, cache } = build();
    const res = fakeResponse();

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {});

    res.statusCode = 400;
    res.emit('finish');

    await new Promise(setImmediate);

    assert.equal(cache.store.size, 0);
  });

  await t.test('res.json tetap mengembalikan res, supaya rantainya tidak patah', async () => {
    const { middleware } = build();
    const res = fakeResponse();

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {});

    assert.equal(res.status(201).json({ ok: true }), res);
  });
});

test('IdempotencyMiddleware — permintaan ulang', async (t) => {
  await t.test('menerima jawaban asli, bukan diproses lagi', async () => {
    // Inti masalahnya: email sudah unik, jadi percobaan ulang sekarang dijawab
    // 409 padahal datanya sudah terbuat. Yang benar adalah 201 yang asli.
    const { middleware, store } = build();

    await store.reserve('user-1:POST:/api/users/', 'abc', TTL);
    await store.saveResponse(
      'user-1:POST:/api/users/',
      'abc',
      { status: 201, body: { data: { id: 'u1' } } },
      TTL
    );

    const res = fakeResponse();
    let lanjut = false;

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {
      lanjut = true;
    });

    assert.equal(lanjut, false);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { data: { id: 'u1' } });
  });

  await t.test('ditandai lewat header, supaya klien tahu ini pengulangan', async () => {
    const { middleware, store } = build();

    await store.reserve('user-1:POST:/api/users/', 'abc', TTL);
    await store.saveResponse('user-1:POST:/api/users/', 'abc', { status: 201, body: {} }, TTL);

    const res = fakeResponse();

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {});

    assert.equal(res.headers['idempotent-replay'], 'true');
  });

  await t.test('pengguna lain dengan kunci sama TIDAK menerima jawaban itu', async () => {
    // Kebocoran data yang paling mudah terjadi dan paling sulit terlihat:
    // dua klien yang kebetulan memakai kunci yang sama.
    const { middleware, store } = build();

    await store.reserve('user-1:POST:/api/users/', 'abc', TTL);
    await store.saveResponse(
      'user-1:POST:/api/users/',
      'abc',
      { status: 201, body: { data: { email: 'rahasia@a.test' } } },
      TTL
    );

    const res = fakeResponse();
    let lanjut = false;

    await middleware.handle(fakeRequest({ key: 'abc', userId: 'user-2' }), res, () => {
      lanjut = true;
    });

    assert.equal(lanjut, true);
    assert.equal(res.body, null);
  });
});

test('IdempotencyMiddleware — permintaan yang masih berjalan', async (t) => {
  await t.test('dijawab 409, bukan diproses bersamaan', async () => {
    const { middleware, store } = build();

    await store.reserve('user-1:POST:/api/users/', 'abc', TTL);

    const error = await captureError(() =>
      middleware.handle(fakeRequest({ key: 'abc' }), fakeResponse(), () => {})
    );

    assert.equal(error.statusCode, 409);
  });

  await t.test('dua permintaan bersamaan: satu lanjut, satu ditolak', async () => {
    // Skenario nyatanya adalah klien yang mengirim ulang sebelum jawaban
    // pertama tiba. Keduanya berjalan sekarang, bukan berurutan.
    const { middleware } = build();

    const jalankan = () =>
      middleware
        .handle(fakeRequest({ key: 'abc' }), fakeResponse(), () => 'lanjut')
        .then(() => 'lanjut')
        .catch((error) => error.statusCode);

    const hasil = await Promise.all([jalankan(), jalankan()]);

    assert.deepEqual(hasil.sort(), [409, 'lanjut']);
  });
});

test('IdempotencyMiddleware — Redis bermasalah', async (t) => {
  await t.test('kegagalan menyimpan jawaban tidak membatalkan jawabannya', async () => {
    // Operasinya sudah terjadi di database. Melempar sekarang berarti klien
    // diberi tahu bahwa permintaannya gagal padahal berhasil.
    const cache = fakeCache({ fail: (operation) => operation === 'set' });
    const { middleware, logger } = build({ cache });
    const res = fakeResponse();

    // Pemesanan ikut gagal, jadi diuji dengan cache yang hanya gagal setelah
    // pemesanannya lewat.
    let lolos = 0;
    cache.set.mock.mockImplementation(async () => {
      lolos += 1;

      if (lolos === 1) {
        return 'OK';
      }

      throw new Error('Redis tidak dapat dihubungi');
    });

    await middleware.handle(fakeRequest({ key: 'abc' }), res, () => {});

    res.status(201).json({ data: { id: 'u1' } });

    await new Promise(setImmediate);

    assert.deepEqual(res.body, { data: { id: 'u1' } });
    assert.match(logger.at('exception')[0].message, /gagal menyimpan jawaban idempotensi/);
  });
});
