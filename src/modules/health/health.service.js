/**
 * BERKAS INI: satu keputusan — apa yang membuat layanan ini dianggap SIAP.
 *
 * KENAPA DI modules/health/: hanya endpoint health yang memakainya.
 *
 * KENAPA TERPISAH DARI controller: keputusannya bukan urusan HTTP. Sebelumnya
 * `if (!databaseUp || !cacheUp)` berada tepat di samping `res.status(503)`,
 * sehingga satu-satunya cara mengujinya adalah lewat permintaan HTTP sungguhan.
 *
 * DAN KEPUTUSAN ITU AKAN BERUBAH. Sekarang RabbitMQ dan MinIO sengaja tidak
 * diwajibkan — email dan avatar adalah fungsi pendukung, dan menjadikannya
 * wajib berarti seluruh autentikasi ikut jatuh karena masalah pada gambar
 * profil. Kalau suatu saat penilaian itu berubah, yang perlu disunting hanya
 * berkas ini, dan yang perlu diperiksa ulang hanya pengujiannya.
 *
 * KENAPA INI PENTING SECARA OPERASIONAL: jawaban readiness menentukan apakah
 * load balancer mengirim lalu lintas dan apakah Docker menyalakan ulang
 * container. Salah menilai "siap" berarti permintaan pengguna dialirkan ke
 * proses yang belum bisa melayaninya.
 */
class HealthService {
  constructor({ health }) {
    this.health = health;
  }

  /**
   * Seluruh pemeriksaan dijalankan sampai selesai, tidak berhenti di kegagalan
   * pertama. Endpoint diagnostik harus melaporkan seluruh keadaan sekaligus;
   * kalau ia berhenti di yang pertama, diagnosis menjadi berlapis — perbaiki
   * satu, jalankan lagi, temukan yang berikutnya.
   */
  async readiness() {
    const [databaseUp, cacheUp] = await Promise.all([
      this.health.pingDatabase(),
      this.health.pingCache(),
    ]);

    return {
      ready: databaseUp && cacheUp,
      checks: {
        database: databaseUp ? 'up' : 'down',
        redis: cacheUp ? 'up' : 'down',
      },
    };
  }
}

module.exports = { HealthService };
