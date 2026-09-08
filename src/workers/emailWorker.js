const nodemailer = require('nodemailer');

const { config } = require('../config');
const { QUEUES, connectQueue, closeQueue } = require('../queue');

// Tidak ada lagi daftar "variabel SMTP wajib" di sini. Dulu ada, dan itu
// berarti ada dua sumber kebenaran untuk pertanyaan yang sama — daftar di
// worker bisa berbeda isi dari daftar di config, dan yang ketinggalan baru
// terasa saat email gagal terkirim. Sekarang skema env yang menjaminnya, dan
// worker tidak akan pernah sampai ke titik ini kalau konfigurasinya kurang.
const buildTransporter = () =>
  nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.password },
  });

const buildResetEmail = ({ fullName, resetUrl }) => ({
  subject: 'Reset Password Akun Anda',
  text: `Halo ${fullName},\n\nBuka tautan berikut untuk mengatur ulang password Anda:\n${resetUrl}\n\nTautan ini berlaku 15 menit dan hanya dapat digunakan sekali.\nJika Anda tidak meminta reset password, abaikan email ini.`,
  html: `<p>Halo <strong>${fullName}</strong>,</p>
<p>Buka tautan berikut untuk mengatur ulang password Anda:</p>
<p><a href="${resetUrl}">Reset Password</a></p>
<p>Tautan ini berlaku <strong>15 menit</strong> dan hanya dapat digunakan sekali.</p>
<p>Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
});

const startWorker = async () => {
  const transporter = buildTransporter();

  await transporter.verify();
  console.log('Koneksi SMTP berhasil');

  const channel = await connectQueue();
  console.log('Koneksi RabbitMQ berhasil');

  await channel.prefetch(1);

  await channel.consume(
    QUEUES.PASSWORD_RESET_EMAIL,
    async (message) => {
      if (!message) {
        return;
      }

      let payload;

      try {
        payload = JSON.parse(message.content.toString());
      } catch (error) {
        console.error('[WORKER] pesan tidak dapat diparse, dibuang:', error.message);
        return channel.nack(message, false, false);
      }

      try {
        const email = buildResetEmail(payload);

        await transporter.sendMail({
          from: config.mail.from,
          to: payload.to,
          ...email,
        });

        console.log(`[WORKER] email reset terkirim ke ${payload.to}`);
        return channel.ack(message);
      } catch (error) {
        console.error(`[WORKER] gagal mengirim ke ${payload.to}:`, error.message);
        return channel.nack(message, false, false);
      }
    },
    { noAck: false }
  );

  console.log(`Worker siap, menunggu pesan di "${QUEUES.PASSWORD_RESET_EMAIL}"`);
};

const shutdown = async (signal) => {
  console.log(`\n${signal} diterima, menutup worker...`);

  try {
    await closeQueue();
  } catch (error) {
    console.error('[WORKER] gagal menutup koneksi:', error.message);
  }

  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startWorker().catch((error) => {
  console.error('Worker gagal dijalankan:', error.message);
  process.exit(1);
});