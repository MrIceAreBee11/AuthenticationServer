const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { AuthService } = require('../../src/modules/auth/auth.service');
const {
  createLog,
  captureError,
  fakeUser,
  fakeUserRepository,
  fakeDenylistRepository,
  fakeRefreshTokenRow,
  fakeRefreshTokenRepository,
  silenceErrorLog,
  testTokenService,
  testPasswordPolicy,
} = require('./fakes');

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

const PESAN_TIDAK_VALID = 'Refresh token tidak valid. Silakan login kembali.';

/** console.warn dibungkam karena deteksi pemakaian ulang sengaja mencatatnya. */
const silenceWarnLog = () => mock.method(console, 'warn', () => {});

const buildService = ({ user = null, row = null } = {}) => {
  const log = createLog();
  const users = fakeUserRepository({ user, log });
  const refreshTokens = fakeRefreshTokenRepository({ row, log });
  const denylist = fakeDenylistRepository({ log });

  return {
    service: new AuthService({
      users,
      denylist,
      refreshTokens,
      tokens: testTokenService(),
      ttlSeconds: REFRESH_TTL_SECONDS,
    }),
    users,
    refreshTokens,
    denylist,
    log,
  };
};

test('AuthService.login — penerbitan refresh token', async (t) => {
  await t.test('login mengembalikan access token dan refresh token sekaligus', async () => {
    const user = fakeUser();
    const { service, refreshTokens } = buildService({ user });

    const hasil = await service.login({ email: user.email, password: 'benar' });

    assert.ok(hasil.token, 'access token wajib ada');
    assert.match(hasil.refreshToken, /^[A-Za-z0-9_-]{43}$/, '32 byte acak dalam base64url');
    assert.equal(refreshTokens.create.mock.callCount(), 1);
  });

  await t.test('yang diserahkan ke penyimpanan adalah token asli, hash urusan repository', async () => {
    const user = fakeUser();
    const { service, refreshTokens } = buildService({ user });

    const hasil = await service.login({ email: user.email, password: 'benar' });
    const [data] = refreshTokens.create.mock.calls[0].arguments;

    assert.equal(data.plainToken, hasil.refreshToken);
    assert.equal(data.userId, user.id);
    assert.ok(data.familyId, 'setiap login memulai rangkaian sesi baru');
    assert.ok(data.expiresAt instanceof Date);
  });

  await t.test('masa berlaku diambil dari REFRESH_TOKEN_EXPIRES_IN', async () => {
    const user = fakeUser();
    const { service, refreshTokens } = buildService({ user });

    await service.login({ email: user.email, password: 'benar' });

    const { expiresAt } = refreshTokens.create.mock.calls[0].arguments[0];
    const selisihHari = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    // .env.unit memasang 7d
    assert.ok(selisihHari > 6.99 && selisihHari <= 7, `selisih ${selisihHari} hari tidak sesuai`);
  });

  await t.test('dua login menghasilkan rangkaian sesi yang berbeda', async () => {
    // Ini yang membuat logout di satu perangkat tidak menyentuh perangkat lain.
    const user = fakeUser();
    const { service, refreshTokens } = buildService({ user });

    await service.login({ email: user.email, password: 'benar' });
    await service.login({ email: user.email, password: 'benar' });

    const [pertama, kedua] = refreshTokens.create.mock.calls.map(
      (panggilan) => panggilan.arguments[0].familyId
    );

    assert.notEqual(pertama, kedua);
  });

  await t.test('baris kedaluwarsa dibersihkan saat login', async () => {
    const user = fakeUser();
    const { service, refreshTokens } = buildService({ user });

    await service.login({ email: user.email, password: 'benar' });

    assert.equal(refreshTokens.deleteExpired.mock.callCount(), 1);
    assert.equal(refreshTokens.deleteExpired.mock.calls[0].arguments[0], user.id);
  });

  await t.test('login gagal tidak menerbitkan refresh token', async () => {
    const { service, refreshTokens } = buildService({
      user: fakeUser({ comparePassword: mock.fn(async () => false) }),
    });

    await captureError(() => service.login({ email: 'orang@contoh.test', password: 'salah' }));

    assert.equal(refreshTokens.create.mock.callCount(), 0);
  });
});

