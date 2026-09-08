const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { envSchema } = require('../../src/config/env.schema');

const ROOT = path.join(__dirname, '..', '..');

/** Environment minimum yang sah; tiap pengujian menimpa bagian yang diuji. */
const baseEnv = () => ({
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'auth_service',
  DB_USER: 'app',
  DB_PASSWORD: 'rahasia',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: 'rahasia',
  JWT_SECRET: 'kunci-uji-yang-panjangnya-lebih-dari-32-karakter',
  JWT_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  RABBITMQ_HOST: 'localhost',
  RABBITMQ_PORT: '5672',
  RABBITMQ_USER: 'app',
  RABBITMQ_PASSWORD: 'rahasia',
  MINIO_HOST: 'localhost',
  MINIO_PORT: '9000',
  MINIO_ROOT_USER: 'app',
  MINIO_ROOT_PASSWORD: 'rahasia',
  MINIO_BUCKET: 'avatars',
  SMTP_HOST: 'smtp.contoh.test',
  SMTP_PORT: '587',
  SMTP_USER: 'app',
  SMTP_PASSWORD: 'rahasia',
  MAIL_FROM: 'Auth <noreply@contoh.test>',
  SUPERADMIN_EMAIL: 'admin@contoh.test',
  SUPERADMIN_PASSWORD: 'PasswordPanjang123',
  SUPERADMIN_FULL_NAME: 'Administrator',
});

const parse = (overrides = {}) => envSchema.safeParse({ ...baseEnv(), ...overrides });

