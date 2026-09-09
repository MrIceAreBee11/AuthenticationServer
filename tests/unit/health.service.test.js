const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { HealthService } = require('../../src/modules/health/health.service');

const build = ({ database = true, cache = true, lambatnya = {} } = {}) => {
  const urutan = [];

  const health = {
    pingDatabase: mock.fn(async () => {
      urutan.push('mulai:database');
      await new Promise((resolve) => setTimeout(resolve, lambatnya.database ?? 0));

      return database;
    }),
    pingCache: mock.fn(async () => {
      urutan.push('mulai:cache');
      await new Promise((resolve) => setTimeout(resolve, lambatnya.cache ?? 0));

      return cache;
    }),
  };

  return { service: new HealthService({ health }), health, urutan };
};

test('HealthService.readiness', async (t) => {
  await t.test('seluruh dependensi hidup berarti siap', async () => {
    const { service } = build();

    assert.deepEqual(await service.readiness(), {
      ready: true,
      checks: { database: 'up', redis: 'up' },
    });
  });

  await t.test('database mati berarti TIDAK siap', async () => {
    const { service } = build({ database: false });
    const hasil = await service.readiness();

    assert.equal(hasil.ready, false);
    assert.equal(hasil.checks.database, 'down');
  });

  await t.test('redis mati berarti TIDAK siap', async () => {
    // Cache bukan sekadar pemanis: daftar token yang dicabut tinggal di sana.
    // Melayani permintaan tanpanya berarti token yang sudah di-logout diterima
    // kembali — jadi ia memang wajib, bukan pendukung.
    const { service } = build({ cache: false });
    const hasil = await service.readiness();

    assert.equal(hasil.ready, false);
    assert.equal(hasil.checks.redis, 'down');
  });

  await t.test('keduanya mati dilaporkan sekaligus, bukan satu per satu', async () => {
    // Endpoint diagnostik yang berhenti di kegagalan pertama membuat
    // diagnosisnya berlapis: perbaiki satu, jalankan lagi, temukan berikutnya.
    const { service } = build({ database: false, cache: false });

    assert.deepEqual(await service.readiness(), {
      ready: false,
      checks: { database: 'down', redis: 'down' },
    });
  });

  await t.test('pemeriksaan berjalan BERSAMAAN, bukan berurutan', async () => {
    // Readiness dipanggil load balancer sesering mungkin. Berurutan berarti
    // waktu tunggunya menjumlah, dan itu tumbuh setiap kali ada dependensi
    // baru yang ikut diperiksa.
    const { service, urutan } = build({ lambatnya: { database: 20 } });

    await service.readiness();

    // Kalau berurutan, 'mulai:cache' baru tercatat setelah database selesai.
    assert.deepEqual(urutan, ['mulai:database', 'mulai:cache']);
  });

  await t.test('RabbitMQ dan MinIO sengaja TIDAK ikut menentukan', async () => {
    // Keputusan yang dapat diperdebatkan, jadi dikunci di pengujian: email dan
    // avatar adalah fungsi pendukung. Menjadikannya wajib berarti seluruh
    // autentikasi ikut jatuh karena masalah pada gambar profil.
    const { service, health } = build();
    const hasil = await service.readiness();

    assert.deepEqual(Object.keys(hasil.checks), ['database', 'redis']);
    assert.equal(health.pingDatabase.mock.callCount(), 1);
    assert.equal(health.pingCache.mock.callCount(), 1);
  });
});
