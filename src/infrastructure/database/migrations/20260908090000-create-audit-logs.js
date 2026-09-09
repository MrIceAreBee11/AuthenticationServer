'use strict';

/**
 * Tabel jejak audit setiap perubahan data.
 *
 * Kenapa di PostgreSQL dan bukan cukup di log terstruktur: pertanyaan
 * "siapa yang mengubah role pengguna ini" biasanya muncul berbulan-bulan
 * kemudian. Log container sudah dirotasi saat itu, dan mencarinya berarti
 * menyisir arsip. Tabel membuat pertanyaan itu satu query.
 *
 * Percobaan yang DITOLAK ikut dicatat. Justru itu yang paling berguna: pola
 * seseorang berulang kali mencoba menyentuh akun yang bukan haknya tidak
 * terlihat kalau hanya yang berhasil yang tersimpan.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },

      // Boleh null, dan ON DELETE SET NULL bukan CASCADE: jejak audit harus
      // tetap ada setelah pelakunya dihapus. Menghapus akun tidak boleh
      // menghapus catatan apa yang pernah dilakukannya.
      actor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },

      action: { type: Sequelize.STRING(60), allowNull: false },
      resource_type: { type: Sequelize.STRING(30), allowNull: false },

      // Teks, bukan UUID: role memakai id integer sementara user memakai UUID.
      resource_id: { type: Sequelize.STRING(64), allowNull: true },

      outcome: { type: Sequelize.STRING(10), allowNull: false },

      // Penghubung ke baris log permintaan yang bersangkutan, sehingga jejak
      // audit dan log aplikasi dapat disandingkan.
      request_id: { type: Sequelize.STRING(64), allowNull: true },
      ip: { type: Sequelize.STRING(45), allowNull: true },

      // Keterangan tambahan per jenis aksi, misalnya field apa yang berubah.
      // JSONB supaya bentuknya bebas tanpa perlu migration setiap ada aksi baru.
      metadata: { type: Sequelize.JSONB, allowNull: true },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // "Apa saja yang pernah terjadi pada sumber daya ini"
    await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id']);

    // "Apa saja yang pernah dilakukan orang ini"
    await queryInterface.addIndex('audit_logs', ['actor_id']);

    // Pembacaan paling umum: kejadian terbaru lebih dulu.
    await queryInterface.addIndex('audit_logs', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
