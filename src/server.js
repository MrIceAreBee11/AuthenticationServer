/**
 * BERKAS INI: titik masuk proses API — merakit container, membuktikan
 * dependensi hidup, membuka port, lalu menutup semuanya dengan rapi.
 *
 * KENAPA TERPISAH DARI app.js: satu-satunya berkas yang boleh membuka port dan
 * mendaftarkan penanganan sinyal. Pengujian memakai app.js tanpa ikut
 * mewarisi keduanya.
 *
 * KENAPA MEMERIKSA DEPENDENSI SEBELUM listen: aplikasi yang menerima
 * permintaan sementara basis datanya mati hanya akan membalas 500 satu per
 * satu. Gagal sekarang, dengan pesan jelas, jauh lebih murah daripada gagal
 * pada permintaan pertama pengguna.
 *
 * KENAPA KATALOG IZIN DIVERIFIKASI DI SINI: seluruh route sudah termuat pada
 * titik ini, jadi daftar izin yang benar-benar dipakai kode sudah lengkap.
 * Izin yang dipakai route tetapi tidak ada barisnya di basis data membuat
 * endpoint-nya menjawab 403 untuk SEMUA orang — termasuk superadmin — tanpa
 * satu pun error di log. Lebih baik aplikasi menolak menyala.
 */
const { config } = require('./config');
const { Container } = require('./container');
const { createApp } = require('./app');

class ApiServer {
  #server = null;

  #shuttingDown = false;

  constructor() {
    this.container = new Container(config);
    this.app = createApp(this.container, config);
  }

  async start() {
    try {
      await this.container.connect();
      console.log('Koneksi database dan Redis berhasil');

      const catalog = await this.container.permissionService.verifyCatalog(
        this.container.authorize.requiredPermissions
      );

      console.log(
        `Katalog izin terverifikasi (${catalog.required} dipakai route, ${catalog.available} tersedia di database)`
      );

      this.#server = this.app.listen(config.app.port, () => {
        console.log(
          `Server berjalan di http://localhost:${config.app.port} [${config.app.env}]`
        );
      });
    } catch (error) {
      console.error('Gagal memulai server:', error.message);
      process.exit(1);
    }
  }

  /**
   * Urutannya disengaja: berhenti menerima permintaan baru DULU, lalu tutup
   * koneksi. Kalau dibalik, permintaan yang sedang berjalan kehilangan basis
   * data di tengah jalan dan pengguna menerima 500 pada saat penutupan.
   */
  async shutdown(signal) {
    if (this.#shuttingDown) {
      return;
    }

    this.#shuttingDown = true;
    console.log(`\n${signal} diterima, menutup server...`);

    // Jaring terakhir: kalau ada koneksi yang menolak tertutup, proses tetap
    // keluar. unref() supaya timer ini sendiri tidak menahan proses tetap
    // hidup ketika penutupannya justru berhasil.
    const forceExit = setTimeout(() => {
      console.error('Shutdown melewati batas waktu, keluar paksa');
      process.exit(1);
    }, config.app.shutdownTimeoutMs);

    forceExit.unref();

    try {
      if (this.#server) {
        await new Promise((resolve) => this.#server.close(resolve));
        console.log('Server berhenti menerima request baru');
      }

      await this.container.close();
      console.log('Semua koneksi ditutup');
      process.exit(0);
    } catch (error) {
      console.error('Gagal menutup dengan rapi:', error.message);
      process.exit(1);
    }
  }
}

const server = new ApiServer();

process.on('SIGINT', () => server.shutdown('SIGINT'));
process.on('SIGTERM', () => server.shutdown('SIGTERM'));

server.start();
