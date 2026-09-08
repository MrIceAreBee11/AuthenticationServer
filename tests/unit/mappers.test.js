const test = require('node:test');
const assert = require('node:assert/strict');

const { toUserDto, toUserListDto, toProfileDto } = require('../../src/mappers/user.mapper');
const {
  toRoleDto,
  toRoleListDto,
  toPermissionDto,
  toPermissionCatalogDto,
} = require('../../src/mappers/role.mapper');

/**
 * Baris pengguna lengkap, termasuk kolom yang TIDAK boleh keluar. Dibuat
 * sebagai objek biasa, bukan instance model — justru itu intinya: mapper tidak
 * boleh bergantung pada toJSON() untuk menyaring apa pun.
 */
const barisPengguna = (overrides = {}) => ({
  id: 'u1',
  email: 'orang@contoh.test',
  fullName: 'Orang Contoh',
  phone: '08120000000',
  isActive: true,
  lastLoginAt: new Date('2026-09-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-09-08T00:00:00Z'),
  avatarKey: 'avatars/u1-abc123.png',
  passwordChangedAt: new Date('2026-09-05T00:00:00Z'),
  passwordHash: '$2b$12$hash-yang-tidak-boleh-keluar',
  ...overrides,
});

test('toUserDto — yang keluar', async (t) => {
  await t.test('daftar field-nya tetap, ditentukan mapper bukan skema tabel', async () => {
    // Kalau daftar ini berubah, berubahnya karena seseorang memutuskan —
    // bukan karena ada kolom baru di tabel users.
    assert.deepEqual(Object.keys(toUserDto(barisPengguna())).sort(), [
      'createdAt',
      'email',
      'fullName',
      'id',
      'isActive',
      'lastLoginAt',
      'phone',
    ]);
  });

  await t.test('roles ikut hanya kalau memang dimuat', async () => {
    // Tanpa penjagaan ini, endpoint yang tidak memuat role akan mengirim
    // roles: [] — dan pemanggil menyimpulkan penggunanya tidak punya role
    // sama sekali, padahal datanya hanya tidak diminta.
    const tanpaRole = toUserDto(barisPengguna());
    const denganRole = toUserDto(
      barisPengguna({ roles: [{ id: 1, name: 'admin', description: 'x' }] })
    );

    assert.ok(!('roles' in tanpaRole));
    assert.deepEqual(denganRole.roles, [{ id: 1, name: 'admin' }]);
  });

  await t.test('role di dalam pengguna hanya identitasnya, izinnya tidak dibawa', async () => {
    const dto = toUserDto(
      barisPengguna({
        roles: [{ id: 1, name: 'admin', description: 'Administrator', permissions: [{ name: 'x' }] }],
      })
    );

    assert.deepEqual(Object.keys(dto.roles[0]).sort(), ['id', 'name']);
  });
});

test('toUserDto — yang TIDAK keluar', async (t) => {
  await t.test('passwordHash tidak keluar meski objeknya objek biasa', async () => {
    // Sebelum ada mapper, penyaringan ini bergantung sepenuhnya pada toJSON()
    // di model. Objek biasa — hasil query mentah, hasil spread, apa pun yang
    // kehilangan prototipe modelnya — akan lolos begitu saja.
    const dto = toUserDto(barisPengguna());

    assert.ok(!JSON.stringify(dto).includes('hash-yang-tidak-boleh-keluar'));
  });

  await t.test('avatarKey tidak keluar', async () => {
    // Kunci objek internal. Pemanggil memakai avatarUrl; kunci mentahnya
    // hanya membocorkan pola penamaan isi bucket.
    assert.equal(toUserDto(barisPengguna()).avatarKey, undefined);
  });

  await t.test('passwordChangedAt tidak keluar di daftar pengguna', async () => {
    // Kapan orang lain terakhir mengganti password bukan urusan pemanggil.
    assert.equal(toUserDto(barisPengguna()).passwordChangedAt, undefined);
  });

  await t.test('updatedAt tidak keluar', async () => {
    assert.equal(toUserDto(barisPengguna()).updatedAt, undefined);
  });

  await t.test('kolom baru yang belum didaftarkan tidak ikut terkirim', async () => {
    // Inilah jaminan yang tidak diberikan toJSON(): menambah kolom di tabel
    // TIDAK otomatis membocorkannya ke pemanggil.
    const dto = toUserDto(barisPengguna({ kolomBaruYangSensitif: 'rahasia' }));

    assert.ok(!JSON.stringify(dto).includes('rahasia'));
  });
});

