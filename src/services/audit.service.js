/**
 * Pencatat jejak audit.
 *
 * Berada di src/services/ dan bukan di dalam satu modul karena hampir semua
 * modul memakainya: users, roles, profile, dan auth.
 *
 * PELAKU DAN requestId TIDAK DITERUSKAN LEWAT ARGUMEN.
 *
 * Keduanya dibaca dari RequestContext — penyimpanan per-permintaan yang sama
 * yang dipakai logger. Alternatifnya menambahkan dua parameter ke SETIAP
 * method service yang mengubah data, hanya untuk keperluan pencatatan. Yang
 * lebih buruk: satu titik yang lupa meneruskannya menghasilkan baris audit
 * tanpa pelaku, dan barisnya tetap tersimpan seolah sah.
 *
 * KEGAGALAN PENCATATAN TIDAK MENJATUHKAN OPERASINYA.
 *
 * Ini keputusan yang bisa diperdebatkan, jadi alasannya dicatat. Kalau audit
 * gagal ditulis lalu operasinya dibatalkan, satu tabel audit yang bermasalah
 * membuat seluruh aplikasi berhenti bisa mengubah data. Sebaliknya, kalau
 * operasinya lanjut, ada kemungkinan perubahan terjadi tanpa jejak.
 *
 * Dipilih yang kedua karena jejak yang hilang tetap MENINGGALKAN JEJAK: ia
 * dicatat sebagai error di log aplikasi berikut aksi apa yang gagal dicatat.
 * Untuk sistem yang wajib patuh audit penuh, pilihannya harus dibalik —
 * dan yang perlu diubah hanya method di bawah ini.
 */
const { AUDIT_OUTCOMES } = require('../constants/auditActions');

class AuditService {
  constructor({ audit, context, logger }) {
    this.audit = audit;
    this.context = context;
    this.logger = logger;
  }

  async #write(entry) {
    const store = this.context?.store;

    try {
      await this.audit.create({
        ...entry,
        resourceId: entry.resourceId == null ? null : String(entry.resourceId),
        actorId: store?.userId ?? null,
        requestId: store?.requestId ?? null,
        ip: store?.ip ?? null,
      });
    } catch (error) {
      this.logger.exception('gagal menulis jejak audit', error, {
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
      });
    }
  }

  /** Perubahan yang berhasil dilakukan. */
  record({ action, resourceType, resourceId, metadata = null }) {
    return this.#write({
      action,
      resourceType,
      resourceId,
      outcome: AUDIT_OUTCOMES.ALLOWED,
      metadata,
    });
  }

  /**
   * Percobaan yang ditolak aturan keamanan.
   *
   * Ini yang paling berguna dari seluruh jejak audit: pola seseorang berulang
   * kali mencoba menyentuh akun yang bukan haknya tidak terlihat sama sekali
   * kalau hanya yang berhasil yang tersimpan.
   */
  recordDenied({ action, resourceType, resourceId, reason }) {
    return this.#write({
      action,
      resourceType,
      resourceId,
      outcome: AUDIT_OUTCOMES.DENIED,
      metadata: { reason },
    });
  }
}

module.exports = { AuditService };
