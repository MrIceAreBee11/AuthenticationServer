const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { signAccessToken, verifyAccessToken } = require('../../src/utils/token');

const ID_PENGGUNA = '11111111-1111-4111-8111-111111111111';

test('signAccessToken', async (t) => {
  await t.test('token memuat pemilik, penanda unik, dan masa berlaku', async () => {
    const { token, jti } = signAccessToken(ID_PENGGUNA);
    const payload = verifyAccessToken(token);

    assert.equal(payload.sub, ID_PENGGUNA);
    assert.equal(payload.jti, jti);
    assert.ok(payload.iat, 'iat dipakai membandingkan waktu ganti password');
    assert.ok(payload.exp > payload.iat, 'token wajib punya batas waktu');
  });

  await t.test('setiap token punya jti yang berbeda', async () => {
    // jti adalah pegangan satu-satunya untuk mencabut token lewat logout.
    // Kalau ia berulang, mencabut satu token akan mencabut token lain juga.
    const daftarJti = new Set();

    for (let i = 0; i < 50; i += 1) {
      daftarJti.add(signAccessToken(ID_PENGGUNA).jti);
    }

    assert.equal(daftarJti.size, 50);
  });

  await t.test('isi token dapat dibaca siapa saja — jadi tidak boleh berisi rahasia', async () => {
    // JWT hanya ditandatangani, bukan dienkripsi. Pengujian ini mendokumentasi-
    // kan kenyataan itu sekaligus memastikan tidak ada data sensitif yang ikut.
    const { token } = signAccessToken(ID_PENGGUNA);
    const [, bagianIsi] = token.split('.');

    const isi = JSON.parse(Buffer.from(bagianIsi, 'base64url').toString('utf8'));

    assert.deepEqual(Object.keys(isi).sort(), ['exp', 'iat', 'jti', 'sub']);
  });
});

test('verifyAccessToken', async (t) => {
  await t.test('token yang isinya diubah ditolak', async () => {
    const { token } = signAccessToken(ID_PENGGUNA);
    const [header, isi, tandaTangan] = token.split('.');

    const isiPalsu = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(isi, 'base64url').toString('utf8')), sub: 'orang-lain' })
    ).toString('base64url');

    assert.throws(() => verifyAccessToken(`${header}.${isiPalsu}.${tandaTangan}`));
  });

  await t.test('token yang ditandatangani kunci lain ditolak', async () => {
    const tokenAsing = jwt.sign({ jti: 'palsu' }, 'kunci-lain-yang-panjangnya-cukup-32-karakter', {
      subject: ID_PENGGUNA,
      expiresIn: '1h',
    });

    assert.throws(() => verifyAccessToken(tokenAsing), /invalid signature/);
  });

  await t.test('token yang sudah kedaluwarsa ditolak dengan nama error yang khas', async () => {
    // Nama error inilah yang dipakai middleware untuk membedakan pesan
    // "sudah kedaluwarsa" dari "tidak valid".
    const tokenBasi = jwt.sign({ jti: 'basi' }, process.env.JWT_SECRET, {
      subject: ID_PENGGUNA,
      expiresIn: '-1s',
    });

    assert.throws(() => verifyAccessToken(tokenBasi), { name: 'TokenExpiredError' });
  });

  await t.test('teks sembarang ditolak', async () => {
    assert.throws(() => verifyAccessToken('bukan-token'));
    assert.throws(() => verifyAccessToken(''));
  });
});
