const test = require('node:test');
const assert = require('node:assert/strict');

const { Logger } = require('../../src/utils/logger');
const { RequestContext } = require('../../src/utils/requestContext');

/** Stream palsu yang menyimpan baris, bukan mencetaknya. */
const fakeStream = () => {
  const lines = [];

  return {
    lines,
    write: (text) => lines.push(text),
    parsed: () => lines.map((line) => JSON.parse(line)),
  };
};

const build = (options = {}) => {
  const stream = fakeStream();

  return { logger: new Logger({ stream, ...options }), stream };
};

test('Logger — bentuk keluaran', async (t) => {
  await t.test('satu baris JSON yang sah per kejadian', async () => {
    const { logger, stream } = build();

    logger.info('pengguna masuk', { userId: 'u1' });

    assert.equal(stream.lines.length, 1);
    assert.ok(stream.lines[0].endsWith('\n'), 'harus diakhiri baris baru');

    const [entry] = stream.parsed();

    assert.equal(entry.level, 'info');
    assert.equal(entry.msg, 'pengguna masuk');
    assert.equal(entry.userId, 'u1');
    assert.ok(!Number.isNaN(Date.parse(entry.time)));
  });

  await t.test('tanpa field tambahan pun tetap JSON yang sah', async () => {
    const { logger, stream } = build();

    logger.info('server berjalan');

    assert.equal(stream.parsed()[0].msg, 'server berjalan');
  });
});

test('Logger — level', async (t) => {
  await t.test('level di bawah ambang tidak dicetak', async () => {
    const { logger, stream } = build({ level: 'warn' });

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    assert.deepEqual(
      stream.parsed().map((entry) => entry.msg),
      ['c', 'd']
    );
  });

  await t.test('ambang bawaan info, jadi debug tidak bocor ke production', async () => {
    const { logger, stream } = build();

    logger.debug('rincian internal');

    assert.equal(stream.lines.length, 0);
  });

  await t.test('level yang tidak dikenal jatuh ke info, bukan membisu', async () => {
    // Logger yang diam karena salah konfigurasi jauh lebih berbahaya daripada
    // logger yang terlalu berisik.
    const { logger, stream } = build({ level: 'ngawur' });

    logger.info('a');

    assert.equal(stream.lines.length, 1);
  });
});

test('Logger — redaksi', async (t) => {
  await t.test('field sensitif tidak pernah masuk log', async () => {
    const { logger, stream } = build();

    logger.info('percobaan login', {
      email: 'orang@contoh.test',
      password: 'RahasiaSekali123',
      token: 'eyJhbGciOi',
      refreshToken: 'abc123',
    });

    const [entry] = stream.parsed();
    const raw = stream.lines[0];

    assert.equal(entry.email, 'orang@contoh.test', 'yang tidak sensitif tetap utuh');
    assert.equal(entry.password, '[REDACTED]');
    assert.equal(entry.token, '[REDACTED]');
    assert.equal(entry.refreshToken, '[REDACTED]');
    assert.ok(!raw.includes('RahasiaSekali123'));
    assert.ok(!raw.includes('eyJhbGciOi'));
  });

  await t.test('redaksi menembus objek bersarang', async () => {
    // Nilai sensitif paling sering ikut lewat objek permintaan yang di-log
    // apa adanya, bukan lewat field tingkat teratas.
    const { logger, stream } = build();

    logger.info('permintaan', { body: { nested: { password: 'bocor' } } });

    assert.ok(!stream.lines[0].includes('bocor'));
  });

  await t.test('objek yang menunjuk dirinya sendiri tidak membuat logger melempar', async () => {
    // Logger adalah bagian yang paling harus dapat diandalkan. Ia tidak boleh
    // menjadi penyebab kegagalan baru saat sedang mencatat kegagalan lain.
    const { logger, stream } = build();
    const melingkar = { nama: 'a' };

    melingkar.diri = melingkar;

    logger.info('objek melingkar', { melingkar });

    assert.equal(stream.lines.length, 1);
  });

  await t.test('array ikut diredaksi', async () => {
    const { logger, stream } = build();

    logger.info('daftar', { items: [{ password: 'bocor' }] });

    assert.ok(!stream.lines[0].includes('bocor'));
  });
});

