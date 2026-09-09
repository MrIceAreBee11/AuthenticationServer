const test = require('node:test');
const assert = require('node:assert/strict');

const { RolesService } = require('../../src/modules/roles/roles.service');
const {
  captureError,
  fakeRole,
  fakeRoleRepository,
  fakePermissionRepository,
  fakePermissionCache,
  fakeDatabase,
  fakeAudit,
} = require('./fakes');

const buildService = ({
  role = null,
  roles = [],
  userCounts = {},
  permissions = [],
  permissionsByIds = null,
} = {}) => {
  const rolesRepo = fakeRoleRepository({ role, roles, userCounts });
  const permissionsRepo = fakePermissionRepository({
    permissions,
    byIds: permissionsByIds,
  });
  const permissionCache = fakePermissionCache();
  const audit = fakeAudit();

  return {
    service: new RolesService({
      roles: rolesRepo,
      permissions: permissionsRepo,
      permissionCache,
      database: fakeDatabase(),
      audit,
    }),
    audit,
    rolesRepo,
    permissionsRepo,
    permissionCache,
  };
};

test('RolesService — pencarian role', async (t) => {
  await t.test('id yang bukan bilangan bulat positif ditolak sebelum query', async () => {
    const { service, rolesRepo } = buildService();

    for (const idBuruk of ['abc', '0', '-1', '1.5', '']) {
      const error = await captureError(() => service.getById(idBuruk));

      assert.equal(error.statusCode, 400, `id "${idBuruk}" seharusnya ditolak`);
    }

    assert.equal(rolesRepo.findById.mock.callCount(), 0);
  });

  await t.test('role tidak ditemukan menghasilkan 404', async () => {
    const { service } = buildService({ role: null });

    assert.equal((await captureError(() => service.getById(9))).statusCode, 404);
  });

  await t.test('role dilengkapi jumlah pengguna dan penanda dilindungi', async () => {
    const { service } = buildService({
      role: fakeRole({ id: 1, name: 'superadmin' }),
      userCounts: { 1: 3 },
    });

    const hasil = await service.getById(1);

    assert.equal(hasil.userCount, 3);
    assert.equal(hasil.isProtected, true);
  });

  await t.test('role tanpa pengguna dilaporkan nol, bukan undefined', async () => {
    const { service } = buildService({
      role: fakeRole({ id: 5, name: 'auditor' }),
      userCounts: {},
    });

    const hasil = await service.getById(5);

    assert.equal(hasil.userCount, 0);
    assert.equal(hasil.isProtected, false);
  });
});

test('RolesService — perlindungan role superadmin', async (t) => {
  // Nama "superadmin" dijadikan acuan oleh aturan keamanan di users.service.
  // Kalau namanya dapat diganti, perlindungan akun superadmin berhenti bekerja
  // tanpa menimbulkan error apa pun.
  await t.test('nama superadmin tidak dapat diubah', async () => {
    const { service, rolesRepo } = buildService({ role: fakeRole({ id: 1, name: 'superadmin' }) });

    const error = await captureError(() => service.update(1, { name: 'bos-besar' }));

    assert.equal(error.statusCode, 403);
    assert.equal(rolesRepo.update.mock.callCount(), 0);
  });

  await t.test('superadmin tidak dapat dihapus', async () => {
    const { service, rolesRepo } = buildService({ role: fakeRole({ id: 1, name: 'superadmin' }) });

    const error = await captureError(() => service.remove(1));

    assert.equal(error.statusCode, 403);
    assert.equal(rolesRepo.destroy.mock.callCount(), 0);
  });

  await t.test('keterangan superadmin masih boleh diubah', async () => {
    // Yang dilindungi hanya namanya, karena hanya nama itulah yang dijadikan
    // acuan oleh kode lain.
    const { service, rolesRepo } = buildService({
      role: fakeRole({ id: 1, name: 'superadmin' }),
      userCounts: { 1: 1 },
    });

    const hasil = await service.update(1, { description: 'Akses penuh' });

    assert.equal(rolesRepo.update.mock.callCount(), 1);
    assert.deepEqual(rolesRepo.update.mock.calls[0].arguments[1], {
      description: 'Akses penuh',
    });
    assert.equal(hasil.name, 'superadmin');
  });
});

test('RolesService.update', async (t) => {
  await t.test('nama dinormalkan ke huruf kecil tanpa spasi tepi', async () => {
    const { service, rolesRepo } = buildService({ role: fakeRole({ id: 2, name: 'admin' }) });

    await service.update(2, { name: '  Auditor Keuangan  ' });

    assert.deepEqual(rolesRepo.update.mock.calls[0].arguments[1], {
      name: 'auditor keuangan',
    });
  });

  await t.test('nama kosong ditolak', async () => {
    const { service } = buildService({ role: fakeRole({ id: 2 }) });

    assert.equal((await captureError(() => service.update(2, { name: '   ' }))).statusCode, 400);
  });

  await t.test('permintaan tanpa satu pun perubahan ditolak', async () => {
    const { service, rolesRepo } = buildService({ role: fakeRole({ id: 2 }) });

    const error = await captureError(() => service.update(2, {}));

    assert.equal(error.statusCode, 400);
    assert.equal(rolesRepo.update.mock.callCount(), 0);
  });
});

