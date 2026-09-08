/**
 * Pembentuk jawaban untuk data pengguna.
 *
 * Berada di src/mappers/ dan bukan di dalam salah satu modul karena tiga modul
 * memakainya: auth (/auth/me), users (/users), dan profile.
 *
 * Sebelum ada berkas ini, controller mengirim objek model apa adanya dan
 * bergantung pada toJSON() untuk membuang passwordHash. Cara itu bekerja,
 * tetapi daftar field yang keluar ditentukan oleh SKEMA TABEL — jadi kolom
 * baru otomatis ikut terkirim tanpa ada yang memutuskan. Di sini daftarnya
 * ditulis eksplisit: kolom baru TIDAK keluar sampai ditambahkan di bawah.
 */

/** Role di dalam data pengguna: cukup identitasnya, izinnya tidak dibawa. */
const toRoleSummary = (role) => ({
  id: role.id,
  name: role.name,
});

/**
 * Bentuk pengguna untuk /users dan /auth/me.
 *
 * Dua field sengaja TIDAK ikut, dan sebelumnya keduanya terkirim:
 *
 *   avatarKey         kunci objek internal di MinIO. Pemanggil memakai
 *                     avatarUrl; kunci mentahnya hanya membocorkan pola
 *                     penamaan isi bucket.
 *   passwordChangedAt kapan seseorang terakhir mengganti password adalah
 *                     keterangan keamanan, dan tidak ada urusannya dengan
 *                     pemanggil yang sedang melihat daftar pengguna.
 *
 * updatedAt juga dilepas: tidak ada pemakainya, dan setiap field yang keluar
 * tanpa pemakai adalah field yang harus tetap didukung selamanya.
 */
const toUserDto = (user) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone ?? null,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt ?? null,
  createdAt: user.createdAt,
  ...(user.roles && { roles: user.roles.map(toRoleSummary) }),
});

const toUserListDto = (users) => users.map(toUserDto);

/**
 * Bentuk profil milik sendiri.
 *
 * Bedanya dengan toUserDto: passwordChangedAt IKUT di sini. Bagi pemilik akun
 * itu keterangan yang berguna — "kapan saya terakhir mengganti password" —
 * sedangkan bagi orang lain ia hanya keterangan keamanan tentang orang lain.
 * avatarKey tetap tidak ikut; yang dipakai peramban adalah avatarUrl.
 */
const toProfileDto = (profile) => ({
  ...toUserDto(profile),
  avatarUrl: profile.avatarUrl ?? null,
  passwordChangedAt: profile.passwordChangedAt ?? null,
});

module.exports = { toUserDto, toUserListDto, toProfileDto, toRoleSummary };
