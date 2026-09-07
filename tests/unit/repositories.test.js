const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PasswordResetTokenRepository,
} = require('../../src/repositories/passwordResetToken.repository');
const {
  TokenDenylistRepository,
} = require('../../src/repositories/tokenDenylist.repository');
const { fakeCache } = require('./fakes');

test('PasswordResetTokenRepository', async (t) => {
  await t.test('yang disimpan adalah hash token, bukan tokennya', async () => {
    // Kalau isi Redis bocor, pemegangnya tidak boleh dapat menyusun kembali
    // token asli lalu memakainya untuk mengganti password orang lain.
    const cache = fakeCache();
    const repo = new PasswordResetTokenRepository(cache);

    await repo.save('token-rahasia-milik-pengguna', 'user-1', 900);

    const [kunci] = [...cache.store.keys()];

    assert.ok(
      !kunci.includes('token-rahasia-milik-pengguna'),
      'token asli tidak boleh muncul di kunci Redis'
    );
    assert.match(kunci, /^password-reset:[0-9a-f]{64}$/, 'kunci harus SHA-256 heksadesimal');
  });

  await t.test('token yang sama menemukan kembali pemiliknya', async () => {
    const repo = new PasswordResetTokenRepository(fakeCache());

    await repo.save('token-abc', 'user-1', 900);

    assert.equal(await repo.findUserId('token-abc'), 'user-1');
  });

  await t.test('token lain tidak menemukan apa pun', async () => {
    const repo = new PasswordResetTokenRepository(fakeCache());

    await repo.save('token-abc', 'user-1', 900);

    assert.equal(await repo.findUserId('token-xyz'), null);
  });

  await t.test('masa berlaku diteruskan ke Redis', async () => {
    const cache = fakeCache();
    const repo = new PasswordResetTokenRepository(cache);

    await repo.save('token-abc', 'user-1', 900);

    assert.deepEqual(cache.set.mock.calls[0].arguments[2], { EX: 900 });
  });

  await t.test('penghapusan memakai kunci hash yang sama', async () => {
    const cache = fakeCache();
    const repo = new PasswordResetTokenRepository(cache);

    await repo.save('token-abc', 'user-1', 900);
    await repo.remove('token-abc');

    assert.equal(cache.store.size, 0);
    assert.equal(await repo.findUserId('token-abc'), null);
  });
});

test('TokenDenylistRepository', async (t) => {
  await t.test('pencabutan dan pemeriksaan memakai kunci yang sama', async () => {
    // Awalan kunci ini sebelumnya ditulis di dua berkas terpisah. Kalau salah
    // satu berbeda, token yang sudah di-logout tetap diterima tanpa error.
    const repo = new TokenDenylistRepository(fakeCache());

    assert.equal(await repo.isRevoked('jti-abc'), false);

    await repo.revoke('jti-abc', 600);

    assert.equal(await repo.isRevoked('jti-abc'), true);
    assert.equal(await repo.isRevoked('jti-lain'), false);
  });

  await t.test('masa simpan diteruskan ke Redis', async () => {
    const cache = fakeCache();
    const repo = new TokenDenylistRepository(cache);

    await repo.revoke('jti-abc', 600);

    assert.deepEqual(cache.set.mock.calls[0].arguments[2], { EX: 600 });
  });

  await t.test('token yang sudah kedaluwarsa tidak perlu dicatat', async () => {
    // Redis menolak masa simpan nol atau negatif. Tanpa penjagaan ini, logout
    // atas token yang sudah kedaluwarsa akan menghasilkan error 500 — padahal
    // tokennya memang sudah tidak berlaku.
    const cache = fakeCache();
    const repo = new TokenDenylistRepository(cache);

    await repo.revoke('jti-lewat', 0);
    await repo.revoke('jti-lewat-jauh', -120);

    assert.equal(cache.set.mock.callCount(), 0);
    assert.equal(cache.store.size, 0);
  });
});
