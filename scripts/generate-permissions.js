/**
 * Membuat src/constants/permissions.js dari isi tabel "permissions".
 *
 * Database adalah sumber kebenaran katalog izin; berkas konstanta hanyalah
 * turunannya, supaya editor bisa melakukan autocomplete dan salah ketik
 * menjadi undefined yang tertangkap saat aplikasi start.
 *
 * Jalankan: npm run gen:permissions
 */
const fs = require('node:fs');
const path = require('node:path');

const { config } = require('../src/config');
const { Database } = require('../src/infrastructure/database');
const { PermissionRepository } = require('../src/repositories/permission.repository');

const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'constants', 'permissions.js');

/** "users.create" -> "USERS_CREATE" */
const toConstantKey = (name) => name.toUpperCase().replace(/[.\-\s]+/g, '_');

const buildFileContent = (permissions) => {
  const groups = new Map();

  permissions.forEach((permission) => {
    const [resource] = permission.name.split('.');

    if (!groups.has(resource)) {
      groups.set(resource, []);
    }

    groups.get(resource).push(permission);
  });

  const body = [...groups.entries()]
    .map(([resource, items]) => {
      const lines = items.map((item) => `  ${toConstantKey(item.name)}: '${item.name}',`);

      return [`  // ${resource}`, ...lines].join('\n');
    })
    .join('\n\n');

  // Sengaja tanpa penanda waktu: kalau tanggal ikut dicetak, berkas ini akan
  // berubah setiap kali generator dijalankan meski katalognya tidak berubah,
  // dan diff Git-nya menjadi berisik tanpa alasan.
  return `// ============================================================
// BERKAS INI DIBUAT OTOMATIS — JANGAN DIEDIT MANUAL
//
// Sumber kebenaran: tabel "permissions" di database.
// Menambah izin: buat migration baru berisi izin tersebut, lalu jalankan
//   npm run db:migrate && npm run gen:permissions
//
// Suntingan manual di berkas ini akan hilang saat generator dijalankan, dan
// izin yang ditulis tangan tanpa baris di database akan membuat aplikasi
// menolak menyala.
// ============================================================

const PERMISSIONS = {
${body}
};

module.exports = { PERMISSIONS };
`;
};

// Dirakit di sini, bukan diambil dari container: skrip ini hanya butuh satu
// tabel, sedangkan container ikut membuka Redis, RabbitMQ, dan MinIO yang
// tidak ada hubungannya — dan gagalnya salah satu akan menggagalkan skrip.
const database = new Database(config.app.env);

const run = async () => {
  const permissions = new PermissionRepository({ Permission: database.models.Permission });
  const permissionNames = await permissions.findAllNames();

  if (permissionNames.length === 0) {
    throw new Error('Tabel permissions kosong. Jalankan "npm run db:migrate" terlebih dahulu.');
  }

  const content = buildFileContent(permissionNames.map((name) => ({ name })));
  const previous = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null;

  if (previous === content) {
    console.log(`Tidak ada perubahan — ${permissionNames.length} izin, berkas sudah sesuai.`);
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, content);
  console.log(`src/constants/permissions.js diperbarui — ${permissionNames.length} izin.`);
};

run()
  .catch((error) => {
    console.error('Gagal membuat konstanta izin:', error.message);
    process.exitCode = 1;
  })
  .finally(() => database.close());
