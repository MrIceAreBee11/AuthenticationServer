/**
 * Satu-satunya tempat yang menyusun query untuk tabel audit_logs.
 *
 * Sengaja tidak ada method update maupun delete. Jejak audit yang dapat diubah
 * bukan jejak audit; kalau retensi perlu dibatasi, itu pekerjaan penghapusan
 * berkala di tingkat basis data, bukan operasi yang tersedia bagi aplikasi.
 */
class AuditRepository {
  constructor({ AuditLog }) {
    this.AuditLog = AuditLog;
  }

  async create(entry) {
    return this.AuditLog.create(entry);
  }

  /** Riwayat satu sumber daya, terbaru lebih dulu. */
  async findByResource({ resourceType, resourceId, limit = 50 }) {
    return this.AuditLog.findAll({
      where: { resourceType, resourceId: String(resourceId) },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  /** Riwayat yang pernah dilakukan seorang pelaku. */
  async findByActor({ actorId, limit = 50 }) {
    return this.AuditLog.findAll({
      where: { actorId },
      order: [['createdAt', 'DESC']],
      limit,
    });
  }
}

module.exports = { AuditRepository };
