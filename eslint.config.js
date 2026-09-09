/**
 * BERKAS INI: aturan lint yang menegakkan hukum arsitektur project ini secara
 * mekanis, bukan lewat ingatan orang yang me-review.
 *
 * KENAPA DI AKAR: ESLint 9 mencari eslint.config.js dari direktori kerja.
 *
 * ISINYA SENGAJA SEDIKIT. Setiap aturan di bawah ada karena pernah ada bug
 * nyata di repositori ini yang seharusnya ia tangkap — bukan karena aturan itu
 * "biasa dipakai". Daftar panjang yang tidak ada yang membaca sama saja dengan
 * tidak ada aturan.
 */
const js = require('@eslint/js');
const n = require('eslint-plugin-n');
const prettier = require('eslint-config-prettier');

/** Berkas yang boleh menyentuh process.env dan console. */
const BERKAS_KONFIGURASI = ['src/config/**/*.js', 'eslint.config.js'];

module.exports = [
  {
    // docs/ adalah generator laporan, bukan kode yang dikirim. Ia sengaja
    // meng-require paket `docx` yang dipasang dengan --no-save (lihat
    // docs/README.md), jadi melintnya hanya menghasilkan keluhan palsu.
    ignores: ['node_modules/', 'coverage/', 'public/', 'docs/'],
  },

  js.configs.recommended,
  n.configs['flat/recommended-script'],

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
    },

    rules: {
      // Menangkap require ke jalur yang tidak ada. Persis kelas bug yang muncul
      // saat empat folder dipindah ke infrastructure/: jalurnya salah, tetapi
      // baru ketahuan ketika berkasnya kebetulan dijalankan.
      'n/no-missing-require': 'error',

      // Menangkap dependensi yang dipakai tetapi tidak terdaftar di
      // package.json — di production `npm ci --omit=dev` tidak memasangnya,
      // jadi gagalnya baru terjadi di container, bukan di mesin pengembang.
      'n/no-extraneous-require': 'error',
      'n/no-unpublished-require': 'off', // devDependencies memang dipakai skrip & pengujian

      // HUKUM PROJECT: process.env hanya dibaca di src/config/.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'process.env hanya boleh dibaca di src/config/. Ambil nilainya dari config yang sudah divalidasi, lalu suntikkan lewat constructor.',
        },
      ],

      // HUKUM PROJECT: pencatatan lewat Logger yang disuntikkan, bukan console.
      'no-console': 'error',

      // Argumen yang tak terpakai dibiarkan bila diawali garis bawah — pola
      // yang tak terhindarkan pada middleware error Express (err, req, res, next).
      // ignoreRestSiblings: `const { passwordHash, ...aman } = user` adalah cara
      // MEMBUANG field, bukan variabel yang terlupa dipakai.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],

      // Dimatikan dengan sadar: aturan ini ditujukan untuk PUSTAKA, yang tidak
      // boleh mematikan proses pemakainya. Ini aplikasi — mematikan proses
      // dengan kode keluar yang benar justru kontraknya terhadap Docker.
      'n/no-process-exit': 'off',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  {
    // Modul konfigurasi memang satu-satunya pembaca process.env, dan ia
    // mencatat kegagalannya lewat console karena logger belum ada saat itu.
    files: BERKAS_KONFIGURASI,
    rules: {
      'no-restricted-properties': 'off',
      'no-console': 'off',
    },
  },

  {
    // Migration dan seeder dijalankan sequelize-cli sebagai proses terpisah
    // yang tidak punya container, jadi tidak ada logger untuk disuntikkan.
    files: ['src/infrastructure/database/migrations/**', 'src/infrastructure/database/seeders/**'],
    rules: { 'no-console': 'off' },
  },

  {
    // Skrip pengembangan dijalankan manusia dari terminal; keluarannya memang
    // untuk dibaca di sana, bukan untuk dikumpulkan sistem log.
    files: ['scripts/**/*.js', 'docs/**/*.js'],
    rules: { 'no-console': 'off' },
  },

  {
    // Pengujian berdiri DI LUAR aplikasi: ia yang menyiapkan lingkungan,
    // jadi membaca process.env di sini bukan pelanggaran lapisan.
    files: ['tests/**/*.js'],
    rules: { 'no-console': 'off', 'no-restricted-properties': 'off' },
  },

  // Terakhir: mematikan aturan gaya yang bentrok dengan Prettier.
  prettier,
];
