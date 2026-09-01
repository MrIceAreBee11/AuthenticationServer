const app = require('./app');
const env = require('./config/env');
const { sequelize } = require('./database');
const { connectRedis, redisClient } = require('./redis');
const { closeQueue } = require('./queue');

const SHUTDOWN_TIMEOUT_MS = 10000;

let server = null;
let isShuttingDown = false;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Koneksi database berhasil');

    await connectRedis();
    console.log('Koneksi Redis berhasil');

    server = app.listen(env.port, () => {
      console.log(`Server berjalan di http://localhost:${env.port} [${env.nodeEnv}]`);
    });
  } catch (error) {
    console.error('Gagal memulai server:', error.message);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} diterima, menutup server...`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown melewati batas waktu, keluar paksa');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('Server berhenti menerima request baru');
    }

    await closeQueue().catch(() => {});
    await redisClient.quit().catch(() => {});
    await sequelize.close();

    console.log('Semua koneksi ditutup');
    process.exit(0);
  } catch (error) {
    console.error('Gagal menutup dengan rapi:', error.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();