/**
 * Nama aksi dan jenis sumber daya untuk jejak audit.
 *
 * Konstanta, bukan teks bebas di titik pemanggilan: nama aksi adalah kunci
 * pencarian. Satu salah ketik membuat satu kejadian tidak ikut terhitung saat
 * ditelusuri, dan tidak ada yang akan menyadarinya — query-nya hanya
 * mengembalikan baris yang lebih sedikit.
 */
const AUDIT_ACTIONS = Object.freeze({
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_ROLES_CHANGED: 'user.roles_changed',

  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  ROLE_PERMISSIONS_CHANGED: 'role.permissions_changed',

  PROFILE_UPDATED: 'profile.updated',
  AVATAR_UPLOADED: 'profile.avatar_uploaded',
  AVATAR_REMOVED: 'profile.avatar_removed',

  PASSWORD_RESET: 'password.reset',
  SESSIONS_REVOKED: 'session.all_revoked',
  REFRESH_TOKEN_REUSED: 'session.refresh_reused',
});

const AUDIT_RESOURCES = Object.freeze({
  USER: 'user',
  ROLE: 'role',
  SESSION: 'session',
});

/**
 * DENIED dipakai untuk percobaan yang ditolak aturan keamanan — bukan untuk
 * kegagalan validasi biasa. Bedanya penting: yang pertama menandakan seseorang
 * mencoba melampaui haknya, yang kedua hanya formulir yang salah isi.
 */
const AUDIT_OUTCOMES = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
});

module.exports = { AUDIT_ACTIONS, AUDIT_RESOURCES, AUDIT_OUTCOMES };
