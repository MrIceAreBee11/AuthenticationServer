/**
 * BERKAS INI: dua fungsi pembentuk jawaban HTTP dengan bentuk yang seragam.
 *
 * KENAPA DI utils/ DAN TETAP FUNGSI, BUKAN CLASS: keduanya murni — tidak
 * menyimpan keadaan, tidak punya dependensi, tidak menyentuh I/O. Membungkusnya
 * jadi class hanya menambah `new` tanpa menambah satu pun kemampuan: tidak ada
 * yang bisa disuntikkan, dan tidak ada yang perlu dipalsukan saat pengujian.
 *
 * KENAPA BENTUKNYA SERAGAM: { success, message, data } selalu sama untuk
 * jawaban berhasil maupun gagal. Keseragaman itulah yang membuat antarmuka
 * dapat menangani seluruh jawaban dengan satu pembungkus fetch, tanpa cabang
 * per endpoint.
 *
 * KENAPA meta DAN details BERSYARAT: kunci yang bernilai null di setiap jawaban
 * hanya menambah bising. Ia muncul hanya ketika memang ada isinya.
 */

const successResponse = (res, statusCode, message, data = null, meta = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta && { meta }),
  });
};

const errorResponse = (res, statusCode, message, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    ...(details && { details }),
  });
};

module.exports = { successResponse, errorResponse };