/**
 * Bentuk body permintaan endpoint autentikasi.
 *
 * Isinya BENTUK saja: ada tidaknya field, tipenya, formatnya. Kebijakan —
 * panjang minimal password dari config, apakah tokennya masih berlaku — tetap
 * di service. Lihat middlewares/validate.js untuk alasan pembagian itu.
 *
 * Seluruh skema memakai .strict(): field yang tidak dideklarasikan membuat
 * permintaannya DITOLAK, bukan diabaikan diam-diam. Salah ketik nama field oleh
 * klien jadi terlihat sebagai 400 dengan keterangan field mana, bukan sebagai
 * "kenapa perubahan saya tidak tersimpan".
 */
const { z } = require('zod');

/**
 * Dinormalkan di sini juga, supaya service tidak menerima dua bentuk berbeda.
 *
 * Pesan pada z.string() dipakai untuk field yang TIDAK ADA maupun yang tipenya
 * salah. Tanpa itu, pesannya jadi bawaan Zod dalam bahasa Inggris — dan pesan
 * ini sampai ke pengguna, bukan ke developer.
 */
const email = z
  .string({ error: 'Email wajib diisi' })
  .trim()
  .toLowerCase()
  .email('Format email tidak valid');

/**
 * Password TIDAK di-trim dan TIDAK dibatasi panjangnya di sini.
 *
 * Tidak di-trim karena spasi adalah karakter password yang sah — memangkasnya
 * berarti password yang berhasil dibuat tidak dapat dipakai login.
 * Panjangnya urusan service, yang membacanya dari config.
 */
const password = z.string({ error: 'Password wajib diisi' }).min(1, 'Password wajib diisi');

/** Token acak 32 byte dalam base64url. Panjang pastinya tidak dipatok di sini
 *  supaya OPAQUE_TOKEN_BYTES boleh dinaikkan tanpa menyentuh skema. */
const opaqueToken = z.string({ error: 'Token wajib diisi' }).trim().min(1, 'Token wajib diisi');

const loginSchema = z.object({ email, password }).strict();

const refreshSchema = z.object({ refreshToken: opaqueToken }).strict();

/**
 * refreshToken opsional pada logout: kalau tidak dikirim, hanya access token
 * yang dicabut dan sesinya masih dapat diperbarui. Perilaku itu disengaja.
 */
const logoutSchema = z.object({ refreshToken: opaqueToken.optional() }).strict();

const forgotPasswordSchema = z.object({ email }).strict();

const resetPasswordSchema = z.object({ token: opaqueToken, newPassword: password }).strict();

module.exports = {
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
