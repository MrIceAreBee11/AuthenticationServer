/**
 * BERKAS INI: penerbitan dan pemeriksaan token.
 *
 * KENAPA DI utils/ PADAHAL SEBUAH CLASS: berkas ini tidak melayani satu fitur.
 * AuthService menerbitkan access token, PasswordService membuat token reset,
 * middleware autentikasi memeriksa tanda tangan. Karena dipakai lintas fitur
 * dan tidak menyentuh penyimpanan apa pun, tempatnya di sini — bukan di
 * modules/auth/.
 *
 * KENAPA CLASS, BUKAN FUNGSI SEPERTI SEBELUMNYA: berkas ini mengimpor config
 * secara langsung. Akibatnya tidak ada satu pun pengujian yang bisa mencoba
 * kunci lain atau masa berlaku lain tanpa mengubah environment global. Kunci
 * dan masa berlaku sekarang masuk lewat constructor.
 *
 * DUA JENIS TOKEN DI SINI, dan bedanya bukan kebetulan:
 *
 *   JWT (access token)  — membawa isinya sendiri, dapat diperiksa tanpa
 *                         menyentuh penyimpanan. Konsekuensinya: TIDAK dapat
 *                         dibatalkan sebelum kedaluwarsa.
 *   Token buram         — teks acak tanpa isi. Tidak berarti apa pun tanpa
 *                         baris pasangannya di penyimpanan, dan justru itu yang
 *                         membuatnya dapat dicabut kapan saja.
 *
 * Refresh token dan token reset password memakai yang kedua karena keduanya
 * WAJIB dapat dicabut.
 */
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

class TokenService {
  constructor({ secret, accessTtlSeconds, opaqueBytes, issuer, audience }) {
    this.secret = secret;
    this.accessTtlSeconds = accessTtlSeconds;
    this.opaqueBytes = opaqueBytes;
    this.issuer = issuer;
    this.audience = audience;
  }

  /**
   * jti adalah pegangan satu-satunya untuk mencabut token lewat logout.
   * Tanpanya, daftar cabut tidak punya apa pun untuk ditandai.
   */
  signAccessToken(userId) {
    const jti = crypto.randomUUID();

    const token = jwt.sign({ jti }, this.secret, {
      subject: userId,
      expiresIn: this.accessTtlSeconds,
      issuer: this.issuer,
      audience: this.audience,
    });

    return { token, jti };
  }

  /**
   * Tanda tangan saja tidak cukup. Tanpa memeriksa iss dan aud, token yang
   * diterbitkan layanan lain dengan secret yang sama akan lolos — dan itu
   * skenario nyata begitu satu secret dipakai lebih dari satu layanan.
   */
  verifyAccessToken(token) {
    return jwt.verify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
    });
  }

  /**
   * base64url dipilih supaya token dapat langsung ditempel ke dalam URL tanpa
   * perlu di-escape — penting karena token reset dikirim lewat tautan email.
   */
  createOpaqueToken() {
    return crypto.randomBytes(this.opaqueBytes).toString('base64url');
  }
}

module.exports = { TokenService };
