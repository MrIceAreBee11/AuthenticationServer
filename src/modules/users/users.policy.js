/**
 * BERKAS INI: dua aturan yang berlaku DI ATAS RBAC saat seorang administrator
 * mengelola akun orang lain.
 *
 * KENAPA DI modules/users/: hanya endpoint /users yang mengelola akun orang
 * lain. Modul profile selalu bekerja pada akun pemanggil sendiri, jadi
 * pertanyaan "boleh tidak kamu menyentuh akun INI" tidak pernah muncul di sana.
 *
 * KENAPA TERPISAH DARI users.service: ini satu-satunya bagian modul users yang
 * berubah karena alasan KEAMANAN, bukan karena kebutuhan fitur. Selama ia
 * menjadi method privat di dalam service, ia hanya dapat diuji lewat lima
 * method lain yang masing-masing sudah menyentuh basis data, penyimpanan
 * objek, dan cache izin. Akibatnya: bagian paling kritis di modul ini justru
 * yang paling tidak teruji.
 *
 * KENAPA DI SERVICE, BUKAN DI MIDDLEWARE: RBAC di middleware menjawab "boleh
 * tidak kamu mengubah user" dari daftar izin. Ia tidak dapat menjawab "boleh
 * tidak kamu mengubah user INI", karena identitas targetnya baru diketahui
 * setelah barisnya diambil dari basis data. Selisih itulah yang diisi berkas
 * ini — dan selisih itu bernama IDOR.
 */
const { ForbiddenError } = require('../../utils/AppError');
const { ERROR_CODES } = require('../../constants/errorCodes');
const { ROLES } = require('../../constants/roles');
const { AUDIT_ACTIONS, AUDIT_RESOURCES } = require('../../constants/auditActions');

class UserManagementPolicy {
  constructor({ users, audit }) {
    this.users = users;
    this.audit = audit;
  }

  #isSuperadmin(user) {
    return Boolean(user?.roles?.some((role) => role.name === ROLES.SUPERADMIN));
  }

  /**
   * Mencatat penolakan lalu MENGEMBALIKAN error-nya — bukan melemparnya.
   *
   * Pemanggilnya yang menulis `throw`, supaya alurnya terbaca di tempat
   * keputusannya diambil. Versi pertama melempar dari dalam sini, dan
   * akibatnya setiap pemanggil tampak punya jalur lanjut yang sebenarnya
   * tidak pernah ada — penghitung cakupan yang menunjukkannya.
   *
   * Inilah bagian paling berguna dari seluruh jejak audit: satu percobaan yang
   * gagal tidak berarti apa-apa, tetapi sepuluh percobaan terhadap akun
   * superadmin adalah pola yang tidak terlihat sama sekali kalau hanya yang
   * berhasil yang tersimpan.
   */
  async #penolakan(target, { reason, message, code }) {
    await this.audit.recordDenied({
      action: AUDIT_ACTIONS.USER_UPDATED,
      resourceType: AUDIT_RESOURCES.USER,
      resourceId: target.id,
      reason,
    });

    return new ForbiddenError(message, code);
  }

  /**
   * Berpasangan, kedua aturan di bawah menjamin selalu ada minimal satu
   * superadmin: superadmin boleh menghapus superadmin lain tetapi tidak
   * dirinya sendiri, dan admin biasa tidak dapat menyentuh keduanya.
   */
  async assertCanManage(actorId, target) {
    if (actorId === target.id) {
      throw await this.#penolakan(target, {
        reason: 'mencoba mengelola akun sendiri lewat endpoint users',
        message: 'Gunakan endpoint /profile untuk mengubah akun Anda sendiri',
        code: ERROR_CODES.SELF_MANAGEMENT_FORBIDDEN,
      });
    }

    if (!this.#isSuperadmin(target)) {
      return;
    }

    // Pelaku diambil langsung, tanpa pemeriksaan bentuk UUID dan tanpa 404.
    // Sebelumnya jalur ini memakai pencari yang sama dengan target, sehingga
    // pelaku yang tidak ditemukan menghasilkan 404 "User tidak ditemukan" —
    // menyesatkan, karena yang diminta klien justru ADA. Id pelaku berasal dari
    // token yang sudah diverifikasi, jadi ketidakhadirannya praktis mustahil;
    // kalaupun terjadi, menolak adalah arah yang aman.
    const actor = await this.users.findById(actorId, { includeRoles: true });

    if (!this.#isSuperadmin(actor)) {
      throw await this.#penolakan(target, {
        reason: 'bukan superadmin, mencoba mengelola akun superadmin',
        message: 'Anda tidak dapat mengelola akun superadmin',
        code: ERROR_CODES.SUPERADMIN_PROTECTED,
      });
    }
  }
}

module.exports = { UserManagementPolicy };
