/**
 * BERKAS INI: penyimpanan berkas di MinIO — unggah, alamat sementara, hapus.
 *
 * KENAPA BUKAN DI DALAM modules/profile/: penyimpanan objek melewati batas
 * proses, sama seperti basis data dan antrean. Ia adalah adapter, bukan bagian
 * dari sebuah fitur. Kalau suatu saat pindah ke S3 atau ke disk lokal,
 * satu-satunya berkas yang berubah adalah ini.
 *
 * KENAPA CLASS: `let isBucketReady = false` dulu berada di module scope, dan
 * ProfileService menerima penyimpanan sebagai objek `{ putObject, ... }` yang
 * dirakit dadakan di dalam constructor-nya sendiri. Sekarang bentuknya satu
 * objek dengan kontrak jelas yang disuntikkan dari container.
 *
 * KENAPA ALAMAT SEMENTARA (presigned URL): bucket-nya tertutup. Kalau avatar
 * disajikan lewat aplikasi, setiap tampilan halaman melewatkan berkas biner
 * melalui proses Node. Presigned URL membuat peramban mengambilnya langsung
 * dari MinIO, dan alamatnya kedaluwarsa sendiri.
 */
const Minio = require('minio');

class ObjectStorage {
  #bucketReady = false;

  constructor(settings, logger) {
    this.logger = logger;
    this.bucket = settings.bucket;

    this.client = new Minio.Client({
      endPoint: settings.host,
      port: settings.port,
      useSSL: settings.useSSL,
      accessKey: settings.accessKey,
      secretKey: settings.secretKey,
    });
  }

  /**
   * Bucket dipastikan ada sebelum operasi pertama, bukan saat aplikasi start.
   * Dengan begitu MinIO yang belum siap tidak menghalangi seluruh aplikasi
   * menyala — hanya fitur avatar yang menunggu.
   */
  async #ensureBucket() {
    if (this.#bucketReady) {
      return;
    }

    if (!(await this.client.bucketExists(this.bucket))) {
      await this.client.makeBucket(this.bucket);
      this.logger.info('bucket dibuat', { bucket: this.bucket });
    }

    this.#bucketReady = true;
  }

  async putObject(objectKey, buffer, mimeType) {
    await this.#ensureBucket();

    return this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  async getPresignedUrl(objectKey, expirySeconds) {
    await this.#ensureBucket();

    return this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
  }

  async removeObject(objectKey) {
    await this.#ensureBucket();

    return this.client.removeObject(this.bucket, objectKey);
  }
}

module.exports = { ObjectStorage };
