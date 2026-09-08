const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { TokenService } = require('../../src/utils/token');

const SECRET = 'kunci-uji-yang-panjangnya-lebih-dari-32-karakter';
const ID_PENGGUNA = '11111111-1111-4111-8111-111111111111';

// Kunci dan masa berlaku masuk lewat constructor, bukan dari environment.
// Itulah yang membuat berkas ini dapat menguji beberapa konfigurasi sekaligus
// dalam satu proses — sebelumnya tidak mungkin.
const ISSUER = 'auth-service-uji';
const AUDIENCE = 'auth-service-uji-api';

const buildService = (overrides = {}) =>
  new TokenService({
    secret: SECRET,
    accessTtlSeconds: 900,
    opaqueBytes: 32,
    issuer: ISSUER,
    audience: AUDIENCE,
    ...overrides,
  });

test('TokenService.signAccessToken', async (t) => {
  await t.test('token memuat pemilik, penanda unik, dan masa berlaku', async () => {
    const tokens = buildService();
    const { token, jti } = tokens.signAccessToken(ID_PENGGUNA);
    const payload = tokens.verifyAccessToken(token);

    assert.equal(payload.sub, ID_PENGGUNA);
    assert.equal(payload.jti, jti);
    assert.ok(payload.iat, 'iat dipakai membandingkan waktu ganti password');
    assert.equal(payload.exp - payload.iat, 900, 'masa berlaku diambil dari constructor');
  });

  await t.test('masa berlaku benar-benar mengikuti yang disuntikkan', async () => {
    const { token } = buildService({ accessTtlSeconds: 60 }).signAccessToken(ID_PENGGUNA);
    const payload = jwt.decode(token);

    assert.equal(payload.exp - payload.iat, 60);
  });

  await t.test('setiap token punya jti yang berbeda', async () => {
    // jti adalah pegangan satu-satunya untuk mencabut token lewat logout.
    // Kalau ia berulang, mencabut satu token akan mencabut token lain juga.
    const tokens = buildService();
    const daftarJti = new Set();

    for (let i = 0; i < 50; i += 1) {
      daftarJti.add(tokens.signAccessToken(ID_PENGGUNA).jti);
    }

    assert.equal(daftarJti.size, 50);
  });

  await t.test('isi token dapat dibaca siapa saja — jadi tidak boleh berisi rahasia', async () => {
    // JWT hanya ditandatangani, bukan dienkripsi. Pengujian ini
    // mendokumentasikan kenyataan itu sekaligus memastikan tidak ada data
    // sensitif yang ikut terbawa.
    const { token } = buildService().signAccessToken(ID_PENGGUNA);
    const [, bagianIsi] = token.split('.');

    const isi = JSON.parse(Buffer.from(bagianIsi, 'base64url').toString('utf8'));

    assert.deepEqual(Object.keys(isi).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'sub']);
  });
});

test('TokenService.verifyAccessToken', async (t) => {
  await t.test('token yang isinya diubah ditolak', async () => {
    const tokens = buildService();
    const { token } = tokens.signAccessToken(ID_PENGGUNA);
    const [header, isi, tandaTangan] = token.split('.');

    const isiPalsu = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(isi, 'base64url').toString('utf8')),
        sub: 'orang-lain',
      })
    ).toString('base64url');

    assert.throws(() => tokens.verifyAccessToken(`${header}.${isiPalsu}.${tandaTangan}`));
  });

  await t.test('token yang ditandatangani kunci lain ditolak', async () => {
    const tokenAsing = jwt.sign({ jti: 'palsu' }, 'kunci-lain-yang-panjangnya-cukup-32-karakter', {
      subject: ID_PENGGUNA,
      expiresIn: '1h',
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    assert.throws(() => buildService().verifyAccessToken(tokenAsing), /invalid signature/);
  });

  await t.test('secret yang sama tetapi issuer berbeda DITOLAK', async () => {
    // Skenario nyata: dua layanan berbagi satu secret. Tanpa memeriksa iss,
    // token layanan sebelah lolos di sini apa adanya.
    const tokenLayananLain = jwt.sign({ jti: 'x' }, SECRET, {
      subject: ID_PENGGUNA,
      expiresIn: '1h',
      issuer: 'layanan-lain',
      audience: AUDIENCE,
    });

    assert.throws(() => buildService().verifyAccessToken(tokenLayananLain), /jwt issuer/);
  });

  await t.test('secret yang sama tetapi audience berbeda DITOLAK', async () => {
    // Sebaliknya: token milik layanan ini tidak boleh dipakai di tempat yang
    // bukan tujuannya.
    const tokenUntukPihakLain = jwt.sign({ jti: 'x' }, SECRET, {
      subject: ID_PENGGUNA,
      expiresIn: '1h',
      issuer: ISSUER,
      audience: 'aplikasi-lain',
    });

    assert.throws(() => buildService().verifyAccessToken(tokenUntukPihakLain), /jwt audience/);
  });

  await t.test('token tanpa iss dan aud sama sekali ditolak', async () => {
    // Token yang terbit SEBELUM klaim ini ditambahkan. Konsekuensinya
    // disengaja: seluruh access token lama mati, tetapi refresh token tidak
    // terpengaruh karena ia bukan JWT — jadi klien memperbarui sendiri dan
    // penggunanya tidak perlu login ulang.
    const tokenLama = jwt.sign({ jti: 'x' }, SECRET, {
      subject: ID_PENGGUNA,
      expiresIn: '1h',
    });

    assert.throws(() => buildService().verifyAccessToken(tokenLama));
  });

  await t.test('token yang sudah kedaluwarsa ditolak dengan nama error yang khas', async () => {
    // Nama error inilah yang dipakai middleware untuk membedakan pesan
    // "sudah kedaluwarsa" dari "tidak valid".
    const tokenBasi = jwt.sign({ jti: 'basi' }, SECRET, {
      subject: ID_PENGGUNA,
      expiresIn: '-1s',
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    assert.throws(() => buildService().verifyAccessToken(tokenBasi), {
      name: 'TokenExpiredError',
    });
  });

  await t.test('teks sembarang ditolak', async () => {
    const tokens = buildService();

    assert.throws(() => tokens.verifyAccessToken('bukan-token'));
    assert.throws(() => tokens.verifyAccessToken(''));
  });
});

test('TokenService.createOpaqueToken', async (t) => {
  await t.test('32 byte acak dalam base64url, aman untuk ditempel ke URL', async () => {
    const token = buildService().createOpaqueToken();

    // 32 byte tepat 43 karakter base64url, tanpa karakter yang perlu di-escape
    // di dalam URL — penting karena token reset dikirim lewat tautan email.
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });

  await t.test('panjangnya mengikuti yang disuntikkan', async () => {
    const token = buildService({ opaqueBytes: 64 }).createOpaqueToken();

    assert.equal(token.length, 86);
  });

  await t.test('tidak pernah berulang', async () => {
    const tokens = buildService();
    const daftar = new Set();

    for (let i = 0; i < 200; i += 1) {
      daftar.add(tokens.createOpaqueToken());
    }

    assert.equal(daftar.size, 200);
  });
});
