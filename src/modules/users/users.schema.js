/**
 * Bentuk permintaan endpoint pengelolaan pengguna.
 *
 * Bentuk saja; keberadaan roleIds di database dan hak mengelola target tetap
 * diperiksa service.
 */
const { z } = require('zod');

const uuid = z.string({ error: 'ID user tidak valid' }).uuid('ID user tidak valid');

const email = z
  .string({ error: 'Email wajib diisi' })
  .trim()
  .toLowerCase()
  .email('Format email tidak valid');

const fullName = z
  .string({ error: 'Nama lengkap wajib diisi' })
  .trim()
  .min(3, 'Nama lengkap minimal 3 karakter')
  .max(150, 'Nama lengkap maksimal 150 karakter');

/**
 * phone menerima null secara eksplisit, bukan hanya boleh absen.
 *
 * Bedanya bermakna: absen berarti "jangan diubah", null berarti "kosongkan".
 * Antarmuka mengirim null ketika kolomnya dikosongkan, dan tanpa .nullable()
 * permintaan itu akan ditolak.
 */
const phone = z
  .string({ error: 'Nomor telepon harus berupa teks' })
  .trim()
  .regex(/^[0-9+\-\s]{8,20}$/, 'Nomor telepon tidak valid (8-20 digit)')
  .nullable();

/** ID role berupa bilangan bulat positif; string dari JSON ikut dikonversi. */
const roleIds = z.array(z.coerce.number().int().positive(), {
  error: 'roleIds harus berupa array berisi ID role',
});

const listUsersQuerySchema = z
  .object({
    // Batas atas tetap ditentukan service dari config. Di sini hanya dipastikan
    // angkanya benar-benar angka — query string selalu berupa teks, dan tanpa
    // konversi ?limit=abc menjadi NaN yang mengalir sampai ke klausa LIMIT.
    page: z.coerce
      .number({ error: 'page harus berupa angka' })
      .int('page harus bilangan bulat')
      .positive('page harus lebih dari nol')
      .optional(),
    limit: z.coerce
      .number({ error: 'limit harus berupa angka' })
      .int('limit harus bilangan bulat')
      .positive('limit harus lebih dari nol')
      .optional(),
  })
  .strict();

const userIdParamSchema = z.object({ id: uuid }).strict();

const createUserSchema = z
  .object({
    email,
    password: z.string({ error: 'Password wajib diisi' }).min(1, 'Password wajib diisi'),
    fullName,
    phone: phone.optional(),
    roleIds: roleIds.optional(),
  })
  .strict();

/**
 * Seluruh field opsional, tetapi minimal satu wajib ada.
 *
 * Tanpa .refine itu, PATCH dengan body kosong lolos ke service dan baru
 * ditolak di sana — jadi aturan yang sama ditegakkan dua kali dengan pesan
 * berbeda. Di sini bentuknya yang menolak, jadi pesannya satu.
 */
const updateUserSchema = z
  .object({
    fullName: fullName.optional(),
    phone: phone.optional(),
    isActive: z.boolean({ error: 'isActive harus bernilai true atau false' }).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Tidak ada data yang dikirim untuk diubah',
  });

const setUserRolesSchema = z.object({ roleIds }).strict();

module.exports = {
  listUsersQuerySchema,
  userIdParamSchema,
  createUserSchema,
  updateUserSchema,
  setUserRolesSchema,
};
