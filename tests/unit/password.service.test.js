const test = require('node:test');
const assert = require('node:assert/strict');

const { PasswordService } = require('../../src/modules/auth/password.service');
const {
  createLog,
  captureError,
  fakeUser,
  fakeUserRepository,
  fakeResetTokenRepository,
} = require('./fakes');

const PESAN_TOKEN_TIDAK_VALID = 'Token reset tidak valid atau sudah kedaluwarsa';

const buildService = ({ user = null, userId = null } = {}) => {
  const log = createLog();
  const users = fakeUserRepository({ user, log });
  const resetTokens = fakeResetTokenRepository({ userId, log });

  return { service: new PasswordService({ users, resetTokens }), users, resetTokens, log };
};

test('PasswordService.requestReset', async (t) => {
  await t.test('email tak terdaftar mengembalikan null, bukan melempar error', async () => {
    // Kalau ia melempar, controller akan membalas dengan status berbeda dan
    // endpoint ini bisa dipakai memeriksa apakah sebuah email terdaftar.
    const { service, resetTokens } = buildService({ user: null });

    const hasil = await service.requestReset({ email: 'asing@contoh.test' });

    assert.equal(hasil, null);
    assert.equal(resetTokens.save.mock.callCount(), 0, 'token tidak boleh dibuat');
  });

  await t.test('akun nonaktif juga mengembalikan null', async () => {
    const { service, resetTokens } = buildService({ user: fakeUser({ isActive: false }) });

    assert.equal(await service.requestReset({ email: 'orang@contoh.test' }), null);
    assert.equal(resetTokens.save.mock.callCount(), 0);
  });

  await t.test('email dinormalkan sebelum dicari', async () => {
    const { service, users } = buildService({ user: fakeUser() });

    await service.requestReset({ email: '  ORANG@Contoh.TEST ' });

    assert.equal(users.findByEmail.mock.calls[0].arguments[0], 'orang@contoh.test');
  });

  await t.test('token 32 byte acak disimpan dengan masa berlaku 15 menit', async () => {
    const user = fakeUser();
    const { service, resetTokens } = buildService({ user });

    const hasil = await service.requestReset({ email: user.email });

    const [token, userId, ttl] = resetTokens.save.mock.calls[0].arguments;

    // 32 byte dalam base64url tepat 43 karakter, tanpa karakter yang perlu
    // di-escape di dalam URL — penting karena token ini masuk ke tautan email.
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(userId, user.id);
    assert.equal(ttl, 15 * 60);
    assert.equal(hasil.resetToken, token, 'token yang dikirim harus sama dengan yang disimpan');
  });

  await t.test('dua permintaan menghasilkan token yang berbeda', async () => {
    const user = fakeUser();
    const { service } = buildService({ user });

    const pertama = await service.requestReset({ email: user.email });
    const kedua = await service.requestReset({ email: user.email });

    assert.notEqual(pertama.resetToken, kedua.resetToken);
  });
});

test('PasswordService.resetPassword', async (t) => {
  await t.test('password terlalu pendek ditolak sebelum Redis dibaca', async () => {
    const { service, resetTokens } = buildService({ userId: 'user-1' });

    const error = await captureError(() =>
      service.resetPassword({ token: 'token-apa-pun', newPassword: 'pendek' })
    );

    assert.equal(error.statusCode, 400);
    assert.match(error.message, /minimal 12 karakter/);
    assert.equal(
      resetTokens.findUserId.mock.callCount(),
      0,
      'permintaan yang pasti gagal tidak perlu membuang operasi baca'
    );
  });

  await t.test('password bukan string ditolak', async () => {
    const { service } = buildService({ userId: 'user-1' });

    const error = await captureError(() =>
      service.resetPassword({ token: 'token', newPassword: undefined })
    );

    assert.equal(error.statusCode, 400);
  });

  await t.test('token tidak dikenal dan akun nonaktif tidak dapat dibedakan', async () => {
    const tokenTidakAda = buildService({ userId: null });
    const akunNonaktif = buildService({
      userId: 'user-1',
      user: fakeUser({ isActive: false }),
    });

    const errorA = await captureError(() =>
      tokenTidakAda.service.resetPassword({ token: 'x', newPassword: 'PasswordBaru123' })
    );
    const errorB = await captureError(() =>
      akunNonaktif.service.resetPassword({ token: 'x', newPassword: 'PasswordBaru123' })
    );

    assert.equal(errorA.message, PESAN_TOKEN_TIDAK_VALID);
    assert.equal(errorB.message, PESAN_TOKEN_TIDAK_VALID);
    assert.equal(errorA.statusCode, 400);
    assert.equal(errorB.statusCode, 400);
  });

  await t.test('token milik akun nonaktif langsung dihapus', async () => {
    const { service, resetTokens } = buildService({
      userId: 'user-1',
      user: fakeUser({ isActive: false }),
    });

    await captureError(() =>
      service.resetPassword({ token: 'token-basi', newPassword: 'PasswordBaru123' })
    );

    assert.equal(resetTokens.remove.mock.callCount(), 1, 'token yang tidak berguna harus dibuang');
    assert.equal(resetTokens.remove.mock.calls[0].arguments[0], 'token-basi');
  });

  await t.test('password diserahkan apa adanya, hook model yang meng-hash', async () => {
    const user = fakeUser();
    const { service, users } = buildService({ userId: user.id, user });

    await service.resetPassword({ token: 'token-sah', newPassword: 'PasswordBaru123' });

    const [target, changes] = users.update.mock.calls[0].arguments;

    assert.equal(target, user, 'harus objek model, bukan id — hook hanya jalan pada instance');
    assert.deepEqual(changes, { passwordHash: 'PasswordBaru123' });
  });

  await t.test('password diubah lebih dulu, token dihapus kemudian', async () => {
    // Kalau urutannya dibalik dan pembaruan password gagal, token sudah lenyap
    // sementara password belum berubah. Pengguna terjebak dengan tautan mati.
    const user = fakeUser();
    const { service, log } = buildService({ userId: user.id, user });

    await service.resetPassword({ token: 'token-sah', newPassword: 'PasswordBaru123' });

    assert.deepEqual(log, [
      'resetTokens.findUserId',
      'users.findById',
      'users.update',
      'resetTokens.remove',
    ]);
  });

  await t.test('token bersifat sekali pakai', async () => {
    const user = fakeUser();
    const { service, resetTokens } = buildService({ userId: user.id, user });

    await service.resetPassword({ token: 'token-sah', newPassword: 'PasswordBaru123' });

    assert.equal(resetTokens.remove.mock.callCount(), 1);
    assert.equal(resetTokens.remove.mock.calls[0].arguments[0], 'token-sah');
  });

  await t.test('hash lama diminta agar hook pembanding perubahan bekerja', async () => {
    const user = fakeUser();
    const { service, users } = buildService({ userId: user.id, user });

    await service.resetPassword({ token: 'token-sah', newPassword: 'PasswordBaru123' });

    assert.deepEqual(users.findById.mock.calls[0].arguments[1], { includePassword: true });
  });
});
