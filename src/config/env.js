require('dotenv').config({ quiet: true });

const REQUIRED_VARS = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'APP_URL',
  'RABBITMQ_HOST',
  'RABBITMQ_PORT',
  'RABBITMQ_USER',
  'RABBITMQ_PASSWORD',
  'MINIO_HOST',
  'MINIO_PORT',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'MINIO_BUCKET',
  'TRUST_PROXY',
];

const missingVars = REQUIRED_VARS.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  throw new Error(
    `Environment variable wajib belum diisi: ${missingVars.join(', ')}`
  );
}

const MIN_JWT_SECRET_LENGTH = 32;

if (process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET terlalu pendek (${process.env.JWT_SECRET.length} karakter, minimal ${MIN_JWT_SECRET_LENGTH})`
  );
}

module.exports = {
  nodeEnv: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  isDevelopment: process.env.NODE_ENV === 'development',

  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN,
  },

  appUrl: process.env.APP_URL,

  rabbitmq: {
    url: `amqp://${encodeURIComponent(process.env.RABBITMQ_USER)}:${encodeURIComponent(process.env.RABBITMQ_PASSWORD)}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.MAIL_FROM,
  },

  minio: {
    host: process.env.MINIO_HOST,
    port: Number(process.env.MINIO_PORT),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER,
    secretKey: process.env.MINIO_ROOT_PASSWORD,
    bucket: process.env.MINIO_BUCKET,
  },

  trustProxy: Number(process.env.TRUST_PROXY),
};