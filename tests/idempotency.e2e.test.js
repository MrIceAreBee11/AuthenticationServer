const test = require('node:test');
const assert = require('node:assert/strict');

// Container dirakit di sini, sama seperti yang dilakukan server.js. Pengujian
// end-to-end memang harus memakai perakitan yang sungguhan — kalau ia memakai
// susunan sendiri, yang diuji bukan aplikasi yang benar-benar dijalankan.
const { config } = require('../src/config');
const { Container } = require('../src/container');
const { createApp } = require('../src/app');

const container = new Container(config);
const app = createApp(container, config);

let server;
let baseUrl;
let accessToken;

const createdUserIds = new Set();
const createdRoleIds = new Set();

const call = async (path, { method = 'GET', token, body, idempotencyKey } = {}) => {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: response.status,
    replay: response.headers.get('idempotent-replay'),
    body: await response.json().catch(() => ({})),
  };
};

/** Lihat catatan yang sama di tests/rbac.e2e.test.js. */
const resetRateLimiter = async () => {
  const keys = await container.cache.keys('ratelimit:*');

  if (keys.length > 0) {
    await container.cache.del(keys);
  }
};

/**
 * Kunci idempotensi dari jalannya pengujian sebelumnya dibersihkan.
 *
 * Masa berlakunya 24 jam, jadi tanpa ini menjalankan berkas ini dua kali dalam
 * satu hari akan membuat permintaan "pertama" langsung menerima jawaban
 * tersimpan dari kemarin — dan datanya sudah dihapus.
 */
const resetIdempotencyKeys = async () => {
  const keys = await container.cache.keys('idem:*');

  if (keys.length > 0) {
    await container.cache.del(keys);
  }
};

const kunci = (nama) => `uji-${nama}-${Date.now()}`;

test.before(async () => {
  await container.connect();
  await resetRateLimiter();
  await resetIdempotencyKeys();

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  const login = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    },
  });

  accessToken = login.body.data.token;
});

test.after(async () => {
  for (const id of createdUserIds) {
    await call(`/users/${id}`, { method: 'DELETE', token: accessToken }).catch(() => {});
  }

  for (const id of createdRoleIds) {
    await call(`/roles/${id}`, { method: 'DELETE', token: accessToken }).catch(() => {});
  }

  await new Promise((resolve) => server.close(resolve));
  await container.close();
});

test('permintaan ulang dengan kunci sama menerima 201 yang asli, bukan 409', async () => {
  // Inilah alasan fitur ini ada. Tanpanya, klien yang mengirim ulang karena
  // jawaban pertama tidak sampai akan menerima 409 "email sudah digunakan" —
  // tampak gagal padahal akunnya sudah terbuat.
  const key = kunci('ulang');
  const email = `idem-${Date.now()}@uji.test`;
  const body = {
    email,
    password: 'RahasiaPanjangSekali123',
    fullName: 'Pengguna Idempotensi',
  };

  const pertama = await call('/users', {
    method: 'POST',
    token: accessToken,
    body,
    idempotencyKey: key,
  });

  assert.equal(pertama.status, 201);
  createdUserIds.add(pertama.body.data.user.id);

  const kedua = await call('/users', {
    method: 'POST',
    token: accessToken,
    body,
    idempotencyKey: key,
  });

  assert.equal(kedua.status, 201);
  assert.equal(kedua.replay, 'true');
  assert.equal(kedua.body.data.user.id, pertama.body.data.user.id);
});

test('tanpa kunci, permintaan ulang tetap dijawab 409 seperti sebelumnya', async () => {
  // Membuktikan bahwa fiturnya opsional dan tidak mengubah perilaku klien
  // yang tidak mengirim header.
  const email = `idem-tanpa-kunci-${Date.now()}@uji.test`;
  const body = {
    email,
    password: 'RahasiaPanjangSekali123',
    fullName: 'Tanpa Kunci',
  };

  const pertama = await call('/users', { method: 'POST', token: accessToken, body });

  assert.equal(pertama.status, 201);
  assert.equal(pertama.replay, null);
  createdUserIds.add(pertama.body.data.user.id);

  const kedua = await call('/users', { method: 'POST', token: accessToken, body });

  assert.equal(kedua.status, 409);
});

test('kunci sama dengan isi berbeda tetap mengembalikan jawaban yang pertama', async () => {
  // Perilaku yang dipilih: kuncinya yang menentukan, bukan isinya. Klien yang
  // memakai ulang kunci untuk data lain sedang salah pakai, dan menerima
  // jawaban lama jauh lebih aman daripada dua akun terbuat dari satu kunci.
  const key = kunci('isi-beda');
  const build = (nomor) => ({
    email: `idem-beda-${nomor}-${Date.now()}@uji.test`,
    password: 'RahasiaPanjangSekali123',
    fullName: `Isi Berbeda ${nomor}`,
  });

  const pertama = await call('/users', {
    method: 'POST',
    token: accessToken,
    body: build(1),
    idempotencyKey: key,
  });

  assert.equal(pertama.status, 201);
  createdUserIds.add(pertama.body.data.user.id);

  const kedua = await call('/users', {
    method: 'POST',
    token: accessToken,
    body: build(2),
    idempotencyKey: key,
  });

  assert.equal(kedua.body.data.user.id, pertama.body.data.user.id);
});

