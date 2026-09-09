const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { UserManagementPolicy } = require('../../src/modules/users/users.policy');
const { ROLES } = require('../../src/constants/roles');
const { AUDIT_OUTCOMES } = require('../../src/constants/auditActions');
const { fakeUser, fakeAudit, captureError } = require('./fakes');

const AKTOR = '22222222-2222-4222-8222-222222222222';
const TARGET = '33333333-3333-4333-8333-333333333333';

const superadmin = (overrides = {}) =>
  fakeUser({ roles: [{ id: 1, name: ROLES.SUPERADMIN }], ...overrides });

const biasa = (overrides = {}) => fakeUser({ roles: [{ id: 2, name: 'admin' }], ...overrides });

/**
 * Hanya DUA dependensi yang perlu dipalsukan, dan itu seluruh alasan aturan ini
 * dipindah keluar dari users.service. Sebelumnya pengujian yang sama menuntut
 * repository user, repository role, cache izin, penyimpanan objek, kebijakan
 * password, konfigurasi halaman, dan pembungkus transaksi — tujuh benda yang
 * tidak satu pun ada hubungannya dengan pertanyaan "boleh atau tidak".
 */
const build = ({ actor = superadmin({ id: AKTOR }) } = {}) => {
  const log = [];
  const audit = fakeAudit({ log });
  const users = { findById: mock.fn(async () => actor) };

  return { policy: new UserManagementPolicy({ users, audit }), audit, users, log };
};

test('UserManagementPolicy — mengelola akun sendiri', async (t) => {
  await t.test('ditolak, dan diarahkan ke endpoint yang benar', async () => {
    // Bukan sekadar kerapian. Endpoint /users memakai izin users.update,
    // sedangkan /profile memakai profile.update. Membiarkan seseorang mengubah
    // akunnya sendiri lewat /users berarti izin yang dipakai bukan izin yang
    // dimaksudkan aturannya.
    const { policy } = build();
    const target = biasa({ id: AKTOR });

    const error = await captureError(() => policy.assertCanManage(AKTOR, target));

    assert.equal(error.statusCode, 403);
    assert.match(error.message, /\/profile/);
  });

  await t.test('penolakannya tercatat di jejak audit', async () => {
    const { policy, audit } = build();

    await captureError(() => policy.assertCanManage(AKTOR, biasa({ id: AKTOR })));

    const [entry] = audit.denied();

    assert.equal(entry.outcome ?? AUDIT_OUTCOMES.DENIED, AUDIT_OUTCOMES.DENIED);
    assert.equal(entry.resourceId, AKTOR);
    assert.match(entry.reason, /akun sendiri/);
  });

  await t.test('pemeriksaan diri didahulukan, bahkan bagi superadmin', async () => {
    // Inilah separuh dari jaminan "selalu ada minimal satu superadmin":
    // superadmin boleh menghapus superadmin lain, tetapi tidak dirinya sendiri.
    const { policy } = build();

    const error = await captureError(() =>
      policy.assertCanManage(AKTOR, superadmin({ id: AKTOR }))
    );

    assert.equal(error.statusCode, 403);
    assert.match(error.message, /\/profile/);
  });
});

test('UserManagementPolicy — target biasa', async (t) => {
  await t.test('diizinkan tanpa perlu memeriksa pelakunya', async () => {
    // Kalau targetnya bukan superadmin, RBAC di middleware sudah cukup. Query
    // tambahan untuk memeriksa pelaku hanya beban.
    const { policy, users, audit } = build();

    await policy.assertCanManage(AKTOR, biasa({ id: TARGET }));

    assert.equal(users.findById.mock.callCount(), 0);
    assert.equal(audit.denied().length, 0);
  });
});

test('UserManagementPolicy — target superadmin', async (t) => {
  await t.test('superadmin boleh mengelola superadmin lain', async () => {
    const { policy } = build({ actor: superadmin({ id: AKTOR }) });

    await policy.assertCanManage(AKTOR, superadmin({ id: TARGET }));
  });

  await t.test('yang bukan superadmin ditolak', async () => {
    // Separuh lainnya dari jaminan itu: admin biasa tidak dapat menyentuh
    // akun superadmin, jadi ia tidak dapat menghapus superadmin terakhir.
    const { policy } = build({ actor: biasa({ id: AKTOR }) });

    const error = await captureError(() =>
      policy.assertCanManage(AKTOR, superadmin({ id: TARGET }))
    );

    assert.equal(error.statusCode, 403);
    assert.match(error.message, /superadmin/i);
  });

  await t.test('penolakan itu yang paling penting tercatat', async () => {
    // Satu percobaan gagal tidak berarti apa-apa. Sepuluh percobaan terhadap
    // akun superadmin adalah pola yang tidak terlihat sama sekali kalau hanya
    // yang berhasil yang tersimpan.
    const { policy, audit } = build({ actor: biasa({ id: AKTOR }) });

    await captureError(() => policy.assertCanManage(AKTOR, superadmin({ id: TARGET })));

    const [entry] = audit.denied();

    assert.equal(entry.resourceId, TARGET);
    assert.match(entry.reason, /bukan superadmin/);
  });

  await t.test('pelaku yang tidak ditemukan ditolak, bukan diloloskan', async () => {
    // Praktis mustahil — id pelaku berasal dari token yang sudah diverifikasi.
    // Diuji justru karena itu: kalau suatu saat menjadi mungkin, arah
    // kegagalannya harus menolak, bukan mengizinkan.
    const { policy } = build({ actor: null });

    const error = await captureError(() =>
      policy.assertCanManage(AKTOR, superadmin({ id: TARGET }))
    );

    assert.equal(error.statusCode, 403);
  });

  await t.test('pelaku tanpa roles ditolak, bukan melempar TypeError', async () => {
    // Kalau pemanggil lupa includeRoles, `user.roles` undefined. Melempar
    // TypeError di sini berarti 500 pada jalur otorisasi — kegagalan yang
    // menyembunyikan penyebabnya.
    const { policy } = build({ actor: fakeUser({ id: AKTOR, roles: undefined }) });

    const error = await captureError(() =>
      policy.assertCanManage(AKTOR, superadmin({ id: TARGET }))
    );

    assert.equal(error.statusCode, 403);
    assert.equal(error.name, 'ForbiddenError');
  });

  await t.test('pelaku diambil BESERTA role-nya', async () => {
    // Tanpa includeRoles, daftar role pelaku kosong dan superadmin sungguhan
    // ikut tertolak.
    const { policy, users } = build({ actor: superadmin({ id: AKTOR }) });

    await policy.assertCanManage(AKTOR, superadmin({ id: TARGET }));

    const [, options] = users.findById.mock.calls[0].arguments;

    assert.deepEqual(options, { includeRoles: true });
  });
});

test('UserManagementPolicy — urutan', async (t) => {
  await t.test('audit ditulis SEBELUM error dilempar', async () => {
    // Kalau dibalik, penolakannya tidak pernah tercatat.
    const { policy, log } = build({ actor: biasa({ id: AKTOR }) });

    await captureError(() => policy.assertCanManage(AKTOR, superadmin({ id: TARGET })));

    assert.deepEqual(log, ['audit.recordDenied']);
  });
});
