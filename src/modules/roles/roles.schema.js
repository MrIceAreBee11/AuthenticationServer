/**
 * Bentuk permintaan endpoint role dan katalog izin.
 *
 * Bentuk saja; keberadaan permissionIds di database, perlindungan role
 * superadmin, dan penolakan role yang masih dipakai tetap di service.
 */
const { z } = require('zod');

/** ID role berupa INTEGER, berbeda dari user yang memakai UUID. */
const roleId = z.coerce
  .number({ error: 'ID role tidak valid' })
  .int('ID role tidak valid')
  .positive('ID role tidak valid');

const name = z
  .string({ error: 'Nama role wajib diisi' })
  .trim()
  .min(1, 'Nama role tidak boleh kosong')
  .max(50, 'Nama role maksimal 50 karakter');

const description = z
  .string({ error: 'Keterangan harus berupa teks' })
  .trim()
  .max(255, 'Keterangan maksimal 255 karakter')
  .nullable();

const permissionIds = z.array(z.coerce.number().int().positive(), {
  error: 'permissionIds harus berupa array berisi ID izin',
});

const roleIdParamSchema = z.object({ id: roleId }).strict();

const createRoleSchema = z
  .object({
    name,
    description: description.optional(),
    permissionIds: permissionIds.optional(),
  })
  .strict();

/** Sama seperti update user: seluruh field opsional, minimal satu wajib ada. */
const updateRoleSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Tidak ada data yang dikirim untuk diubah',
  });

/**
 * permissionIds WAJIB ada di sini, dan array kosong sah.
 *
 * Keduanya bermakna: PUT berarti "jadikan tepat seperti ini", jadi array
 * kosong adalah perintah mengosongkan izin — bukan permintaan yang tidak
 * lengkap. Membiarkannya opsional membuat body kosong tanpa sengaja
 * mengosongkan seluruh izin sebuah role.
 */
const setRolePermissionsSchema = z.object({ permissionIds }).strict();

module.exports = {
  roleIdParamSchema,
  createRoleSchema,
  updateRoleSchema,
  setRolePermissionsSchema,
};
