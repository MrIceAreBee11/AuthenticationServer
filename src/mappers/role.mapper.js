/**
 * Pembentuk jawaban untuk role dan katalog izin.
 *
 * Alasan keberadaannya sama dengan user.mapper: daftar field yang keluar
 * ditentukan di sini, bukan oleh skema tabel.
 *
 * Ditempatkan bersama mapper lain, bukan di dalam modules/roles/, supaya
 * seluruh batas keluaran aplikasi terbaca dari satu folder. Kalau suatu saat
 * ada pertanyaan "field apa saja yang pernah kita janjikan ke pemanggil",
 * jawabannya ada di satu tempat.
 */
const toPermissionDto = (permission) => ({
  id: permission.id,
  name: permission.name,
  description: permission.description ?? null,
});

/**
 * userCount dan isProtected bukan kolom tabel — keduanya dihitung service.
 * Keduanya sengaja ikut: antarmuka memakainya untuk menonaktifkan tombol hapus
 * pada role yang dilindungi atau yang masih dipakai, dan tanpa itu penolakan
 * baru muncul setelah pengguna menekan tombolnya.
 */
const toRoleDto = (role) => ({
  id: role.id,
  name: role.name,
  description: role.description ?? null,
  userCount: role.userCount ?? 0,
  isProtected: role.isProtected ?? false,
  createdAt: role.createdAt,
  ...(role.permissions && { permissions: role.permissions.map(toPermissionDto) }),
});

const toRoleListDto = (roles) => roles.map(toRoleDto);

/**
 * Katalog izin lengkap, dipakai antarmuka untuk menyusun matriks izin.
 * `groups` adalah izin yang sama dikelompokkan per sumber daya, jadi ia
 * dibentuk ulang dari daftar yang sudah dipetakan — bukan dipetakan dua kali.
 */
const toPermissionCatalogDto = ({ permissions, groups }) => ({
  permissions: permissions.map(toPermissionDto),
  groups: Object.fromEntries(
    Object.entries(groups).map(([resource, items]) => [resource, items.map(toPermissionDto)])
  ),
});

module.exports = { toRoleDto, toRoleListDto, toPermissionDto, toPermissionCatalogDto };
