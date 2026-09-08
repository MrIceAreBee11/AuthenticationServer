const Minio = require('minio');

const { config } = require('../config');

const minioClient = new Minio.Client({
  endPoint: config.storage.host,
  port: config.storage.port,
  useSSL: config.storage.useSSL,
  accessKey: config.storage.accessKey,
  secretKey: config.storage.secretKey,
});

let isBucketReady = false;

const ensureBucket = async () => {
  if (isBucketReady) {
    return;
  }

  const exists = await minioClient.bucketExists(config.storage.bucket);

  if (!exists) {
    await minioClient.makeBucket(config.storage.bucket);
    console.log(`[MINIO] bucket "${config.storage.bucket}" dibuat`);
  }

  isBucketReady = true;
};

const putObject = async (objectKey, buffer, mimeType) => {
  await ensureBucket();

  return minioClient.putObject(config.storage.bucket, objectKey, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
};

const getPresignedUrl = async (objectKey, expirySeconds) => {
  await ensureBucket();

  return minioClient.presignedGetObject(config.storage.bucket, objectKey, expirySeconds);
};

const removeObject = async (objectKey) => {
  await ensureBucket();

  return minioClient.removeObject(config.storage.bucket, objectKey);
};

module.exports = { putObject, getPresignedUrl, removeObject };