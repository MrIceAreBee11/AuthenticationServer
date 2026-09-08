/**
 * BERKAS INI: proses terpisah yang mengambil pesan dari antrean lalu mengirim
 * email reset password.
 *
 * KENAPA PROSES SENDIRI, BUKAN DI DALAM API: pengiriman email lewat SMTP bisa
 * memakan beberapa detik dan kadang gagal. Kalau ia dijalankan di dalam
 * permintaan HTTP, pengguna menunggu selama itu — dan endpoint lupa password
 * jadi bisa dipakai mengukur email mana yang terdaftar dari lamanya jawaban.
 *
 * KENAPA DI workers/: ia punya titik masuk sendiri dan siklus hidupnya
 * terpisah dari API. Mematikan worker tidak mematikan API, dan sebaliknya —
 * pesan yang belum terkirim menunggu di antrean sampai worker hidup lagi.
 *
 * KENAPA CLASS: sebelumnya berkas ini serangkaian fungsi lepas yang mengimpor
 * config dan koneksi antrean langsung, jadi tidak ada bagian yang bisa diuji
 * tanpa broker dan server SMTP sungguhan.
 *
 * KENAPA PESAN RUSAK DIBUANG, BUKAN DIKEMBALIKAN: pesan yang tidak dapat
 * diparse akan selalu gagal diparse. Mengembalikannya ke antrean membuatnya
 * dicoba tanpa henti dan memblokir seluruh antrean di belakangnya.
 */
const nodemailer = require('nodemailer');

const { config } = require('../config');
const { MessageQueue } = require('../queue');
const { Logger } = require('../utils/logger');
const { QUEUES } = require('../constants/cacheKeys');
const { SECONDS } = require('../constants/units');

const buildResetEmail = ({ fullName, resetUrl }, ttlSeconds) => {
  const minutes = Math.round(ttlSeconds / SECONDS.MINUTE);

  return {
    subject: 'Reset Password Akun Anda',
    text: `Halo ${fullName},\n\nBuka tautan berikut untuk mengatur ulang password Anda:\n${resetUrl}\n\nTautan ini berlaku ${minutes} menit dan hanya dapat digunakan sekali.\nJika Anda tidak meminta reset password, abaikan email ini.`,
    html: `<p>Halo <strong>${fullName}</strong>,</p>
<p>Buka tautan berikut untuk mengatur ulang password Anda:</p>
<p><a href="${resetUrl}">Reset Password</a></p>
<p>Tautan ini berlaku <strong>${minutes} menit</strong> dan hanya dapat digunakan sekali.</p>
<p>Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
  };
};

class EmailWorker {
  constructor({ queue, mailer, mail, resetTtlSeconds, logger }) {
    this.queue = queue;
    this.mailer = mailer;
    this.mail = mail;
    this.resetTtlSeconds = resetTtlSeconds;
    this.logger = logger;
  }

  #parse(message, channel) {
    try {
      return JSON.parse(message.content.toString());
    } catch (error) {
      this.logger.exception('pesan tidak dapat diparse, dibuang', error);
      channel.nack(message, false, false);

      return null;
    }
  }

  /**
   * Pesan baru di-ack SETELAH email benar-benar terkirim. Kalau di-ack lebih
   * dulu, worker yang mati di tengah pengiriman membuat pesannya hilang
   * padahal emailnya belum sampai.
   */
  #handle = async (message, channel) => {
    if (!message) {
      return;
    }

    const payload = this.#parse(message, channel);

    if (!payload) {
      return;
    }

    try {
      await this.mailer.sendMail({
        from: this.mail.from,
        to: payload.to,
        ...buildResetEmail(payload, this.resetTtlSeconds),
      });

      this.logger.info('email reset terkirim', { to: payload.to });
      channel.ack(message);
    } catch (error) {
      this.logger.exception('gagal mengirim email', error, { to: payload.to });
      channel.nack(message, false, false);
    }
  };

  async start() {
    await this.mailer.verify();
    this.logger.info('koneksi smtp berhasil');

    // prefetch 1: satu pesan sekaligus. Worker tidak boleh menarik seratus
    // pesan lalu memegangnya sementara SMTP-nya lambat.
    await this.queue.consume(QUEUES.PASSWORD_RESET_EMAIL, this.#handle, { prefetch: 1 });

    this.logger.info('worker siap menunggu pesan', { queue: QUEUES.PASSWORD_RESET_EMAIL });
  }

  async shutdown(signal) {
    this.logger.info('sinyal penutupan diterima', { signal });

    await this.queue.close().catch((error) => {
      this.logger.exception('gagal menutup koneksi antrean', error);
    });

    process.exit(0);
  }
}

const logger = new Logger({
  level: config.app.logLevel,
  bindings: { env: config.app.env, component: 'worker' },
});

const worker = new EmailWorker({
  queue: new MessageQueue(config.queue.url, logger),
  mailer: nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.password },
  }),
  mail: config.mail,
  resetTtlSeconds: config.password.resetTtlSeconds,
  logger,
});

process.on('SIGINT', () => worker.shutdown('SIGINT'));
process.on('SIGTERM', () => worker.shutdown('SIGTERM'));

worker.start().catch((error) => {
  logger.exception('worker gagal dijalankan', error);
  process.exit(1);
});

module.exports = { EmailWorker };