const issuesFor = (overrides) => {
  const result = parse(overrides);

  assert.equal(result.success, false, 'seharusnya ditolak');

  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

test('Skema environment — konversi tipe', async (t) => {
  await t.test('angka dikonversi dari string, bukan dibiarkan string', async () => {
    // process.env selalu string. Tanpa konversi, PORT dipakai sebagai "3000"
    // dan perbandingan angka apa pun jadi salah tanpa error.
    const { data } = parse();

    assert.equal(typeof data.PORT, 'number');
    assert.equal(typeof data.DB_PORT, 'number');
    assert.equal(typeof data.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 'number');
  });

  await t.test('boolean tidak mengandalkan truthiness string', async () => {
    // Bug klasik: string "false" itu truthy, jadi MINIO_USE_SSL="false"
    // menyalakan SSL kalau dibaca apa adanya.
    assert.equal(parse({ MINIO_USE_SSL: 'false' }).data.MINIO_USE_SSL, false);
    assert.equal(parse({ MINIO_USE_SSL: 'true' }).data.MINIO_USE_SSL, true);
    assert.match(issuesFor({ MINIO_USE_SSL: 'iya' }).join(), /MINIO_USE_SSL/);
  });

  await t.test('durasi bergaya 15m diubah menjadi detik', async () => {
    const { data } = parse({ JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_EXPIRES_IN: '7d' });

    assert.equal(data.JWT_EXPIRES_IN, 900);
    assert.equal(data.REFRESH_TOKEN_EXPIRES_IN, 604800);
  });

  await t.test('daftar dipisah koma menjadi array yang sudah dirapikan', async () => {
    const { data } = parse({ AVATAR_ALLOWED_MIME_TYPES: 'image/png , image/webp ,' });

    assert.deepEqual(data.AVATAR_ALLOWED_MIME_TYPES, ['image/png', 'image/webp']);
  });
});

test('Skema environment — lantai keamanan', async (t) => {
  await t.test('kebijakan keamanan boleh diperketat, tidak boleh dilemahkan', async () => {
    // Inilah bedanya skema dengan sekadar memindahkan angka ke .env. Kalau
    // nilainya hanya dibaca apa adanya, siapa pun dengan akses .env dapat
    // menurunkan cost factor bcrypt ke 4 dan tidak ada yang memberi tahu.
    assert.equal(parse({ BCRYPT_SALT_ROUNDS: '14' }).data.BCRYPT_SALT_ROUNDS, 14);
    assert.equal(parse({ PASSWORD_MIN_LENGTH: '16' }).data.PASSWORD_MIN_LENGTH, 16);

    assert.match(issuesFor({ BCRYPT_SALT_ROUNDS: '4' }).join(), /BCRYPT_SALT_ROUNDS/);
    assert.match(issuesFor({ PASSWORD_MIN_LENGTH: '6' }).join(), /PASSWORD_MIN_LENGTH/);
    assert.match(issuesFor({ JWT_SECRET: 'pendek' }).join(), /minimal 32 karakter/);
    assert.match(issuesFor({ OPAQUE_TOKEN_BYTES: '8' }).join(), /OPAQUE_TOKEN_BYTES/);
  });

  await t.test('rahasia tidak boleh kosong', async () => {
    for (const key of [
      'DB_PASSWORD',
      'REDIS_PASSWORD',
      'RABBITMQ_PASSWORD',
      'MINIO_ROOT_PASSWORD',
      'SMTP_PASSWORD',
    ]) {
      assert.match(issuesFor({ [key]: '' }).join(), new RegExp(key), key);
    }
  });

  await t.test('password superadmin ikut divalidasi panjangnya', async () => {
    // Sebelum refactor ini, seeder membacanya langsung dari process.env dan
    // password kosong berujung pada hash dari string "undefined".
    assert.match(issuesFor({ SUPERADMIN_PASSWORD: 'pendek' }).join(), /SUPERADMIN_PASSWORD/);
    assert.match(issuesFor({ SUPERADMIN_EMAIL: 'bukan-email' }).join(), /SUPERADMIN_EMAIL/);
  });
});

test('Skema environment — invarian lintas variabel', async (t) => {
  await t.test('refresh token wajib lebih panjang umurnya dari access token', async () => {
    // Tidak ada satu variabel pun yang bisa memvalidasi ini sendirian. Kalau
    // terbalik, sesi mati sebelum sempat diperbarui dan pengguna harus login
    // setiap 15 menit — gejalanya membingungkan, penyebabnya satu baris .env.
    const issues = issuesFor({ JWT_EXPIRES_IN: '7d', REFRESH_TOKEN_EXPIRES_IN: '1h' });

    assert.match(issues.join(), /harus lebih panjang/);
  });

  await t.test('production menolak APP_URL tanpa HTTPS', async () => {
    // Tautan reset password melewati alamat ini.
    const issues = issuesFor({
      NODE_ENV: 'production',
      APP_URL: 'http://contoh.test',
      TRUST_PROXY: '1',
    });

    assert.match(issues.join(), /HTTPS/);
  });

  await t.test('production menolak TRUST_PROXY nol', async () => {
    // Dengan TRUST_PROXY=0 di belakang proxy, pembatas laju melihat IP proxy —
    // jadi SELURUH pengguna berbagi satu jatah lima percobaan login.
    const issues = issuesFor({
      NODE_ENV: 'production',
      APP_URL: 'https://contoh.test',
      TRUST_PROXY: '0',
    });

    assert.match(issues.join(), /TRUST_PROXY/);
  });

  await t.test('development tidak terkena kedua aturan production', async () => {
    const result = parse({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000' });

    assert.equal(result.success, true);
  });
});

test('Skema environment — seluruh masalah dilaporkan sekaligus', async (t) => {
  await t.test('bukan berhenti di variabel pertama yang salah', async () => {
    // Ini alasan utama memakai skema. Validasi lama melempar pada temuan
    // pertama, jadi memperbaiki .env berarti restart berulang kali.
    const issues = issuesFor({
      PORT: '99999',
      JWT_SECRET: 'pendek',
      BCRYPT_SALT_ROUNDS: '4',
      SUPERADMIN_EMAIL: 'bukan-email',
      MINIO_USE_SSL: 'mungkin',
    });

    assert.ok(issues.length >= 5, `hanya ${issues.length} masalah dilaporkan: ${issues.join(' | ')}`);
  });
});

test('Konsistensi berkas konfigurasi', async (t) => {
  await t.test('.env.example memuat setiap variabel yang ada di skema', async () => {
    // Pengujian ini yang membuat .env.example tidak mungkin tertinggal.
    // Tanpanya, developer baru meng-clone repositori dan aplikasinya menolak
    // menyala karena variabel yang tidak pernah didokumentasikan.
    const schemaSource = fs.readFileSync(
      path.join(ROOT, 'src', 'config', 'env.schema.js'),
      'utf8'
    );
    const exampleSource = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

    const inSchema = [...schemaSource.matchAll(/^ {4}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
    const inExample = new Set(
      [...exampleSource.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1])
    );

    const missing = inSchema.filter((key) => !inExample.has(key));

    assert.deepEqual(missing, [], `belum ada di .env.example: ${missing.join(', ')}`);
    assert.ok(inSchema.length > 40, 'skema terbaca dengan benar');
  });

  await t.test('setiap baris bertanda RAHASIA dibiarkan kosong nilainya', async () => {
    // Penanda RAHASIA di .env.example adalah konvensi, dan konvensi yang tidak
    // diuji akan luntur. Berkas ini di-commit, jadi satu nilai yang lupa
    // dikosongkan langsung menjadi rahasia yang bocor ke repositori.
    const lines = fs
      .readFileSync(path.join(ROOT, '.env.example'), 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line) && line.includes('RAHASIA'));

    lines.forEach((line) => {
      const [key, rest] = line.split('=');

      assert.equal(rest.split('#')[0].trim(), '', `nilai harus dibiarkan kosong: ${key}`);
    });

    assert.ok(lines.length >= 6, `hanya ${lines.length} baris RAHASIA terbaca`);
  });
});
