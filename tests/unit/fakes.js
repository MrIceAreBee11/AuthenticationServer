const { mock } = require('node:test');

const { TokenService } = require('../../src/utils/token');

/**
 * Objek palsu untuk seluruh dependensi lapisan service.
 *
 * Inilah yang dibeli oleh perpindahan ke class pada Fase 2: karena setiap
 * service menerima dependensinya lewat constructor, seluruh basis data, Redis,
 * dan RabbitMQ dapat digantikan objek di berkas ini. Tidak ada satu pun
 * layanan yang perlu hidup untuk menjalankan pengujian unit.
 *
 * Setiap metode palsu memakai mock.fn() dari node:test, sehingga jumlah dan
 * argumen pemanggilannya dapat diperiksa. Selain itu setiap pemanggilan
 * dicatat ke sebuah array bersama, supaya URUTAN antar objek pun dapat
 * dibuktikan — dipakai misalnya untuk memastikan password diubah sebelum token
 * resetnya dihapus.
 */

/** Array bersama tempat seluruh objek palsu mencatat urutan pemanggilan. */
const createLog = () => [];

/** Membungkus sebuah fungsi agar namanya tercatat di log sebelum dijalankan. */
const logged = (log, name, implementation) =>
  mock.fn(async (...args) => {
    log.push(name);

    return implementation(...args);
  });

/**
 * Menangkap error dari sebuah fungsi async agar isinya dapat diperiksa.
 * assert.rejects tidak mengembalikan error-nya, sedangkan banyak pengujian di
 * sini perlu membandingkan pesan dan statusCode antar dua jalur berbeda.
 */
const captureError = async (fn) => {
  try {
    await fn();
  } catch (error) {
    return error;
  }

  throw new Error('Diharapkan gagal, tetapi justru berhasil');
};

/**
 * Menirukan instance model User sejauh yang benar-benar dipakai service:
 * pembanding password, penyaring kolom rahasia, dan daftar role.
 */
const fakeUser = (overrides = {}) => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'orang@contoh.test',
    fullName: 'Orang Contoh',
    phone: null,
    isActive: true,
    passwordHash: '$2b$12$hash-palsu-bukan-hash-sungguhan',
    lastLoginAt: null,
    passwordChangedAt: null,
    roles: [],
    comparePassword: mock.fn(async () => true),
    ...overrides,
  };

  // Model asli membuang passwordHash di toJSON(). Ditirukan di sini supaya
  // pengujian dapat membuktikan service tidak pernah membocorkannya.
  user.toJSON =
    overrides.toJSON ??
    (() => {
      const { passwordHash, comparePassword, toJSON, ...aman } = user;

      return aman;
    });

  return user;
};

/** Pengguna beserta role dan izinnya, bentuk yang dipakai PermissionService. */
const fakeUserWithPermissions = (permissionsPerRole) =>
  fakeUser({
    roles: permissionsPerRole.map((names, index) => ({
      id: index + 1,
      name: `role-${index + 1}`,
      permissions: names.map((name) => ({ name })),
    })),
  });

const fakeRole = (overrides = {}) => {
  const role = {
    id: 2,
    name: 'admin',
    description: 'Administrator',
    permissions: [],
    ...overrides,
  };

  role.toJSON = () => {
    const { toJSON, ...rest } = role;

    return rest;
  };

  return role;
};

const fakeUserRepository = ({ user = null, page = null, log = createLog() } = {}) => ({
  log,
  findByEmail: logged(log, 'users.findByEmail', async () => user),
  findById: logged(log, 'users.findById', async () => user),
  findWithRolePermissions: logged(log, 'users.findWithRolePermissions', async () => user),
  paginate: logged(log, 'users.paginate', async () => page ?? { rows: [], count: 0 }),
  create: logged(log, 'users.create', async (data) => fakeUser(data)),
  update: logged(log, 'users.update', async (target, changes) =>
    Object.assign(target, changes)
  ),
  destroy: logged(log, 'users.destroy', async () => undefined),
  setRoles: logged(log, 'users.setRoles', async () => undefined),
});

const fakeDenylistRepository = ({ revoked = false, log = createLog() } = {}) => ({
  log,
  revoke: logged(log, 'denylist.revoke', async () => undefined),
  isRevoked: logged(log, 'denylist.isRevoked', async () => revoked),
});