test('AuthService.refresh — rotasi', async (t) => {
  await t.test('token yang sah ditukar dengan sepasang token baru', async () => {
    const user = fakeUser();
    const row = fakeRefreshTokenRow({ userId: user.id });
    const { service, refreshTokens } = buildService({ user, row });

    const hasil = await service.refresh({ refreshToken: 'token-lama' });

    assert.equal(testTokenService().verifyAccessToken(hasil.token).sub, user.id);
    assert.match(hasil.refreshToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(hasil.refreshToken, 'token-lama');
    assert.equal(hasil.user.passwordHash, undefined);
    assert.equal(refreshTokens.revoke.mock.callCount(), 1, 'yang lama wajib dicabut');
  });

  await t.test('pengganti mewarisi rangkaian sesi yang sama', async () => {
    // Kalau rotasi memulai rangkaian baru, seluruh riwayat sesi itu terputus
    // dan deteksi pemakaian ulang kehilangan jangkauannya.
    const user = fakeUser();
    const row = fakeRefreshTokenRow({ userId: user.id, familyId: 'keluarga-abc' });
    const { service, refreshTokens } = buildService({ user, row });

    await service.refresh({ refreshToken: 'token-lama' });

    assert.equal(refreshTokens.create.mock.calls[0].arguments[0].familyId, 'keluarga-abc');
  });

  await t.test('yang lama dicabut sebelum penggantinya dibuat', async () => {
    // Kalau urutannya dibalik dan pencabutan gagal, dua token dalam satu
    // rangkaian sama-sama berlaku dan deteksi pemakaian ulang berhenti bekerja.
    const user = fakeUser();
    const row = fakeRefreshTokenRow({ userId: user.id });
    const { service, log } = buildService({ user, row });

    await service.refresh({ refreshToken: 'token-lama' });

    const urutan = log.filter((nama) => nama.startsWith('refreshTokens.'));

    assert.deepEqual(urutan, [
      'refreshTokens.findByToken',
      'refreshTokens.revoke',
      'refreshTokens.create',
      'refreshTokens.deleteExpired',
    ]);
  });

  await t.test('refresh token wajib diisi', async () => {
    const { service, refreshTokens } = buildService();

    for (const buruk of [undefined, null, '', '   ', 123, {}]) {
      const error = await captureError(() => service.refresh({ refreshToken: buruk }));

      assert.equal(error.statusCode, 400, `nilai ${JSON.stringify(buruk)} seharusnya ditolak`);
    }

    assert.equal(refreshTokens.findByToken.mock.callCount(), 0);
  });
});

test('AuthService.refresh — deteksi pemakaian ulang', async (t) => {
  await t.test('token yang sudah dicabut mencabut seluruh rangkaiannya', async (subtest) => {
    subtest.mock.restoreAll();
    silenceWarnLog();

    // Pada pemakaian normal ini tidak mungkin terjadi: klien membuang token
    // lamanya begitu menerima yang baru. Jadi kemunculannya berarti ada
    // salinan token itu di tangan orang lain.
    const user = fakeUser();
    const row = fakeRefreshTokenRow({
      userId: user.id,
      familyId: 'keluarga-abc',
      revokedAt: new Date(),
    });
    const { service, refreshTokens } = buildService({ user, row });

    const error = await captureError(() => service.refresh({ refreshToken: 'token-basi' }));

    assert.equal(error.statusCode, 401);
    assert.equal(error.message, PESAN_TIDAK_VALID);
    assert.equal(refreshTokens.revokeFamily.mock.callCount(), 1);
    assert.equal(refreshTokens.revokeFamily.mock.calls[0].arguments[0], 'keluarga-abc');
    assert.equal(
      refreshTokens.create.mock.callCount(),
      0,
      'tidak ada token baru yang boleh terbit'
    );
  });

  await t.test('hanya rangkaian itu yang dicabut, bukan seluruh sesi pengguna', async (subtest) => {
    subtest.mock.restoreAll();
    silenceWarnLog();

    // Mencabut semuanya berarti pengguna ikut terlempar keluar dari perangkat
    // lain yang tidak ada hubungannya dengan pencurian ini.
    const user = fakeUser();
    const row = fakeRefreshTokenRow({ userId: user.id, revokedAt: new Date() });
    const { service, refreshTokens } = buildService({ user, row });

    await captureError(() => service.refresh({ refreshToken: 'token-basi' }));

    assert.equal(refreshTokens.revokeAllForUser.mock.callCount(), 0);
  });

  await t.test('kejadiannya dicatat ke log agar dapat ditelusuri', async (subtest) => {
    subtest.mock.restoreAll();
    const warn = silenceWarnLog();

    const user = fakeUser();
    const row = fakeRefreshTokenRow({ userId: user.id, revokedAt: new Date() });
    const { service } = buildService({ user, row });

    await captureError(() => service.refresh({ refreshToken: 'token-basi' }));

    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /dipakai ulang/);
  });
});

