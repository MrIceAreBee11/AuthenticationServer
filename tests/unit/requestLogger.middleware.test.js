const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { RequestLoggerMiddleware } = require('../../src/middlewares/requestLogger');
const { RequestContext } = require('../../src/utils/requestContext');
const { fakeLogger } = require('./fakes');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** res palsu yang dapat memicu 'finish' seperti Express sungguhan. */
const fakeResponse = (statusCode = 200) => {
  const listeners = {};

  return {
    statusCode,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    on(event, handler) {
      listeners[event] = handler;
    },
    finish() {
      listeners.finish?.();
    },
  };
};

const build = () => {
  const logger = fakeLogger();
  const context = new RequestContext();

  return { middleware: new RequestLoggerMiddleware({ logger, context }), logger, context };
};

const fakeRequest = (overrides = {}) => ({
  method: 'GET',
  originalUrl: '/api/v1/users',
  headers: {},
  ...overrides,
});

test('RequestLoggerMiddleware — identitas permintaan', async (t) => {
  await t.test('membuat requestId baru bila klien tidak mengirimnya', async () => {
    const { middleware } = build();
    const req = fakeRequest();
    const res = fakeResponse();

    middleware.handle(req, res, () => {});

    assert.match(req.requestId, UUID_PATTERN);
  });

  await t.test('menghormati x-request-id dari klien agar jejaknya nyambung', async () => {
    // Supaya satu permintaan dapat ditelusuri melewati reverse proxy atau
    // layanan pemanggil, bukan terputus di batas aplikasi ini.
    const { middleware } = build();
    const req = fakeRequest({ headers: { 'x-request-id': 'dari-proxy-123' } });

    middleware.handle(req, fakeResponse(), () => {});

    assert.equal(req.requestId, 'dari-proxy-123');
  });

  await t.test('nilai yang tidak wajar dari klien ditolak dan diganti', async () => {
    // Nilai ini masuk ke setiap baris log. Menerimanya apa adanya berarti
    // pihak luar dapat menyuntikkan baris palsu ke dalam log, atau mengirim
    // satu megabyte teks yang ikut tersimpan di setiap baris.
    const { middleware } = build();

    for (const buruk of ['ada spasi', 'baris\nbaru', '{"json":true}', '', '   ']) {
      const req = fakeRequest({ headers: { 'x-request-id': buruk } });

      middleware.handle(req, fakeResponse(), () => {});

      assert.match(req.requestId, UUID_PATTERN, `nilai ${JSON.stringify(buruk.slice(0, 20))}`);
    }
  });

  await t.test('nilai panjang tapi wajar dipangkas, bukan dibuang', async () => {
    const { middleware } = build();
    const panjang = 'a'.repeat(100);
    const req = fakeRequest({ headers: { 'x-request-id': panjang } });

    middleware.handle(req, fakeResponse(), () => {});

    assert.equal(req.requestId.length, 64);
  });

  await t.test('dikembalikan lewat header agar pengguna dapat menyebutkannya', async () => {
    const { middleware } = build();
    const req = fakeRequest();
    const res = fakeResponse();

    middleware.handle(req, res, () => {});

    assert.equal(res.headers['x-request-id'], req.requestId);
  });
});

test('RequestLoggerMiddleware — konteks', async (t) => {
  await t.test('requestId terjangkau dari dalam rantai middleware', async () => {
    // Inilah yang membuat service dan repository beberapa lapis di bawah tetap
    // mencantumkan requestId tanpa menerimanya lewat argumen.
    const { middleware, context } = build();
    let terlihat = null;

    middleware.handle(fakeRequest(), fakeResponse(), () => {
      terlihat = context.requestId;
    });

    assert.match(terlihat, UUID_PATTERN);
  });

  await t.test('di luar rantai, requestId bernilai null', async () => {
    const { context } = build();

    assert.equal(context.requestId, null);
  });
});

test('RequestLoggerMiddleware — pencatatan hasil', async (t) => {
  await t.test('dicatat saat selesai, bukan saat mulai', async () => {
    // Satu baris yang sudah memuat status dan durasi jauh lebih berguna
    // daripada dua baris yang harus dijodohkan sendiri.
    const { middleware, logger } = build();
    const res = fakeResponse(200);

    middleware.handle(fakeRequest(), res, () => {});

    assert.equal(logger.entries.length, 0, 'belum ada apa pun sebelum selesai');

    res.finish();

    assert.equal(logger.entries.length, 1);
  });

  await t.test('memuat metode, alamat, status, dan durasi', async () => {
    const { middleware, logger } = build();
    const res = fakeResponse(201);

    middleware.handle(fakeRequest({ method: 'POST' }), res, () => {});
    res.finish();

    const [entry] = logger.entries;

    assert.equal(entry.fieldsOrError.method, 'POST');
    assert.equal(entry.fieldsOrError.path, '/api/v1/users');
    assert.equal(entry.fieldsOrError.status, 201);
    assert.equal(typeof entry.fieldsOrError.durationMs, 'number');
  });

  await t.test('userId ikut bila permintaannya sudah terautentikasi', async () => {
    const { middleware, logger } = build();
    const req = fakeRequest();
    const res = fakeResponse(200);

    middleware.handle(req, res, () => {
      // authenticate berjalan setelah ini dan mengisi req.user
      req.user = { id: 'u1' };
    });
    res.finish();

    assert.equal(logger.entries[0].fieldsOrError.userId, 'u1');
  });

  await t.test('level mengikuti status: 5xx error, 4xx warn, sisanya info', async () => {
    for (const [status, level] of [
      [200, 'info'],
      [201, 'info'],
      [304, 'info'],
      [400, 'warn'],
      [401, 'warn'],
      [404, 'warn'],
      [500, 'error'],
      [503, 'error'],
    ]) {
      const { middleware, logger } = build();
      const res = fakeResponse(status);

      middleware.handle(fakeRequest(), res, () => {});
      res.finish();

      assert.equal(logger.entries[0].level, level, `status ${status}`);
    }
  });

  await t.test('next dipanggil tepat sekali', async () => {
    const { middleware } = build();
    const next = mock.fn();

    middleware.handle(fakeRequest(), fakeResponse(), next);

    assert.equal(next.mock.callCount(), 1);
  });
});
