const nodemailer = require('nodemailer');

const env = require('../config/env');
const { QUEUES, connectQueue, closeQueue } = require('../queue');

const REQUIRED_SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'];

const buildTransporter = () => {
  const missing = REQUIRED_SMTP_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Konfigurasi SMTP belum lengkap: ${missing.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.password },
  });
};

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
          from: env.smtp.from,
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