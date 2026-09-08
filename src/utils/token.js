const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const { config } = require('../config');

const signAccessToken = (userId) => {
  const jti = crypto.randomUUID();

  const token = jwt.sign({ jti }, config.token.secret, {
    subject: userId,
    expiresIn: config.token.accessTtlSeconds,
  });

  return { token, jti };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, config.token.secret);
};

const OPAQUE_TOKEN_BYTES = config.token.opaqueBytes;

/**
 * Token acak tanpa isi apa pun — kebalikan dari JWT.
 *
 * JWT membawa datanya sendiri dan dapat diperiksa tanpa menyentuh
 * penyimpanan; konsekuensinya ia tidak dapat dibatalkan sebelum kedaluwarsa.
 * Token buram justru sebaliknya: ia tidak berarti apa-apa tanpa baris
 * pasangannya di penyimpanan, dan itulah yang membuatnya dapat dicabut kapan
 * saja. Sifat itu yang dibutuhkan token reset password dan refresh token.
 *
 * base64url dipilih supaya token dapat langsung ditempel ke dalam URL tanpa
 * perlu di-escape — penting karena token reset dikirim lewat tautan email.
 */
const createOpaqueToken = () =>
  crypto.randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');

module.exports = { signAccessToken, verifyAccessToken, createOpaqueToken };