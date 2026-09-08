const test = require('node:test');
const assert = require('node:assert/strict');

const { parseDuration } = require('../../src/utils/duration');

test('parseDuration — nilai yang diterima', async (t) => {
  await t.test('setiap satuan diubah ke detik dengan benar', async () => {
    assert.equal(parseDuration('30s'), 30);
    assert.equal(parseDuration('15m'), 900);
    assert.equal(parseDuration('1h'), 3600);
    assert.equal(parseDuration('24h'), 86400);
    assert.equal(parseDuration('7d'), 604800);
  });

  await t.test('spasi di tepi diabaikan', async () => {
    assert.equal(parseDuration('  7d  '), 604800);
  });
});

test('parseDuration — nilai yang ditolak', async (t) => {
  await t.test('satuan yang tidak didukung ditolak, bukan diterjemahkan diam-diam', async () => {
    // Inilah gunanya. Tanpa penolakan ini, "1w" menghasilkan NaN yang mengalir
    // sampai ke kolom tanggal, dan kegagalannya baru terlihat jauh kemudian.
    for (const buruk of ['1w', '1y', '7 hari', '7', 'd7', '7dd', '', '  ']) {
      assert.throws(
        () => parseDuration(buruk),
        /tidak dikenali/,
        `nilai "${buruk}" seharusnya ditolak`
      );
    }
  });

  await t.test('nilai kosong dan bukan teks ditolak', async () => {
    for (const buruk of [undefined, null, {}, []]) {
      assert.throws(() => parseDuration(buruk), /tidak dikenali/);
    }
  });

  await t.test('nol ditolak', async () => {
    assert.throws(() => parseDuration('0d'), /harus lebih dari nol/);
    assert.throws(() => parseDuration('0s'), /harus lebih dari nol/);
  });

  await t.test('angka negatif tidak lolos pola', async () => {
    assert.throws(() => parseDuration('-7d'), /tidak dikenali/);
  });

  await t.test('pesan error menyebutkan nama variabelnya', async () => {
    // Supaya saat aplikasi menolak menyala, yang salah tulis langsung terlihat.
    assert.throws(() => parseDuration('1w', 'REFRESH_TOKEN_EXPIRES_IN'), {
      message: /REFRESH_TOKEN_EXPIRES_IN/,
    });
  });
});
