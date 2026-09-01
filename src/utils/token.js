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

module.exports = { signAccessToken, verifyAccessToken };