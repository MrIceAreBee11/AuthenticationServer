/**
 * Pabrik middleware pemeriksa bentuk permintaan.
 *
 * Tetap fungsi, bukan class: ia tidak punya satu pun dependency untuk
 * disuntikkan dan tidak menyimpan state. Alasannya sama dengan
 * utils/response.js — class hanya menambah `new` tanpa menambah kemampuan.
 *
 * PEMBAGIAN TUGAS dengan service, dan ini yang menentukan isi tiap skema:
 *
 *   skema Zod  -> BENTUK. Ada tidaknya field, tipenya, formatnya, konversinya.
 *   service    -> KEBIJAKAN. Panjang minimal password (dari config), apakah
 *                 role-nya benar-benar ada, apakah target boleh dikelola.
 *
 * Kalau kebijakan ikut ditaruh di skema, nilai config harus disuntikkan ke
 * skema — dan panjang minimal password jadi tertulis di dua tempat.
 *
 * Pemeriksaan di service TIDAK dihapus meski sebagian jadi tak terjangkau
 * lewat HTTP. Service juga dipanggil seeder dan bisa dipanggil kode lain nanti;
 * membuang penjagaan hanya karena ada penjagaan di lapisan atasnya adalah cara
 * lubang keamanan muncul saat pemanggil baru ditambahkan.
 *
 * HASILNYA DITARUH DI req.valid, BUKAN MENIMPA req.body/req.query.
 *
 * Awalnya middleware ini menimpa req[source]. Untuk body dan params itu
 * bekerja, tetapi untuk query TIDAK: Express 5 mendefinisikan req.query sebagai
 * getter, jadi penugasan padanya tidak melempar apa pun DAN tidak berlaku —
 * hasil konversi Zod terbuang diam-diam dan controller tetap menerima teks.
 *
 * Selain menghindari itu, req.valid punya keuntungan sendiri: controller yang
 * membaca req.valid.body membuktikan validasinya berjalan. Membaca req.body
 * tidak membuktikan apa pun.
 */
const { BadRequestError } = require('../utils/AppError');
const { ERROR_CODES } = require('../constants/errorCodes');

/** Zod menyusun jalur sebagai array; akar objek dilaporkan sebagai "(body)". */
const toFieldErrors = (issues) =>
  issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  }));

/**
 * @param {import('zod').ZodType} schema
 * @param {'body'|'query'|'params'} source bagian permintaan yang diperiksa
 */
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});

    if (!result.success) {
      // Seluruh field yang salah dilaporkan sekaligus, bukan yang pertama saja.
      // Bentuk details-nya sama dengan yang dipakai ValidationError Sequelize,
      // jadi antarmuka menanganinya dengan satu jalur.
      throw new BadRequestError('Data yang dikirim tidak valid', ERROR_CODES.VALIDATION_FAILED, {
        errors: toFieldErrors(result.error.issues),
      });
    }

    // Ditumpuk, bukan ditimpa: satu route bisa memeriksa params dan body
    // sekaligus, dan yang kedua tidak boleh menghapus hasil yang pertama.
    req.valid = { ...req.valid, [source]: result.data };

    return next();
  };

module.exports = { validate };
