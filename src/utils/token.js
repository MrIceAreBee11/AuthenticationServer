const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');

const signAccessToken = (userId) => {
  const jti = crypto.randomUUID();

  const token = jwt.sign({ jti }, env.jwt.secret, {
    subject: userId,
    expiresIn: env.jwt.expiresIn,
  });

  return { token, jti };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, env.jwt.secret);
};

const OPAQUE_TOKEN_BYTES = 32;

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