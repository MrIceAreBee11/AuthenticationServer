const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { AuthenticateMiddleware } = require('../../src/middlewares/authenticate');
const {
  captureError,
  fakeUser,
  fakeUserRepository,
  fakeDenylistRepository,
  testTokenService,
  fakeLogger,
} = require('./fakes');

/**
 * Lima pemeriksaan di middleware ini adalah inti keamanan seluruh aplikasi,
 * dan sampai refactor ini NOL yang mengujinya — karena repository-nya
 * di-require langsung, jadi tidak ada cara menjalankannya tanpa PostgreSQL dan
 * Redis hidup. Itu satu-satunya alasan berkas ini bisa ada sekarang.
 */
const buildMiddleware = ({ user = fakeUser(), revoked = false, denylistFails = false } = {}) => {
  const users = fakeUserRepository({ user });
  const denylist = fakeDenylistRepository({ revoked });
  const tokens = testTokenService();

  if (denylistFails) {
    denylist.isRevoked = mock.fn(async () => {
      throw new Error('Redis tidak dapat dihubungi');
    });
  }

  const logger = fakeLogger();

  return {
    middleware: new AuthenticateMiddleware({ users, denylist, tokens, logger }),
    users,
    denylist,
    tokens,
    logger,
  };
};

const fakeRequest = (authorization) => ({ headers: { authorization } });

const bearer = (tokens, userId) => `Bearer ${tokens.signAccessToken(userId).token}`;

test('AuthenticateMiddleware — header', async (t) => {
  await t.test('header tidak ada ditolak sebelum apa pun disentuh', async () => {
    // Pemeriksaan termurah lebih dulu: permintaan tanpa header sama sekali
    // tidak boleh memicu satu pun operasi baca ke Redis atau basis data.
    const { middleware, users, denylist } = buildMiddleware();

    const error = await captureError(() => middleware.handle(fakeRequest(undefined), {}, () => {}));

    assert.equal(error.statusCode, 401);
    assert.equal(denylist.isRevoked.mock.callCount(), 0);
    assert.equal(users.findById.mock.callCount(), 0);
  });

  await t.test('skema selain Bearer ditolak', async () => {
    const { middleware } = buildMiddleware();

    for (const header of ['Basic abc', 'bearer abc', 'abc', '']) {
      const error = await captureError(() => middleware.handle(fakeRequest(header), {}, () => {}));

      assert.equal(error.statusCode, 401, `header "${header}" seharusnya ditolak`);
    }
  });
});

test('AuthenticateMiddleware — token', async (t) => {
  await t.test('token kedaluwarsa dan token cacat dibedakan pesannya', async () => {
    // Pembedaan ini berguna bagi klien: "kedaluwarsa" berarti perbarui token,
    // "tidak valid" berarti ada yang salah pada permintaannya.
    const { middleware, tokens } = buildMiddleware();

    // TokenService uji yang sama, hanya masa berlakunya dibuat sudah lewat.
    // Menyusunnya sendiri di sini pernah membuat tes ini salah lulus: token
    // tanpa klaim iss/aud gagal dengan alasan LAIN, bukan karena kedaluwarsa.
    const kedaluwarsa = testTokenService({ accessTtlSeconds: -10 }).signAccessToken('u1').token;

    const errorBasi = await captureError(() =>
      middleware.handle(fakeRequest(`Bearer ${kedaluwarsa}`), {}, () => {})
    );
    const errorCacat = await captureError(() =>
      middleware.handle(fakeRequest('Bearer bukan-token'), {}, () => {})
    );

    assert.match(errorBasi.message, /kedaluwarsa/);
    assert.match(errorCacat.message, /tidak valid/);
    assert.equal(tokens.verifyAccessToken.length, 1);
  });

  await t.test('token yang sudah dicabut ditolak', async () => {
    const { middleware, tokens } = buildMiddleware({ revoked: true });

    const error = await captureError(() =>
      middleware.handle(fakeRequest(bearer(tokens, 'u1')), {}, () => {})
    );

    assert.equal(error.statusCode, 401);
    assert.match(error.message, /tidak berlaku/);
  });

  await t.test('Redis mati menghasilkan 503, bukan meloloskan permintaan', async () => {
    // Fail closed. Redis adalah satu-satunya sumber kebenaran untuk "token ini
    // sudah dicabut atau belum". Kalau tidak terbaca, kita TIDAK TAHU — dan
    // melanjutkan berarti menerima token yang mungkin sudah di-logout.
    const { middleware, tokens, users, logger } = buildMiddleware({ denylistFails: true });

    const error = await captureError(() =>
      middleware.handle(fakeRequest(bearer(tokens, 'u1')), {}, () => {})
    );

    assert.equal(error.statusCode, 503);
    assert.equal(
      users.findById.mock.callCount(),
      0,
      'tidak boleh lanjut ke pemeriksaan berikutnya'
    );

    // Kegagalannya WAJIB tercatat. 503 tanpa jejak di log berarti tidak ada
    // yang tahu Redis sedang bermasalah.
    assert.equal(logger.at('exception').length, 1);
  });
});