test('Logger — child', async (t) => {
  await t.test('field induk terbawa, field anak menang', async () => {
    const { logger, stream } = build({ bindings: { env: 'test', component: 'induk' } });

    logger.child({ component: 'redis' }).info('tersambung');

    const [entry] = stream.parsed();

    assert.equal(entry.env, 'test');
    assert.equal(entry.component, 'redis');
  });

  await t.test('induk tidak tersentuh oleh anak', async () => {
    const { logger, stream } = build();

    logger.child({ component: 'anak' });
    logger.info('dari induk');

    assert.equal(stream.parsed()[0].component, undefined);
  });

  await t.test('ambang level ikut terwarisi', async () => {
    const { logger, stream } = build({ level: 'error' });

    logger.child({ component: 'x' }).info('tidak boleh muncul');

    assert.equal(stream.lines.length, 0);
  });
});

test('Logger — exception', async (t) => {
  await t.test('error masuk sebagai field terstruktur, bukan digabung ke pesan', async () => {
    // Stack trace yang disisipkan ke dalam teks pesan merusak parsing barisnya.
    const { logger, stream } = build();

    logger.exception('gagal menyimpan', new TypeError('x bukan fungsi'), { userId: 'u1' });

    const [entry] = stream.parsed();

    assert.equal(entry.level, 'error');
    assert.equal(entry.msg, 'gagal menyimpan');
    assert.equal(entry.err.name, 'TypeError');
    assert.equal(entry.err.message, 'x bukan fungsi');
    assert.ok(entry.err.stack.includes('TypeError'));
    assert.equal(entry.userId, 'u1');
  });

  await t.test('error yang null tidak membuatnya melempar', async () => {
    const { logger, stream } = build();

    logger.exception('gagal', null);

    assert.equal(stream.lines.length, 1);
  });
});

test('Logger — correlation ID', async (t) => {
  await t.test('requestId dibaca dari context saat menulis', async () => {
    // Dibaca saat menulis, bukan saat logger dibuat. Itulah yang membuat satu
    // logger bersama tetap menandai baris dengan permintaan yang benar tanpa
    // perlu diteruskan lewat setiap pemanggilan.
    const context = new RequestContext();
    const { logger, stream } = build({ context });

    await context.run({ requestId: 'req-123' }, async () => {
      logger.info('di dalam permintaan');
    });

    logger.info('di luar permintaan');

    const [didalam, diluar] = stream.parsed();

    assert.equal(didalam.requestId, 'req-123');
    assert.equal(diluar.requestId, undefined);
  });

  await t.test('dua permintaan bersamaan tidak saling tertukar requestId', async () => {
    // Inilah alasan memakai AsyncLocalStorage dan bukan variabel global. Node
    // melayani banyak permintaan sekaligus dalam satu proses; variabel global
    // akan tertimpa di tengah await dan log jadi salah tertaut.
    const context = new RequestContext();
    const { logger, stream } = build({ context });

    const permintaan = (id, jeda) =>
      context.run({ requestId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, jeda));
        logger.info('selesai');
      });

    await Promise.all([permintaan('req-a', 20), permintaan('req-b', 5)]);

    const ids = stream.parsed().map((entry) => entry.requestId);

    assert.equal(ids.length, 2);
    assert.deepEqual([...ids].sort(), ['req-a', 'req-b']);
  });

  await t.test('child logger ikut membawa requestId', async () => {
    const context = new RequestContext();
    const { logger, stream } = build({ context });

    await context.run({ requestId: 'req-x' }, async () => {
      logger.child({ component: 'redis' }).error('gagal');
    });

    assert.equal(stream.parsed()[0].requestId, 'req-x');
  });
});
