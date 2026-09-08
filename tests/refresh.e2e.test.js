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

const call = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const login = async () => {
  const { body } = await call('/auth/login', {
    method: 'POST',
    body: {
      email: process.env.SUPERADMIN_EMAIL,
      password: process.env.SUPERADMIN_PASSWORD,
    },
  });

  return body.data;
};

/** Lihat catatan yang sama di auth.e2e.test.js. */
const resetRateLimiter = async () => {
  const keys = await container.cache.keys('ratelimit:*');

  if (keys.length > 0) {
    await container.cache.del(keys);
  }
};

test.before(async () => {
  await container.connect();
  await resetRateLimiter();

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await container.close();
});

test('login mengembalikan refresh token berupa teks acak, bukan JWT', async () => {
  const data = await login();

  assert.ok(data.refreshToken, 'refresh token harus ada');
  assert.equal(
    data.refreshToken.split('.').length,
    1,
    'refresh token bukan JWT — ia tidak membawa isi apa pun'
  );
  assert.match(data.refreshToken, /^[A-Za-z0-9_-]{43}$/);
});

test('refresh menukar token lama dengan sepasang token baru', async () => {
  const awal = await login();

  const { status, body } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: awal.refreshToken },
  });

  assert.equal(status, 200);
  assert.ok(body.data.token, 'access token baru harus ada');
  assert.notEqual(body.data.refreshToken, awal.refreshToken, 'refresh token wajib dirotasi');

  // Access token baru harus benar-benar dapat dipakai.
  const { status: statusMe } = await call('/auth/me', { token: body.data.token });

  assert.equal(statusMe, 200);
});

test('refresh tidak memerlukan access token yang masih hidup', async () => {
  // Justru inilah gunanya: dipanggil ketika access token sudah kedaluwarsa.
  const awal = await login();

  const { status } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: awal.refreshToken },
  });

  assert.equal(status, 200);
});

test('refresh token hanya dapat dipakai sekali', async () => {
  const awal = await login();

  const pertama = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: awal.refreshToken },
  });

  assert.equal(pertama.status, 200);

  const kedua = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: awal.refreshToken },
  });

  assert.equal(kedua.status, 401);
});

test('pemakaian ulang mencabut seluruh rangkaian sesi', async () => {
  // Skenario pencurian: penyerang menyalin refresh token, lalu pemilik yang
  // sah memperbaruinya. Token salinan itu kini sudah dirotasi. Begitu
  // penyerang memakainya, seluruh rangkaian sesi itu dicabut — termasuk token
  // terbaru yang ada di tangan pemilik sah. Keduanya harus login kembali,
  // tetapi penyerang tidak mendapatkan apa pun.
  const awal = await login();

  const rotasi = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: awal.refreshToken },
  });

  assert.equal(rotasi.status, 200);

  const pemakaianUlang = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: awal.refreshToken },
  });

  assert.equal(pemakaianUlang.status, 401);

  // Token terbaru yang sebelumnya sah sekarang juga ikut mati.
  const setelahnya = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: rotasi.body.data.refreshToken },
  });

  assert.equal(
    setelahnya.status,
    401,
    'seluruh rangkaian harus dicabut, bukan hanya token yang dipakai ulang'
  );
});

test('rangkaian sesi lain tidak ikut tercabut', async () => {
  // Dua login berarti dua rangkaian, seperti dua perangkat berbeda.
  const perangkatA = await login();
  const perangkatB = await login();

  // Perangkat A mengalami pemakaian ulang.
  await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: perangkatA.refreshToken },
  });
  await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: perangkatA.refreshToken },
  });

  // Perangkat B seharusnya tidak terpengaruh sama sekali.
  const { status } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: perangkatB.refreshToken },
  });

  assert.equal(status, 200, 'perangkat lain tidak boleh ikut terlempar keluar');
});

test('refresh token yang tidak dikenal ditolak dengan 401', async () => {
  const { status, body } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: 'token-yang-tidak-pernah-diterbitkan' },
  });

  assert.equal(status, 401);
  assert.match(body.message, /tidak valid/i);
});

test('refresh tanpa mengirim token ditolak dengan 400', async () => {
  const { status } = await call('/auth/refresh', { method: 'POST', body: {} });

  assert.equal(status, 400);
});

