/**
 * Entry point untuk proses API: menyiapkan container, memastikan dependency
 * siap, membuka port, lalu menangani shutdown saat proses dihentikan.
 *
 * app.js hanya menyiapkan Express, sedangkan file ini yang menangani lifecycle
 * proses seperti listen dan signal handler. Dengan pemisahan ini, app.js tetap
 * bisa dipakai untuk testing tanpa ikut menjalankan server.
 *
 * Dependency dicek sebelum listen supaya aplikasi tidak mulai menerima request
 * kalau database atau Redis belum siap.
 *
 * Katalog permission juga diverifikasi setelah semua route terpasang. Kalau ada
 * permission yang dipakai route tetapi belum tersedia di database, lebih baik
 * aplikasi gagal start daripada endpoint diam-diam mengembalikan 403 untuk semua
 * user.
 */

const { config } = require('./config');
const { Container } = require('./container');
const { createApp } = require('./app');

class ApiServer {
  #server = null;

  #shuttingDown = false;

  constructor() {
    this.container = new Container(config);
    this.logger = this.container.logger.child({ component: 'server' });
    this.app = createApp(this.container, config);
  }

  async start() {
    try {
      await this.container.connect();
      this.logger.info('koneksi database dan redis berhasil');

      const catalog = await this.container.permissionService.verifyCatalog(
        this.container.authorize.requiredPermissions
      );

      this.logger.info('katalog izin terverifikasi', {
        dipakaiRoute: catalog.required,
        tersediaDiDatabase: catalog.available,
      });

      this.#server = this.app.listen(config.app.port, () => {
        this.logger.info('server berjalan', {
          port: config.app.port,
          env: config.app.env,
        });
      });
    } catch (error) {
      this.logger.exception('gagal memulai server', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown: stop terima incoming request terlebih dahulu,
   * selesaikan inflight request, lalu tutup koneksi database/cache.
   */
  // exitCode dipisah dari signal: penutupan atas permintaan operator keluar 0,
  // penutupan karena crash keluar 1. Kalau keduanya keluar 0, orchestrator dan
  // monitoring tidak dapat membedakan "dihentikan sengaja" dari "mati sendiri".
  async shutdown(signal, exitCode = 0) {
    if (this.#shuttingDown) {
      return;
    }

    this.#shuttingDown = true;
    this.logger.info('sinyal penutupan diterima', { signal });

    // Safety timeout jika ada koneksi gantung; unref() agar timer tidak menahan event loop
    const forceExit = setTimeout(() => {
      this.logger.error('shutdown melewati batas waktu, keluar paksa');
      process.exit(1);
    }, config.app.shutdownTimeoutMs);

    forceExit.unref();

    try {
      if (this.#server) {
        await new Promise((resolve) => this.#server.close(resolve));
        this.logger.info('server berhenti menerima request baru');
      }

      await this.container.close();
      this.logger.info('semua koneksi ditutup');
      process.exit(exitCode);
    } catch (error) {
      this.logger.exception('gagal menutup dengan rapi', error);
      process.exit(1);
    }
  }

  /**
   * Promise rejection yang tak tertangani dan exception yang lolos berarti
   * state proses sudah tidak dapat dipercaya. Node sendiri akan mematikannya,
   * tapi tanpa handler ini kejadiannya tidak tercatat — dan penyebab restart
   * jadi tidak diketahui. Setelah dicatat, prosesnya memang dimatikan:
   * melanjutkan dari state yang rusak lebih berbahaya daripada restart.
   */
  registerCrashHandlers() {
    process.on('unhandledRejection', (reason) => {
      this.logger.exception(
        'promise rejection tak tertangani',
        reason instanceof Error ? reason : new Error(String(reason))
      );
      this.shutdown('unhandledRejection', 1);
    });

    process.on('uncaughtException', (error) => {
      this.logger.exception('exception tak tertangani', error);
      this.shutdown('uncaughtException', 1);
    });
  }
}

const server = new ApiServer();

server.registerCrashHandlers();

process.on('SIGINT', () => server.shutdown('SIGINT'));
process.on('SIGTERM', () => server.shutdown('SIGTERM'));

server.start();
