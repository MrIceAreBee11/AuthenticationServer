const test = require('node:test');
const assert = require('node:assert/strict');

const { PermissionService } = require('../../src/services/permission.service');
const {
  captureError,
  fakeUserWithPermissions,
  fakeUserRepository,
  fakePermissionRepository,
  fakeCache,
  fakeLogger,
} = require('./fakes');

const KUNCI_VERSI = 'permissions:version';
const CACHE_TTL = 300;
const AWALAN_KUNCI = 'permissions:user:';

const buildService = ({ user = null, names = [], cache = fakeCache() } = {}) => {
  const users = fakeUserRepository({ user });
  const permissions = fakePermissionRepository({ names });

  const logger = fakeLogger();

  return {
    service: new PermissionService({
      users,
      permissions,
      cache,
      ttlSeconds: CACHE_TTL,
      logger,
    }),
    users,
    permissions,
    cache,
    logger,
  };
};

const kunciPengguna = (cache) =>
  [...cache.store.keys()].filter((key) => key.startsWith(AWALAN_KUNCI));

test('PermissionService.getUserPermissions', async (t) => {
  await t.test('cache yang terisi dijawab tanpa menyentuh database', async () => {
    const cache = fakeCache({
      initial: {
        [KUNCI_VERSI]: '1',
        [`${AWALAN_KUNCI}v1:u1`]: JSON.stringify(['users.read']),
      },
    });
    const { service, users } = buildService({ cache });

    const hasil = await service.getUserPermissions('u1');

    assert.deepEqual(hasil, ['users.read']);
    assert.equal(
      users.findWithRolePermissions.mock.callCount(),
      0,
      'inilah gunanya cache — database tidak perlu disentuh'
    );
  });

  await t.test('cache kosong dibaca dari database lalu disimpan berikut versinya', async () => {
    const { service, cache, users } = buildService({
      user: fakeUserWithPermissions([['users.read', 'users.create']]),
    });

    const hasil = await service.getUserPermissions('u1');

    assert.deepEqual(hasil, ['users.read', 'users.create']);
    assert.equal(users.findWithRolePermissions.mock.callCount(), 1);

    // Nomor versi ikut masuk ke dalam kunci. Itulah yang memungkinkan seluruh
    // cache lama dibuat tidak terjangkau hanya dengan menaikkan satu angka.
    assert.deepEqual(kunciPengguna(cache), [`${AWALAN_KUNCI}v1:u1`]);

    const panggilanSimpan = cache.set.mock.calls.find(
      (panggilan) => panggilan.arguments[0] === `${AWALAN_KUNCI}v1:u1`
    );

    assert.deepEqual(panggilanSimpan.arguments[2], { EX: 300 });
  });

  await t.test('izin yang sama dari dua role hanya muncul sekali', async () => {
    const { service } = buildService({
      user: fakeUserWithPermissions([
        ['users.read', 'roles.read'],
        ['users.read', 'profile.read'],
      ]),
    });

    assert.deepEqual(await service.getUserPermissions('u1'), [
      'users.read',
      'roles.read',
      'profile.read',
    ]);
  });

  await t.test('pengguna tidak ditemukan menghasilkan daftar kosong, bukan error', async () => {
    const { service } = buildService({ user: null });

    assert.deepEqual(await service.getUserPermissions('tidak-ada'), []);
  });

  await t.test('cache tidak terbaca tetap dijawab dari database', async () => {
    // Redis di sini hanya salinan cepat; sumber kebenarannya PostgreSQL yang
    // masih hidup. Jadi kegagalan Redis dilewati, bukan menjatuhkan permintaan.
    const cache = fakeCache({
      initial: { [KUNCI_VERSI]: '1' },
      fail: (operasi, kunci) => operasi === 'get' && kunci.startsWith(AWALAN_KUNCI),
    });
    const { service, users } = buildService({
      cache,
      user: fakeUserWithPermissions([['users.read']]),
    });

    assert.deepEqual(await service.getUserPermissions('u1'), ['users.read']);
    assert.equal(users.findWithRolePermissions.mock.callCount(), 1);
  });

  await t.test('versi cache tidak terbaca membuat cache dilewati seluruhnya', async () => {
    const cache = fakeCache({ fail: (operasi) => operasi === 'get' });
    const { service, users } = buildService({
      cache,
      user: fakeUserWithPermissions([['users.read']]),
    });

    assert.deepEqual(await service.getUserPermissions('u1'), ['users.read']);
    assert.equal(users.findWithRolePermissions.mock.callCount(), 1);
    assert.equal(kunciPengguna(cache).length, 0, 'tanpa versi, kunci tidak dapat dibentuk');
  });

  await t.test('gagal menyimpan cache tidak menjatuhkan permintaan', async () => {
    const cache = fakeCache({
      initial: { [KUNCI_VERSI]: '1' },
      fail: (operasi, kunci) => operasi === 'set' && kunci.startsWith(AWALAN_KUNCI),
    });
    const { service } = buildService({
      cache,
      user: fakeUserWithPermissions([['users.read']]),
    });

    assert.deepEqual(await service.getUserPermissions('u1'), ['users.read']);
  });
});