test('AuthenticateMiddleware — pengguna', async (t) => {
  await t.test('pengguna yang sudah dihapus ditolak meski tokennya masih sah', async () => {
    const { middleware, tokens } = buildMiddleware({ user: null });

    const error = await captureError(() =>
      middleware.handle(fakeRequest(bearer(tokens, 'u1')), {}, () => {})
    );

    assert.equal(error.statusCode, 401);
  });

  await t.test('akun nonaktif ditolak meski tokennya masih sah', async () => {
    // Inilah gunanya memeriksa basis data pada setiap permintaan: menonaktifkan
    // akun harus berlaku SEKARANG, bukan setelah token lamanya kedaluwarsa.
    const { middleware, tokens } = buildMiddleware({ user: fakeUser({ isActive: false }) });

    const error = await captureError(() =>
      middleware.handle(fakeRequest(bearer(tokens, 'u1')), {}, () => {})
    );

    assert.equal(error.statusCode, 401);
  });
});

test('AuthenticateMiddleware — waktu ganti password', async (t) => {
  await t.test('token yang terbit SEBELUM ganti password ditolak', async () => {
    const { middleware, tokens } = buildMiddleware({
      user: fakeUser({ passwordChangedAt: new Date(Date.now() + 60_000) }),
    });

    const error = await captureError(() =>
      middleware.handle(fakeRequest(bearer(tokens, 'u1')), {}, () => {})
    );

    assert.equal(error.statusCode, 401);
    assert.match(error.message, /Password telah diubah/);
  });

  await t.test('token yang terbit SETELAH ganti password diterima', async () => {
    const { middleware, tokens } = buildMiddleware({
      user: fakeUser({ passwordChangedAt: new Date(Date.now() - 60_000) }),
    });

    const req = fakeRequest(bearer(tokens, 'u1'));
    let lanjut = false;

    await middleware.handle(req, {}, () => {
      lanjut = true;
    });

    assert.equal(lanjut, true);
  });

  await t.test('pengguna yang belum pernah ganti password lolos pemeriksaan itu', async () => {
    const { middleware, tokens } = buildMiddleware({
      user: fakeUser({ passwordChangedAt: null }),
    });

    let lanjut = false;

    await middleware.handle(fakeRequest(bearer(tokens, 'u1')), {}, () => {
      lanjut = true;
    });

    assert.equal(lanjut, true);
  });
});

test('AuthenticateMiddleware — hasil akhir', async (t) => {
  await t.test('req diisi pengguna dan keterangan token, lalu next dipanggil', async () => {
    const user = fakeUser();
    const { middleware, tokens } = buildMiddleware({ user });

    const { token, jti } = tokens.signAccessToken(user.id);
    const req = fakeRequest(`Bearer ${token}`);
    const next = mock.fn();

    await middleware.handle(req, {}, next);

    assert.equal(req.user, user);
    assert.equal(req.token.id, jti, 'jti dipakai logout untuk mencabut token ini');
    assert.ok(req.token.expiresAt, 'exp dipakai menghitung masa simpan entri cabut');
    assert.equal(next.mock.callCount(), 1);
  });

  await t.test('spasi berlebih di sekitar token dimaafkan', async () => {
    const user = fakeUser();
    const { middleware, tokens } = buildMiddleware({ user });

    const req = fakeRequest(`Bearer   ${tokens.signAccessToken(user.id).token}   `);
    const next = mock.fn();

    await middleware.handle(req, {}, next);

    assert.equal(next.mock.callCount(), 1);
  });
});
