const test = require('node:test');
const assert = require('node:assert/strict');

const { AvatarStore, EXTENSION_BY_MIME } = require('../../src/services/avatar.store');
const { fakeStorage, fakeLogger, testAvatarSettings, captureError } = require('./fakes');

const USER_ID = '11111111-1111-4111-8111-111111111111';

const build = ({ gagal, avatar } = {}) => {
  const storage = fakeStorage(gagal ? { gagal } : {});
  const logger = fakeLogger();

  return {
    storage,
    logger,
    avatars: new AvatarStore({ storage, avatar: testAvatarSettings(avatar), logger }),
  };
};

const berkas = (overrides = {}) => ({
  mimetype: 'image/jpeg',
  buffer: Buffer.from('bukan-gambar-sungguhan'),
  size: 22,
  ...overrides,
});

test('AvatarStore.urlFor', async (t) => {
  await t.test('kunci kosong menjawab null tanpa menyentuh penyimpanan', async () => {
    // Pengguna tanpa avatar adalah keadaan normal, bukan kegagalan. Memanggil
    // MinIO untuk kunci null hanya menambah satu permintaan jaringan per
    // pemuatan profil.
    const { avatars, storage } = build();

    assert.equal(await avatars.urlFor(null), null);
    assert.equal(storage.getPresignedUrl.mock.callCount(), 0);
  });

  await t.test('masa berlaku diambil dari konfigurasi, bukan ditulis di kode', async () => {
    const { avatars, storage } = build({ avatar: { urlTtlSeconds: 120 } });

    await avatars.urlFor('kunci.jpg');

    const [, detik] = storage.getPresignedUrl.mock.calls[0].arguments;

    assert.equal(detik, 120);
  });

  await t.test('penyimpanan bermasalah menjawab null, TIDAK melempar', async () => {
    // Ini inti keputusannya: nama, email, dan role tidak bergantung pada
    // penyimpanan berkas. Melempar di sini berarti seluruh halaman profil
    // menjadi error hanya karena fotonya tidak dapat dialamatkan.
    const { avatars } = build({ gagal: (operasi) => operasi === 'getPresignedUrl' });

    assert.equal(await avatars.urlFor('kunci.jpg'), null);
  });

  await t.test('tetapi kegagalannya WAJIB tercatat', async () => {
    const { avatars, logger } = build({ gagal: (operasi) => operasi === 'getPresignedUrl' });

    await avatars.urlFor('kunci.jpg');

    assert.match(logger.at('exception')[0].message, /alamat sementara avatar/);
  });
});

test('AvatarStore.save', async (t) => {
  await t.test('kunci diawali id pengguna', async () => {
    // Berkas satu orang berkumpul di satu awalan, sehingga daftar dan
    // pembersihan per pengguna menjadi satu operasi berawalan.
    const { avatars } = build();

    const kunci = await avatars.save(USER_ID, berkas());

    assert.ok(kunci.startsWith(`${USER_ID}/`), kunci);
  });

  await t.test('ekstensi dari tipe MIME, bukan dari nama berkas kiriman klien', async () => {
    // Nama berkas dapat berisi apa saja. Tipe MIME sudah divalidasi middleware
    // unggah, jadi itulah satu-satunya sumber yang boleh dipercaya.
    const { avatars } = build();

    for (const [mime, ekstensi] of Object.entries(EXTENSION_BY_MIME)) {
      const kunci = await avatars.save(USER_ID, berkas({ mimetype: mime }));

      assert.ok(kunci.endsWith(`.${ekstensi}`), `${mime} -> ${kunci}`);
    }
  });

  await t.test('dua unggahan berturut-turut TIDAK pernah bertabrakan', async () => {
    // Inilah yang membuat urutan "unggah baru dulu, hapus lama terakhir" di
    // pemanggil benar-benar aman. Kalau kuncinya dapat sama, unggahan baru
    // menimpa yang lama dan pembatalan di tengah jalan kehilangan keduanya.
    const { avatars } = build();

    const pertama = await avatars.save(USER_ID, berkas());
    const kedua = await avatars.save(USER_ID, berkas());

    assert.notEqual(pertama, kedua);
  });

  await t.test('isi dan tipe berkas diteruskan apa adanya', async () => {
    const { avatars, storage } = build();
    const file = berkas();

    const kunci = await avatars.save(USER_ID, file);

    assert.deepEqual(storage.objek.get(kunci), {
      buffer: file.buffer,
      mimeType: file.mimetype,
    });
  });

  await t.test('kegagalan unggah DILEMPAR, tidak dimaafkan', async () => {
    // Berbeda dari penghapusan. Kalau unggahan gagal dan diam-diam dimaafkan,
    // basis data akan menunjuk berkas yang tidak pernah ada — dan avatar itu
    // rusak permanen tanpa satu pun tanda.
    const { avatars } = build({ gagal: (operasi) => operasi === 'putObject' });

    const error = await captureError(() => avatars.save(USER_ID, berkas()));

    assert.match(error.message, /MinIO/);
  });
});

test('AvatarStore.removeQuietly', async (t) => {
  await t.test('berkasnya benar-benar dihapus', async () => {
    const { avatars, storage } = build();
    const kunci = await avatars.save(USER_ID, berkas());

    await avatars.removeQuietly(kunci);

    assert.equal(storage.objek.has(kunci), false);
  });

  await t.test('kunci kosong dilewati tanpa memanggil penyimpanan', async () => {
    // Pemanggil tidak perlu memeriksa dulu; pengguna tanpa avatar adalah
    // keadaan normal pada penghapusan akun.
    const { avatars, storage } = build();

    await avatars.removeQuietly(null);

    assert.equal(storage.removeObject.mock.callCount(), 0);
  });

  await t.test('kegagalan DIMAAFKAN, tidak dilempar', async () => {
    // Berkas berada di luar basis data, jadi tidak ada transaksi yang mencakup
    // keduanya. Kalau ini melempar, menghapus pengguna menjadi mustahil selama
    // MinIO bermasalah — padahal barisnya sudah terhapus.
    const { avatars } = build({ gagal: (operasi) => operasi === 'removeObject' });

    await avatars.removeQuietly('kunci.jpg');
  });

  await t.test('kegagalannya tercatat beserta konteks pemanggilnya', async () => {
    // Yang membuat pilihan di atas dapat dipertanggungjawabkan: berkas yang
    // menggantung tetap meninggalkan jejak, lengkap dengan asal pemanggilnya.
    const { avatars, logger } = build({ gagal: (operasi) => operasi === 'removeObject' });

    await avatars.removeQuietly('kunci.jpg', { context: 'avatar lama', userId: USER_ID });

    const [entry] = logger.at('exception');

    assert.match(entry.message, /menghapus berkas/);
    assert.equal(entry.fields.context, 'avatar lama');
    assert.equal(entry.fields.userId, USER_ID);
  });
});
