/**
 * Bentuk permintaan endpoint profil sendiri.
 *
 * Sengaja TIDAK memuat email, isActive, maupun roleIds. Endpoint ini berarti
 * "akun saya sendiri", dan ketiganya bukan hal yang boleh diubah pemiliknya:
 * email adalah identitas login, dua sisanya kewenangan administrator.
 *
 * Dengan .strict(), mengirim salah satunya tidak diabaikan diam-diam
 * melainkan ditolak — jadi percobaan menaikkan hak sendiri lewat endpoint ini
 * terlihat sebagai 400, bukan lenyap tanpa jejak.
 */
const { z } = require('zod');

const updateProfileSchema = z
  .object({
    fullName: z
      .string({ error: 'Nama lengkap harus berupa teks' })
      .trim()
      .min(3, 'Nama lengkap minimal 3 karakter')
      .max(150, 'Nama lengkap maksimal 150 karakter')
      .optional(),
    phone: z
      .string({ error: 'Nomor telepon harus berupa teks' })
      .trim()
      .regex(/^[0-9+\-\s]{8,20}$/, 'Nomor telepon tidak valid (8-20 digit)')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Tidak ada data yang dikirim untuk diubah',
  });

module.exports = { updateProfileSchema };