/**
 * Baris refresh_tokens palsu. Field-nya sengaja hanya yang benar-benar dibaca
 * service: penanda rangkaian, tanggal kedaluwarsa, dan tanggal pencabutan.
 */
const fakeRefreshTokenRow = (overrides = {}) => ({
  id: 'baris-1',
  userId: '11111111-1111-4111-8111-111111111111',
  familyId: 'keluarga-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  ...overrides,
});

const fakeRefreshTokenRepository = ({ row = null, log = createLog() } = {}) => ({
  log,
  create: logged(log, 'refreshTokens.create', async (data) => fakeRefreshTokenRow(data)),
  findByToken: logged(log, 'refreshTokens.findByToken', async () => row),
  revoke: logged(log, 'refreshTokens.revoke', async (target) =>
    Object.assign(target, { revokedAt: new Date() })
  ),
  revokeFamily: logged(log, 'refreshTokens.revokeFamily', async () => 1),
  revokeAllForUser: logged(log, 'refreshTokens.revokeAllForUser', async () => 1),
  deleteExpired: logged(log, 'refreshTokens.deleteExpired', async () => 0),
});

const fakeResetTokenRepository = ({ userId = null, log = createLog() } = {}) => ({
  log,
  save: logged(log, 'resetTokens.save', async () => undefined),
  findUserId: logged(log, 'resetTokens.findUserId', async () => userId),
  remove: logged(log, 'resetTokens.remove', async () => undefined),
});

const fakeRoleRepository = ({
  role = null,
  roles = [],
  byIds = null,
  userCounts = {},
  log = createLog(),
} = {}) => ({
  log,
  findById: logged(log, 'roles.findById', async () => role),
  findAll: logged(log, 'roles.findAll', async () => roles),
  findByIds: logged(log, 'roles.findByIds', async (ids) => byIds ?? ids.map((id) => fakeRole({ id }))),
  create: logged(log, 'roles.create', async (data) => fakeRole(data)),
  update: logged(log, 'roles.update', async (target, changes) => Object.assign(target, changes)),
  destroy: logged(log, 'roles.destroy', async () => undefined),
  setPermissions: logged(log, 'roles.setPermissions', async () => undefined),
  countUsersPerRole: logged(log, 'roles.countUsersPerRole', async () => userCounts),
});

const fakePermissionRepository = ({
  permissions = [],
  names = null,
  byIds = null,
  log = createLog(),
} = {}) => ({
  log,
  findAll: logged(log, 'permissions.findAll', async () => permissions),
  findAllNames: logged(
    log,
    'permissions.findAllNames',
    async () => names ?? permissions.map((item) => item.name)
  ),
  findByIds: logged(log, 'permissions.findByIds', async (ids) =>
    byIds ?? ids.map((id) => ({ id, name: `izin-${id}`, toJSON: () => ({ id }) }))
  ),
});

const fakePermissionCache = ({ permissions = [], log = createLog() } = {}) => ({
  log,
  getUserPermissions: logged(log, 'cache.getUserPermissions', async () => permissions),
  invalidateUser: logged(log, 'cache.invalidateUser', async () => undefined),
  bumpVersion: logged(log, 'cache.bumpVersion', async () => '2'),
});

/**
 * Redis palsu berbasis Map.
 *
 * `fail` adalah predikat (operasi, kunci) yang menentukan operasi mana yang
 * dibuat gagal. Bentuk predikat dipilih, bukan sekadar daftar nama operasi,
 * karena beberapa pengujian perlu membuat pembacaan kunci cache gagal
 * sementara pembacaan kunci versi tetap berhasil.
 */
const fakeCache = ({ fail = () => false, initial = {} } = {}) => {
  const store = new Map(Object.entries(initial));

  const guard = (operation, key) => {
    if (fail(operation, key)) {
      throw new Error(`Redis tidak dapat dihubungi (${operation} ${key})`);
    }
  };

  return {
    store,
    get: mock.fn(async (key) => {
      guard('get', key);

      return store.has(key) ? store.get(key) : null;
    }),
    set: mock.fn(async (key, value) => {
      guard('set', key);
      store.set(key, String(value));

      return 'OK';
    }),
    del: mock.fn(async (key) => {
      guard('del', key);

      return store.delete(key) ? 1 : 0;
    }),
    exists: mock.fn(async (key) => {
      guard('exists', key);

      return store.has(key) ? 1 : 0;
    }),
    incr: mock.fn(async (key) => {
      guard('incr', key);

      const next = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(next));

      return next;
    }),
  };
};

