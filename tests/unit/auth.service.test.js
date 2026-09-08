const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { AuthService } = require('../../src/modules/auth/auth.service');
const {
  captureError,
  fakeUser,
  fakeUserRepository,
  fakeDenylistRepository,
  fakeRefreshTokenRepository,
  testTokenService,
  fakeLogger,
} = require('./fakes');

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const buildService = ({ user = null } = {}) => {
  const users = fakeUserRepository({ user });
  const denylist = fakeDenylistRepository();
  const refreshTokens = fakeRefreshTokenRepository();

  return {
    service: new AuthService({
      users,
      denylist,
      refreshTokens,
      tokens: testTokenService(),
      ttlSeconds: REFRESH_TTL_SECONDS,
      logger: fakeLogger(),
    }),
    users,
    denylist,
    refreshTokens,
  };
};

test('AuthService.login', async (t) => {
  await t.test('login yang benar mengembalikan token sah tanpa membocorkan hash', async () => {
    const user = fakeUser();
    const { service, users } = buildService({ user });

    const hasil = await service.login({
      email: 'orang@contoh.test',
      password: 'PasswordBenar123',
    });

    const payload = testTokenService().verifyAccessToken(hasil.token);

    assert.equal(payload.sub, user.id, 'subject token harus id pengguna');
    assert.ok(payload.jti, 'token wajib punya jti untuk keperluan pencabutan');
    assert.equal(hasil.user.passwordHash, undefined, 'hash password tidak boleh ikut keluar');
    assert.equal(hasil.user.email, user.email);
    assert.equal(users.update.mock.callCount(), 1);
    assert.ok(
      users.update.mock.calls[0].arguments[1].lastLoginAt instanceof Date,
      'lastLoginAt harus dicatat saat login berhasil'
    );
  });

  await t.test('email dinormalkan sebelum dicari, dan hash sengaja diminta', async () => {
    const { service, users } = buildService({ user: fakeUser() });

    await service.login({ email: '   ORANG@Contoh.TEST  ', password: 'apa saja' });

    const [emailDicari, opsi] = users.findByEmail.mock.calls[0].arguments;

    assert.equal(emailDicari, 'orang@contoh.test');
    assert.deepEqual(opsi, { includePassword: true }, 'tanpa opsi ini hash tidak terbaca');
  });

  await t.test('email tak terdaftar dan password salah menghasilkan jawaban identik', async () => {
    // Kalau kedua pesan berbeda, endpoint ini dapat dipakai memeriksa satu per
    // satu email mana yang terdaftar di sistem.
    const tidakTerdaftar = buildService({ user: null }).service;
    const passwordSalah = buildService({
      user: fakeUser({ comparePassword: mock.fn(async () => false) }),
    }).service;

    const errorA = await captureError(() =>
      tidakTerdaftar.login({ email: 'asing@contoh.test', password: 'apa pun' })
    );
    const errorB = await captureError(() =>
      passwordSalah.login({ email: 'orang@contoh.test', password: 'salah' })
    );

    assert.equal(errorA.message, errorB.message);
    assert.equal(errorA.statusCode, 401);
    assert.equal(errorB.statusCode, 401);
  });

  await t.test('email tak terdaftar tetap memakan waktu perbandingan bcrypt', async () => {
    // Tanpa perbandingan tiruan itu, jalur "email tidak ada" selesai dalam
    // waktu di bawah satu milidetik sementara jalur "email ada" memakan lebih
    // dari seratus milidetik. Selisih itu sendiri sudah membocorkan email mana
    // yang terdaftar, tanpa perlu melihat isi jawabannya.
    //
    // Ambang batasnya dibuat longgar: bcrypt dengan cost 12 jauh di atas 10 ms
    // pada mesin apa pun, sedangkan jalur tanpa bcrypt jauh di bawahnya.
    const { service } = buildService({ user: null });

    const mulai = process.hrtime.bigint();
    await captureError(() => service.login({ email: 'asing@contoh.test', password: 'x' }));
    const durasiMs = Number(process.hrtime.bigint() - mulai) / 1e6;

    assert.ok(
      durasiMs >= 10,
      `jalur email tak terdaftar hanya ${durasiMs.toFixed(1)} ms — perbandingan tiruan hilang`
    );
  });

  await t.test('akun nonaktif dengan password salah tetap 401, bukan 403', async () => {
    // Ini pembuktian urutannya. Kalau status aktif diperiksa sebelum password,
    // jawabannya menjadi 403 — dan 403 mengonfirmasi bahwa email itu terdaftar.
    const { service } = buildService({
      user: fakeUser({ isActive: false, comparePassword: mock.fn(async () => false) }),
    });

    const error = await captureError(() =>
      service.login({ email: 'orang@contoh.test', password: 'salah' })
    );

    assert.equal(error.statusCode, 401);
  });

  await t.test('akun nonaktif dengan password benar menghasilkan 403', async () => {
    const { service, users } = buildService({ user: fakeUser({ isActive: false }) });

    const error = await captureError(() =>
      service.login({ email: 'orang@contoh.test', password: 'PasswordBenar123' })
    );

    assert.equal(error.statusCode, 403);
    assert.match(error.message, /tidak aktif/i);
    assert.equal(users.update.mock.callCount(), 0, 'login gagal tidak boleh mencatat lastLoginAt');
  });
});

test('AuthService.logout', async (t) => {
  await t.test('masa simpan entri cabut sepanjang sisa umur token', async () => {
    // Kalau masa simpannya lebih pendek dari sisa umur token, token yang sudah
    // di-logout akan berlaku kembali begitu entrinya hilang dari Redis.
    const { service, denylist } = buildService();
    const kedaluwarsa = Math.floor(Date.now() / 1000) + 600;

    await service.logout({ tokenId: 'jti-abc', expiresAt: kedaluwarsa });

    const [tokenId, ttl] = denylist.revoke.mock.calls[0].arguments;

    assert.equal(tokenId, 'jti-abc');
    assert.ok(ttl > 595 && ttl <= 600, `ttl ${ttl} tidak sepadan dengan sisa umur token`);
  });
});

test('AuthService.getProfile', async (t) => {
  await t.test('pengguna tidak ditemukan menghasilkan 404', async () => {
    const { service } = buildService({ user: null });

    const error = await captureError(() => service.getProfile('id-yang-tidak-ada'));

    assert.equal(error.statusCode, 404);
  });

  await t.test('role diminta lengkap agar antarmuka dapat menampilkannya', async () => {
    const user = fakeUser();
    const { service, users } = buildService({ user });

    const hasil = await service.getProfile(user.id);

    assert.equal(hasil, user);
    assert.deepEqual(users.findById.mock.calls[0].arguments[1], {
      includeRoles: true,
      detailedRoles: true,
    });
  });
});