test('dua permintaan serentak dengan kunci sama hanya membuat satu data', async () => {
  // Skenario nyatanya adalah klien yang mengirim ulang sebelum jawaban
  // pertama tiba. Tanpa pemesanan atomik, keduanya lolos ke database dan
  // yang kedua gagal pada kendala unik — 500 yang tidak perlu.
  const key = kunci('serentak');
  const body = {
    email: `idem-serentak-${Date.now()}@uji.test`,
    password: 'RahasiaPanjangSekali123',
    fullName: 'Serentak',
  };

  const hasil = await Promise.all([
    call('/users', { method: 'POST', token: accessToken, body, idempotencyKey: key }),
    call('/users', { method: 'POST', token: accessToken, body, idempotencyKey: key }),
  ]);

  // Yang dijamin bukan status persisnya. Kalau yang pertama sudah selesai dan
  // jawabannya tersimpan sebelum yang kedua membacanya, yang kedua menerima
  // 201 pengulangan, bukan 409 — dan itu sama benarnya. Yang WAJIB hanya satu:
  // tepat satu permintaan yang benar-benar membuat data.
  const asli = hasil.filter((item) => item.status === 201 && item.replay === null);
  const ditahan = hasil.filter((item) => item.status === 409 || item.replay === 'true');

  assert.equal(asli.length, 1);
  assert.equal(ditahan.length, 1);

  createdUserIds.add(asli[0].body.data.user.id);
});

test('permintaan yang gagal tidak mengunci kuncinya', async () => {
  // Kalau kegagalan ikut tersimpan, klien yang salah kirim sekali tidak dapat
  // memperbaiki dan mengulang dengan kunci yang sama selama 24 jam.
  const key = kunci('gagal');

  const gagal = await call('/users', {
    method: 'POST',
    token: accessToken,
    body: { email: 'bukan-email', password: 'x', fullName: '' },
    idempotencyKey: key,
  });

  assert.equal(gagal.status, 400);

  const email = `idem-pulih-${Date.now()}@uji.test`;

  const berhasil = await call('/users', {
    method: 'POST',
    token: accessToken,
    body: { email, password: 'RahasiaPanjangSekali123', fullName: 'Pulih' },
    idempotencyKey: key,
  });

  assert.equal(berhasil.status, 201);
  assert.equal(berhasil.replay, null);
  createdUserIds.add(berhasil.body.data.user.id);
});

test('kunci yang sama pada endpoint berbeda tidak saling mencampuri', async () => {
  // Cakupannya menyertakan alamat. Tanpa itu, POST /roles dengan kunci yang
  // sudah dipakai di POST /users akan menerima jawaban user — objek dengan
  // bentuk yang sama sekali berbeda.
  const key = kunci('lintas-endpoint');

  const user = await call('/users', {
    method: 'POST',
    token: accessToken,
    body: {
      email: `idem-lintas-${Date.now()}@uji.test`,
      password: 'RahasiaPanjangSekali123',
      fullName: 'Lintas Endpoint',
    },
    idempotencyKey: key,
  });

  assert.equal(user.status, 201);
  createdUserIds.add(user.body.data.user.id);

  const role = await call('/roles', {
    method: 'POST',
    token: accessToken,
    body: { name: `idem-lintas-${Date.now()}`, description: 'Dibuat oleh pengujian' },
    idempotencyKey: key,
  });

  assert.equal(role.status, 201);
  assert.equal(role.replay, null);
  createdRoleIds.add(role.body.data.role.id);
});

test('kunci berbentuk tidak wajar diabaikan, bukan menolak permintaannya', async () => {
  // Kunci dari klien masuk ke ruang kunci Redis, jadi bentuknya dibatasi.
  // Yang tidak lolos diperlakukan seperti tidak ada — memutus permintaannya
  // hanya karena bentuk header akan lebih merugikan daripada berguna.
  const email = `idem-aneh-${Date.now()}@uji.test`;

  const { status, replay, body } = await call('/users', {
    method: 'POST',
    token: accessToken,
    body: { email, password: 'RahasiaPanjangSekali123', fullName: 'Kunci Aneh' },
    idempotencyKey: 'kunci dengan spasi dan *',
  });

  assert.equal(status, 201);
  assert.equal(replay, null);
  createdUserIds.add(body.data.user.id);
});