test('Nilai opsional yang kosong', async (t) => {
  await t.test('setiap field opsional jatuh ke null, bukan undefined', async () => {
    // undefined hilang saat diubah ke JSON, jadi field-nya lenyap dari
    // jawaban. Pemanggil lalu harus membedakan "tidak ada nilainya" dari
    // "field-nya tidak dikirim" — dua hal yang sebenarnya sama di sini.
    const minimal = { id: 'u1', email: 'a@b.test', fullName: 'A', isActive: true };
    const dto = toUserDto(minimal);

    assert.equal(dto.phone, null);
    assert.equal(dto.lastLoginAt, null);
    assert.equal(JSON.parse(JSON.stringify(dto)).phone, null);
  });

  await t.test('profil tanpa avatar dan tanpa riwayat ganti password', async () => {
    const dto = toProfileDto({ id: 'u1', email: 'a@b.test', fullName: 'A', isActive: true });

    assert.equal(dto.avatarUrl, null);
    assert.equal(dto.passwordChangedAt, null);
  });

  await t.test('role tanpa deskripsi dan tanpa penanda dilindungi', async () => {
    const dto = toRoleDto({ id: 9, name: 'auditor', createdAt: new Date() });

    assert.equal(dto.description, null);
    assert.equal(dto.userCount, 0);
    assert.equal(dto.isProtected, false);
  });
});

test('toProfileDto', async (t) => {
  await t.test('passwordChangedAt IKUT — pemiliknya berhak tahu', async () => {
    // Bedanya dengan toUserDto. Bagi pemilik akun ini keterangan berguna;
    // bagi orang lain ia keterangan keamanan tentang orang lain.
    const dto = toProfileDto(barisPengguna({ avatarUrl: 'https://minio/presigned' }));

    assert.ok(dto.passwordChangedAt instanceof Date);
    assert.equal(dto.avatarUrl, 'https://minio/presigned');
  });

  await t.test('avatarKey tetap tidak ikut, meski ini akun sendiri', async () => {
    assert.equal(toProfileDto(barisPengguna()).avatarKey, undefined);
  });

  await t.test('avatarUrl null kalau belum ada avatar atau storage bermasalah', async () => {
    assert.equal(toProfileDto(barisPengguna()).avatarUrl, null);
  });

  await t.test('passwordHash tetap tidak keluar', async () => {
    const dto = toProfileDto(barisPengguna());

    assert.ok(!JSON.stringify(dto).includes('hash-yang-tidak-boleh-keluar'));
  });
});

test('toUserListDto', async (t) => {
  await t.test('memetakan setiap baris dengan aturan yang sama', async () => {
    const daftar = toUserListDto([barisPengguna({ id: 'u1' }), barisPengguna({ id: 'u2' })]);

    assert.equal(daftar.length, 2);
    assert.ok(!JSON.stringify(daftar).includes('avatars/u1'));
    assert.ok(!JSON.stringify(daftar).includes('hash-yang-tidak-boleh-keluar'));
  });

  await t.test('daftar kosong tetap array kosong', async () => {
    assert.deepEqual(toUserListDto([]), []);
  });
});

test('toRoleDto', async (t) => {
  const barisRole = (overrides = {}) => ({
    id: 2,
    name: 'admin',
    description: 'Administrator',
    userCount: 5,
    isProtected: false,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  });

  await t.test('userCount dan isProtected ikut karena antarmuka memakainya', async () => {
    // Keduanya bukan kolom tabel; service yang menghitungnya. Antarmuka
    // memakainya untuk menonaktifkan tombol hapus sebelum ditekan.
    const dto = toRoleDto(barisRole());

    assert.equal(dto.userCount, 5);
    assert.equal(dto.isProtected, false);
    assert.equal(dto.updatedAt, undefined);
  });

  await t.test('userCount default nol, bukan undefined', async () => {
    const dto = toRoleDto(barisRole({ userCount: undefined }));

    assert.equal(dto.userCount, 0);
  });

  await t.test('permissions ikut hanya kalau dimuat, dan dipetakan juga', async () => {
    const tanpa = toRoleDto(barisRole());
    const dengan = toRoleDto(
      barisRole({ permissions: [{ id: 1, name: 'users.read', description: 'x', extra: 'y' }] })
    );

    assert.ok(!('permissions' in tanpa));
    assert.deepEqual(dengan.permissions, [
      { id: 1, name: 'users.read', description: 'x' },
    ]);
  });

  await t.test('toRoleListDto memetakan seluruh baris', async () => {
    assert.equal(toRoleListDto([barisRole({ id: 1 }), barisRole({ id: 2 })]).length, 2);
    assert.deepEqual(toRoleListDto([]), []);
  });
});

test('toPermissionDto & katalog', async (t) => {
  await t.test('hanya id, name, description', async () => {
    const dto = toPermissionDto({ id: 1, name: 'users.read', description: 'x', createdAt: new Date() });

    assert.deepEqual(Object.keys(dto).sort(), ['description', 'id', 'name']);
  });

  await t.test('description null kalau kosong', async () => {
    assert.equal(toPermissionDto({ id: 1, name: 'x' }).description, null);
  });

  await t.test('katalog memetakan daftar maupun kelompoknya', async () => {
    const izin = (id, name) => ({ id, name, description: null, extra: 'buang' });

    const dto = toPermissionCatalogDto({
      permissions: [izin(1, 'users.read'), izin(2, 'roles.read')],
      groups: { users: [izin(1, 'users.read')], roles: [izin(2, 'roles.read')] },
    });

    assert.ok(!JSON.stringify(dto).includes('buang'));
    assert.deepEqual(Object.keys(dto.groups).sort(), ['roles', 'users']);
    assert.equal(dto.groups.users[0].name, 'users.read');
  });
});