test('PermissionService.bumpVersion', async (t) => {
  await t.test(
    'menaikkan versi membuat cache lama tidak terjangkau, bukan menghapusnya',
    async () => {
      const { service, cache } = buildService({
        user: fakeUserWithPermissions([['users.read']]),
      });

      await service.getUserPermissions('u1');
      await service.bumpVersion();
      await service.getUserPermissions('u1');

      const kunci = kunciPengguna(cache);

      // Kunci lama sengaja ditinggalkan. Menghapus cache satu per satu berarti
      // menyapu seluruh keyspace Redis; membiarkannya hilang lewat TTL jauh
      // lebih murah, dan selama versinya sudah naik ia tak akan terbaca lagi.
      assert.equal(kunci.length, 2);
      assert.ok(kunci.includes(`${AWALAN_KUNCI}v1:u1`));
      assert.ok(kunci.includes(`${AWALAN_KUNCI}v2:u1`));
    }
  );

  await t.test('Redis mati membuatnya mengembalikan null, bukan melempar', async () => {
    const cache = fakeCache({ fail: (operasi) => operasi === 'incr' });
    const { service } = buildService({ cache });

    assert.equal(await service.bumpVersion(), null);
  });
});

test('PermissionService.invalidateUser', async (t) => {
  await t.test('hanya kunci pengguna itu yang dihapus', async () => {
    const cache = fakeCache({
      initial: {
        [KUNCI_VERSI]: '1',
        [`${AWALAN_KUNCI}v1:u1`]: '[]',
        [`${AWALAN_KUNCI}v1:u2`]: '[]',
      },
    });
    const { service } = buildService({ cache });

    await service.invalidateUser('u1');

    assert.deepEqual(kunciPengguna(cache), [`${AWALAN_KUNCI}v1:u2`]);
  });
});

test('PermissionService.verifyCatalog', async (t) => {
  await t.test('tanpa izin yang dipakai route, tidak ada yang perlu diperiksa', async () => {
    const { service } = buildService({ names: ['users.read'] });

    assert.deepEqual(await service.verifyCatalog([]), { required: 0, available: 0 });
  });

  await t.test('seluruh izin ada di database, jumlahnya dilaporkan', async () => {
    const { service } = buildService({ names: ['users.read', 'users.create', 'roles.read'] });

    assert.deepEqual(await service.verifyCatalog(['users.read', 'users.create']), {
      required: 2,
      available: 3,
    });
  });

  await t.test(
    'izin yang dipakai route tapi tidak ada di database menghentikan aplikasi',
    async () => {
      // Inilah pengaman yang menutup kegagalan senyap: tanpa baris di database,
      // endpoint tersebut menjawab 403 untuk semua orang — termasuk superadmin,
      // karena izin superadmin berasal dari baris database, bukan dari kode.
      const { service } = buildService({ names: ['users.read'] });

      const error = await captureError(() =>
        service.verifyCatalog(['users.read', 'users.hapus-semua', 'roles.rahasia'])
      );

      assert.match(error.message, /users\.hapus-semua/);
      assert.match(error.message, /roles\.rahasia/);
      assert.doesNotMatch(error.message, /users\.read/, 'yang sudah ada tidak perlu disebut');
      assert.match(error.message, /db:migrate/, 'pesan harus menyebutkan cara memperbaikinya');
    }
  );
});