test('RolesService.remove', async (t) => {
  await t.test('role yang masih dipakai ditolak dengan 409 dan jumlahnya', async () => {
    // Kalau dibiarkan, ON DELETE CASCADE akan mencabut wewenang sejumlah
    // pengguna sekaligus secara diam-diam.
    const { service, rolesRepo } = buildService({
      role: fakeRole({ id: 3, name: 'auditor' }),
      userCounts: { 3: 4 },
    });

    const error = await captureError(() => service.remove(3));

    assert.equal(error.statusCode, 409);
    assert.match(error.message, /4 pengguna/);
    assert.equal(rolesRepo.destroy.mock.callCount(), 0);
  });

  await t.test('role tanpa pengguna dihapus dan versi cache dinaikkan', async () => {
    const { service, rolesRepo, permissionCache } = buildService({
      role: fakeRole({ id: 3, name: 'auditor' }),
      userCounts: {},
    });

    await service.remove(3);

    assert.equal(rolesRepo.destroy.mock.callCount(), 1);
    assert.equal(permissionCache.bumpVersion.mock.callCount(), 1);
  });
});

test('RolesService.setPermissions', async (t) => {
  await t.test('permissionIds bukan array ditolak', async () => {
    const { service } = buildService({ role: fakeRole({ id: 2 }) });

    for (const buruk of [undefined, null, 'users.read', 7, {}]) {
      const error = await captureError(() => service.setPermissions(2, buruk));

      assert.equal(error.statusCode, 400, `nilai ${JSON.stringify(buruk)} seharusnya ditolak`);
    }
  });

  await t.test('id izin yang tidak ada ditolak, izin tidak dipasang sebagian', async () => {
    const { service, rolesRepo } = buildService({
      role: fakeRole({ id: 2 }),
      permissionsByIds: [{ id: 1, name: 'users.read' }],
    });

    const error = await captureError(() => service.setPermissions(2, [1, 99]));

    assert.equal(error.statusCode, 400);
    assert.match(error.message, /tidak ditemukan/);
    assert.equal(rolesRepo.setPermissions.mock.callCount(), 0);
  });

  await t.test(
    'perubahan izin role menaikkan versi cache, bukan menghapus per pengguna',
    async () => {
      // Mengubah izin sebuah role memengaruhi SEMUA pemakainya sekaligus, dan
      // penghapusan cache per pengguna tidak menjangkau itu.
      const { service, rolesRepo, permissionCache } = buildService({
        role: fakeRole({ id: 2 }),
        userCounts: { 2: 12 },
      });

      await service.setPermissions(2, [1, 2, 3]);

      assert.equal(rolesRepo.setPermissions.mock.callCount(), 1);
      assert.equal(permissionCache.bumpVersion.mock.callCount(), 1);
      assert.equal(permissionCache.invalidateUser.mock.callCount(), 0);
    }
  );

  await t.test('daftar izin kosong mengosongkan izin role', async () => {
    const { service, rolesRepo, permissionsRepo } = buildService({ role: fakeRole({ id: 2 }) });

    await service.setPermissions(2, []);

    assert.deepEqual(rolesRepo.setPermissions.mock.calls[0].arguments[1], []);
    assert.equal(
      permissionsRepo.findByIds.mock.callCount(),
      0,
      'daftar kosong tidak perlu diverifikasi ke database'
    );
  });
});

test('RolesService.create — pemeriksaan sebelum transaksi', async (t) => {
  // Seluruh penolakan di bawah ini terjadi sebelum transaksi dibuka, sehingga
  // dapat diuji tanpa basis data. Isi transaksinya sendiri diuji end-to-end.
  await t.test('nama wajib diisi', async () => {
    const { service } = buildService();

    for (const buruk of [undefined, null, '', '   ']) {
      const error = await captureError(() => service.create({ name: buruk }));

      assert.equal(error.statusCode, 400, `nama ${JSON.stringify(buruk)} seharusnya ditolak`);
    }
  });

  await t.test('permissionIds bukan array ditolak', async () => {
    const { service } = buildService();

    const error = await captureError(() =>
      service.create({ name: 'auditor', permissionIds: 'users.read' })
    );

    assert.equal(error.statusCode, 400);
  });

  await t.test('id izin yang tidak ada ditolak', async () => {
    const { service } = buildService({ permissionsByIds: [] });

    const error = await captureError(() =>
      service.create({ name: 'auditor', permissionIds: [99] })
    );

    assert.equal(error.statusCode, 400);
    assert.match(error.message, /tidak ditemukan/);
  });
});

test('RolesService.listPermissions', async (t) => {
  await t.test('izin dikelompokkan berdasarkan sumber dayanya', async () => {
    const buat = (id, name) => ({ id, name, toJSON: () => ({ id, name }) });
    const { service } = buildService({
      permissions: [buat(1, 'users.read'), buat(2, 'users.create'), buat(3, 'roles.read')],
    });

    const hasil = await service.listPermissions();

    assert.equal(hasil.permissions.length, 3);
    assert.deepEqual(Object.keys(hasil.groups), ['users', 'roles']);
    assert.equal(hasil.groups.users.length, 2);
    assert.equal(hasil.groups.roles.length, 1);
  });
});

test('RolesService.list', async (t) => {
  await t.test('setiap role dilengkapi jumlah pengguna dan penanda dilindungi', async () => {
    const { service } = buildService({
      roles: [
        fakeRole({ id: 1, name: 'superadmin' }),
        fakeRole({ id: 2, name: 'admin' }),
        fakeRole({ id: 3, name: 'user' }),
      ],
      userCounts: { 1: 1, 3: 8 },
    });

    const hasil = await service.list();

    assert.deepEqual(
      hasil.map((role) => [role.name, role.userCount, role.isProtected]),
      [
        ['superadmin', 1, true],
        ['admin', 0, false],
        ['user', 8, false],
      ]
    );
  });
});
