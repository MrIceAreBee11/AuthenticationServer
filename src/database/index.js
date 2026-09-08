/**
 * BERKAS INI: koneksi PostgreSQL, registri model, dan pembungkus transaksi.
 *
 * KENAPA DI database/ DAN BUKAN infra/: folder ini juga menampung models/,
 * migrations/, dan seeders/ yang jalurnya ditunjuk .sequelizerc. Memindahkannya
 * berarti mengubah kontrak dengan sequelize-cli tanpa imbalan apa pun.
 *
 * KENAPA CLASS: model Sequelize terikat pada satu instance sequelize saat
 * didefinisikan. Membungkusnya dalam class membuat ikatan itu terjadi di dalam
 * constructor — bukan sebagai efek samping saat berkas ini di-require. Akibatnya
 * container yang menentukan kapan koneksi dibuat, dan pengujian dapat membuat
 * instance kedua dengan konfigurasi berbeda tanpa menyentuh yang pertama.
 */
const { Sequelize } = require('sequelize');

const databaseConfig = require('../config/database');

const MODEL_FACTORIES = {
  User: require('./models/user'),
  Role: require('./models/role'),
  Permission: require('./models/permission'),
  RefreshToken: require('./models/refreshToken'),
  AuditLog: require('./models/auditLog'),
};

class Database {
  constructor(environment) {
    const connection = databaseConfig[environment];

    if (!connection) {
      throw new Error(`Konfigurasi database untuk NODE_ENV="${environment}" tidak ditemukan`);
    }

    this.sequelize = new Sequelize(connection);
    this.models = Object.fromEntries(
      Object.entries(MODEL_FACTORIES).map(([name, build]) => [name, build(this.sequelize)])
    );

    Object.values(this.models).forEach((model) => model.associate?.(this.models));
  }

  /** Dipanggil saat start untuk membuktikan koneksinya benar-benar hidup. */
  connect() {
    return this.sequelize.authenticate();
  }

  close() {
    return this.sequelize.close();
  }

  /**
   * Menjalankan beberapa operasi tulis sebagai satu kesatuan.
   *
   * Service memutuskan batas transaksinya karena hanya service yang tahu
   * invarian bisnisnya — tetapi ia menerima method ini, bukan mengimpor objek
   * sequelize. Dengan begitu aturan "penyusunan query hanya di repository"
   * tetap utuh.
   */
  runInTransaction(callback) {
    return this.sequelize.transaction(callback);
  }

  /** Query mentah, hanya untuk repository yang butuh agregat. */
  query(sql, options) {
    return this.sequelize.query(sql, options);
  }
}

module.exports = { Database };
