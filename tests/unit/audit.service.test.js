const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { AuditService } = require('../../src/services/audit.service');
const { RequestContext } = require('../../src/utils/requestContext');
const {
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
  AUDIT_OUTCOMES,
} = require('../../src/constants/auditActions');
const { fakeLogger } = require('./fakes');

const build = ({ gagalMenulis = false } = {}) => {
  const rows = [];
  const repository = {
    create: mock.fn(async (entry) => {
      if (gagalMenulis) {
        throw new Error('tabel audit tidak dapat ditulis');
      }

      rows.push(entry);

      return entry;
    }),
  };

  const context = new RequestContext();
  const logger = fakeLogger();

  return {
    service: new AuditService({ audit: repository, context, logger }),
    rows,
    repository,
    context,
    logger,
  };
};

test('AuditService.record', async (t) => {
  await t.test('menyimpan aksi dengan hasil allowed', async () => {
    const { service, rows } = build();

    await service.record({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: 'u1',
      metadata: { email: 'a@b.test' },
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'user.created');
    assert.equal(rows[0].outcome, AUDIT_OUTCOMES.ALLOWED);
    assert.deepEqual(rows[0].metadata, { email: 'a@b.test' });
  });

  await t.test('resourceId selalu jadi teks', async () => {
    // Role memakai id integer, user memakai UUID. Kolomnya satu, jadi
    // penyeragaman harus terjadi di sini — bukan diserahkan ke pemanggil,
    // yang pasti ada yang lupa.
    const { service, rows } = build();

    await service.record({
      action: AUDIT_ACTIONS.ROLE_CREATED,
      resourceType: AUDIT_RESOURCES.ROLE,
      resourceId: 7,
    });

    assert.equal(rows[0].resourceId, '7');
    assert.equal(typeof rows[0].resourceId, 'string');
  });

  await t.test('resourceId yang tidak ada tetap null, bukan teks "null"', async () => {
    const { service, rows } = build();

    await service.record({
      action: AUDIT_ACTIONS.SESSIONS_REVOKED,
      resourceType: AUDIT_RESOURCES.SESSION,
      resourceId: null,
    });

    assert.equal(rows[0].resourceId, null);
  });
});

test('AuditService.recordDenied', async (t) => {
  await t.test('percobaan yang ditolak ikut tercatat, berikut alasannya', async () => {
    // Inilah bagian paling berguna dari seluruh jejak audit. Pola seseorang
    // berulang kali mencoba menyentuh akun yang bukan haknya tidak terlihat
    // sama sekali kalau hanya yang berhasil yang tersimpan.
    const { service, rows } = build();

    await service.recordDenied({
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: 'korban',
      reason: 'bukan superadmin',
    });

    assert.equal(rows[0].outcome, AUDIT_OUTCOMES.DENIED);
    assert.deepEqual(rows[0].metadata, { reason: 'bukan superadmin' });
  });
});

test('AuditService — pelaku dan penanda permintaan', async (t) => {
  await t.test('dibaca dari context, bukan dari argumen', async () => {
    // Alternatifnya menambah dua parameter ke SETIAP method service yang
    // mengubah data. Satu titik yang lupa meneruskannya menghasilkan baris
    // audit tanpa pelaku — dan barisnya tetap tersimpan seolah sah.
    const { service, rows, context } = build();

    await context.run({ requestId: 'req-1', userId: 'pelaku-1', ip: '10.0.0.5' }, async () => {
      await service.record({
        action: AUDIT_ACTIONS.USER_DELETED,
        resourceType: AUDIT_RESOURCES.USER,
        resourceId: 'u9',
      });
    });

    assert.equal(rows[0].actorId, 'pelaku-1');
    assert.equal(rows[0].requestId, 'req-1');
    assert.equal(rows[0].ip, '10.0.0.5');
  });

  await t.test('di luar siklus permintaan ketiganya null, bukan melempar', async () => {
    // Service yang sama juga dipanggil seeder, dan seeder tidak punya store.
    const { service, rows } = build();

    await service.record({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: 'u1',
    });

    assert.equal(rows[0].actorId, null);
    assert.equal(rows[0].requestId, null);
    assert.equal(rows[0].ip, null);
  });

  await t.test('permintaan tanpa autentikasi tercatat tanpa pelaku', async () => {
    // Reset password berjalan tanpa sesi, jadi yang diketahui hanya akun mana
    // yang terpengaruh. Justru itu yang membuatnya perlu dicatat.
    const { service, rows, context } = build();

    await context.run({ requestId: 'req-2' }, async () => {
      await service.record({
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        resourceType: AUDIT_RESOURCES.USER,
        resourceId: 'u1',
      });
    });

    assert.equal(rows[0].actorId, null);
    assert.equal(rows[0].requestId, 'req-2');
  });
});

test('AuditService — kegagalan menulis', async (t) => {
  await t.test('tidak melempar, supaya operasinya tidak ikut gagal', async () => {
    // Keputusan yang bisa diperdebatkan, jadi diuji secara eksplisit: satu
    // tabel audit yang bermasalah tidak boleh membuat seluruh aplikasi
    // berhenti bisa mengubah data.
    const { service } = build({ gagalMenulis: true });

    await service.record({
      action: AUDIT_ACTIONS.USER_CREATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: 'u1',
    });
  });

  await t.test('tetapi kegagalannya WAJIB tercatat di log', async () => {
    // Inilah yang membuat pilihan di atas dapat dipertanggungjawabkan: jejak
    // yang hilang tetap meninggalkan jejak.
    const { service, logger } = build({ gagalMenulis: true });

    await service.record({
      action: AUDIT_ACTIONS.USER_DELETED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: 'u9',
    });

    const [entry] = logger.at('exception');

    assert.match(entry.message, /gagal menulis jejak audit/);
    assert.equal(entry.fields.action, 'user.deleted');
    assert.equal(entry.fields.resourceId, 'u9');
  });
});

test('Katalog aksi audit', async (t) => {
  await t.test('nama aksi berbentuk sumberdaya.aksi', async () => {
    // Bentuk ini yang membuat penyaringan "semua kejadian pada user" jadi satu
    // pola, bukan daftar nama yang harus dirawat.
    Object.values(AUDIT_ACTIONS).forEach((action) => {
      assert.match(action, /^[a-z]+\.[a-z_]+$/, action);
    });
  });

  await t.test('tidak ada nilai terduplikasi', async () => {
    const values = Object.values(AUDIT_ACTIONS);

    assert.equal(new Set(values).size, values.length);
  });

  await t.test('katalognya beku', async () => {
    assert.ok(Object.isFrozen(AUDIT_ACTIONS));
    assert.ok(Object.isFrozen(AUDIT_RESOURCES));
    assert.ok(Object.isFrozen(AUDIT_OUTCOMES));
  });
});