test('AuthService.refresh — penolakan lainnya', async (t) => {
  await t.test('token tak dikenal ditolak dengan pesan yang sama', async () => {
    const { service } = buildService({ row: null });

    const error = await captureError(() => service.refresh({ refreshToken: 'token-asing' }));

    assert.equal(error.statusCode, 401);
    assert.equal(error.message, PESAN_TIDAK_VALID);
  });

  await t.test('token kedaluwarsa ditolak tanpa mencabut apa pun', async () => {
    const user = fakeUser();
    const row = fakeRefreshTokenRow({
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    const { service, refreshTokens } = buildService({ user, row });

    const error = await captureError(() => service.refresh({ refreshToken: 'token-basi' }));

    assert.equal(error.statusCode, 401);
    assert.match(error.message, /sudah berakhir/);

    // Kedaluwarsa bukan tanda pencurian, jadi tidak ada alasan mencabut
    // rangkaiannya — barisnya akan dibuang sendiri oleh pembersihan berkala.
    assert.equal(refreshTokens.revokeFamily.mock.callCount(), 0);
  });

  await t.test('akun yang sudah dinonaktifkan tidak dapat memperbarui token', async () => {
    const user = fakeUser({ isActive: false });
    const row = fakeRefreshTokenRow({ userId: user.id });
    const { service, refreshTokens } = buildService({ user, row });

    const error = await captureError(() => service.refresh({ refreshToken: 'token-sah' }));

    assert.equal(error.statusCode, 401);
    assert.equal(refreshTokens.revokeFamily.mock.callCount(), 1, 'sesinya sekalian dibersihkan');
    assert.equal(refreshTokens.create.mock.callCount(), 0);
  });

  await t.test('akun yang sudah dihapus juga ditolak', async () => {
    const row = fakeRefreshTokenRow();
    const { service } = buildService({ user: null, row });

    const error = await captureError(() => service.refresh({ refreshToken: 'token-sah' }));

    assert.equal(error.statusCode, 401);
    assert.equal(error.message, PESAN_TIDAK_VALID);
  });
});

test('AuthService.logout — mencabut dua jenis token', async (t) => {
  const kedaluwarsaAccess = () => Math.floor(Date.now() / 1000) + 600;

  await t.test('tanpa refresh token, hanya access token yang dicabut', async () => {
    const { service, denylist, refreshTokens } = buildService();

    await service.logout({ tokenId: 'jti-1', expiresAt: kedaluwarsaAccess(), userId: 'u1' });

    assert.equal(denylist.revoke.mock.callCount(), 1);
    assert.equal(refreshTokens.findByToken.mock.callCount(), 0);
  });

  await t.test('dengan refresh token, rangkaian sesinya ikut dicabut', async () => {
    const row = fakeRefreshTokenRow({ userId: 'u1', familyId: 'keluarga-abc' });
    const { service, denylist, refreshTokens } = buildService({ row });

    await service.logout({
      tokenId: 'jti-1',
      expiresAt: kedaluwarsaAccess(),
      refreshToken: 'token-saya',
      userId: 'u1',
    });

    assert.equal(denylist.revoke.mock.callCount(), 1);
    assert.equal(refreshTokens.revokeFamily.mock.calls[0].arguments[0], 'keluarga-abc');
  });

  await t.test('refresh token milik orang lain diabaikan, bukan dicabut', async () => {
    // Tanpa pemeriksaan kepemilikan, siapa pun yang memegang refresh token
    // orang lain dapat mencabut sesi orang tersebut lewat logout miliknya.
    const row = fakeRefreshTokenRow({ userId: 'korban', familyId: 'keluarga-korban' });
    const { service, denylist, refreshTokens } = buildService({ row });

    await service.logout({
      tokenId: 'jti-1',
      expiresAt: kedaluwarsaAccess(),
      refreshToken: 'token-orang-lain',
      userId: 'penyerang',
    });

    assert.equal(refreshTokens.revokeFamily.mock.callCount(), 0);
    assert.equal(denylist.revoke.mock.callCount(), 1, 'logout-nya sendiri tetap berhasil');
  });

  await t.test('refresh token yang tidak dikenal tidak menggagalkan logout', async () => {
    const { service, denylist } = buildService({ row: null });

    await service.logout({
      tokenId: 'jti-1',
      expiresAt: kedaluwarsaAccess(),
      refreshToken: 'token-asal',
      userId: 'u1',
    });

    assert.equal(denylist.revoke.mock.callCount(), 1);
  });
});

test('PasswordService — reset password mencabut seluruh sesi', async (t) => {
  const { PasswordService } = require('../../src/modules/auth/password.service');
  const { fakeResetTokenRepository } = require('./fakes');

  await t.test('seluruh refresh token pengguna dicabut, bukan hanya satu rangkaian', async () => {
    // Ganti password harus mengeluarkan pihak yang mungkin sudah masuk tanpa
    // hak — dan pihak itu bisa berada di rangkaian sesi mana pun.
    const user = fakeUser();
    const log = createLog();
    const users = fakeUserRepository({ user, log });
    const resetTokens = fakeResetTokenRepository({ userId: user.id, log });
    const refreshTokens = fakeRefreshTokenRepository({ log });

    const service = new PasswordService({
      users,
      resetTokens,
      refreshTokens,
      tokens: testTokenService(),
      policy: testPasswordPolicy(),
    });

    await service.resetPassword({ token: 'token-sah', newPassword: 'PasswordBaru123' });

    assert.equal(refreshTokens.revokeAllForUser.mock.callCount(), 1);
    assert.equal(refreshTokens.revokeAllForUser.mock.calls[0].arguments[0], user.id);
  });

  await t.test('pencabutan terjadi setelah password diubah, sebelum token reset dibuang', async () => {
    const user = fakeUser();
    const log = createLog();
    const users = fakeUserRepository({ user, log });
    const resetTokens = fakeResetTokenRepository({ userId: user.id, log });
    const refreshTokens = fakeRefreshTokenRepository({ log });

    const service = new PasswordService({
      users,
      resetTokens,
      refreshTokens,
      tokens: testTokenService(),
      policy: testPasswordPolicy(),
    });

    await service.resetPassword({ token: 'token-sah', newPassword: 'PasswordBaru123' });

    assert.deepEqual(log, [
      'resetTokens.findUserId',
      'users.findById',
      'users.update',
      'refreshTokens.revokeAllForUser',
      'resetTokens.remove',
    ]);
  });

  await t.test('reset yang gagal tidak mencabut sesi siapa pun', async (subtest) => {
    subtest.mock.restoreAll();
    silenceErrorLog();

    const log = createLog();
    const refreshTokens = fakeRefreshTokenRepository({ log });
    const service = new PasswordService({
      users: fakeUserRepository({ user: null, log }),
      resetTokens: fakeResetTokenRepository({ userId: null, log }),
      refreshTokens,
    });

    await captureError(() =>
      service.resetPassword({ token: 'token-asing', newPassword: 'PasswordBaru123' })
    );

    assert.equal(refreshTokens.revokeAllForUser.mock.callCount(), 0);
  });
});
