/**
 * BERKAS INI: konfigurasi koneksi dalam bentuk yang dimengerti sequelize-cli.
 *
 * KENAPA TERPISAH DARI config/index.js: sequelize-cli tidak memanggil aplikasi
 * kita. Ia membaca berkas ini langsung — jalurnya ditunjuk oleh .sequelizerc —
 * lalu memilih blok berdasarkan --env. Bentuk objek dengan kunci per lingkungan
 * ini adalah kontrak CLI-nya, bukan pilihan kita.
 *
 * KENAPA MEMBACA config, BUKAN process.env: supaya nilainya melewati validasi
 * yang sama. Kalau berkas ini membaca process.env sendiri, migration bisa jalan
 * dengan konfigurasi yang aplikasinya sendiri akan menolak — dan selisih itu
 * baru terasa saat deploy.
 */
const { config } = require('./index');

const base = {
  username: config.database.user,
  password: config.database.password,
  database: config.database.name,
  host: config.database.host,
  port: config.database.port,
  dialect: 'postgres',
  seederStorage: 'sequelize',
  define: { underscored: true, timestamps: true },
  pool: { ...config.database.pool },
};

module.exports = {
  // Satu-satunya console.* di src/ selain kegagalan config, dan sengaja:
  // berkas ini dibaca sequelize-cli sebagai proses terpisah yang tidak punya
  // container, jadi tidak ada logger untuk disuntikkan. Hanya aktif di development.
  development: { ...base, logging: (sql) => console.log(`[SQL] ${sql}`) },

  // Nama database pengujian diturunkan dari nama utama, bukan variabel
  // tersendiri. Dengan begitu tidak mungkin lupa mengubahnya dan menjalankan
  // pengujian yang mengosongkan tabel di database pengembangan.
  test: { ...base, database: `${config.database.name}_test`, logging: false },

  production: { ...base, logging: false },
};
