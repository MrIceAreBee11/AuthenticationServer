/**
 * BERKAS INI: pemeriksaan hidup-matinya basis data dan cache.
 *
 * KENAPA DI repositories/: inilah satu-satunya lapisan yang boleh menyentuh
 * koneksi secara langsung. Controller kesehatan hanya menyusun jawabannya dari
 * dua boolean yang dikembalikan di bawah.
 *
 * KENAPA MENGEMBALIKAN BOOLEAN, BUKAN MELEMPAR: endpoint readiness harus
 * melaporkan SELURUH keadaan sekaligus. Kalau ia berhenti di kegagalan
 * pertama, diagnosisnya jadi berlapis — perbaiki basis data, baru tahu Redis
 * juga mati.
 */
class HealthRepository {
  constructor({ database, cache }) {
    this.database = database;
    this.cache = cache;
  }

  async pingDatabase() {
    try {
      await this.database.connect();

      return true;
    } catch (error) {
      console.error('[READINESS] database:', error.message);

      return false;
    }
  }

  async pingCache() {
    try {
      await this.cache.ping();

      return true;
    } catch (error) {
      console.error('[READINESS] redis:', error.message);

      return false;
    }
  }
}

module.exports = { HealthRepository };
