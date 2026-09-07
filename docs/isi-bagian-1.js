/** Bab 1-5 */
module.exports = ({ h1, h2, h3, p, rich, quote, li, num, code, caption, table, br, gap }) => [

  /* ═══════════════════ BAB 1 ═══════════════════ */
  h1('BAB 1 — Latar Belakang dan Tujuan'),

  h2('1.1 Kenapa Service Ini Dibangun'),
  p('Hampir semua aplikasi yang punya pengguna butuh tiga hal yang sama: memastikan orang yang masuk memang benar dirinya, mengatur siapa boleh melakukan apa, dan menyimpan data profil mereka. Kalau setiap aplikasi membangun ketiganya sendiri, hasilnya adalah pekerjaan yang sama diulang berkali-kali, dengan kualitas keamanan yang berbeda-beda di tiap aplikasi.'),
  p('Masalahnya bukan cuma soal boros waktu. Keamanan adalah bidang yang mudah terlihat benar padahal salah. Sebuah tim bisa menulis fitur login yang tampak berfungsi sempurna, tapi diam-diam membocorkan daftar email yang terdaftar di sistem, atau menyimpan password dengan cara yang bisa dibalik. Kesalahan seperti ini jarang menimbulkan error; ia cuma menunggu.'),
  p('Karena itu fungsi autentikasi dan otorisasi dipisahkan menjadi satu service tersendiri. Satu tempat untuk diperiksa, satu tempat untuk diperbaiki, dan satu standar yang berlaku untuk semua aplikasi yang memakainya.'),

  h2('1.2 Tujuan'),
  p('Service ini dibangun untuk memenuhi lima kebutuhan berikut:'),
  num('Menyediakan mekanisme login dan logout yang aman, dengan token yang benar-benar bisa dicabut sebelum masa berlakunya habis.'),
  num('Mengatur hak akses berbasis peran (Role-Based Access Control), sehingga penambahan atau pencabutan izin cukup dilakukan di satu tempat.'),
  num('Menyediakan alur lupa password yang aman dan tidak membebani waktu respons aplikasi.'),
  num('Mengelola data profil pengguna termasuk foto avatar, dengan penyimpanan file yang terpisah dari server aplikasi.'),
  num('Dapat dijalankan ulang oleh siapa pun, di komputer mana pun, dengan satu perintah — tanpa langkah pemasangan manual.'),

  h2('1.3 Ruang Lingkup'),
  p('Berikut batasan pekerjaan yang disepakati di awal. Menuliskan apa yang tidak dikerjakan sama pentingnya dengan menuliskan apa yang dikerjakan, karena itu yang mencegah salah paham di kemudian hari.'),
  table(
    ['Termasuk', 'Tidak Termasuk'],
    [
      ['Login dan logout', 'Pendaftaran mandiri oleh publik'],
      ['Verifikasi token pada setiap request', 'Login lewat Google / OAuth pihak ketiga'],
      ['Pengaturan role dan permission', 'Verifikasi dua langkah (2FA / OTP)'],
      ['Lupa password lewat email', 'Refresh token'],
      ['Profil pengguna dan foto avatar', 'Audit log aktivitas pengguna'],
      ['Manajemen user oleh administrator', 'Penggantian alamat email pengguna'],
      ['Pembuatan akun awal lewat seeder', 'Aplikasi frontend untuk pengguna akhir'],
      ['Antarmuka console untuk demonstrasi', 'Pemulihan role yang sudah dihapus'],
    ],
    [4513, 4513]
  ),
  p('Dua catatan penting. Pertama, tidak adanya pendaftaran mandiri adalah keputusan sadar: akun dibuat oleh administrator, sehingga tidak ada pintu masuk terbuka yang perlu dijaga. Kedua, penggantian email tidak disertakan karena email adalah identitas login — mengubahnya butuh alur verifikasi tersendiri ke alamat baru, yang merupakan fitur terpisah, bukan sekadar operasi pembaruan data.'),

  h2('1.4 Ringkasan Hasil'),
  p('Seluruh tujuan tercapai. Service berjalan sebagai kumpulan container yang dapat dinyalakan dengan satu perintah, dengan hasil pengujian sebagai berikut:'),
  table(
    ['Aspek', 'Hasil'],
    [
      ['Jumlah endpoint', '25 endpoint pada 6 modul'],
      ['Tabel database', '5 tabel dengan relasi many-to-many ganda'],
      ['Pengujian otomatis', '15 pengujian end-to-end, seluruhnya lulus'],
      ['Waktu respons login', 'sekitar 135 milidetik'],
      ['Ketahanan saat worker mati', 'Pesan email tertahan di antrean, tidak ada yang hilang'],
      ['Ketahanan saat broker restart', 'Pesan bertahan karena disimpan ke disk'],
      ['Waktu penghentian container', 'sekitar 1,8 detik, seluruh koneksi ditutup rapi'],
      ['Kegagalan saat start dari nol', 'Nol — tidak ada container yang gagal lalu restart'],
      ['Ukuran image aplikasi', 'sekitar 310 MB'],
    ],
    [3400, 5626]
  ),
  br(),

  /* ═══════════════════ BAB 2 ═══════════════════ */
  h1('BAB 2 — Teknologi yang Digunakan dan Alasannya'),

  h2('2.1 Gambaran Umum'),
  p('Sebelum masuk ke daftar teknologi satu per satu, ada baiknya melihat gambaran besarnya dulu. Bayangkan sebuah kantor pelayanan.'),
  quote('Ada resepsionis yang menerima tamu dan mengarahkan mereka (Express). Ada lemari arsip besar yang menyimpan berkas permanen (PostgreSQL). Ada papan tulis di samping meja untuk catatan cepat yang boleh terhapus (Redis). Ada loket antrean tempat menitipkan pekerjaan yang tidak perlu ditunggu (RabbitMQ). Dan ada gudang di belakang untuk barang besar seperti foto dan dokumen (MinIO).'),
  p('Setiap komponen punya sifat yang berbeda, dan itulah alasan mereka tidak digabung. Lemari arsip dibuat rapi dan tahan lama, tapi mencarinya butuh waktu. Papan tulis sangat cepat dibaca, tapi isinya hilang kalau kantor pindah. Menyimpan foto di dalam lemari arsip akan membuat lemari itu penuh dan lambat.'),
  p('Bagian berikut menjelaskan tiap teknologi dengan empat sudut pandang yang sama: perannya, analoginya, alasan dipilih, dan di bagian mana ia dipakai dalam project ini.'),

  h2('2.2 Express.js — Kerangka Aplikasi Web'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Menerima permintaan HTTP dari klien, menjalankan pemeriksaan berlapis, lalu mengembalikan jawaban.'],
      ['Analogi', 'Resepsionis kantor. Ia menerima tamu, memeriksa kartu identitas, menanyakan keperluan, lalu mengarahkan ke bagian yang tepat. Ia tidak mengerjakan urusan tamu sendiri, hanya mengatur alurnya.'],
      ['Alasan dipilih', 'Ringan dan tidak memaksakan struktur tertentu, sehingga arsitektur folder bisa disusun sesuai kebutuhan. Ekosistemnya besar, sehingga hampir semua kebutuhan sudah ada pustakanya.'],
      ['Dipakai untuk', 'Seluruh endpoint, serta rantai middleware: helmet, cors, parser JSON, rate limiter, authenticate, authorize, dan penanganan error.'],
    ],
    [1900, 7126]
  ),
  p('Konsep terpenting dari Express dalam project ini adalah middleware, yaitu fungsi yang dijalankan berurutan sebelum permintaan sampai ke tujuannya. Bayangkan sebuah surat yang harus melewati beberapa meja: meja pertama memeriksa amplopnya, meja kedua memeriksa identitas pengirim, meja ketiga memeriksa izinnya. Kalau ada satu meja yang menolak, surat itu tidak pernah sampai ke meja berikutnya.'),
  p('Urutan meja ini bukan soal selera. Pemeriksaan yang paling murah selalu diletakkan paling depan, supaya permintaan yang jelas-jelas akan ditolak tidak sempat memakan sumber daya.'),

  h2('2.3 PostgreSQL — Basis Data Utama'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Menyimpan data permanen: pengguna, role, permission, dan relasi di antara ketiganya.'],
      ['Analogi', 'Lemari arsip yang rapi dan tahan api. Setiap berkas punya tempatnya sendiri, ada aturan yang mencegah berkas ganda, dan isinya tetap ada meski kantor mati listrik.'],
      ['Alasan dipilih', 'Mendukung relasi antar tabel dengan aturan yang ditegakkan oleh database itu sendiri, bukan oleh aplikasi. Punya tipe data UUID bawaan dan transaksi yang andal.'],
      ['Dipakai untuk', '5 tabel: users, roles, permissions, user_roles, role_permissions.'],
    ],
    [1900, 7126]
  ),
  p('Keunggulan yang paling terasa dalam project ini adalah kemampuan PostgreSQL menjaga integritas data sendiri. Misalnya, tabel penghubung user_roles diberi aturan bahwa user_id harus benar-benar ada di tabel users. Kalau aplikasi mencoba memasukkan data yang tidak valid, database yang menolaknya — bukan aplikasi yang harus memeriksa.'),
  quote('Prinsip yang dipakai berulang di project ini: kalau sebuah aturan harus selalu benar, tegakkan di database. Pemeriksaan di aplikasi bisa terlewat atau dilewati; aturan di database tidak bisa.'),

  h2('2.4 Sequelize — ORM (Object Relational Mapping)'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Jembatan antara kode JavaScript dan perintah SQL. Kita menulis objek, Sequelize menerjemahkannya menjadi query.'],
      ['Analogi', 'Penerjemah. Kita berbicara dalam bahasa JavaScript, database berbicara dalam bahasa SQL. Penerjemah membuat keduanya saling paham tanpa kita perlu fasih dua bahasa sekaligus.'],
      ['Alasan dipilih', 'Punya sistem migration yang mencatat riwayat perubahan struktur database, sehingga skema bisa dibangun ulang dari nol di komputer mana pun. Juga menyediakan hook, yaitu kode yang otomatis berjalan sebelum atau sesudah data disimpan.'],
      ['Dipakai untuk', 'Model, migration, seeder, serta pengamanan password melalui hook.'],
    ],
    [1900, 7126]
  ),
  p('Fitur hook menjadi kunci keamanan di project ini. Password dienkripsi di dalam hook model, bukan di dalam kode fitur. Artinya, jalur kode mana pun yang menyimpan pengguna — baik dari fitur login, seeder, maupun script manual — akan tetap terenkripsi. Tidak ada jalan untuk lupa.'),

  h2('2.5 Redis — Penyimpanan Sementara di Memori'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Menyimpan data berumur pendek: daftar token yang sudah di-logout, cache izin pengguna, dan hitungan pembatasan percobaan login.'],
      ['Analogi', 'Papan tulis di samping meja kerja, lengkap dengan penghapus otomatis. Menulis dan membaca sangat cepat, tapi isinya memang tidak dimaksudkan untuk disimpan selamanya. Yang istimewa: kita bisa menulis catatan sambil berkata "hapus sendiri setelah 15 menit".'],
      ['Alasan dipilih', 'Punya fitur TTL (time to live), yaitu data yang menghapus dirinya sendiri setelah waktu tertentu. Tanpa fitur ini kita harus menulis dan merawat program pembersih sendiri.'],
      ['Dipakai untuk', 'Daftar token tercabut, cache permission, token reset password, dan hitungan rate limit.'],
    ],
    [1900, 7126]
  ),
  p('Ketiga fungsi Redis di project ini punya pola yang sama: data yang seharusnya mati sendiri. Token reset password harus hangus setelah 15 menit. Catatan token yang di-logout hanya perlu disimpan sampai token itu kedaluwarsa dengan sendirinya. Cache izin boleh basi sebentar lalu diambil ulang.'),
  p('Kalau ketiganya disimpan di PostgreSQL, kita harus menulis program pembersih terjadwal — dan setiap kali lupa membersihkan, tabelnya tumbuh selamanya.'),

  h2('2.6 RabbitMQ — Antrean Pesan (Message Broker)'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Menampung perintah pengiriman email sehingga aplikasi utama tidak perlu menunggu prosesnya selesai.'],
      ['Analogi', 'Loket titipan. Kita menitipkan surat di loket lalu langsung pergi; petugas pos mengambil dan mengirimkannya belakangan. Kalau petugas sedang istirahat, surat menunggu di loket — tidak hilang.'],
      ['Alasan dipilih', 'Antrean dan pesannya bisa disimpan ke disk, sehingga tetap ada meski broker dimatikan. Punya mekanisme acknowledgement: pesan baru dihapus setelah pekerja menyatakan pekerjaannya benar-benar selesai.'],
      ['Dipakai untuk', 'Antrean email.password-reset.'],
    ],
    [1900, 7126]
  ),
  p('Mengirim email lewat SMTP memakan waktu 1 sampai 3 detik. Kalau proses itu dilakukan langsung di dalam permintaan HTTP, pengguna harus menunggu selama itu untuk sesuatu yang sebenarnya tidak ia butuhkan saat itu juga. Lebih buruk lagi, kalau server email sedang bermasalah, permintaan lupa password akan gagal — padahal token resetnya sudah tersimpan dan sah.'),
  p('Dengan antrean, aplikasi cukup menitipkan perintah lalu langsung menjawab pengguna. Hasil pengukuran menunjukkan waktu respons tetap sekitar 135 milidetik, baik ketika pekerja email sedang hidup maupun ketika sedang mati.'),

  h2('2.7 MinIO — Penyimpanan Objek (Object Storage)'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Menyimpan file yang diunggah pengguna, dalam project ini foto avatar.'],
      ['Analogi', 'Gudang di belakang kantor. Lemari arsip dipakai untuk dokumen tipis yang sering dicari; gudang dipakai untuk barang besar. Memasukkan lemari ke dalam lemari arsip akan merusak sistemnya.'],
      ['Alasan dipilih', 'Memakai antarmuka yang sama dengan Amazon S3, sehingga kode yang ditulis hari ini bisa dipindahkan ke layanan cloud tanpa diubah — cukup ganti alamat servernya.'],
      ['Dipakai untuk', 'Bucket avatars, dengan akses melalui presigned URL berbatas waktu.'],
    ],
    [1900, 7126]
  ),
  p('Alasan file tidak disimpan di folder pada server aplikasi berkaitan langsung dengan container. Container bersifat sementara: apa pun yang ditulis di dalamnya hilang ketika container dibuat ulang. Kalau avatar disimpan di sana, seluruh foto pengguna lenyap setiap kali aplikasi di-deploy ulang.'),

  h2('2.8 JSON Web Token (JWT) — Tanda Pengenal Digital'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Bukti identitas yang dibawa klien di setiap permintaan, sehingga server tidak perlu menyimpan data sesi.'],
      ['Analogi', 'Kartu tanda pengenal berhologram. Siapa pun bisa membaca nama yang tertera di kartu — tidak ada yang dirahasiakan di sana. Yang membuatnya sah adalah hologramnya, yang tidak bisa dipalsukan tanpa alat pencetak resmi.'],
      ['Alasan dipilih', 'Tidak butuh penyimpanan sesi di server, sehingga aplikasi bisa dijalankan di banyak instance tanpa berbagi data sesi.'],
      ['Dipakai untuk', 'Access token dengan masa berlaku 1 jam.'],
    ],
    [1900, 7126]
  ),
  p('Analogi hologram di atas perlu ditekankan karena inilah kesalahpahaman paling umum tentang JWT: isi token tidak dienkripsi, hanya ditandatangani. Siapa pun yang memegang token bisa membaca isinya dalam hitungan detik. Yang tidak bisa dilakukan adalah mengubah isinya tanpa merusak tanda tangannya.'),
  quote('Karena itu tidak ada satu pun data rahasia yang ditaruh di dalam token. Isinya hanya ID pengguna, ID token, waktu terbit, dan waktu kedaluwarsa.'),

  h2('2.9 bcryptjs — Pengaman Password'),
  table(
    ['Aspek', 'Penjelasan'],
    [
      ['Peran', 'Mengubah password menjadi bentuk teracak yang tidak bisa dikembalikan.'],
      ['Analogi', 'Mesin penghancur kertas yang sengaja dibuat lambat. Dokumen yang masuk tidak bisa disusun kembali. Kalau ingin memeriksa apakah dokumen baru sama dengan yang dulu, kita hancurkan yang baru lalu bandingkan serpihannya.'],
      ['Alasan dipilih', 'Versi murni JavaScript, sehingga tidak perlu proses kompilasi. Ini menghindari dua sumber masalah sekaligus: kebutuhan alat build di Windows, dan kompilasi ulang di dalam container Linux.'],
      ['Dipakai untuk', 'Enkripsi password pengguna dengan cost factor 12.'],
    ],
    [1900, 7126]
  ),
  p('Kelambatan bcrypt bukan kekurangan, melainkan justru fiturnya. Semakin lambat proses enkripsinya, semakin lama waktu yang dibutuhkan penyerang untuk mencoba jutaan kemungkinan password. Angka 12 dipilih karena menghasilkan waktu sekitar 250 milidetik — cukup lambat untuk menggagalkan serangan tebak-tebakan, cukup cepat untuk tidak mengganggu pengguna.'),

  h2('2.10 Nodemailer dan Docker'),
  table(
    ['Teknologi', 'Peran, Analogi, dan Alasan'],
    [
      ['Nodemailer', 'Pengirim email lewat SMTP. Analoginya tukang pos: ia tidak menulis suratnya, hanya mengantarkannya. Dipilih karena merupakan pustaka pengiriman email paling mapan di ekosistem Node.js, dan bisa dipakai dengan penyedia SMTP mana pun tanpa mengubah kode.'],
      ['Docker & Docker Compose', 'Menjalankan seluruh infrastruktur dalam wadah terisolasi. Analoginya kontainer pengiriman standar: isinya bisa apa saja, tetapi kapal dan truk memperlakukan semuanya dengan cara yang sama. Dipilih karena memungkinkan seluruh sistem dijalankan dengan satu perintah, dengan versi yang sama persis di komputer siapa pun.'],
    ],
    [2200, 6826]
  ),
  p('Docker juga menyelesaikan satu masalah praktis yang sering luput: Redis tidak tersedia secara resmi untuk Windows. Tanpa Docker, pengembang di Windows harus mencari perangkat lunak pengganti yang perilakunya tidak persis sama dengan Redis asli di server. Dengan Docker, yang berjalan adalah Redis asli di dalam Linux — sekalipun komputernya Windows.'),

  h2('2.11 Kenapa Empat Infrastruktur Terpisah'),
  p('Pertanyaan yang wajar muncul: kenapa tidak menyimpan semuanya di PostgreSQL saja? Jawabannya ada pada perbedaan sifat data.'),
  table(
    ['Jenis Data', 'Sifatnya', 'Tempat yang Tepat'],
    [
      ['Data pengguna, role, permission', 'Permanen, saling berelasi, harus konsisten', 'PostgreSQL'],
      ['Token tercabut, cache izin, token reset', 'Berumur pendek, harus cepat, boleh hilang', 'Redis'],
      ['Perintah kirim email', 'Sekali pakai, tidak boleh hilang, tidak perlu ditunggu', 'RabbitMQ'],
      ['Foto avatar', 'Berukuran besar, jarang berubah, tidak berelasi', 'MinIO'],
    ],
    [2600, 3400, 3026]
  ),
  p('Memaksakan semuanya ke satu tempat berarti memakai alat yang salah untuk sebagian pekerjaan. Menyimpan foto sebagai kolom di database membuat setiap query menjadi berat. Menyimpan cache di database menghilangkan seluruh keuntungan kecepatannya. Menyimpan antrean di database mengharuskan kita menulis sendiri mekanisme yang sudah disediakan RabbitMQ.'),
  br(),

  /* ═══════════════════ BAB 3 ═══════════════════ */
  h1('BAB 3 — Struktur Folder dan Aturan Penempatan File'),
  p('Bab ini dibuat lebih detail dari yang lain, karena pertanyaan "file ini sebaiknya ditaruh di mana" adalah pertanyaan yang paling sering muncul dan paling jarang dijelaskan secara tuntas.'),

  h2('3.1 Dua Cara Menata Folder'),
  p('Ada dua pendekatan umum. Pendekatan pertama mengelompokkan berdasarkan jenis file:'),
  ...code([
    'controllers/    -> authController, userController, roleController',
    'services/       -> authService, userService, roleService',
    'routes/         -> authRoutes, userRoutes, roleRoutes',
  ]),
  p('Terlihat rapi, tetapi menyulitkan saat bekerja. Mengubah logika login berarti membuka tiga folder berbeda, dan semakin banyak fitur, semakin jauh jarak antara file-file yang sebenarnya saling berkaitan.'),
  p('Pendekatan kedua mengelompokkan berdasarkan fitur, dan inilah yang dipakai:'),
  ...code([
    'modules/',
    '  auth/     -> auth.controller.js, auth.service.js, auth.routes.js',
    '  users/    -> users.controller.js, users.service.js, users.routes.js',
    '  profile/  -> profile.controller.js, profile.service.js, profile.routes.js',
  ]),
  p('Semua yang berkaitan dengan satu fitur berada di satu tempat. Ada tiga keuntungan konkret: file yang sering berubah bersamaan letaknya berdekatan, menghapus sebuah fitur cukup dengan menghapus satu folder, dan dua orang yang mengerjakan fitur berbeda hampir tidak pernah menyentuh file yang sama sehingga konflik pada Git jauh berkurang.'),

  h2('3.2 Peta Folder Lengkap'),
  p('Berikut seluruh folder dalam project ini beserta aturan isinya. Kolom terakhir sengaja mencantumkan apa yang tidak boleh masuk, karena batas itulah yang membuat aturannya jelas.'),
  table(
    ['Folder', 'Untuk Apa', 'Contoh Isi', 'Yang Tidak Boleh Masuk'],
    [
      ['src/config/', 'Membaca dan memvalidasi konfigurasi dari environment', 'env.js, database.js', 'Logika bisnis apa pun'],
      ['src/constants/', 'Data tetap yang tidak punya efek samping sama sekali', 'permissions.js (dibuat otomatis)', 'Apa pun yang membuka koneksi'],
      ['src/utils/', 'Fungsi bantu murni, tidak menyentuh database atau jaringan', 'AppError.js, response.js, token.js', 'Query database, panggilan Redis'],
      ['src/database/', 'Koneksi database, definisi model, migration, seeder', 'index.js, models/, migrations/', 'Logika fitur'],
      ['src/redis/', 'Koneksi ke Redis', 'index.js', 'Logika yang memakai Redis'],
      ['src/queue/', 'Koneksi ke RabbitMQ dan penerbitan pesan', 'index.js', 'Isi pesan atau template email'],
      ['src/storage/', 'Koneksi ke MinIO dan operasi file', 'index.js', 'Aturan validasi file'],
      ['src/repositories/', 'Satu-satunya tempat penyusunan query ke basis data, Redis, dan storage', 'user.repository.js, role.repository.js', 'Aturan bisnis atau validasi'],
      ['src/services/', 'Logika bisnis; memanggil repository, tidak menyentuh model', 'permission.service.js', 'Penyusunan query'],
      ['src/middlewares/', 'Pemeriksaan yang dijalankan sebelum controller', 'authenticate.js, authorize.js', 'Logika bisnis fitur'],
      ['src/modules/', 'Fitur-fitur aplikasi, satu folder per fitur', 'auth/, users/, profile/', 'Apa pun yang dipakai lebih dari satu fitur'],
      ['src/routes/', 'Pengumpul seluruh route dari semua modul', 'index.js', 'Definisi route detail'],
      ['src/workers/', 'Proses terpisah yang berjalan sendiri', 'emailWorker.js', 'Kode yang dipakai proses API'],
      ['tests/', 'Pengujian otomatis', 'auth.e2e.test.js, rbac.e2e.test.js', 'Kode aplikasi'],
      ['public/', 'Antarmuka console, disajikan sebagai berkas statis', 'index.html, styles.css, app.js', 'Kode sisi server'],
    ],
    [1600, 2500, 2400, 2526]
  ),

  h2('3.3 Empat Pertanyaan Penentu'),
  p('Ketika membuat file baru dan bingung menaruhnya di mana, jawab empat pertanyaan ini secara berurutan. Berhenti pada pertanyaan pertama yang jawabannya "ya".'),
  table(
    ['No', 'Pertanyaan', 'Kalau Ya, Taruh Di'],
    [
      ['1', 'Apakah isinya hanya data tetap, tanpa fungsi dan tanpa koneksi apa pun?', 'src/constants/'],
      ['2', 'Apakah ia berupa fungsi yang tidak menyentuh database, cache, atau jaringan sama sekali?', 'src/utils/'],
      ['3', 'Apakah ia dipakai oleh lebih dari satu fitur, dan menyentuh penyimpanan?', 'src/services/ atau src/middlewares/'],
      ['4', 'Apakah ia hanya dipakai oleh satu fitur?', 'src/modules/<nama-fitur>/'],
    ],
    [700, 5500, 2826]
  ),
  p('Pertanyaan pertama sengaja diletakkan paling atas, dan alasannya bukan sekadar urutan. File yang berisi data murni aman diimpor dari mana saja, termasuk dari seeder yang dijalankan oleh perkakas baris perintah. Sementara file yang membuka koneksi akan membuka koneksi itu segera setelah diimpor — sesuatu yang tidak diinginkan oleh pemanggil yang hanya ingin membaca daftar nama.'),

  h2('3.4 Studi Kasus Penempatan'),
  p('Enam contoh nyata dari project ini, termasuk yang sempat salah dan alasan perbaikannya.'),

  h3('Kasus 1 — Kenapa token.js di utils/, bukan di modules/auth/'),
  p('Sekilas file ini hanya berkaitan dengan autentikasi, jadi wajar kalau ingin ditaruh di dalam modul auth. Tetapi ia dipakai oleh dua pihak: modul auth menandatangani token saat login, dan middleware authenticate memverifikasi token pada setiap permintaan ke seluruh modul.'),
  quote('Aturannya: apa pun yang dipakai lintas modul harus naik satu lapisan. Kalau ia tetap di dalam modul auth, maka middleware global harus menjangkau ke dalam sebuah modul — persis keterikatan yang ingin dihindari oleh struktur modular.'),
  p('Dan karena isinya murni perhitungan tanda tangan tanpa menyentuh database, tempatnya di utils/, bukan services/.'),

  h3('Kasus 2 — Kenapa model Sequelize di database/, bukan di modules/users/'),
  p('Model User adalah representasi tabel users, sehingga terasa cocok berada di dalam modul users. Namun model itu dipakai oleh hampir semua modul: auth membutuhkannya untuk login, profile untuk membaca data diri, users untuk manajemen, dan permission.service untuk menelusuri role.'),
  p('Kalau model tinggal di modules/users/, maka modul auth harus mengimpor dari modul users — satu modul menjangkau isi modul lain. Sementara jika ia berada di database/, semua modul mengimpor dari lapisan bersama yang memang ditujukan untuk itu.'),
  quote('Struktur modular berlaku untuk perilaku fitur, bukan untuk skema data yang dipakai bersama.'),

  h3('Kasus 3 — Kenapa permission.service.js di services/, bukan di modules/auth/'),
  p('File ini mengambil daftar izin pengguna dari database dan menyimpannya di cache Redis. Ia dipanggil oleh middleware authorize, yang melayani seluruh modul.'),
  p('Ia tidak bisa ditaruh di utils/ karena menyentuh dua penyimpanan sekaligus. Ia juga tidak bisa ditaruh di dalam modul auth karena bukan milik satu fitur. Folder services/ ada tepat untuk kategori ini: logika bersama yang berinteraksi dengan penyimpanan.'),

  h3('Kasus 4 — Kenapa constants/permissions.js harus folder tersendiri'),
  p('Kasus ini muncul dari kesalahan nyata. Nama izin awalnya ditulis langsung sebagai teks di setiap tempat pemakaian, dan salah ketik satu huruf menyebabkan permintaan ditolak tanpa pesan error apa pun — sistem bekerja persis seperti dirancang, hanya membandingkan teks yang tidak pernah ada.'),
  p('Perbaikannya adalah mengumpulkan seluruh nama izin ke satu berkas, lalu dipakai oleh middleware maupun seeder. Pertanyaannya kemudian: kenapa tidak digabung saja ke permission.service.js yang sudah ada?'),
  p('Karena permission.service.js mengimpor koneksi Redis. Kalau seeder mengimpornya hanya untuk membaca daftar nama, seeder ikut membuka koneksi Redis yang tidak pernah ditutup — dan perkakas baris perintah akan menggantung, tidak mau berhenti.'),
  quote('Berkas berisi data murni dan berkas yang membuka koneksi harus dipisahkan. Yang pertama bebas diimpor dari mana pun; yang kedua hanya oleh pihak yang benar-benar membutuhkannya.'),

  h3('Kasus 5 — Kenapa app.js dan server.js dipisah'),
  p('File app.js menyusun aplikasi Express lengkap dengan seluruh middleware dan route, lalu mengekspornya tanpa menyalakannya. File server.js yang menyalakan: ia memeriksa koneksi database dan Redis, lalu membuka port.'),
  p('Pemisahan ini terasa berlebihan di awal, tetapi menjadi syarat pada tahap pengujian. Berkas pengujian mengimpor app.js lalu menyalakannya di port acak yang bebas, sehingga pengujian bisa berjalan bersamaan dengan server pengembangan yang sedang aktif di port 3000. Kalau app.listen berada di dalam app.js, setiap pengujian akan berebut port yang sama.'),

  h3('Kasus 6 — Kenapa authenticate.js di middlewares/, bukan di modules/auth/'),
  p('Alasannya sama dengan Kasus 1, dan konsekuensinya lebih terlihat. Middleware ini dipakai oleh modul auth, profile, dan users. Kalau ia berada di dalam modul auth, maka modul profile harus menulis impor yang menjangkau ke dalam modul tetangganya — dan menghapus modul auth suatu hari nanti akan merusak dua modul lain yang sebenarnya tidak berhubungan.'),

  h2('3.5 Aturan Penamaan Berkas'),
  table(
    ['Jenis Berkas', 'Pola', 'Contoh'],
    [
      ['Berkas dengan dua bagian makna', '<domain>.<peran>.js', 'auth.service.js, health.routes.js'],
      ['Berkas dengan satu makna utuh', 'camelCase.js', 'authenticate.js, errorHandler.js'],
      ['Berkas yang mengekspor sebuah class', 'PascalCase.js', 'AppError.js'],
      ['Migration dan seeder', 'diberi awalan waktu otomatis', '20260831072435-create-users.js'],
    ],
    [3000, 2800, 3226]
  ),
  p('Konsistensi penamaan bukan sekadar soal kerapian. Sistem berkas Windows tidak membedakan huruf besar dan kecil, sedangkan Linux membedakannya. Berkas bernama ErrorHandler.js yang diimpor sebagai errorHandler akan berjalan mulus di komputer pengembang, lalu gagal total ketika masuk ke container Linux — dengan pesan error yang membingungkan karena kode yang sama berjalan baik di tempat lain.'),
  br(),

  /* ═══════════════════ BAB 4 ═══════════════════ */
  h1('BAB 4 — Desain Basis Data dan RBAC'),

  h2('4.1 Rancangan Tabel'),
  p('Sistem hak akses dibangun di atas lima tabel. Tiga tabel utama menyimpan data, dua tabel penghubung menyimpan relasinya.'),
  ...code([
    '  users                 roles                permissions',
    '  ---------             ---------            -----------',
    '  id (UUID)             id (INT)             id (INT)',
    '  email                 name                 name',
    '  password_hash         description          description',
    '  full_name                  |                     |',
    '  avatar_key                 |                     |',
    '  is_active                  |                     |',
    '      |                      |                     |',
    '      +----- user_roles -----+                     |',
    '            user_id                                |',
    '            role_id                                |',
    '                |                                  |',
    '                +------- role_permissions ---------+',
    '                        role_id',
    '                        permission_id',
  ]),
  caption('Gambar 4.1 — Relasi antar tabel'),
  p('Alurnya dibaca seperti ini: seorang pengguna memiliki beberapa role, dan setiap role memiliki beberapa permission. Untuk mengetahui apakah seseorang boleh melakukan sesuatu, sistem menelusuri rantai tersebut dari ujung ke ujung.'),

  h2('4.2 Lima Keputusan Desain'),

  h3('Keputusan 1 — Permission melekat pada role, bukan langsung pada pengguna'),
  p('Tidak ada tabel user_permissions. Inilah inti dari RBAC: izin diberikan melalui peran, bukan satu per satu ke tiap orang. Ketika kebijakan berubah, misalnya semua admin kini boleh menghapus pengguna, cukup satu baris yang diubah — bukan dua ratus pengguna yang harus disunting.'),

  h3('Keputusan 2 — UUID untuk pengguna, angka berurutan untuk role dan permission'),
  table(
    ['Pertimbangan', 'users (UUID)', 'roles & permissions (INT)'],
    [
      ['Muncul di URL publik?', 'Ya, pada /users/:id dan di dalam token', 'Tidak, hanya dipakai internal'],
      ['Berbahaya jika bisa ditebak?', 'Ya', 'Tidak'],
      ['Jumlah baris', 'Ribuan hingga jutaan', 'Belasan, dan statis'],
    ],
    [2600, 3200, 3226]
  ),
  p('Kalau ID pengguna berupa angka 1, 2, 3, siapa pun bisa menebak alamat pengguna lain sekaligus memperkirakan berapa total pengguna yang ada. Serangan semacam ini disebut enumeration. UUID tidak bisa ditebak. Sebaliknya, role dan permission adalah data referensi berjumlah belasan yang tidak pernah muncul di URL, sehingga memakai UUID hanya memperbesar indeks tanpa manfaat.'),

  h3('Keputusan 3 — Tidak ada tabel profil terpisah'),
  p('Data profil seperti nama lengkap, nomor telepon, dan kunci avatar disimpan sebagai kolom di tabel users. Memisahkannya menjadi tabel tersendiri akan menambah operasi penggabungan tabel pada setiap pembacaan data pengguna, tanpa manfaat pada skala ini.'),
  p('Pemisahan baru masuk akal apabila salah satu dari tiga kondisi ini terpenuhi: kolom profilnya banyak dan jarang diakses, hak aksesnya berbeda dari data kredensial, atau satu pengguna boleh memiliki lebih dari satu profil. Tidak ada satu pun yang berlaku di sini.'),

  h3('Keputusan 4 — Menyimpan kunci objek, bukan alamat lengkap'),
  p('Kolom avatar_key berisi kunci seperti "6af9267a.../b6b96151....png", bukan alamat lengkap seperti "http://localhost:9000/avatars/...".'),
  p('Alasannya, alamat mengandung nama host, port, dan protokol — semuanya berubah ketika aplikasi dipindahkan ke server sungguhan. Kalau alamat lengkap tersimpan di database, seluruh baris avatar akan menunjuk lokasi yang salah dan harus diperbaiki lewat migration khusus. Selain itu akses ke MinIO memakai alamat bertanda tangan yang berubah setiap kali dibuat, sehingga memang mustahil disimpan.'),
  quote('Basis data menyimpan identitas, bukan alamat. Alamat dirakit saat dibutuhkan, dari konfigurasi yang berlaku saat itu.'),

  h3('Keputusan 5 — Penamaan kolom snake_case, penamaan atribut camelCase'),
  p('PostgreSQL memakai konvensi penulisan dengan garis bawah, sedangkan JavaScript memakai huruf kapital di tengah kata. Keduanya benar di lingkungannya masing-masing, sehingga tidak ada yang perlu mengalah. Sequelize menjembatani otomatis melalui pengaturan underscored, yang ditulis sekali di berkas konfigurasi dan berlaku untuk seluruh model.'),

  h2('4.3 Perbedaan Migration, Model, dan Seeder'),
  p('Ketiganya berhubungan dengan database, tetapi menjawab pertanyaan yang berbeda. Kebingungan antara ketiganya sangat umum, sehingga perlu dijelaskan berdampingan.'),
  table(
    ['Aspek', 'Migration', 'Model', 'Seeder'],
    [
      ['Menjawab pertanyaan', 'Bagaimana cara membentuk tabelnya?', 'Bagaimana aplikasi memandang tabel ini?', 'Data awal apa yang harus ada?'],
      ['Dijalankan kapan', 'Sekali, saat pemasangan atau deploy', 'Setiap kali aplikasi berjalan', 'Sekali, setelah migration'],
      ['Berisi', 'Perintah membuat dan mengubah tabel', 'Validasi, relasi, hook, scope', 'Baris data'],
      ['Sifatnya', 'Riwayat — bertambah, tidak pernah disunting', 'Kondisi saat ini — bebas disunting', 'Data awal'],
      ['Analogi', 'Riwayat commit pada Git', 'Isi berkas saat ini', 'Isi lemari saat kantor pertama dibuka'],
    ],
    [1800, 2400, 2400, 2426]
  ),
  p('Migration menyimpan fakta bahwa kolom password_changed_at ditambahkan pada tanggal tertentu. Model hanya peduli bahwa kolom itu ada sekarang. Karena itulah migration tidak boleh disunting setelah pernah dijalankan di komputer orang lain — Sequelize mencatat migration yang sudah berjalan berdasarkan nama berkasnya, sehingga suntingan pada berkas lama tidak akan pernah dijalankan ulang.'),

  h2('4.4 Isi Data Awal'),
  p('Katalog sebelas permission dibuat oleh migration, sedangkan seeder mengurus tiga role, pemetaan role ke izin, dan satu akun superadmin. Alasan pemisahan ini dijelaskan di Bab 12. Format nama permission mengikuti pola sumber-daya diikuti tindakan.'),
  table(
    ['Role', 'Permission yang Dimiliki', 'Jumlah'],
    [
      ['superadmin', 'Seluruh permission yang ada', '11'],
      ['admin', 'users.create, users.read, users.update, users.delete, roles.read, profile.read, profile.update', '7'],
      ['user', 'profile.read, profile.update', '2'],
    ],
    [1800, 5600, 1626]
  ),
  p('Kredensial superadmin tidak ditulis di dalam berkas seeder, melainkan dibaca dari environment. Alasannya, berkas seeder masuk ke dalam repositori kode — menuliskan password di sana berarti setiap orang yang pernah mengakses repositori memegang kunci akun paling berkuasa, selamanya, karena riwayat Git tidak melupakan.'),
  br(),

  /* ═══════════════════ BAB 5 ═══════════════════ */
  h1('BAB 5 — Alur Kerja Tiap Fitur'),
  p('Bab ini menjelaskan cara kerja setiap fitur beserta keputusan keamanan yang menyertainya. Penyusunannya per fitur, bukan per tahap pengerjaan, supaya mudah dicari kembali.'),

  h2('5.1 Login'),
  ...code([
    '  Klien                  API                     Database',
    '    |                     |                          |',
    '    |-- email+password -->|                          |',
    '    |                     |-- cari user by email --->|',
    '    |                     |<-- data user ------------|',
    '    |                     |                          |',
    '    |                     | bandingkan password      |',
    '    |                     | periksa status aktif     |',
    '    |                     | catat waktu login  ----->|',
    '    |                     | terbitkan JWT            |',
    '    |<-- token + profil --|                          |',
  ]),
  caption('Gambar 5.1 — Alur login'),
  p('Ada empat keputusan keamanan pada alur sependek ini.'),
  num('Pesan error dibuat seragam. Email tidak terdaftar dan password salah sama-sama menghasilkan pesan "Email atau password salah". Kalau dibedakan, penyerang bisa mencoba ribuan alamat email untuk menyusun daftar akun yang benar-benar ada.'),
  num('Waktu respons disamakan. Kalau pengguna tidak ditemukan, sistem tetap menjalankan proses pembandingan password terhadap data tiruan. Tanpa ini, permintaan dengan email tidak terdaftar akan dijawab lima puluh kali lebih cepat, dan selisih waktu itu sendiri sudah membocorkan informasi yang berusaha disembunyikan.'),
  num('Status aktif diperiksa setelah password terverifikasi, bukan sebelumnya. Kalau dibalik, orang yang salah memasukkan password ke akun nonaktif akan diberi tahu bahwa akun itu ada.'),
  num('Data password yang tersimpan tidak pernah ikut keluar dalam jawaban, dijaga oleh dua lapis: pengecualian kolom pada tingkat query, dan penghapusan kolom pada tingkat penyusunan jawaban.'),

  h2('5.2 Verifikasi Token pada Setiap Permintaan'),
  p('Middleware authenticate menjalankan lima pemeriksaan berurutan. Urutannya disusun dari yang paling murah ke yang paling mahal, sehingga permintaan yang akan ditolak ditolak secepat mungkin.'),
  table(
    ['Urutan', 'Yang Diperiksa', 'Perkiraan Biaya'],
    [
      ['1', 'Header Authorization ada dan berformat Bearer', 'Pemeriksaan teks, hampir nol'],
      ['2', 'Tanda tangan token sah', 'Perhitungan, sekitar 0,1 milidetik'],
      ['3', 'Token tidak ada di daftar cabut', 'Redis, sekitar 0,2 milidetik'],
      ['4', 'Pengguna ada dan berstatus aktif', 'PostgreSQL, sekitar 2 milidetik'],
      ['5', 'Token terbit setelah password terakhir diubah', 'Perbandingan angka, gratis'],
    ],
    [900, 5400, 2726]
  ),
  p('Pemeriksaan keempat menjelaskan kenapa sistem tetap membaca database pada setiap permintaan, alih-alih mempercayai isi token sepenuhnya. Kolom status aktif tidak ada gunanya kalau efek penonaktifan baru terasa satu jam kemudian. Pengujian membuktikan hal ini: sebuah akun dinonaktifkan langsung di database, dan permintaan berikutnya dengan token yang sama persis langsung ditolak.'),

  h2('5.3 Logout'),
  p('JWT dirancang untuk tidak memerlukan penyimpanan sesi di server. Konsekuensinya, server tidak punya apa pun untuk dihapus ketika pengguna menekan tombol keluar. Tanpa penanganan khusus, token yang sudah di-logout tetap sah sampai masa berlakunya habis.'),
  p('Solusinya adalah daftar cabut yang disimpan di Redis. Ketika pengguna logout, ID token dicatat dengan masa simpan yang persis sama dengan sisa umur token tersebut.'),
  ...code([
    'SET token:denylist:<id-token>  "1"  EX <sisa detik>',
  ]),
  p('Masa simpan dihitung dari data di dalam token itu sendiri, bukan dari angka tetap. Alasannya, masa simpan yang lebih pendek dari umur token akan membuat token yang sudah dicabut hidup kembali — sebuah lubang keamanan yang tidak menimbulkan error dan tidak tercatat di mana pun.'),
  p('Pengujian membuktikan alur ini bekerja: token yang tanda tangannya masih sah dan belum kedaluwarsa tetap ditolak setelah pemiliknya melakukan logout.'),

  h2('5.4 RBAC dan Cache Izin'),
  p('Middleware authorize memeriksa apakah pengguna memiliki izin tertentu. Pemeriksaan ini membutuhkan penelusuran empat tabel sekaligus, dan berjalan pada setiap permintaan ke endpoint yang dilindungi.'),
  p('Karena data izin jarang berubah tetapi sering dibaca, hasilnya disimpan di cache Redis selama lima menit. Namun cache selalu membawa risiko: data sumber berubah, isi cache belum. Untuk izin, "basi" berarti seseorang masih bisa melakukan hal yang izinnya baru saja dicabut.'),
  table(
    ['Mekanisme', 'Cara Kerja', 'Sifat'],
    [
      ['Masa simpan 5 menit', 'Cache hangus dengan sendirinya', 'Jaring pengaman pasif'],
      ['Penghapusan eksplisit', 'Cache dihapus saat role diubah', 'Akurat dan seketika'],
    ],
    [2400, 4200, 2426]
  ),
  p('Keduanya dipakai bersamaan. Penghapusan eksplisit bergantung pada programmer yang tidak lupa memanggilnya; suatu hari akan ada satu jalur kode yang terlewat. Masa simpan membatasi kerusakan dari kelalaian itu menjadi paling lama lima menit, bukan selamanya.'),
  p('Urutan pemanggilannya juga penting: data diubah dulu, cache dihapus setelahnya. Kalau dibalik, ada celah waktu ketika permintaan lain masuk, tidak menemukan cache, membaca data lama yang belum sempat berubah, lalu menyimpannya kembali ke cache.'),
  p('Pengujian membuktikan mekanisme ini: seorang pengguna dengan role terbatas ditolak saat mengakses daftar pengguna, role-nya dinaikkan oleh administrator, dan permintaan berikutnya dengan token yang sama persis langsung diterima.'),

  h2('5.5 Lupa Password'),
  p('Alur ini adalah jalan pintas resmi menuju akun seseorang tanpa memerlukan password lama, sehingga menjadi sasaran paling menarik di seluruh sistem. Lima aturan diterapkan.'),
  table(
    ['No', 'Aturan', 'Alasan'],
    [
      ['1', 'Jawaban selalu sama, baik email terdaftar maupun tidak', 'Endpoint ini bisa diakses tanpa login, sehingga lebih rawan dipakai memetakan daftar pengguna'],
      ['2', 'Token dibuat acak sepanjang 32 byte', 'Token yang diturunkan dari email atau waktu bisa direkayasa'],
      ['3', 'Token hanya berlaku 15 menit', 'Email yang diteruskan atau riwayat peramban tidak menjadi kunci permanen'],
      ['4', 'Token hanya bisa dipakai sekali', 'Mencegah pemakaian ulang oleh siapa pun yang pernah melihat email tersebut'],
      ['5', 'Semua sesi lama dimatikan setelah password berubah', 'Inti dari reset password adalah mengeluarkan penyusup; kalau sesi lama tetap hidup, resetnya sia-sia'],
    ],
    [700, 3400, 4926]
  ),
  p('Selain itu, yang disimpan di Redis bukan tokennya, melainkan hasil pengacakan satu arah dari token tersebut. Kalau isi Redis bocor, pemegangnya tidak bisa menyusun kembali token aslinya. Ini penerapan prinsip yang sama seperti pada password.'),
  p('Aturan kelima diwujudkan lewat kolom password_changed_at. Sistem tidak menyimpan daftar token aktif per pengguna, sehingga tidak ada yang bisa dicabut satu per satu. Sebagai gantinya, sistem mencatat kapan password terakhir diubah, lalu menolak setiap token yang diterbitkan sebelum waktu tersebut. Satu kolom, satu perbandingan, dan sebagai efek samping sistem mendapat fitur "keluar dari semua perangkat" secara gratis.'),

  h2('5.6 Pengiriman Email Secara Asinkron'),
  ...code([
    '  API                  RabbitMQ                Worker            SMTP',
    '   |                      |                      |                |',
    '   |-- titip pesan ------>|                      |                |',
    '   |<-- selesai (135 ms)  |                      |                |',
    '   |                      |<-- ambil pesan ------|                |',
    '   |                      |                      |-- kirim ------>|',
    '   |                      |                      |<-- berhasil ---|',
    '   |                      |<-- konfirmasi -------|                |',
    '   |                      | (pesan dihapus)      |                |',
  ]),
  caption('Gambar 5.2 — Pemisahan antara menerima perintah dan mengerjakannya'),
  p('Konsep terpenting di sini adalah konfirmasi. Ketika pekerja mengambil sebuah pesan, RabbitMQ belum menghapusnya. Pesan baru dihapus setelah pekerja menyatakan pekerjaannya selesai. Kalau pekerja mati di tengah proses, pesan dikembalikan ke antrean untuk dikerjakan ulang.'),
  p('Tiga hasil pengujian membuktikan ketahanan rancangan ini:'),
  li('Ketika pekerja dimatikan, permintaan lupa password tetap dijawab dalam sekitar 139 milidetik dan pesannya menunggu di antrean.'),
  li('Ketika broker di-restart, pesan yang menunggu tetap ada karena disimpan ke disk.'),
  li('Ketika sebuah pesan rusak dimasukkan dengan sengaja, pekerja mencatatnya, membuangnya, lalu tetap hidup dan memproses pesan berikutnya dengan normal.'),

  h2('5.7 Profil dan Foto Avatar'),
  p('Unggahan file membawa risiko yang tidak ada pada endpoint biasa, sehingga ada empat keputusan khusus.'),
  num('File ditampung di memori, bukan ditulis ke disk sementara. Ini menghilangkan kebutuhan pembersihan berkas sisa. Pendekatan ini benar hanya karena ukuran file dibatasi 2 MB; untuk file besar, cara ini akan menghabiskan memori server.'),
  num('Format SVG tidak diizinkan meski merupakan format gambar. Alasannya, SVG adalah dokumen XML yang bisa memuat kode JavaScript di dalamnya. Kalau berkas seperti itu dibuka di peramban pada domain yang sama dengan aplikasi, kodenya ikut berjalan.'),
  num('Nama objek dibuat acak, dan objek lama dihapus setelah data berhasil diperbarui. Urutannya disengaja: unggah baru, perbarui database, baru hapus yang lama. Kalau penghapusan didahulukan lalu pembaruan gagal, database akan menunjuk berkas yang sudah tidak ada.'),
  num('Bucket bersifat tertutup. Akses diberikan melalui alamat bertanda tangan yang berlaku satu jam. Pengujian membuktikan bahwa alamat yang sama tanpa bagian tanda tangan langsung ditolak dengan pesan Access Denied.'),
  p('Satu hal yang perlu dicatat sebagai batasan: pemeriksaan jenis berkas saat ini mengandalkan keterangan yang dikirim klien, dan keterangan itu bisa dipalsukan. Pemeriksaan yang benar-benar kuat harus membaca beberapa byte pertama isi berkas. Risikonya rendah karena berkas disimpan di MinIO dan tidak pernah dijalankan, tetapi ini tetap dicatat sebagai batasan yang disadari.'),

  h2('5.8 Manajemen Pengguna dan Role'),
  p('Modul ini mengubah siapa boleh melakukan apa, sehingga celah di sini bisa membatalkan seluruh sistem hak akses. Tiga bahaya ditangani secara khusus.'),
  table(
    ['Bahaya', 'Skenario', 'Penanganan'],
    [
      ['Menaikkan hak sendiri', 'Seorang admin memberikan role superadmin kepada dirinya sendiri', 'Endpoint penetapan role dijaga izin roles.update, yang hanya dimiliki superadmin'],
      ['Menyerang akun lebih tinggi', 'Seorang admin menonaktifkan atau menghapus akun superadmin', 'Hanya superadmin yang boleh mengelola akun superadmin'],
      ['Mengunci diri sendiri', 'Superadmin menghapus akunnya sendiri sehingga sistem tidak bisa diadministrasi', 'Seluruh operasi manajemen terhadap diri sendiri ditolak'],
    ],
    [2000, 3400, 3626]
  ),
  p('Menariknya, dua aturan terakhir sudah cukup untuk menjamin selalu ada minimal satu superadmin di sistem, tanpa perlu penghitungan khusus. Superadmin boleh menghapus superadmin lain, tetapi tidak dirinya sendiri; sementara admin biasa tidak bisa menyentuh keduanya.'),
  p('Bahaya pertama layak digarisbawahi karena bukan kelemahan RBAC, melainkan kesalahan dalam memilih izin untuk sebuah endpoint. Kalau penetapan role dijaga oleh izin users.update, maka setiap pemegang izin itu dapat menaikkan haknya sendiri sampai tak terbatas.'),
  quote('Endpoint yang bisa mengubah hak akses harus dijaga oleh izin yang tidak dimiliki oleh pihak yang haknya bisa ia naikkan.'),
  br(),
];
