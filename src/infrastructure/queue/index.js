/**
 * BERKAS INI: koneksi RabbitMQ dan penerbitan pesan.
 *
 * KENAPA TERPISAH DARI worker: berkas ini hanya menitipkan pesan ke antrean.
 * Yang mengambil dan mengirim email adalah proses lain (src/workers/). Justru
 * pemisahan itu tujuannya — permintaan HTTP tidak perlu menunggu SMTP.
 *
 * KENAPA CLASS: koneksi dan channel dulu disimpan sebagai `let` di module
 * scope. Selain tidak bisa direset, keduanya membuat berkas ini punya dua
 * tanggung jawab yang tercampur: memegang state dan menyediakan operasi.
 *
 * TIGA LAPIS KETAHANAN, semuanya disengaja:
 *   durable: true    -> definisi antrean bertahan saat broker restart
 *   persistent: true -> isi pesan ditulis ke disk, bukan hanya di memori
 *   manual ack       -> di sisi worker; pesan baru hilang setelah benar-benar
 *                       terkirim, bukan setelah diterima
 * Tanpa ketiganya sekaligus, antrean tetap kehilangan pesan.
 */
const amqp = require('amqplib');

const { QUEUES } = require('../../constants/cacheKeys');

class MessageQueue {
  #connection = null;

  #channel = null;

  constructor(url, logger) {
    this.url = url;
    this.logger = logger;
  }

  async connect() {
    if (this.#channel) {
      return this.#channel;
    }

    this.#connection = await amqp.connect(this.url);

    this.#connection.on('error', (error) => {
      this.logger.error('rabbitmq error', { reason: error.message });
    });

    // Referensinya dibuang supaya connect() berikutnya benar-benar menyambung
    // ulang. Tanpa ini, channel yang sudah mati tetap dipakai dan setiap
    // penerbitan gagal tanpa pernah mencoba memulihkan diri.
    this.#connection.on('close', () => {
      this.logger.warn('koneksi rabbitmq tertutup');
      this.#connection = null;
      this.#channel = null;
    });

    this.#channel = await this.#connection.createChannel();

    await this.#channel.assertQueue(QUEUES.PASSWORD_RESET_EMAIL, { durable: true });

    return this.#channel;
  }

  async publish(queue, payload) {
    const channel = await this.connect();

    return channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    });
  }

  /** Dipakai worker: satu pesan sekaligus, supaya kegagalan tidak menumpuk. */
  async consume(queue, handler, { prefetch = 1 } = {}) {
    const channel = await this.connect();

    await channel.prefetch(prefetch);

    return channel.consume(queue, (message) => handler(message, channel));
  }

  async close() {
    if (this.#channel) {
      await this.#channel.close();
      this.#channel = null;
    }

    if (this.#connection) {
      await this.#connection.close();
      this.#connection = null;
    }
  }
}

module.exports = { MessageQueue };