/**
 * TokenService sungguhan, bukan palsu.
 *
 * Ia murni — hanya kriptografi dan JWT, tanpa satu pun I/O — jadi memalsukannya
 * berarti menguji tiruannya. Yang dipakai di sini adalah kunci uji, bukan kunci
 * asli, dan itu justru membuktikan bahwa kunci memang masuk lewat constructor.
 */
const testTokenService = (overrides = {}) =>
  new TokenService({
    secret: 'kunci-uji-yang-panjangnya-lebih-dari-32-karakter',
    accessTtlSeconds: 900,
    opaqueBytes: 32,
    issuer: 'auth-service-uji',
    audience: 'auth-service-uji-api',
    ...overrides,
  });

/** Kebijakan password untuk pengujian; nilainya sama dengan bawaan skema. */
const testPasswordPolicy = (overrides = {}) => ({
  minLength: 12,
  saltRounds: 12,
  resetTtlSeconds: 900,
  ...overrides,
});

/** Pembungkus transaksi palsu: jalankan callback tanpa transaksi sungguhan. */
const fakeDatabase = ({ log = createLog() } = {}) => ({
  log,
  runInTransaction: logged(log, 'database.runInTransaction', async (callback) =>
    callback(null)
  ),
  query: logged(log, 'database.query', async () => []),
});

/**
 * Logger palsu yang merekam, bukan mencetak.
 *
 * Menggantikan seluruh pembungkam console. Sebelumnya jalur kegagalan diuji
 * dengan membungkam console.error supaya keluaran tes tidak berisik — yang
 * berarti tidak ada satu pun assertion atas APA yang dicatat. Sekarang isinya
 * dapat diperiksa.
 */
const fakeLogger = () => {
  const entries = [];

  const record = (level) => (message, fieldsOrError, fields) =>
    entries.push({ level, message, fieldsOrError, fields });

  return {
    entries,
    error: record('error'),
    warn: record('warn'),
    info: record('info'),
    debug: record('debug'),
    exception: record('exception'),
    child: () => fakeLogger(),
    /** Baris yang levelnya cocok; dipakai assertion. */
    at: (level) => entries.filter((entry) => entry.level === level),
  };
};

/**
 * Pencatat audit palsu yang merekam, bukan menulis ke basis data.
 *
 * Dipakai untuk membuktikan bahwa perubahan data DAN percobaan yang ditolak
 * benar-benar meninggalkan jejak — bagian yang paling mudah lupa ditulis dan
 * paling sulit disadari hilangnya.
 */
const fakeAudit = ({ log = createLog() } = {}) => {
  const entries = [];

  return {
    log,
    entries,
    record: logged(log, 'audit.record', async (entry) => {
      entries.push({ ...entry, outcome: 'allowed' });
    }),
    recordDenied: logged(log, 'audit.recordDenied', async (entry) => {
      entries.push({ ...entry, outcome: 'denied' });
    }),
    /** Baris audit dengan aksi tertentu; dipakai assertion. */
    of: (action) => entries.filter((entry) => entry.action === action),
    denied: () => entries.filter((entry) => entry.outcome === 'denied'),
  };
};

/** Objek res palsu yang merekam status dan isi jawaban. */
const fakeResponse = () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;

      return res;
    },
    json(payload) {
      res.body = payload;

      return res;
    },
  };

  return res;
};

/** Membungkam console.error selama pengujian jalur kegagalan. */
const silenceErrorLog = () => mock.method(console, 'error', () => {});

/** Membungkam console.log selama pengujian yang memicu log informasi. */
const silenceInfoLog = () => mock.method(console, 'log', () => {});

module.exports = {
  fakeAudit,
  fakeLogger,
  testTokenService,
  testPasswordPolicy,
  fakeDatabase,
  createLog,
  captureError,
  fakeUser,
  fakeUserWithPermissions,
  fakeRole,
  fakeUserRepository,
  fakeDenylistRepository,
  fakeRefreshTokenRow,
  fakeRefreshTokenRepository,
  fakeResetTokenRepository,
  fakeRoleRepository,
  fakePermissionRepository,
  fakePermissionCache,
  fakeCache,
  fakeResponse,
  silenceErrorLog,
  silenceInfoLog,
};
