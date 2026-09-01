const Minio = require('minio');

const env = require('../config/env');

const minioClient = new Minio.Client({
  endPoint: env.minio.host,
  port: env.minio.port,
  useSSL: env.minio.useSSL,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

let isBucketReady = false;

const ensureBucket = async () => {
  if (isBucketReady) {
    return;
  }

  const exists = await minioClient.bucketExists(env.minio.bucket);

  if (!exists) {
    await minioClient.makeBucket(env.minio.bucket);
    console.log(`[MINIO] bucket "${env.minio.bucket}" dibuat`);
  }

  isBucketReady = true;
};

const putObject = async (objectKey, buffer, mimeType) => {
  await ensureBucket();

  return minioClient.putObject(env.minio.bucket, objectKey, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
};

const getPresignedUrl = async (objectKey, expirySeconds) => {
  await ensureBucket();

  return minioClient.presignedGetObject(env.minio.bucket, objectKey, expirySeconds);
};

const removeObject = async (objectKey) => {
  await ensureBucket();

  return minioClient.removeObject(env.minio.bucket, objectKey);
};

module.exports = { putObject, getPresignedUrl, removeObject };