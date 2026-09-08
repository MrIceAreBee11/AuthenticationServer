/** Bab 6-10 + Lampiran */
module.exports = ({ h1, h2, h3, p, rich, quote, li, num, code, caption, table, br, gap }) => [

  /* ═══════════════════ BAB 6 ═══════════════════ */
  h1('BAB 6 — Keamanan'),
  p('Bab ini merangkum seluruh ancaman yang ditangani beserta letak penanganannya di dalam kode, sehingga dapat diperiksa ulang satu per satu.'),

  h2('6.1 Daftar Ancaman dan Penanganannya'),
  table(
    ['Ancaman', 'Penjelasan Singkat', 'Penanganan', 'Lokasi'],
    [
      ['User enumeration', 'Penyerang menyusun daftar email yang benar-benar terdaftar', 'Pesan error dibuat seragam untuk semua sebab kegagalan', 'auth.service.js, password.service.js'],
      ['Timing attack', 'Selisih waktu respons membocorkan email mana yang terdaftar', 'Proses pembandingan tetap dijalankan terhadap data tiruan', 'auth.service.js'],
      ['Brute force password', 'Mencoba ribuan password sampai berhasil', 'Enkripsi lambat (cost 12) dan pembatasan 5 percobaan per 15 menit', 'user.js, rateLimiter.js'],
      ['Pemalsuan token', 'Membuat token atas nama orang lain', 'Tanda tangan HMAC dengan kunci acak minimal 32 karakter', 'token.js, env.js'],
      ['Token curian tetap sah', 'Token yang bocor tetap berlaku sampai kedaluwarsa', 'Daftar cabut di Redis dan pemeriksaan waktu ganti password', 'authenticate.js'],
      ['Penonaktifan tidak berlaku', 'Akun dimatikan tetapi masih bisa dipakai', 'Status aktif dibaca dari database pada setiap permintaan', 'authenticate.js'],
      ['Enumeration lewat ID', 'ID berurutan memungkinkan penebakan data pengguna lain', 'ID pengguna berupa UUID acak', 'migration users'],
      ['Kebocoran hash password', 'Hash ikut terkirim dalam jawaban API', 'Dua lapis: pengecualian kolom pada query dan pada penyusunan jawaban', 'user.js'],
      ['Privilege escalation', 'Admin menaikkan hak dirinya sendiri', 'Penetapan role dijaga izin roles.update yang hanya dimiliki superadmin', 'users.routes.js'],
      ['Serangan ke akun lebih tinggi', 'Admin menonaktifkan akun superadmin', 'Hanya superadmin yang boleh mengelola akun superadmin', 'users.service.js'],
      ['Sistem terkunci', 'Superadmin menghapus akunnya sendiri', 'Operasi manajemen terhadap diri sendiri ditolak', 'users.service.js'],
      ['XSS lewat unggahan', 'Berkas SVG berisi kode JavaScript', 'Hanya JPEG, PNG, dan WebP yang diterima', 'upload.js'],
      ['Kehabisan memori', 'Unggahan berukuran sangat besar', 'Batas 2 MB per berkas, satu berkas per permintaan', 'upload.js'],
      ['Akses berkas tanpa izin', 'Menebak alamat berkas milik pengguna lain', 'Bucket tertutup, akses lewat alamat bertanda tangan berbatas waktu', 'storage/index.js'],
      ['Kebocoran token reset', 'Isi Redis bocor sehingga token bisa dipakai', 'Yang disimpan adalah hasil pengacakan satu arah, bukan tokennya', 'password.service.js'],
      ['Pemalsuan alamat IP', 'Header dipalsukan untuk melewati pembatasan percobaan', 'Header proksi hanya dipercaya sebanyak jumlah proksi yang benar-benar ada', 'app.js, env.js'],
      ['Kebocoran struktur internal', 'Pesan error mentah membocorkan detail sistem', 'Hanya error yang sudah diantisipasi yang pesannya diteruskan', 'errorHandler.js'],
      ['Kredensial ikut ke image', 'Berkas .env terbawa ke dalam image Docker', 'Berkas .env dikecualikan, nilainya disuntikkan saat container berjalan', '.dockerignore'],
      ['Eskalasi dari dalam container', 'Kode berjalan sebagai root di dalam container', 'Aplikasi dijalankan sebagai pengguna biasa', 'Dockerfile'],
    ],
    [1800, 2600, 2800, 1826]
  ),

  h2('6.2 Prinsip yang Dipakai Berulang'),
  p('Sembilan belas penanganan di atas sebenarnya berangkat dari sejumlah kecil prinsip yang sama, diterapkan pada tempat berbeda.'),

  h3('Aman sebagai perilaku bawaan'),
  p('Kolom password diatur agar tidak ikut terbaca pada setiap query, kecuali diminta secara khusus. Kebalikannya — aman kalau programmer ingat menuliskannya — pasti gagal cepat atau lambat, karena suatu hari akan ada yang lupa.'),

  h3('Gagal ke arah yang aman'),
  p('Ketika pemeriksaan tidak bisa dilakukan, sistem menolak, bukan mengizinkan. Ketika nama izin salah ketik, akibatnya akses ditolak, bukan diberikan. Perbedaan arah kegagalan inilah yang membedakan kesalahan yang merepotkan dari kesalahan yang berbahaya.'),

  h3('Menolak dengan pemeriksaan termurah lebih dulu'),
  p('Baik pada middleware autentikasi maupun pada urutan pemasangan middleware unggahan, pemeriksaan disusun dari yang paling ringan. Selain lebih cepat, ini membuat sistem lebih tahan ketika sedang diserang: permintaan tanpa izin ditolak setelah membaca satu baris header, tanpa menyentuh basis data atau memori.'),

  h3('Kemampuan yang tidak diberikan tidak perlu dijaga'),
  p('Administrator sengaja tidak diberi kemampuan mengganti password pengguna lain. Administrator yang bisa melakukannya adalah administrator yang bisa menyamar sebagai siapa pun tanpa meninggalkan jejak.'),

  h3('Menelan error harus punya alasan tertulis'),
  p('Ada dua tempat di mana kegagalan sengaja diabaikan, dan alasannya berbeda. Pada penerbitan pesan email, kegagalan diabaikan supaya jawaban tetap seragam dan tidak membocorkan keberadaan email. Pada pembuatan alamat avatar, kegagalan diabaikan supaya data profil tetap bisa ditampilkan meski penyimpanan berkas sedang bermasalah. Blok penangkap error tanpa alasan yang jelas adalah bug yang belum ketahuan.'),
  br(),

  /* ═══════════════════ BAB 7 ═══════════════════ */
  h1('BAB 7 — Containerization dan Operasional'),

  h2('7.1 Susunan Layanan'),
  p('Seluruh sistem terdiri atas enam layanan yang dijalankan bersama oleh Docker Compose.'),
  table(
    ['Layanan', 'Peran', 'Port', 'Wajib Saat Start?'],
    [
      ['postgres', 'Basis data utama', '5432', 'Ya'],
      ['redis', 'Cache dan penyimpanan sementara', '6379', 'Ya'],
      ['rabbitmq', 'Antrean pesan email', '5672, 15672', 'Tidak'],
      ['minio', 'Penyimpanan berkas', '9000, 9001', 'Tidak'],
      ['app', 'API utama', '3000', '—'],
      ['worker', 'Pengirim email', '—', '—'],
    ],
    [1700, 3600, 2000, 1726]
  ),
  p('Kolom terakhir mencerminkan keputusan yang dibuat sadar. PostgreSQL dan Redis bersifat wajib karena tanpa keduanya tidak ada yang bisa login dan mekanisme logout menjadi palsu. RabbitMQ dan MinIO tidak wajib karena email dan avatar adalah fungsi pendukung — menjadikannya wajib berarti menjatuhkan seluruh autentikasi karena masalah pada gambar profil.'),
  quote('Menandai semua dependensi sebagai wajib adalah pilihan yang malas dan membuat sistem jauh lebih rapuh daripada yang diperlukan.'),

  h2('7.2 Perbedaan Alamat di Host dan di Dalam Container'),
  p('Inilah hal yang paling sering menjebak saat aplikasi pertama kali dimasukkan ke container.'),
  ...code([
    '  Dari komputer pengembang        Dari dalam container app',
    '  -----------------------        ------------------------',
    '  localhost:5432 -> Postgres     localhost:5432 -> tidak ada',
    '                                 postgres:5432  -> Postgres',
  ]),
  p('Di dalam container, kata localhost merujuk pada container itu sendiri. PostgreSQL bukan lagi tetangga di komputer yang sama, melainkan proses di container lain. Docker Compose menyediakan penamaan internal, sehingga setiap layanan dapat dipanggil menggunakan nama layanannya.'),
  p('Berkas konfigurasi tetap berisi localhost karena itu yang benar ketika aplikasi dijalankan langsung di komputer pengembang. Yang dilakukan adalah menimpa empat nama host tersebut khusus untuk container, sehingga satu berkas konfigurasi melayani dua konteks jaringan tanpa duplikasi.'),

  h2('7.3 Rancangan Dockerfile'),
  ...code([
    'FROM node:24-alpine',
    'WORKDIR /app',
    'COPY package.json package-lock.json ./',
    'RUN npm ci --omit=dev && npm cache clean --force',
    'COPY .sequelizerc ./',
    'COPY src ./src',
    'COPY public ./public',
    'USER node',
    'EXPOSE 3000',
    'CMD ["node", "src/server.js"]',
  ]),
  p('Empat keputusan di balik sembilan baris ini:'),
  num('Berkas daftar dependensi disalin lebih dulu, terpisah dari kode. Docker menyimpan hasil setiap perintah; kalau seluruh berkas disalin sekaligus di awal, setiap perubahan satu baris kode akan memaksa pemasangan ulang seluruh dependensi. Instruksi disusun dari yang paling jarang berubah ke yang paling sering.'),
  num('Pemasangan memakai npm ci, bukan npm install. Perintah ci membaca berkas kunci versi secara harfiah dan menolak bila tidak sesuai, sehingga image yang dibangun hari ini berisi versi yang sama persis dengan yang dibangun bulan lalu dari kode yang sama.'),
  num('Aplikasi berjalan sebagai pengguna biasa. Kalau ada celah yang memungkinkan eksekusi kode di dalam container, penyerang memperoleh hak pengguna biasa, bukan hak penuh.'),
  num('Tidak memakai multi-stage build. Teknik itu berguna bila ada tahap kompilasi yang menghasilkan berkas jadi. Project ini berjalan langsung dari kode sumber, sehingga tidak ada yang perlu dibuang setelah proses build. Meniru pola tanpa memeriksa masalah yang diselesaikannya hanya menambah kerumitan.'),

  h2('7.4 Migration Tidak Dijalankan Saat Container Menyala'),
  p('Ada godaan untuk menjalankan migration otomatis setiap kali container start. Hal itu sengaja tidak dilakukan, dengan tiga alasan.'),
  li('Bila aplikasi dijalankan dalam beberapa salinan sekaligus, semuanya akan menjalankan migration bersamaan pada basis data yang sama, dan salah satunya gagal di tengah jalan.'),
  li('Migration bersifat mengubah struktur dan sulit dibatalkan. Setiap restart yang tidak disengaja akan menjadi peristiwa perubahan skema.'),
  li('Image aplikasi sengaja tidak menyertakan perkakas migration, agar ukurannya tetap ramping.'),
  quote('Deploy dan perubahan skema adalah dua operasi dengan tingkat risiko yang berbeda, sehingga sebaiknya tidak digabungkan.'),

  h2('7.5 Penghentian yang Rapi'),
  p('Ketika container dihentikan, sistem operasi mengirim sinyal SIGTERM lalu menunggu sepuluh detik sebelum menghentikannya secara paksa. Tanpa penanganan, setiap penghentian dan setiap deploy akan memutus permintaan pengguna di tengah jalan.'),
  p('Urutan penutupannya disusun dengan sengaja: berhenti menerima permintaan baru, tutup antrean pesan, tutup Redis, terakhir tutup basis data. Kalau basis data ditutup lebih dulu, permintaan yang sedang berjalan akan gagal padahal beberapa milidetik lagi selesai.'),
  p('Hasil pengukuran menunjukkan proses penghentian selesai dalam sekitar 1,8 detik dengan seluruh koneksi tertutup rapi, bukan menunggu batas waktu sepuluh detik.'),

  h2('7.6 Cara Menjalankan'),
  h3('Mode pengembangan'),
  ...code([
    'docker compose up -d postgres redis rabbitmq minio',
    'npm install',
    'npm run db:migrate',
    'npm run db:seed',
    'npm run dev          # terminal 1 - API',
    'npm run worker       # terminal 2 - pengirim email',
  ]),
  h3('Mode container penuh'),
  ...code([
    'docker compose up -d --build',
    'docker compose ps',
    'curl http://localhost:3000/api/v1/health/ready',
  ]),
  br(),

  /* ═══════════════════ BAB 8 ═══════════════════ */
  h1('BAB 8 — Pengujian'),

  h2('8.1 Pendekatan yang Dipilih'),
  p('Pengujian ditulis pada tingkat end-to-end, yaitu menguji perilaku sistem melalui permintaan HTTP sungguhan, bukan menguji fungsi satu per satu.'),
  p('Alasannya, kesalahan yang paling sering lolos bukan kesalahan di dalam sebuah fungsi, melainkan kesalahan di sambungan antar lapisan: middleware yang urutannya tertukar, izin yang salah dipasang pada sebuah endpoint, atau data yang tidak sengaja ikut terkirim. Pengujian per fungsi bisa lulus semua sementara alur nyatanya rusak.'),
  p('Perkakas yang dipakai adalah fasilitas pengujian bawaan Node.js, sehingga tidak menambah dependensi baru sama sekali.'),

  h2('8.2 Daftar Pengujian'),
  table(
    ['No', 'Yang Diuji', 'Sifat'],
    [
      ['1', 'Endpoint pemeriksaan kesehatan menjawab dengan benar', 'Fungsional'],
      ['2', 'Login dengan password salah ditolak dengan pesan seragam', 'Keamanan'],
      ['3', 'Login dengan email tidak terdaftar memberi pesan yang sama persis', 'Keamanan'],
      ['4', 'Login yang benar menghasilkan token berformat sah tanpa membocorkan hash', 'Keamanan'],
      ['5', 'Endpoint terlindungi menolak permintaan tanpa token', 'Keamanan'],
      ['6', 'Endpoint terlindungi menerima token yang sah beserta data role', 'Fungsional'],
      ['7', 'Pemeriksaan hak akses mengizinkan superadmin membaca daftar izin', 'Fungsional'],
      ['8', 'Logout membuat token tidak bisa dipakai lagi', 'Keamanan'],
    ],
    [700, 6300, 2026]
  ),
  p('Lima dari delapan pengujian pada berkas autentikasi menguji sifat keamanan, dan itu disengaja. Sifat-sifat tersebut mudah rusak tanpa sengaja ketika seseorang merapikan kode, dan kerusakannya tidak terlihat saat dicoba secara manual. Pesan error yang diseragamkan, misalnya, sangat mungkin diubah oleh orang yang berniat baik agar "lebih membantu pengguna".'),

  h2('8.3 Hasil'),
  ...code([
    'ℹ tests 15',
    'ℹ pass 15',
    'ℹ fail 0',
    'ℹ duration_ms 3097',
  ]),
  p('Delapan pengujian pertama berada pada berkas autentikasi, tujuh sisanya pada berkas RBAC yang ditambahkan bersama modul role. Ketujuhnya memeriksa katalog permission, perlindungan role superadmin, siklus hidup role dari pembuatan sampai penghapusan, penolakan permissionIds yang tidak ada, penolakan penghapusan role yang masih dipakai, dan penanganan ID yang bukan angka.'),
  p('Pengujian dijalankan terhadap basis data terpisah bernama auth_service_test, sehingga tidak mengotori data pengembangan. Pemilihan basis data dilakukan lewat berkas environment khusus yang hanya berisi satu baris penanda mode pengujian.'),

  h2('8.4 Pengujian Manual yang Dilakukan'),
  p('Selain pengujian otomatis, sejumlah perilaku diverifikasi secara manual karena membutuhkan manipulasi infrastruktur.'),
  table(
    ['Yang Diuji', 'Cara', 'Hasil'],
    [
      ['Penonaktifan akun berlaku seketika', 'Ubah status di basis data, pakai token yang sama', 'Ditolak seketika'],
      ['Pembatasan percobaan login', 'Enam kali login gagal berturut-turut', 'Lima ditolak biasa, keenam diblokir'],
      ['Hitungan pembatasan bertahan', 'Restart server setelah terblokir', 'Tetap terblokir'],
      ['Antrean menahan pesan', 'Matikan pekerja, kirim permintaan reset', 'Pesan menunggu, API tetap cepat'],
      ['Pesan bertahan setelah broker restart', 'Restart broker dengan pesan menunggu', 'Pesan tetap ada'],
      ['Pesan rusak tidak melumpuhkan pekerja', 'Kirim pesan berformat salah', 'Dicatat, dibuang, pekerja tetap jalan'],
      ['Berkas tidak bisa diakses tanpa tanda tangan', 'Buka alamat tanpa bagian tanda tangan', 'Ditolak Access Denied'],
      ['Avatar lama terhapus otomatis', 'Unggah dua kali berturut-turut', 'Hanya satu objek tersisa'],
      ['Cache izin diperbarui saat role berubah', 'Naikkan role, pakai token yang sama', 'Izin baru langsung berlaku'],
      ['Start dari nol tanpa kegagalan', 'Hapus semua container lalu nyalakan', 'Nol kegagalan, nol restart'],
    ],
    [2800, 3200, 3026]
  ),
  br(),

  /* ═══════════════════ BAB 9 ═══════════════════ */
  h1('BAB 9 — Kendala dan Penyelesaiannya'),
  p('Bab ini mencatat kendala nyata yang ditemui selama pengerjaan. Bagian ini sengaja disertakan karena justru di sinilah pemahaman paling banyak terbentuk — kesalahan yang tidak pernah dijelaskan oleh dokumentasi mana pun, karena dokumentasi tidak pernah salah.'),

  h2('9.1 Kesalahan Ketik yang Menyamar sebagai Masalah Jaringan'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Docker menolak menarik image dengan pesan bahwa image tidak ditemukan, sementara menarik image yang sama secara manual justru berhasil.'],
      ['Dugaan awal', 'Koneksi internet tidak stabil, karena Docker menarik empat image sekaligus.'],
      ['Akar penyebab', 'Kesalahan ketik pada nama image: tertulis "alphine", seharusnya "alpine". Perintah manual berhasil karena diketik ulang dengan ejaan yang benar.'],
      ['Perbaikan', 'Memperbaiki satu huruf pada berkas konfigurasi.'],
      ['Pelajaran', 'Pesan "tidak ditemukan" dari sebuah perkakas tidak selalu berarti sumber dayanya tidak ada. Urutan pemeriksaan yang benar adalah membaca ulang namanya huruf per huruf terlebih dahulu, baru mencurigai jaringan.'],
    ],
    [1500, 7526]
  ),

  h2('9.2 Variabel Kosong yang Tidak Menimbulkan Error'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Peringatan bahwa sebuah variabel tidak diatur, tetapi sistem tetap berjalan.'],
      ['Akar penyebab', 'Nama variabel di berkas konfigurasi berbeda dari nama di berkas environment.'],
      ['Dampak sebenarnya', 'Docker Compose mengganti variabel tak dikenal dengan teks kosong, sehingga pemetaan port berubah menjadi port acak. Antarmuka web menjadi tidak dapat diakses pada alamat yang diharapkan.'],
      ['Pelajaran', 'Peringatan pada perkakas konfigurasi harus diperlakukan seserius error. Pola kesalahan yang paling melelahkan bukan yang gagal keras, melainkan yang berjalan dengan nilai kosong.'],
    ],
    [1500, 7526]
  ),

  h2('9.3 Perbedaan Huruf Besar-Kecil pada Nama Berkas'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Tidak ada gejala sama sekali di komputer pengembang.'],
      ['Akar penyebab', 'Nama berkas ditulis dengan huruf kapital di awal, sedangkan pemanggilnya menulis huruf kecil.'],
      ['Kenapa berbahaya', 'Sistem berkas Windows tidak membedakan huruf besar dan kecil, sedangkan Linux membedakannya. Kesalahan ini akan meledak nanti di dalam container, dengan gejala "kode yang sama berjalan di komputer saya tetapi gagal di server".'],
      ['Pelajaran', 'Windows menyembunyikan kelas kesalahan ini dari pengembang. Konvensi penamaan berkas harus ditegakkan secara sadar, tidak boleh mengandalkan sistem berkas untuk memaafkan.'],
    ],
    [1500, 7526]
  ),

  h2('9.4 Satu Spasi yang Mengubah Struktur Data'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Docker menolak berkas konfigurasi dengan pesan bahwa sebuah bagian seharusnya berupa daftar.'],
      ['Akar penyebab', 'Tanda hubung penanda item daftar ditulis tanpa spasi setelahnya, sehingga YAML membacanya sebagai pasangan kunci-nilai, bukan sebagai item daftar.'],
      ['Pelajaran', 'Pada YAML, spasi dan indentasi adalah strukturnya. Kesalahan indentasi tidak menghasilkan kesalahan sintaks, melainkan struktur yang berbeda dari yang dimaksudkan — dan itu jauh lebih sulit dilihat.'],
    ],
    [1500, 7526]
  ),

  h2('9.5 Kesalahan Indentasi yang Menyisipkan Layanan ke Dalam Layanan'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Docker melaporkan bahwa layanan postgres memiliki properti tidak dikenal bernama app dan worker.'],
      ['Akar penyebab', 'Dua blok layanan baru ditempel dengan indentasi empat spasi, sehingga menjadi properti di dalam layanan postgres, bukan layanan tersendiri.'],
      ['Perbaikan', 'Memindahkan kedua blok ke posisi yang benar dengan indentasi dua spasi.'],
      ['Pelajaran', 'Pesan error tersebut sebenarnya sangat informatif: ia menyebutkan di mana kunci itu ditemukan. Bila sebuah pemeriksa menyebutkan kunci berada di tempat yang tidak diduga, penyebabnya hampir selalu indentasi.'],
    ],
    [1500, 7526]
  ),

  h2('9.6 Saran Perbaikan Otomatis yang Justru Merusak'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Pemeriksa keamanan dependensi melaporkan dua kerentanan tingkat menengah dan menawarkan perbaikan otomatis.'],
      ['Yang ditemukan', 'Perbaikan yang ditawarkan akan menurunkan Sequelize dari versi 6 ke versi 3 — versi berusia delapan tahun yang akan merusak seluruh project.'],
      ['Analisis', 'Kerentanannya hanya berlaku pada fungsi tertentu dengan argumen tertentu, sementara Sequelize hanya memakai fungsi lain tanpa argumen tersebut. Jalur kode yang rentan tidak pernah dieksekusi.'],
      ['Pelajaran', 'Angka jumlah kerentanan bukan vonis. Urutan yang benar adalah membaca isi laporannya, memeriksa apakah kode kita menyentuh jalur tersebut, membaca apa yang akan dilakukan perbaikannya, baru memutuskan.'],
    ],
    [1500, 7526]
  ),

  h2('9.7 Urutan Hook yang Terbalik'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Penyimpanan pengguna gagal dengan pesan format email tidak valid, padahal email yang dikirim benar dan hanya mengandung spasi di awal.'],
      ['Akar penyebab', 'Pembersihan teks diletakkan pada hook yang berjalan setelah proses validasi, sehingga validator menilai data yang belum dibersihkan.'],
      ['Perbaikan', 'Memisahkan menjadi dua hook: pembersihan sebelum validasi, pengamanan password setelahnya.'],
      ['Pelajaran', 'Urutannya adalah bersihkan, periksa, simpan. Menaruh pembersihan setelah pemeriksaan membuat data yang sebenarnya sah ditolak; menaruh pengamanan sebelum pemeriksaan membuat aturan validasi memeriksa data yang sudah teracak.'],
    ],
    [1500, 7526]
  ),

  h2('9.8 Kompensasi Waktu yang Membuka Lubang Keamanan'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Setelah reset password, token lama seharusnya ditolak, tetapi pengujian menunjukkan token itu masih diterima.'],
      ['Akar penyebab', 'Waktu perubahan password sengaja dimundurkan satu detik untuk menghindari masalah lain, tetapi mundurnya terlalu jauh sehingga menjadi lebih awal daripada waktu terbit token.'],
      ['Akar yang lebih dalam', 'Dua satuan waktu yang berbeda dibandingkan langsung: penanda waktu pada token beresolusi detik, sedangkan penanda waktu pada basis data beresolusi milidetik.'],
      ['Perbaikan', 'Menghapus kompensasi, lalu membandingkan keduanya pada resolusi terkasar yang tersedia, yaitu detik.'],
      ['Pelajaran', 'Ini kesalahan yang gagal ke arah terbuka, dan itu jenis yang paling berbahaya. Setiap kali membandingkan dua waktu dari sumber berbeda, periksa satuan dan resolusinya terlebih dahulu.'],
    ],
    [1500, 7526]
  ),

  h2('9.9 Nama Izin yang Salah Ketik Tanpa Pesan Error'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Superadmin yang memiliki seluruh izin ditolak saat mengakses endpoint, tanpa pesan error apa pun di log.'],
      ['Akar penyebab', 'Nama izin pada definisi endpoint ditulis dalam bentuk tunggal, sedangkan izin yang tersimpan berbentuk jamak.'],
      ['Kenapa tidak ada error', 'Bagi sistem, nama izin hanyalah teks. Tidak ada yang memvalidasi bahwa teks tersebut merupakan izin yang benar-benar ada.'],
      ['Perbaikan', 'Mengumpulkan seluruh nama izin ke satu berkas konstanta, dipakai bersama oleh pemeriksa izin dan oleh seeder.'],
      ['Pelajaran', 'Arah kegagalannya sudah benar — salah ketik menyebabkan akses ditolak, bukan diberikan. Pada sistem yang berbasis daftar larangan, kesalahan yang sama justru akan membuka pintu tanpa ada yang menyadarinya.'],
    ],
    [1500, 7526]
  ),

  h2('9.10 ID yang Tidak Kembali ke Angka Satu'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Perintah pengujian yang menyebut ID role secara langsung memberikan hasil yang salah.'],
      ['Akar penyebab', 'Data awal pernah dihapus dan diisi ulang beberapa kali selama pengembangan. PostgreSQL tidak mengembalikan penomoran otomatis ke angka satu setelah baris dihapus, sehingga ID role menjadi 7, 8, dan 9.'],
      ['Yang menyelamatkan', 'Seeder tidak pernah menebak ID, melainkan mencarinya berdasarkan nama. Karena itu data tetap benar meski penomorannya berubah.'],
      ['Pelajaran', 'Nama adalah kontrak, ID adalah detail penyimpanan. Kode yang menyebut ID secara langsung untuk data hasil seeder adalah kesalahan yang menunggu waktu.'],
    ],
    [1500, 7526]
  ),

  h2('9.11 Dua Status Koneksi yang Terlihat Sama'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Setelah aplikasi masuk ke container, endpoint lupa password selalu gagal dengan kesalahan server, sementara endpoint login berjalan normal.'],
      ['Akar penyebab', 'Klien Redis memiliki dua status berbeda: soket sudah terbuka, dan siap menerima perintah. Pemeriksaan kesiapan memakai status yang pertama, sehingga perintah dikirim sebelum proses masuk selesai.'],
      ['Kenapa baru muncul sekarang', 'Sebelumnya perintah yang dikirim terlalu dini masuk ke antrean tunggu dan akhirnya terkirim. Setelah antrean tersebut dimatikan demi kecepatan, perintah itu langsung ditolak.'],
      ['Perbaikan', 'Mengubah pemeriksaan agar menunggu status siap, dengan batas waktu agar tidak menggantung selamanya.'],
      ['Pelajaran', 'Optimasi yang membuat sistem gagal lebih cepat akan memunculkan kesalahan yang sebelumnya tersembunyi oleh kelambatan. Itu bukan alasan membatalkan optimasinya, melainkan alasan memperbaiki kesalahan yang baru terlihat.'],
    ],
    [1500, 7526]
  ),

  h2('9.12 Alat Ukur yang Menyesatkan'),
  table(
    ['Aspek', 'Uraian'],
    [
      ['Gejala', 'Pengujian melaporkan bahwa pesan hilang dari antrean, padahal beberapa detik kemudian pesan yang sama muncul kembali.'],
      ['Akar penyebab', 'Angka dibaca dari antarmuka pemantauan yang datanya diperbarui secara berkala setiap beberapa detik, bukan dari sumber yang membaca langsung.'],
      ['Perbaikan', 'Mengganti sumber data pengukuran ke pembacaan langsung, bukan menunggu lebih lama.'],
      ['Pelajaran', 'Bila sebuah pengujian memberi hasil yang bertentangan dengan bukti lain, curigai alat ukurnya sebelum menyalahkan sistemnya. Data untuk dashboard manusia dan data untuk keputusan program punya persyaratan ketepatan waktu yang berbeda.'],
    ],
    [1500, 7526]
  ),

  h2('9.13 Pola yang Berulang'),
  p('Kalau dua belas kendala di atas dikelompokkan, muncul beberapa pola yang sama.'),
  table(
    ['Pola', 'Contoh Kasus', 'Cara Menemukannya'],
    [
      ['Dua tempat yang harus cocok, satu berbeda', '9.1, 9.2, 9.3, 9.9', 'Kumpulkan kedua sisi ke dalam satu tampilan, lalu bandingkan'],
      ['Perkakas berjalan tanpa error tetapi hasilnya salah', '9.2, 9.4, 9.5, 9.9', 'Jalankan perintah pemeriksa konfigurasi sebelum menjalankan sistemnya'],
      ['Satuan atau status yang terlihat sama padahal berbeda', '9.8, 9.11', 'Cetak nilainya secara eksplisit saat ragu'],
      ['Saran otomatis yang salah', '9.6, 9.12', 'Baca dulu apa yang akan dilakukannya, jangan langsung menurut'],
    ],
    [2600, 2000, 4426]
  ),
  quote('Kesimpulan yang paling berharga dari seluruh bab ini: pesan dari sebuah perkakas adalah data, bukan perintah. Tugas pengembang adalah memverifikasinya, bukan mempercayainya begitu saja.'),
  br(),

  /* ═══════════════════ BAB 10 ═══════════════════ */
  h1('BAB 10 — Batasan dan Rencana Lanjutan'),
  p('Bagian ini mencatat hal-hal yang sengaja belum dibangun. Mencantumkannya secara terbuka lebih berguna daripada membiarkannya tidak terlihat, karena masing-masing sudah punya alasan dan pemicu kapan sebaiknya ditambahkan.'),
  table(
    ['Yang Belum Ada', 'Alasan Ditunda', 'Kapan Sebaiknya Ditambahkan'],
    [
      ['Pencatatan log terstruktur', 'Selama log dibaca langsung dari terminal, pencatatan sederhana sudah memadai', 'Ketika log dikirim ke sistem pengumpul terpusat'],
      ['Antrean khusus pesan gagal', 'Pesan email yang gagal saat ini dibuang setelah dicatat', 'Ketika kegagalan pengiriman email perlu ditelusuri satu per satu'],
      ['Pemeriksaan isi berkas unggahan', 'Pemeriksaan saat ini mengandalkan keterangan dari klien', 'Ketika berkas mulai ditampilkan langsung di peramban'],
      ['Daftar sesi aktif per perangkat', 'Pengguna belum dapat melihat atau mencabut sesinya di perangkat lain', 'Ketika pengguna mulai memakai lebih dari dua perangkat'],
      ['Batas umur mutlak sebuah sesi', 'Sesi yang terus diperbarui dapat hidup tanpa batas selama pemakaiannya aktif', 'Ketika kebijakan keamanan mewajibkan login ulang berkala'],
      ['Satu token reset aktif per pengguna', 'Saat ini beberapa token bisa aktif bersamaan', 'Ketika audit keamanan mempersoalkannya'],
      ['Basis data Redis terpisah untuk pengujian', 'Pengujian dan pengembangan berbagi ruang kunci yang sama', 'Ketika pengujian dijalankan otomatis bersamaan dengan pengembangan'],
      ['Pencarian dan penyaringan daftar pengguna', 'Pembagian halaman sudah menjawab kebutuhan dasar', 'Ketika jumlah pengguna melebihi beberapa ratus'],
    ],
    [2600, 3400, 3026]
  ),
  p('Perlu ditegaskan bahwa daftar ini bukan daftar pekerjaan yang tertinggal, melainkan hasil dari satu prinsip yang dipegang sepanjang pengerjaan: sesuatu ditambahkan ketika sudah ada yang benar-benar membutuhkannya, bukan ketika terpikir mungkin akan berguna. Berkas kosong dan fungsi yang belum berisi adalah utang, bukan persiapan.'),
  p('Prinsip ini terbukti benar setidaknya pada satu kasus. Penanganan penghentian aplikasi sempat direncanakan sejak awal, tetapi sengaja ditunda karena saat itu belum ada koneksi apa pun yang perlu ditutup. Ketika akhirnya ditulis pada tahap terakhir, isinya menutup koneksi basis data, cache, dan antrean pesan — semuanya belum ada pada saat perencanaan awal. Menuliskannya lebih dini hanya akan menghasilkan fungsi kosong yang tetap harus disusun ulang.'),
  br(),

  /* ═══════════════════ LAMPIRAN ═══════════════════ */
  /* ═══════════════════ BAB 11 ═══════════════════ */
  h1('BAB 11 — Pengembangan Lanjutan: Modul Role dan Antarmuka Console'),
  p('Bab ini mencatat dua penambahan yang dikerjakan setelah delapan tahap awal selesai. Keduanya berangkat dari satu kebutuhan praktis: hasil kerja ini harus dapat diperagakan, bukan hanya dijelaskan lewat perintah di terminal.'),

  h2('11.1 Temuan: Empat Permission Tanpa Endpoint'),
  p('Saat menyiapkan peragaan, ditemukan bahwa empat permission hasil seeder tidak pernah punya endpoint pasangannya: roles.read, roles.create, roles.update, dan roles.delete. Pengaturan role selama ini hanya dilakukan lewat seeder dan lewat penetapan role kepada pengguna, bukan lewat pengelolaan role itu sendiri.'),
  p('Artinya, permintaan untuk menampilkan perbandingan wewenang antar role membutuhkan penambahan di sisi backend terlebih dahulu, bukan sekadar tampilan baru. Tanpa itu, antarmuka tidak punya endpoint untuk dipanggil.'),
  quote('Pelajaran kecilnya: daftar permission yang di-seed sebaiknya diperiksa berkala terhadap daftar endpoint yang benar-benar ada. Permission yang menganggur berarti fitur yang direncanakan tetapi tidak pernah dibangun.'),

  h2('11.2 Modul Role'),
  p('Tujuh endpoint ditambahkan, sehingga totalnya menjadi 25.'),
  table(
    ['Endpoint', 'Fungsi', 'Izin'],
    [
      ['GET /roles', 'Daftar role beserta izin dan jumlah pemakainya', 'roles.read'],
      ['POST /roles', 'Membuat role baru sekaligus izin awalnya', 'roles.create'],
      ['GET /roles/:id', 'Detail satu role', 'roles.read'],
      ['PATCH /roles/:id', 'Mengubah nama atau keterangan', 'roles.update'],
      ['PUT /roles/:id/permissions', 'Mengganti seluruh izin sebuah role', 'roles.update'],
      ['DELETE /roles/:id', 'Menghapus role', 'roles.delete'],
      ['GET /permissions', 'Katalog seluruh permission, dikelompokkan', 'permissions.read'],
    ],
    [2600, 4400, 2026]
  ),
  p('Tiga aturan pengaman ditambahkan pada modul ini:'),
  num('Role superadmin dilindungi dari penghapusan maupun penggantian nama. Alasannya, namanya dijadikan acuan oleh aturan keamanan di dalam kode — mengganti namanya akan membuat perlindungan akun superadmin berhenti bekerja tanpa menimbulkan error apa pun.'),
  num('Role yang masih dipakai pengguna tidak dapat dihapus, dan penolakannya menyebutkan jumlah pemakainya. Kalau dibiarkan, penghapusan akan mencabut wewenang sejumlah pengguna sekaligus secara diam-diam melalui aturan cascade di basis data.'),
  num('Pembuatan role memakai transaksi, karena menyimpan role dan menetapkan izinnya adalah dua operasi tulis yang tidak bermakna secara terpisah.'),

  h2('11.3 Versi Cache RBAC'),
  p('Mengubah izin sebuah role memengaruhi seluruh pengguna yang memakainya sekaligus. Fungsi penghapusan cache yang dibuat sebelumnya bekerja per pengguna, sehingga tidak menjangkau kasus ini.'),
  p('Solusinya adalah nomor versi yang disisipkan ke dalam kunci cache. Menaikkan nomor tersebut membuat seluruh cache lama tidak terjangkau sekaligus, tanpa perlu menghapusnya satu per satu. Sisa kunci lama hilang sendiri lewat masa simpan yang sudah ada.'),
  ...code([
    'permissions:user:v3:6af9267a-...     <- kunci sebelum perubahan',
    'permissions:user:v4:6af9267a-...     <- kunci setelah versi dinaikkan',
  ]),
  p('Ini persis jalur peningkatan yang dicatat sebagai batasan pada tahap kelima. Waktu itu ia sengaja tidak dibangun karena belum ada satu pun endpoint yang mengubah izin sebuah role. Setelah endpoint tersebut ada, ia menjadi kebutuhan nyata dan langsung dibangun.'),
  quote('Contoh yang baik tentang menunda pekerjaan sampai benar-benar dibutuhkan: bentuk akhirnya justru lebih jelas setelah pemakainya ada.'),

  h2('11.4 Antarmuka Console'),
  p('Antarmuka dibangun tanpa kerangka kerja apa pun, hanya HTML, CSS, dan JavaScript biasa, lalu disajikan langsung oleh Express sebagai berkas statis.'),
  table(
    ['Pertimbangan', 'Alasan'],
    [
      ['Tanpa proses build', 'Tidak ada tahap kompilasi yang bisa gagal pada hari peragaan'],
      ['Tanpa dependensi baru', 'Tidak menambah satu pun paket ke dalam project'],
      ['Disajikan oleh Express', 'Satu alamat, satu server, tanpa urusan lintas origin'],
      ['Tiga berkas terpisah', 'Struktur, tampilan, dan logika dipisah agar mudah dibaca'],
    ],
    [2600, 6426]
  ),
  p('Konsekuensinya, seluruh sistem tetap dapat dijalankan dengan satu perintah yang sama seperti sebelumnya, dan antarmuka ikut masuk ke dalam image Docker.'),

  h2('11.5 API Response Inspector'),
  p('Setiap aksi pada antarmuka mencatat permintaan HTTP-nya di sebuah panel melayang: metode, alamat, kode status berwarna, waktu tempuh, penanda waktu, serta isi permintaan dan jawaban dengan pewarnaan sintaks.'),
  p('Ini keputusan yang dibuat khusus untuk keperluan peragaan kepada audiens teknis. Antarmuka biasa hanya memperlihatkan hasil akhir; panel ini memperlihatkan bahwa hasil tersebut benar-benar datang dari endpoint yang dibangun, lengkap dengan waktu responsnya.'),
  p('Pencatatannya tidak dipasang di tiap fungsi, melainkan pada satu pembungkus fetch yang dilewati semua panggilan. Menambah endpoint baru otomatis ikut tercatat tanpa menyentuh panel sama sekali.'),
  table(
    ['Perilaku', 'Alasan'],
    [
      ['Panel berada di luar layar login maupun layar aplikasi', 'Agar permintaan login itu sendiri ikut tercatat, bukan baru mulai setelah masuk'],
      ['Dapat digeser dan diubah ukurannya, dengan batas', 'Ukuran minimum 300x200 dan selalu utuh di dalam viewport, sehingga tidak bisa tersesat di luar layar'],
      ['Posisi dan ukuran diingat', 'Penyaji dapat menatanya sekali sebelum presentasi'],
      ['Isian password disamarkan', 'Panel ini tampil di depan penonton; request login yang sah pun tidak boleh memamerkan passwordnya'],
      ['Bawaannya mengecil di layar sempit', 'Di bawah 1000 piksel panel pasti menutupi kartu login'],
    ],
    [3200, 5826]
  ),

  h2('11.6 Matriks Izin'),
  p('Halaman ini menyusun seluruh permission sebagai baris dan seluruh role sebagai kolom, sehingga perbedaan wewenang antar role terlihat sebagai perbedaan panjang kolom.'),
  ...code([
    '  PERMISSION            superadmin   admin   user',
    '  ------------------    ----------   -----   ----',
    '  users.create              v          v      -',
    '  users.delete              v          v      -',
    '  roles.create              v          -      -',
    '  roles.update              v          -      -',
    '  profile.read              v          v      v',
    '  profile.update            v          v      v',
  ]),
  caption('Gambar 11.1 — Perbandingan wewenang antar role'),
  p('Baris roles.create dan roles.update memperlihatkan pembatasan yang paling penting: keduanya hanya dimiliki superadmin. Inilah yang mencegah seorang admin menaikkan wewenangnya sendiri, dan pada tampilan ini alasannya terlihat tanpa perlu membaca kode.'),
  p('Kolom role dapat disunting langsung dari halaman ini, kecuali kolom superadmin yang sengaja dikunci agar peragaan tidak berisiko mengunci akun yang sedang dipakai.'),

  h2('11.8 Dua Kesalahan yang Ditemukan Justru Karena Ada Antarmuka'),
  p('Membangun antarmuka ternyata memunculkan dua kesalahan yang tidak pernah terlihat selama pengujian dilakukan lewat terminal, karena keduanya hanya muncul ketika seseorang masuk sebagai pengguna selain superadmin.'),
  p('Pertama, endpoint daftar izin milik sendiri dijaga oleh izin permissions.read. Akibatnya pengguna dengan role admin maupun user sama sekali tidak dapat masuk ke antarmuka: proses masuk mengambil daftar izin, permintaan itu ditolak, dan seluruh proses gagal. Penjagaan tersebut memang salah tempat sejak awal, dipasang pada tahap kelima ketika endpoint katalog permission belum ada sehingga izin itu belum punya rumah. Setelah katalog dibuat pada bab ini, penjagaan dipindahkan ke tempat yang benar dan endpoint milik sendiri cukup memerlukan token yang sah.'),
  p('Kedua, dan ini akibat langsung dari perbaikan pertama: controller endpoint tersebut membaca daftar izin dari variabel yang diisi oleh middleware otorisasi. Begitu middleware itu dilepas, sumber datanya hilang dan jawabannya menjadi kosong tanpa menimbulkan error sama sekali. Perbaikannya membuat controller mengambil datanya sendiri.'),
  quote('Pelajarannya: controller tidak boleh bergantung pada middleware otorisasi untuk DATANYA. Ketergantungan seperti itu tidak terlihat saat membaca route, dan ia rusak diam-diam begitu penjagaan route diubah.'),
  p('Keduanya adalah jenis kesalahan yang sama seperti yang dicatat di Bab 9: dua tempat yang harus cocok, dan yang tidak cocok tidak menghasilkan error apa pun. Yang membedakan kali ini adalah cara menemukannya. Selama pengujian hanya dilakukan sebagai superadmin, keduanya tidak pernah muncul. Antarmuka memaksa mencoba peran lain, dan di situlah keduanya terungkap.'),
  quote('Membangun cara memperagakan sistem ternyata sekaligus menjadi cara mengujinya.'),
  h2('11.7 Pelacakan Cakupan Endpoint'),
  p('Halaman Status dan Cakupan memuat daftar seluruh 26 endpoint. Endpoint yang sudah pernah dipanggil dari antarmuka selama sesi berjalan ditandai hijau, disertai penghitung cakupan.'),
  p('Fungsinya sederhana tetapi berguna saat peragaan: ia membuktikan bahwa seluruh endpoint benar-benar dapat diakses melalui antarmuka, bukan sekadar tercantum di dokumen.'),
  br(),

  /* ═══════════════════ BAB 12 ═══════════════════ */
  h1('BAB 12 — Perbaikan Berdasarkan Tinjauan'),
  p('Setelah pemaparan internal, terdapat sejumlah masukan dari pembimbing yang ditindaklanjuti. Bab ini mencatat perbaikannya beserta alasan di baliknya.'),

  h2('12.1 Katalog Izin Dipindahkan ke Migration'),

  h3('Masalah yang ditemukan'),
  p('Sebelumnya, katalog sebelas izin ditulis tangan di dua tempat: sebagai konstanta di src/constants/permissions.js, dan sebagai daftar yang disisipkan oleh seeder. Menambah satu izin berarti menyunting dua berkas, dan melewatkan salah satunya menimbulkan kegagalan yang sangat sulit dilacak.'),
  p('Kegagalannya begini. Izin ditambahkan ke konstanta dan dipakai di route, tetapi tidak ikut ditambahkan ke daftar seeder. Akibatnya izin tersebut tidak punya baris di basis data. Karena izin superadmin sendiri diambil dari baris basis data, bukan dari konstanta di kode, maka tidak ada satu pengguna pun yang dapat melewati pemeriksaan itu — termasuk superadmin. Endpoint tersebut menjawab 403 selamanya, tanpa satu pun error di log.'),
  p('Ada masalah kedua yang lebih luas. Katalog izin berada di seeder, sedangkan perintah seeder sering dilewati pada saat deploy karena isinya dianggap data contoh. Perintah migration selalu dijalankan karena ia mengubah struktur. Kalau seeder terlewat di sebuah environment, tabel izin kosong dan seluruh endpoint terlindungi menolak semua orang.'),

  h3('Perbaikan'),
  p('Arah aliran datanya dibalik. Basis data dijadikan sumber kebenaran, dan berkas konstanta menjadi turunannya.'),
  ...code([
    'SEBELUM                              SESUDAH',
    'constants/permissions.js             migration (daftar izin, teks literal)',
    '       | diimpor seeder                     | db:migrate - SELALU jalan',
    '   seeder                               BASIS DATA  <- sumber kebenaran',
    '       | db:seed - bisa terlewat            | npm run gen:permissions',
    '  BASIS DATA                          constants/permissions.js  <- DIBUAT SCRIPT',
    '                                            |',
    '                                      authorize(PERMISSIONS.USERS_CREATE)',
  ]),
  caption('Gambar 12.1 — Arah aliran katalog izin sebelum dan sesudah perbaikan'),
  table(
    ['Bagian', 'Perubahan'],
    [
      ['Migration baru', 'Menyisipkan sebelas izin dengan ON CONFLICT DO NOTHING, sehingga aman dijalankan pada basis data yang izinnya sudah terisi'],
      ['Seeder RBAC', 'Berhenti menyisipkan izin. Kini hanya mengurus role dan pemetaannya, memakai teks literal alih-alih konstanta'],
      ['Script generator', 'Membaca tabel izin lalu menulis berkas konstanta, dengan header penanda bahwa berkas itu tidak boleh disunting manual'],
      ['Middleware authorize', 'Mencatat sendiri setiap nama izin yang diminta route saat aplikasi dimuat'],
      ['Pemeriksaan saat start', 'Membandingkan daftar yang dicatat middleware dengan isi basis data. Ada yang tidak cocok, aplikasi menolak menyala'],
    ],
    [2200, 6826]
  ),

  h3('Kenapa seeder memakai teks literal, bukan konstanta'),
  p('Seeder dan migration adalah catatan sejarah. Kalau seeder mengimpor berkas konstanta, perilakunya akan berubah secara retroaktif setiap kali konstanta itu diubah — padahal yang seharusnya ia gambarkan adalah keadaan pada saat ia pertama dijalankan. Prinsip ini sama dengan aturan pada Bab 4: migration yang sudah dijalankan tidak boleh disunting.'),
  p('Satu pengecualian dibuat untuk superadmin. Alih-alih menuliskan daftar izinnya, seeder mengambil seluruh baris yang ada di tabel izin. Dengan begitu, izin yang ditambahkan lewat migration baru tidak mungkin terlewat dari superadmin.'),

  h3('Dua pengaman yang berjalan tanpa perlu diingat'),
  p('Yang membuat perbaikan ini benar-benar menutup lubangnya bukan generator, melainkan dua pemeriksaan berikut.'),
  num('Middleware authorize menolak nama izin yang bukan teks. Salah ketik pada konstanta menghasilkan nilai undefined, dan itu tertangkap pada saat route didefinisikan, yaitu ketika aplikasi dimuat.'),
  num('Saat start, daftar izin yang dipakai seluruh route dibandingkan dengan isi tabel izin. Ada yang tidak ada, aplikasi menolak menyala dan menyebutkan izin mana beserta perintah yang harus dijalankan.'),
  quote('Kegagalan yang tadinya berupa 403 senyap selamanya, sekarang berupa satu pesan jelas pada detik pertama aplikasi dijalankan.'),
  p('Ini penerapan prinsip fail fast yang sama seperti pada pemeriksaan variabel environment, koneksi basis data, dan kredensial superadmin di seeder.'),

  h3('Hasil pengujian'),
  ...code([
    'Izin dikumpulkan authorize()   : 11, cocok persis dengan basis data',
    'Katalog benar                  : lolos',
    'Ada izin yang tidak ada di DB  : ditolak, menyebutkan nama izinnya',
    'Konstanta salah ketik          : ditolak saat route didefinisikan',
    'Basis data dibangun dari nol   : 11 izin, superadmin 11, admin 7, user 2',
    'Pengujian end-to-end           : 15 lulus, 0 gagal',
  ]),
  br(),

  h2('12.2 Lapisan Repository dan Perpindahan ke Class'),

  h3('Masalah yang ditemukan'),
  p('Masukan berikutnya menyangkut dua hal yang sebenarnya satu persoalan yang sama: penyusunan query tersebar di mana-mana, dan modul-modul ditulis sebagai kumpulan fungsi lepas.'),
  p('Sebelum perbaikan, service memanggil model Sequelize secara langsung. Service profil memanggil model User, service role memanggil model Role beserta model penghubungnya, dan middleware autentikasi memanggil model User sekaligus klien Redis. Akibatnya, pengetahuan tentang cara data disimpan bocor ke seluruh lapisan.'),
  p('Dua contoh nyata dari kebocoran itu. Awalan kunci token yang dicabut, token:denylist:, ditulis di dua berkas yang berbeda — di service autentikasi ketika mencabut, dan di middleware autentikasi ketika memeriksa. Kalau salah satu diubah, logout berhenti bekerja tanpa satu pun error: token dicabut dengan kunci A, diperiksa dengan kunci B, dan hasil pemeriksaannya selalu "tidak dicabut". Hal yang sama terjadi pada awalan password-reset: beserta cara token itu di-hash.'),
  quote('Pola kegagalannya sama seperti pada katalog izin: dua tempat yang harus cocok, dan yang tidak cocok tidak menghasilkan error apa pun.'),
  p('Persoalan kedua, karena service berupa objek berisi fungsi yang mengambil dependensinya lewat require di baris paling atas berkas, dependensi itu tidak dapat digantikan dari luar. Untuk menguji satu fungsi service, seluruh basis data, Redis, dan RabbitMQ harus benar-benar hidup. Itulah alasan sampai bab sebelumnya seluruh pengujian yang ada berupa end-to-end.'),

  h3('Perbaikan'),
  p('Dibuat satu folder baru, src/repositories/, dan satu aturan tunggal: Sequelize dan klien Redis hanya boleh disebut di dalam folder itu.'),
  ...code([
    'routes  ->  controller  ->  service  ->  repository  ->  model / DB',
    '',
    '            "terima HTTP"   "aturan"     "cara simpan"',
  ]),
  caption('Gambar 12.2 — Arah ketergantungan antar lapisan'),
  table(
    ['Repository', 'Tanggung jawab'],
    [
      ['user.repository.js', 'Seluruh pencarian, penyimpanan, dan penetapan role pengguna'],
      ['role.repository.js', 'Role beserta izinnya, termasuk penghitungan jumlah pengguna per role'],
      ['permission.repository.js', 'Katalog izin dan pembacaan daftar namanya'],
      ['tokenDenylist.repository.js', 'Satu-satunya pemilik awalan kunci token:denylist:'],
      ['passwordResetToken.repository.js', 'Satu-satunya pemilik awalan password-reset: beserta cara hash-nya'],
      ['health.repository.js', 'Pemeriksaan hidup-matinya basis data dan cache'],
    ],
    [3200, 5826]
  ),
  p('Kedua kebocoran tadi otomatis tertutup. Awalan kunci sekarang hanya ada di satu berkas, dan tidak ada satu pun pemanggil yang tahu bentuk kuncinya. Cara hash token reset pun demikian: service cukup menyerahkan token apa adanya, dan repository yang memutuskan bagaimana ia disimpan.'),

  h3('Dua pengecualian yang disengaja'),
  p('Ada dua tempat di luar folder repository yang masih menyebut Sequelize, dan keduanya bukan penyusunan query.'),
  num('Pembungkus transaksi di src/database/index.js. Service role dan service pengguna memerlukan beberapa operasi tulis yang harus berhasil bersama-sama atau gagal bersama-sama. Pembungkus ini menyediakannya tanpa memaksa service mengimpor Sequelize.'),
  num('Berkas server.js, yang membuka dan menutup koneksi. Ia adalah titik penyusunan aplikasi, jadi memang tugasnya mengurus siklus hidup koneksi — bukan menyusun query.'),

  h3('Kenapa repository mengembalikan objek model, bukan objek biasa'),
  p('Keputusan ini sengaja diambil dan dicatat di dalam berkasnya. Objek model membawa perilaku yang benar-benar dipakai: metode pembanding password, penyaring kolom rahasia saat objek diubah menjadi JSON, dan hook yang meng-hash password sebelum disimpan.'),
  p('Kalau repository mengubahnya menjadi objek biasa, tiga hal itu hilang. Yang paling berbahaya adalah hook: pembaruan yang dilakukan tanpa objek model akan melewati hook, dan password tersimpan dalam bentuk teks asli tanpa satu pun peringatan.'),

  h3('Kenapa class, dan kenapa tidak semuanya'),
  p('Repository, service, dan controller ditulis sebagai class dengan dependensinya disuntikkan lewat constructor, disertai nilai bawaan agar pemakaian sehari-hari tidak berubah sama sekali.'),
  ...code([
    'class AuthService {',
    '  constructor({ users = userRepository, denylist = tokenDenylistRepository } = {}) {',
    '    this.users = users;',
    '    this.denylist = denylist;',
    '  }',
    '}',
    '',
    "// dipakai biasa   : authService.login(...)            <- dependensi asli",
    "// dipakai di test : new AuthService({ users: palsu }) <- dependensi palsu",
  ]),
  caption('Gambar 12.3 — Penyuntikan dependensi lewat constructor'),
  p('Inilah yang membuka jalan bagi pengujian unit: objek palsu dapat dimasukkan tanpa menyalakan satu pun layanan.'),
  p('Middleware, berkas di utils/, dan berkas route tetap berupa fungsi. Express memang mengharuskan middleware berupa fungsi, berkas utils tidak menyimpan keadaan apa pun sehingga class hanya menambah upacara, dan berkas route hanya menyambungkan alamat ke handler.'),
  quote('Class dipakai di tempat yang punya dependensi untuk disuntikkan. Di tempat yang tidak punya, ia hanya menambah baris tanpa menambah kemampuan.'),

  h3('Catatan tentang controller'),
  p('Metode controller ditulis sebagai properti berisi fungsi panah, bukan metode biasa. Alasannya teknis: handler diserahkan ke router sebagai nilai, terlepas dari objek pemiliknya. Metode biasa akan kehilangan acuan this begitu dilepas seperti itu, dan setiap pemanggilan berujung pada error. Fungsi panah mengikat this pada saat objeknya dibuat, sehingga tetap utuh.'),

  h3('Hasil pengujian'),
  p('Karena restrukturisasi ini menyentuh hampir seluruh berkas di src/, pembuktian yang dipakai adalah bahwa perilaku sistem tidak berubah sedikit pun.'),
  ...code([
    'Aplikasi dimuat                : berhasil, tanpa error require',
    'Pengujian end-to-end           : 15 lulus, 0 gagal',
    'Container dibangun ulang       : sehat, katalog izin terverifikasi 11/11',
    'Sapuan seluruh endpoint        : 25 dari 25 endpoint saat itu, 0 gagal',
    'Sequelize di luar repositories : hanya pembungkus transaksi dan server.js',
  ]),
  br(),

  h2('12.3 Pengujian Unit'),

  h3('Masalah yang ditemukan'),
  p('Sampai bab sebelumnya, seluruh pengujian yang ada berupa end-to-end: aplikasi sungguhan dinyalakan, lalu endpoint dipanggil lewat HTTP. Pengujiannya sahih, tetapi ada dua hal yang tidak dapat dijangkaunya.'),
  p('Pertama, ia memerlukan seluruh layanan hidup. Menjalankan satu pengujian berarti menyalakan PostgreSQL, Redis, RabbitMQ, dan MinIO terlebih dahulu. Kedua, dan ini yang lebih penting, ada aturan-aturan yang secara sengaja tidak terlihat dari luar. Contohnya penyetaraan waktu respons pada login: dari luar, jawabannya sama saja. Yang berbeda hanyalah lamanya, dan itu tidak dapat diperiksa lewat isi jawaban.'),
  quote('Pengujian end-to-end membuktikan sistemnya bekerja. Pengujian unit membuktikan alasan di balik cara ia bekerja.'),

  h3('Yang membuatnya mungkin'),
  p('Perpindahan ke class pada bagian sebelumnya bukan sekadar perkara gaya penulisan. Karena setiap service menerima dependensinya lewat constructor, seluruh basis data dan Redis dapat digantikan objek palsu. Inilah imbal hasil dari restrukturisasi itu.'),
  ...code([
    '// dipakai sehari-hari - dependensi sungguhan dari nilai bawaan',
    'authService.login({ email, password })',
    '',
    '// dipakai di pengujian - dependensi palsu, tanpa satu pun layanan hidup',
    'new AuthService({ users: userRepositoryPalsu, denylist: denylistPalsu })',
  ]),
  caption('Gambar 12.4 — Dependensi yang sama, sumber yang berbeda'),
  p('Seluruh objek palsu dikumpulkan di satu berkas, tests/unit/fakes.js. Setiap metodenya mencatat jumlah dan argumen pemanggilannya, dan seluruh pemanggilan juga dicatat ke satu daftar bersama sehingga URUTAN antar objek pun dapat dibuktikan — dipakai misalnya untuk memastikan password diubah sebelum token resetnya dihapus.'),
  p('Seluruhnya memakai node:test, penguji yang sudah menyatu di dalam Node, beserta node:assert. Tidak ada satu pun paket pengujian yang dipasang. Alasannya sama dengan yang mendasari keputusan-keputusan sebelumnya di laporan ini: kemampuan yang sudah tersedia tidak perlu ditambah dari luar.'),

  h3('Apa yang diuji, dan mengapa justru itu'),
  p('Sasarannya bukan sekadar mengejar angka cakupan, melainkan aturan-aturan yang kalau rusak tidak akan menimbulkan error apa pun.'),
  table(
    ['Yang dibuktikan', 'Kalau ia rusak'],
    [
      ['Pesan untuk email tak terdaftar sama dengan pesan untuk password salah', 'Endpoint login dapat dipakai memetakan email mana yang terdaftar'],
      ['Jalur email tak terdaftar tetap memakan waktu perbandingan bcrypt', 'Selisih waktu responsnya sendiri membocorkan email mana yang terdaftar'],
      ['Status aktif diperiksa setelah password, bukan sebelum', 'Jawaban 403 mengonfirmasi bahwa email tersebut terdaftar'],
      ['Masa simpan entri cabut sepanjang sisa umur token', 'Token yang sudah di-logout berlaku kembali setelah entrinya hilang'],
      ['Token reset disimpan sebagai hash, bukan token aslinya', 'Isi Redis yang bocor dapat langsung dipakai mengganti password orang lain'],
      ['Password diubah lebih dulu, token dihapus kemudian', 'Pembaruan yang gagal meninggalkan pengguna dengan tautan yang sudah mati'],
      ['Kegagalan Redis pada cache izin dilewati, bukan menjatuhkan permintaan', 'Redis yang tersendat menjatuhkan seluruh endpoint terlindungi'],
      ['Perubahan izin role menaikkan versi cache, bukan menghapus per pengguna', 'Sebagian pengguna masih memakai izin lama sampai cache-nya kedaluwarsa'],
      ['Nama role superadmin tidak dapat diubah', 'Perlindungan akun superadmin berhenti bekerja tanpa error'],
      ['Role yang masih dipakai tidak dapat dihapus', 'ON DELETE CASCADE mencabut wewenang sejumlah pengguna secara diam-diam'],
      ['Setiap token punya jti yang berbeda', 'Mencabut satu token ikut mencabut token lain'],
    ],
    [4200, 4826]
  ),
  p('Perhatikan bahwa hampir seluruh baris di kolom kanan berbunyi "tanpa error", "diam-diam", atau "senyap". Itu bukan kebetulan. Jenis kegagalan itulah yang paling mahal, dan justru yang paling sulit ditemukan lewat pengujian dari luar.'),

  h3('Satu pengujian yang mengukur waktu, dan alasannya'),
  p('Satu pengujian di antaranya bekerja dengan cara yang tidak biasa: ia mengukur lamanya proses, bukan isi jawabannya. Yang dibuktikan adalah bahwa percobaan login dengan email tak terdaftar tetap menjalankan perbandingan bcrypt tiruan.'),
  p('Kalau perbandingan tiruan itu dihapus, jalur "email tidak ada" selesai dalam waktu di bawah satu milidetik, sedangkan jalur "email ada" memakan lebih dari seratus milidetik. Selisih sebesar itu dapat diukur dari jarak jauh, dan ia membocorkan email mana yang terdaftar tanpa perlu melihat isi jawabannya sama sekali.'),
  p('Ambang batasnya dibuat sangat longgar, sepuluh milidetik. Bcrypt dengan cost dua belas jauh di atasnya pada mesin apa pun, sedangkan jalur tanpa bcrypt jauh di bawahnya. Jarak antara keduanya begitu lebar sehingga pengujian ini tidak akan gagal karena mesin yang lambat, tetapi tetap langsung gagal begitu perbandingan tiruannya hilang.'),

  h3('Cakupan, dan apa yang sengaja tidak diuji'),
  table(
    ['Berkas', 'Baris', 'Cabang'],
    [
      ['modules/auth/auth.service.js', '100%', '100%'],
      ['modules/auth/password.service.js', '100%', '100%'],
      ['services/permission.service.js', '97,5%', '93,9%'],
      ['modules/roles/roles.service.js', '92,4%', '95,8%'],
      ['repositories/passwordResetToken.repository.js', '100%', '100%'],
      ['repositories/tokenDenylist.repository.js', '100%', '100%'],
      ['utils/token.js, utils/response.js, utils/AppError.js', '100%', '100%'],
      ['Keseluruhan', '88,8%', '95,4%'],
    ],
    [5000, 2000, 2026]
  ),
  p('Repository yang isinya murni pemanggilan Sequelize sengaja tidak diuji unit. Menirukan Sequelize berarti menguji tiruan itu, bukan query yang sesungguhnya dijalankan — dan pengujian semacam itu tetap lulus meski nama kolomnya salah. Bagian itu dibuktikan oleh pengujian end-to-end, yang memakai basis data sungguhan.'),
  p('Hal yang sama berlaku untuk isi transaksi pada pembuatan role. Yang diuji unit adalah seluruh penolakan yang terjadi sebelum transaksi dibuka; isi transaksinya sendiri diserahkan ke pengujian end-to-end.'),
  quote('Cakupan yang tinggi bukan tujuannya. Yang dicari adalah pengujian yang benar-benar gagal ketika sesuatu rusak.'),

  h3('Ambang cakupan yang ditegakkan, bukan diharapkan'),
  p('Perintah pengujian cakupan dipasangi ambang delapan puluh persen untuk baris maupun cabang. Kalau angkanya turun di bawah itu, perintahnya gagal — bukan sekadar mencetak peringatan. Dengan begitu standar tersebut tidak bergantung pada ingatan siapa pun.'),

  h3('Dua lapis dengan kebutuhan yang berbeda'),
  table(
    ['Pembanding', 'Pengujian unit', 'Pengujian end-to-end'],
    [
      ['Jumlah', '99', '15'],
      ['Waktu', 'sekitar 2 detik', 'sekitar 20 detik'],
      ['Kebutuhan', 'tidak ada', 'seluruh layanan hidup'],
      ['Yang dibuktikan', 'alasan di balik cara kerjanya', 'sistemnya benar-benar bekerja'],
    ],
    [2200, 3400, 3426]
  ),
  p('Berkas .env.unit sengaja ikut di-commit karena isinya bukan rahasia. Alamat layanannya diisi kata "tidak-dipakai", yang justru menjadi pembuktian tambahan: kalau ada satu saja pengujian unit yang benar-benar mencoba menghubungi sesuatu, ia akan langsung gagal karena alamat itu tidak dapat diterjemahkan.'),

  h3('Satu kegagalan palsu yang muncul di sini'),
  p('Saat menjalankan seluruh pengujian berulang kali untuk memastikan hasilnya konsisten, empat pengujian end-to-end tiba-tiba gagal — padahal sepuluh menit sebelumnya semuanya lulus. Statusnya 429, bukan 200.'),
  p('Penyebabnya bukan kode yang baru ditulis. Pengujian end-to-end memang sengaja melakukan beberapa percobaan login yang gagal untuk membuktikan pesannya seragam, dan batas pembatas laju adalah lima kegagalan per lima belas menit. Menjalankan pengujian tiga kali berturut-turut melewati batas itu.'),
  quote('Kegagalan yang tampak seperti bug, padahal murni akibat pengujian sebelumnya. Pengujian yang tidak dapat diulang sama membingungkannya dengan pengujian yang salah.'),
  p('Perbaikannya membuat kedua berkas pengujian membersihkan penghitung pembatas laju di Redis sebelum mulai. Setelah itu, seluruh rangkaian dapat dijalankan berkali-kali berturut-turut dengan hasil yang sama.'),

  h3('Hasil pengujian'),
  ...code([
    'Pengujian unit                 : 99 lulus, 0 gagal, tanpa layanan hidup',
    'Pengujian end-to-end           : 15 lulus, 0 gagal',
    'Cakupan baris                  : 88,8 persen (ambang 80)',
    'Cakupan cabang                 : 95,4 persen (ambang 80)',
    'Ambang diuji dengan angka 95   : perintah gagal sebagaimana mestinya',
    'Dijalankan dua kali berturutan : hasil sama, 114 lulus keduanya',
  ]),
  br(),

  h2('12.4 Refresh Token'),

  h3('Masalah yang ditemukan'),
  p('Masukan terakhir menyangkut umur token. Sampai bab sebelumnya, access token berlaku satu jam dan tidak ada cara memperpanjangnya. Dua hal yang saling bertabrakan muncul dari situ.'),
  p('Access token adalah JWT: ia membawa datanya sendiri dan dapat diperiksa tanpa menyentuh penyimpanan. Justru sifat itu yang membuatnya tidak dapat dibatalkan sebelum kedaluwarsa — tidak ada tempat untuk menandainya. Daftar cabut di Redis memang menutup lubang itu, tetapi ia harus dibaca pada setiap permintaan, yang berarti keunggulan JWT-nya sendiri sudah hilang.'),
  p('Jadi umur token menjadi pilihan antara dua hal yang tidak menyenangkan. Dipendekkan, penggunanya harus login berulang kali. Diperpanjang, token yang bocor tetap berlaku selama itu.'),
  quote('Refresh token memecah pilihan itu: yang berumur pendek dipakai setiap permintaan, yang berumur panjang hanya dipakai untuk memperbarui — dan yang panjang itu dapat dicabut kapan saja.')

  ,
  h3('Dua jenis token dengan sifat yang berbeda'),
  table(
    ['', 'Access token', 'Refresh token'],
    [
      ['Bentuk', 'JWT bertanda tangan', 'Teks acak 32 byte, tanpa isi'],
      ['Umur', '15 menit', '7 hari'],
      ['Dipakai untuk', 'Setiap permintaan ke endpoint terlindungi', 'Hanya satu endpoint: POST /auth/refresh'],
      ['Disimpan di mana', 'Tidak disimpan server', 'Tabel refresh_tokens, dalam bentuk hash'],
      ['Cara mencabut', 'Daftar cabut di Redis sampai kedaluwarsa', 'Menandai barisnya di basis data'],
      ['Berapa kali pakai', 'Berkali-kali sampai kedaluwarsa', 'Sekali — langsung dirotasi'],
    ],
    [2200, 3400, 3426]
  ),
  p('Perbedaan bentuknya bukan kebetulan. Refresh token sengaja dibuat tidak membawa isi apa pun, karena ia tidak berarti apa-apa tanpa baris pasangannya di basis data. Itulah yang membuatnya dapat dicabut kapan saja — sifat yang tidak dimiliki JWT.'),

  h3('Kenapa disimpan di PostgreSQL, bukan di Redis'),
  p('Token reset password disimpan di Redis. Refresh token tidak. Tiga alasannya.'),
  num('Umurnya panjang. Redis di sistem ini diperlakukan sebagai cache yang boleh hilang; kalau ia dikosongkan, seluruh pengguna langsung terlempar keluar.'),
  num('Deteksi pemakaian ulang memerlukan jejak. Token yang sudah dirotasi harus tetap tersimpan sampai kedaluwarsa, supaya kemunculannya kembali dapat dikenali. Baris yang menghilang sendiri lewat TTL justru menghapus barang bukti yang dibutuhkan.'),
  num('Mencabut seluruh sesi seorang pengguna cukup satu perintah UPDATE. Di Redis itu berarti menyapu seluruh keyspace.'),
  p('Yang tetap sama dengan token reset: yang disimpan adalah hasil SHA-256 dari token, bukan tokennya. Kalau basis data bocor, isinya tidak dapat dipakai menyamar sebagai siapa pun. Di sini SHA-256 punya satu alasan tambahan — hash-nya juga menjadi kunci pencarian, dan bcrypt yang memakai salt acak tidak dapat dipakai untuk itu.'),

  h3('Rotasi, dan deteksi pemakaian ulang'),
  p('Setiap refresh token hanya boleh dipakai sekali. Begitu dipakai, ia dicabut dan penggantinya diterbitkan dalam rangkaian yang sama. Inilah yang membuat pencurian token dapat dikenali.'),
  ...code([
    'PEMAKAIAN NORMAL',
    '  login      -> token A  (rangkaian K dimulai)',
    '  refresh A  -> token B  (A dicabut)',
    '  refresh B  -> token C  (B dicabut)',
    '',
    'TOKEN DICURI SETELAH B DITERBITKAN',
    '  pencuri punya salinan A, pemilik sah punya B',
    '  pencuri refresh A  -> A sudah dicabut!',
    '                     -> SELURUH rangkaian K dicabut',
    '                     -> B ikut mati, pencuri tidak dapat apa-apa',
    '                     -> pemilik sah login kembali',
  ]),
  caption('Gambar 12.5 — Rotasi dan apa yang terjadi saat token dipakai ulang'),
  p('Pada pemakaian normal, token yang sudah dirotasi tidak akan pernah muncul lagi: klien membuangnya begitu menerima penggantinya. Jadi kemunculannya berarti ada salinannya di tangan orang lain — dan tidak ada cara mengetahui mana yang asli. Karena itu seluruh rangkaian dicabut, bukan hanya token yang dipakai ulang.'),
  p('Yang dicabut hanya rangkaian itu, bukan seluruh sesi pengguna. Setiap login memulai rangkaiannya sendiri, jadi pencurian di satu perangkat tidak melempar penggunanya keluar dari perangkat lain yang tidak ada hubungannya.'),
  quote('Pencuri tidak mendapatkan apa pun, dan pemilik yang sah hanya perlu login kembali. Tanpa rotasi, keduanya dapat memakai token yang sama selama tujuh hari tanpa seorang pun tahu.'),

  h3('Urutan yang menentukan'),
  p('Pada rotasi, token lama dicabut LEBIH DULU, penggantinya dibuat kemudian. Urutan ini disengaja.'),
  p('Kalau dibalik dan pencabutan gagal, dua token dalam satu rangkaian sama-sama berlaku — dan deteksi pemakaian ulang berhenti bekerja tanpa satu pun error. Dengan urutan ini, kegagalan terburuk hanya memaksa pengguna login kembali: merepotkan, tetapi tidak membuka celah. Ini pertimbangan yang sama seperti pada reset password di Bab 6: kalau harus ada yang gagal, biarkan yang gagal itu jatuh ke sisi yang aman.'),

  h3('Ganti password mengeluarkan seluruh sesi'),
  p('Sebelum bab ini, mengganti password sudah membatalkan access token lewat perbandingan waktu ganti password di middleware. Refresh token tidak ikut terpengaruh, karena ia tersimpan di basis data dan tidak melalui pemeriksaan itu.'),
  p('Kalau dibiarkan, mengganti password justru tidak mengeluarkan pihak yang mungkin sudah masuk tanpa hak — padahal itulah alasan utama orang mengganti passwordnya. Karena itu reset password sekarang mencabut SELURUH refresh token pengguna tersebut, bukan hanya satu rangkaian.'),

  h3('Satu jebakan di sisi klien'),
  p('Rotasi menciptakan masalah baru yang tidak ada sebelumnya, dan letaknya bukan di server melainkan di antarmuka.'),
  p('Konsol memperbarui token secara otomatis: ketika sebuah permintaan dijawab 401, ia menukar refresh token dengan yang baru lalu mengulangi permintaan aslinya. Persoalannya muncul ketika DUA permintaan berjalan bersamaan dan keduanya dijawab 401. Masing-masing memanggil endpoint perbarui, dan yang kedua mengirim token yang sudah dirotasi oleh yang pertama.'),
  quote('Server membaca itu sebagai pemakaian ulang, lalu mencabut seluruh rangkaian sesi. Pengaman terhadap pencurian token justru berbalik mengunci pemakainya sendiri.'),
  p('Perbaikannya membuat seluruh pemanggil berbagi satu permintaan perbarui yang sama: yang pertama menjalankannya, yang lain menunggu hasilnya. Terbukti bekerja — dua permintaan yang sama-sama dijawab 401 hanya menghasilkan satu panggilan perbarui, dan keduanya berhasil setelah diulang.'),
  p('Access token juga dipendekkan dari satu jam menjadi lima belas menit. Tanpa refresh token, perubahan itu akan membuat konsol meminta login setiap seperempat jam; dengan refresh token, pemakainya tidak merasakan apa pun.'),

  h3('Satu kelemahan yang disadari dan dibiarkan'),
  p('Setiap rotasi memperpanjang masa berlaku tujuh hari dari saat itu. Akibatnya, sesi yang terus dipakai dapat hidup tanpa batas — pengguna aktif tidak pernah perlu login lagi.'),
  p('Konsekuensinya: token yang dicuri lalu dirotasi terus oleh pencurinya juga bertahan tanpa batas. Yang menghentikannya adalah deteksi pemakaian ulang, yang bekerja begitu pemilik sah memakai tokennya. Batas umur mutlak sebuah sesi akan menutup sisanya, dan itu dicatat di Bab 10 sebagai hal yang belum ada beserta pemicunya.'),

  h3('Yang ikut berubah'),
  table(
    ['Bagian', 'Perubahan'],
    [
      ['Migration baru', 'Tabel refresh_tokens dengan indeks pada user_id dan family_id, serta ON DELETE CASCADE ke users'],
      ['Repository baru', 'refreshToken.repository.js — satu-satunya tempat yang tahu token disimpan sebagai hash'],
      ['Endpoint baru', 'POST /auth/refresh, tanpa middleware autentikasi karena justru dipakai saat access token sudah kedaluwarsa'],
      ['Logout', 'Mencabut dua hal: access token ke daftar cabut Redis, dan rangkaian refresh token di basis data'],
      ['Reset password', 'Mencabut seluruh refresh token pengguna tersebut'],
      ['Environment', 'REFRESH_TOKEN_EXPIRES_IN, formatnya divalidasi saat start sehingga salah satuan menghentikan aplikasi'],
      ['Konsol', 'Menyimpan kedua token, memperbarui otomatis saat 401, dan menyamarkan sebagian token di panel inspector'],
    ],
    [2200, 6826]
  ),
  p('Satu keuntungan tak terduga: karena token reset password dan refresh token sama-sama berupa teks acak 32 byte, keduanya sekarang memakai satu fungsi pembuat yang sama. Sebelumnya pembuatan token reset ditulis langsung di dalam service-nya.'),

  h3('Penyamaran token di panel inspector'),
  p('Satu hal yang muncul saat memeragakan fitur ini: refresh token tampil utuh di panel inspector. Panel itu memang dibuat untuk memperlihatkan isi jawaban, tetapi memperlihatkan kredensial yang masih berlaku pada layar yang sedang dipertunjukkan sama saja dengan membagikannya.'),
  p('Menyembunyikannya sepenuhnya juga bukan jawaban, karena justru yang paling berguna dilihat adalah bahwa nilainya BERUBAH setiap kali dipakai. Yang dipilih: tampilkan sepuluh karakter pertama beserta panjang aslinya. Rotasinya tetap terlihat jelas, tokennya tidak terbaca.'),

  h3('Hasil pengujian'),
  ...code([
    'Pengujian unit                 : 138 lulus, 0 gagal',
    'Pengujian end-to-end           : 27 lulus, 0 gagal',
    'Cakupan baris                  : 89,4 persen (ambang 80)',
    'Cakupan cabang                 : 96,2 persen (ambang 80)',
    'Sapuan seluruh endpoint        : 26 dari 26 endpoint, 0 gagal',
    'Rotasi                         : refresh token berganti setiap dipakai',
    'Pemakaian ulang                : 401, seluruh rangkaian dicabut',
    'Rangkaian lain                 : tidak ikut tercabut',
    'Logout                         : kedua jenis token mati',
    'Pengguna dihapus               : baris refresh token ikut terhapus',
    'Perbarui bersamaan di konsol   : dua permintaan 401, satu panggilan perbarui',
  ]),
  br(),

  h1('Lampiran A — Daftar Endpoint'),
  table(
    ['Metode dan Alamat', 'Fungsi', 'Izin yang Dibutuhkan'],
    [
      ['GET /api/v1/health', 'Memastikan proses aplikasi hidup', 'Terbuka'],
      ['GET /api/v1/health/ready', 'Memastikan basis data dan cache terhubung', 'Terbuka'],
      ['POST /api/v1/auth/login', 'Masuk dan memperoleh sepasang token', 'Terbuka, dibatasi 5 kali per 15 menit'],
      ['POST /api/v1/auth/refresh', 'Menukar refresh token dengan sepasang token baru', 'Terbuka, cukup refresh token yang sah'],
      ['GET /api/v1/auth/me', 'Melihat identitas pemilik token', 'Token sah'],
      ['POST /api/v1/auth/logout', 'Mencabut token yang sedang dipakai', 'Token sah'],
      ['GET /api/v1/auth/permissions', 'Melihat daftar izin sendiri', 'Token sah'],
      ['POST /api/v1/auth/forgot-password', 'Meminta tautan reset password', 'Terbuka, dibatasi 3 kali per jam'],
      ['POST /api/v1/auth/reset-password', 'Mengganti password dengan token reset', 'Terbuka'],
      ['GET /api/v1/profile', 'Melihat profil sendiri beserta avatar', 'profile.read'],
      ['PATCH /api/v1/profile', 'Mengubah nama dan nomor telepon sendiri', 'profile.update'],
      ['POST /api/v1/profile/avatar', 'Mengunggah foto profil', 'profile.update'],
      ['DELETE /api/v1/profile/avatar', 'Menghapus foto profil', 'profile.update'],
      ['GET /api/v1/users', 'Melihat daftar pengguna per halaman', 'users.read'],
      ['POST /api/v1/users', 'Membuat pengguna baru', 'users.create'],
      ['GET /api/v1/users/:id', 'Melihat detail pengguna', 'users.read'],
      ['PATCH /api/v1/users/:id', 'Mengubah data atau status pengguna', 'users.update'],
      ['DELETE /api/v1/users/:id', 'Menghapus pengguna', 'users.delete'],
      ['PUT /api/v1/users/:id/roles', 'Menetapkan role pengguna', 'roles.update'],
      ['GET /api/v1/roles', 'Melihat daftar role beserta izinnya', 'roles.read'],
      ['POST /api/v1/roles', 'Membuat role baru', 'roles.create'],
      ['GET /api/v1/roles/:id', 'Melihat detail satu role', 'roles.read'],
      ['PATCH /api/v1/roles/:id', 'Mengubah nama atau keterangan role', 'roles.update'],
      ['PUT /api/v1/roles/:id/permissions', 'Mengubah izin sebuah role', 'roles.update'],
      ['DELETE /api/v1/roles/:id', 'Menghapus role', 'roles.delete'],
      ['GET /api/v1/permissions', 'Melihat katalog seluruh permission', 'permissions.read'],
    ],
    [3000, 3400, 2626]
  ),

  h1('Lampiran B — Variabel Konfigurasi'),
  p('Seluruh variabel dibaca dan divalidasi di satu tempat saat aplikasi mulai berjalan. Aplikasi menolak menyala apabila ada yang belum diisi, sehingga kesalahan konfigurasi ketahuan pada detik pertama, bukan setelah pengguna pertama mencoba memakainya.'),
  table(
    ['Kelompok', 'Variabel', 'Keterangan'],
    [
      ['Aplikasi', 'NODE_ENV, PORT, APP_URL, TRUST_PROXY', 'TRUST_PROXY diisi sesuai jumlah proksi yang benar-benar ada di depan aplikasi'],
      ['Basis data', 'DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD', 'Nama host berbeda antara mode pengembangan dan mode container'],
      ['Token', 'JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN', 'Kunci wajib minimal 32 karakter dan dibuat oleh pembangkit acak'],
      ['Cache', 'REDIS_HOST, REDIS_PORT, REDIS_PASSWORD', 'Kata sandi tetap dipasang meski hanya untuk pengembangan lokal'],
      ['Antrean', 'RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_MANAGEMENT_PORT', 'Alamat koneksi dirakit otomatis dengan pengamanan karakter khusus'],
      ['Penyimpanan', 'MINIO_HOST, MINIO_PORT, MINIO_CONSOLE_PORT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, MINIO_BUCKET, MINIO_USE_SSL', 'Kata sandi minimal 8 karakter, jika kurang layanan menolak menyala'],
      ['Email', 'SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, MAIL_FROM', 'Hanya diperlukan oleh proses pengirim email, tidak oleh proses API'],
      ['Akun awal', 'SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_FULL_NAME', 'Hanya dipakai satu kali saat pengisian data awal'],
    ],
    [1600, 4400, 3026]
  ),

  h1('Lampiran C — Perintah yang Sering Dipakai'),
  table(
    ['Keperluan', 'Perintah'],
    [
      ['Menyalakan infrastruktur saja', 'docker compose up -d postgres redis rabbitmq minio'],
      ['Menyalakan seluruh sistem', 'docker compose up -d --build'],
      ['Melihat status seluruh layanan', 'docker compose ps'],
      ['Memeriksa berkas konfigurasi sebelum menjalankan', 'docker compose config --services'],
      ['Menjalankan API mode pengembangan', 'npm run dev'],
      ['Menjalankan pengirim email', 'npm run worker'],
      ['Membentuk struktur basis data', 'npm run db:migrate'],
      ['Mengisi data awal', 'npm run db:seed'],
      ['Membangun ulang basis data dari nol', 'npm run db:reset'],
      ['Menyiapkan basis data pengujian', 'npm run test:db:setup'],
      ['Menjalankan pengujian', 'npm test'],
      ['Melihat catatan proses pengirim email', 'docker logs auth_worker --tail 20'],
    ],
    [3600, 5426]
  ),
];
