/**
 * BERKAS INI: koneksi Redis beserta pembuktian bahwa ia benar-benar siap.
 *
 * KENAPA DI redis/ padahal namanya menyebut vendor: repository dan service
 * tidak pernah menyebut nama ini — mereka menerima `cache` lewat constructor.
 * Nama folder hanya menandai implementasinya, dan pemakainya tidak tahu.
 *
 * KENAPA CLASS: sebelumnya berkas ini menyimpan `let connectPromise = null` di
 * module scope. State seperti itu tidak bisa direset antar berkas pengujian dan
 * bocor dari satu skenario ke skenario berikutnya. Sekarang ia field instance.
 *
 * CATATAN isOpen VS isReady: keduanya berbeda dan pernah menghabiskan waktu
 * lama untuk ditemukan. isOpen berarti socket-nya tersambung; isReady berarti
 * server sudah menjawab dan perintah boleh dikirim. Menganggap isOpen cukup
 * membuat perintah pertama gagal dengan ClientOfflineError.
 */
const { once } = require('node:events');
const { createClient } = require('redis');

class CacheClient {
  #connectPromise = null;

  constructor(settings) {
    this.readyTimeoutMs = settings.readyTimeoutMs;

    this.client = createClient({
      socket: {
        host: settings.host,
        port: settings.port,
        connectTimeout: settings.connectTimeoutMs,
        reconnectStrategy: (retries) =>
          Math.min(retries * settings.reconnectStepMs, settings.reconnectMaxMs),
      },
      password: settings.password,
      // Tanpa ini, perintah saat Redis mati akan menggantung di antrean
      // sampai koneksi kembali — dan permintaan HTTP-nya ikut menggantung.
      // Lebih baik gagal cepat supaya pemanggil bisa memutuskan sikapnya.
      disableOfflineQueue: true,
    });

    this.client.on('error', (error) => {
      console.error('[REDIS ERROR]', error.message || error.code || 'unknown');
    });
  }

  async connect() {
    if (this.client.isReady) {
      return;
    }

    if (!this.client.isOpen && !this.#connectPromise) {
      this.#connectPromise = this.client.connect().finally(() => {
        this.#connectPromise = null;
      });
    }

    if (this.#connectPromise) {
      await this.#connectPromise;
    }

    if (this.client.isReady) {
      return;
    }

    // Menunggu 'ready' bisa menggantung selamanya kalau server tidak pernah
    // menjawab, jadi ia dilombakan dengan batas waktu.
    const readyTimeout = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Redis belum siap dalam ${this.readyTimeoutMs} ms`)),
        this.readyTimeoutMs
      );

      timer.unref();
    });

    await Promise.race([once(this.client, 'ready'), readyTimeout]);
  }

  close() {
    return this.client.quit().catch(() => {});
  }

  /** Perintah yang dipakai repository. Diteruskan apa adanya. */
  get(key) {
    return this.client.get(key);
  }

  set(key, value, options) {
    return this.client.set(key, value, options);
  }

  del(key) {
    return this.client.del(key);
  }

  exists(key) {
    return this.client.exists(key);
  }

  incr(key) {
    return this.client.incr(key);
  }

  ping() {
    return this.client.ping();
  }

  keys(pattern) {
    return this.client.keys(pattern);
  }

  /**
   * Dibutuhkan express-rate-limit, yang mengirim perintah Redis mentah.
   * Ia juga memastikan koneksi siap lebih dulu — pembatas laju dipasang saat
   * route didefinisikan, jauh sebelum server memanggil connect().
   */
  async sendCommand(args) {
    await this.connect();

    return this.client.sendCommand(args);
  }
}

module.exports = { CacheClient };
