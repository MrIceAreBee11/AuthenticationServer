/**
 * BERKAS INI: nama role yang punya arti khusus bagi kode.
 *
 * KENAPA DI constants/: ini himpunan domain tertutup, bukan tombol operasional.
 * Menjadikannya variabel environment justru berbahaya — mengubahnya di
 * production akan membuat aturan keamanan di bawah menunjuk role yang tidak ada,
 * dan perlindungannya berhenti bekerja tanpa satu pun error.
 *
 * KENAPA ADA SAMA SEKALI: sebelum ini, teks 'superadmin' ditulis ulang di tiga
 * berkas — roles.service.js melindunginya dari penghapusan, users.service.js
 * memakainya untuk memutuskan siapa boleh mengelola siapa, dan seeder
 * membuatnya. Salah ketik di salah satu dari tiga tempat itu tidak menghasilkan
 * error apa pun; yang terjadi hanya perlindungan akun superadmin diam-diam
 * berhenti bekerja. Sekarang ketiganya membaca baris yang sama.
 */
const ROLES = Object.freeze({
  SUPERADMIN: 'superadmin',
});

/** Role yang tidak boleh diganti nama maupun dihapus lewat API. */
const PROTECTED_ROLES = Object.freeze([ROLES.SUPERADMIN]);

module.exports = { ROLES, PROTECTED_ROLES };
