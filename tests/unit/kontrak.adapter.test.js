const test = require('node:test');
const assert = require('node:assert/strict');

const { UserRepository } = require('../../src/repositories/user.repository');
const { RoleRepository } = require('../../src/repositories/role.repository');
const { PermissionRepository } = require('../../src/repositories/permission.repository');
const { RefreshTokenRepository } = require('../../src/repositories/refreshToken.repository');
const { TokenDenylistRepository } = require('../../src/repositories/tokenDenylist.repository');
const { IdempotencyRepository } = require('../../src/repositories/idempotency.repository');
const { AuditRepository } = require('../../src/repositories/audit.repository');
const { AuditService } = require('../../src/services/audit.service');
const { CacheClient } = require('../../src/infrastructure/redis');
const { ObjectStorage } = require('../../src/infrastructure/storage');
const { Database } = require('../../src/infrastructure/database');

const {
  fakeUserRepository,
  fakeRefreshTokenRepository,
  fakeCache,
  fakeStorage,
  fakeDatabase,
  fakeAudit,
} = require('./fakes');

/**
 * BERKAS INI: penjaga agar objek palsu di fakes.js tidak pernah menjanjikan
 * method yang tidak ada pada kelas sungguhannya.
 *
 * KENAPA INI YANG DIUJI, BUKAN "PORT" BERUPA JSDoc: JavaScript tidak punya
 * interface, jadi kontrak yang ditulis sebagai komentar tidak diperiksa apa
 * pun — ia hanya dokumentasi yang perlahan menjadi salah. Yang di bawah ini
 * dijalankan setiap kali `npm test`.
 *
 * KENAPA HANYA SATU ARAH (palsu HARUS ada di asli, tidak sebaliknya): tiga dari
 * empat arah penyimpangan sudah gagal dengan sendirinya.
 *
 *   - Method BARU di kelas asli yang dipakai service, tetapi belum ada di
 *     palsu  -> pengujian unit memanggil undefined dan langsung gagal.
 *   - Method DIGANTI NAMA di kelas asli dan di service, palsu ketinggalan
 *     -> sama, gagal seketika.
 *   - Method dihapus dari asli tetapi masih dipakai service
 *     -> pengujian end-to-end gagal.
 *
 * Yang TIDAK gagal sendiri hanya satu: palsu punya method yang kelas aslinya
 * tidak punya. Di situ pengujian unit tetap hijau sementara production
 * memanggil sesuatu yang tidak ada — dan justru itulah yang dijaga di sini.
 *
 * Palsu tidak dituntut LENGKAP. fakeCache sengaja tidak punya connect atau
 * ping: pengujian unit tidak pernah menyambung ke mana pun, dan memaksanya
 * lengkap hanya menambah kode mati.
 */
const methodAsli = (Kelas) =>
  Object.getOwnPropertyNames(Kelas.prototype).filter((nama) => nama !== 'constructor');

const methodPalsu = (objek) =>
  Object.keys(objek).filter((nama) => typeof objek[nama] === 'function');

/** Method pembantu khusus pengujian, bukan bagian dari kontrak adapter. */
const PEMBANTU_PENGUJIAN = new Set(['of', 'denied', 'at']);

const PASANGAN = [
  ['UserRepository', UserRepository, fakeUserRepository()],
  ['RefreshTokenRepository', RefreshTokenRepository, fakeRefreshTokenRepository()],
  ['CacheClient', CacheClient, fakeCache()],
  ['ObjectStorage', ObjectStorage, fakeStorage()],
  ['Database', Database, fakeDatabase()],
  ['AuditService', AuditService, fakeAudit()],
];

test('Kontrak adapter: palsu tidak menjanjikan yang tidak ada di aslinya', async (t) => {
  for (const [nama, Kelas, palsu] of PASANGAN) {
    await t.test(nama, () => {
      const asli = new Set(methodAsli(Kelas));
      const asing = methodPalsu(palsu).filter((m) => !asli.has(m) && !PEMBANTU_PENGUJIAN.has(m));

      assert.deepEqual(
        asing,
        [],
        `${nama}: palsu punya method yang tidak ada di kelas aslinya — ` +
          `pengujian unit akan tetap hijau sementara production memanggil sesuatu yang tidak ada`
      );
    });
  }
});

test('Kontrak adapter: setiap kelas asli benar-benar punya isi', async (t) => {
  // Penjaga bagi penjaganya. Kalau sebuah kelas gagal di-import atau namanya
  // berubah, `methodAsli` mengembalikan daftar kosong dan pemeriksaan di atas
  // lulus tanpa memeriksa apa pun.
  const SELURUH = [
    ['UserRepository', UserRepository],
    ['RoleRepository', RoleRepository],
    ['PermissionRepository', PermissionRepository],
    ['RefreshTokenRepository', RefreshTokenRepository],
    ['TokenDenylistRepository', TokenDenylistRepository],
    ['IdempotencyRepository', IdempotencyRepository],
    ['AuditRepository', AuditRepository],
    ['CacheClient', CacheClient],
    ['ObjectStorage', ObjectStorage],
    ['Database', Database],
  ];

  for (const [nama, Kelas] of SELURUH) {
    await t.test(nama, () => {
      assert.equal(typeof Kelas, 'function', `${nama} tidak ter-import sebagai class`);
      assert.ok(methodAsli(Kelas).length > 0, `${nama} tidak punya satu pun method`);
    });
  }
});