test('logout dengan refresh token mematikan sesi itu sepenuhnya', async () => {
  const data = await login();

  const { status } = await call('/auth/logout', {
    method: 'POST',
    token: data.token,
    body: { refreshToken: data.refreshToken },
  });

  assert.equal(status, 200);

  // Access token dicabut lewat daftar cabut di Redis.
  const { status: statusMe } = await call('/auth/me', { token: data.token });

  assert.equal(statusMe, 401);

  // Refresh token dicabut lewat barisnya di basis data.
  const { status: statusRefresh } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: data.refreshToken },
  });

  assert.equal(statusRefresh, 401, 'sesi yang sudah logout tidak boleh dapat diperbarui');
});

test('logout tanpa refresh token hanya mencabut access token', async () => {
  const data = await login();

  await call('/auth/logout', { method: 'POST', token: data.token });

  const { status: statusMe } = await call('/auth/me', { token: data.token });

  assert.equal(statusMe, 401);

  // Perilaku ini disengaja dan didokumentasikan: tanpa refresh token yang
  // dikirim, server tidak tahu rangkaian sesi mana yang harus dicabut.
  const { status: statusRefresh } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: data.refreshToken },
  });

  assert.equal(statusRefresh, 200);
});

test('refresh token milik orang lain tidak dapat dicabut lewat logout', async () => {
  // Pemeriksaan kepemilikan hanya bermakna antar dua pengguna yang BERBEDA.
  // Dua kali login dengan akun yang sama menghasilkan dua rangkaian sesi milik
  // satu orang, dan mencabut salah satunya lewat logout memang haknya.
  const superadmin = await login();

  const dibuat = await call('/users', {
    method: 'POST',
    token: superadmin.token,
    body: {
      email: `uji-refresh-${Date.now()}@contoh.test`,
      password: 'PasswordUjiCoba123',
      fullName: 'Akun Uji Refresh',
    },
  });

  assert.equal(dibuat.status, 201, 'akun kedua gagal dibuat');

  const akunKedua = dibuat.body.data.user;

  try {
    const korban = await login();

    // Akun kedua menyertakan refresh token superadmin di logout miliknya.
    const masuk = await call('/auth/login', {
      method: 'POST',
      body: { email: akunKedua.email, password: 'PasswordUjiCoba123' },
    });

    assert.equal(masuk.status, 200);

    const { status } = await call('/auth/logout', {
      method: 'POST',
      token: masuk.body.data.token,
      body: { refreshToken: korban.refreshToken },
    });

    assert.equal(status, 200, 'logout-nya sendiri tetap berhasil');

    // Sesi superadmin harus tetap hidup.
    const { status: statusKorban } = await call('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: korban.refreshToken },
    });

    assert.equal(statusKorban, 200, 'sesi orang lain tidak boleh dapat dicabut');
  } finally {
    await call(`/users/${akunKedua.id}`, {
      method: 'DELETE',
      token: superadmin.token,
    });
  }
});

test('menghapus pengguna ikut menghapus refresh token-nya', async () => {
  // ON DELETE CASCADE pada kolom user_id yang mengurusnya. Tanpa itu, baris
  // refresh_tokens tertinggal sebagai yatim dan menghalangi penghapusan.
  const superadmin = await login();

  const dibuat = await call('/users', {
    method: 'POST',
    token: superadmin.token,
    body: {
      email: `uji-cascade-${Date.now()}@contoh.test`,
      password: 'PasswordUjiCoba123',
      fullName: 'Akun Uji Cascade',
    },
  });

  assert.equal(dibuat.status, 201);

  const akun = dibuat.body.data.user;

  const masuk = await call('/auth/login', {
    method: 'POST',
    body: { email: akun.email, password: 'PasswordUjiCoba123' },
  });

  assert.equal(masuk.status, 200, 'akun baru harus bisa login dan punya refresh token');

  const dihapus = await call(`/users/${akun.id}`, {
    method: 'DELETE',
    token: superadmin.token,
  });

  assert.equal(dihapus.status, 200, 'penghapusan tidak boleh terhalang baris refresh_tokens');

  const { status } = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: masuk.body.data.refreshToken },
  });

  assert.equal(status, 401, 'refresh token milik akun terhapus tidak boleh berlaku');
});
