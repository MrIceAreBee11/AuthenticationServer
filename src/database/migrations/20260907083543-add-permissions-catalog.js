'use strict';

/**
 * Katalog izin diletakkan di migration, bukan di seeder.
 *
 * Alasannya: kode aplikasi tidak dapat berfungsi tanpa baris-baris ini —
 * middleware authorize() membandingkan setiap permintaan dengan isi tabel ini.
 * Migration dijamin dijalankan di setiap environment karena ia mengubah
 * struktur, sedangkan seeder sering dilewati di production. Kalau katalog ini
 * absen, SELURUH endpoint terlindungi akan menjawab 403 untuk semua orang,
 * termasuk superadmin, tanpa satu pun error di log.
 *
 * Nama izin ditulis sebagai teks literal, bukan mengambil dari berkas
 * konstanta. Migration adalah catatan sejarah: isinya harus tetap
 * menggambarkan keadaan saat ia dibuat, apa pun yang berubah di kode nanti.
 */

const PERMISSION_CATALOG = [
  { name: 'users.create', description: 'Membuat user baru' },
  { name: 'users.read', description: 'Melihat daftar dan detail user' },
  { name: 'users.update', description: 'Mengubah data user' },
  { name: 'users.delete', description: 'Menghapus user' },
  { name: 'roles.create', description: 'Membuat role baru' },
  { name: 'roles.read', description: 'Melihat daftar role' },
  { name: 'roles.update', description: 'Mengubah role dan permission-nya' },
  { name: 'roles.delete', description: 'Menghapus role' },
  { name: 'permissions.read', description: 'Melihat katalog seluruh permission' },
  { name: 'profile.read', description: 'Melihat profil sendiri' },
  { name: 'profile.update', description: 'Mengubah profil sendiri' },
];

module.exports = {
  async up(queryInterface) {
    // ignoreDuplicates menghasilkan ON CONFLICT DO NOTHING, sehingga migration
    // ini aman dijalankan pada database yang izinnya sudah pernah terisi lewat
    // seeder versi sebelumnya.
    await queryInterface.bulkInsert('permissions', PERMISSION_CATALOG, {
      ignoreDuplicates: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      name: PERMISSION_CATALOG.map((permission) => permission.name),
    });
  },
};
