# Brief Deck Presentasi — Auth Service

> **Cara pakai:** buka sesi Claude Design baru, tempel bagian **"PROMPT SIAP TEMPEL"**, lalu lampirkan seluruh sisa berkas ini sebagai bahan isi.
>
> **Perubahan dari versi sebelumnya:** presentasi kini memuat **demo langsung** memakai antarmuka console. Struktur diringkas menjadi 15 slide agar demo mendapat porsi 5 menit.

---

## PROMPT SIAP TEMPEL

```
Buatkan deck presentasi 15 slide untuk presentasi teknis internal berdurasi 20 menit,
yang di tengahnya ada sesi demo langsung selama 5 menit.

KONTEKS
- Presenter: Satya Rayyis Baruna, Junior Developer di PT Digital Infra Teknologi (DTECH)
- Audiens: Khairul Umam (pembimbing) dan tim internal — orang teknis, istilah teknis boleh dipakai
- Tujuan: melaporkan hasil pengembangan Authentication & Authorization Service dan
  menjelaskan keputusan teknis di baliknya
- Sifat: laporan hasil kerja, bukan pitch penjualan. Percaya diri tapi tidak berlebihan.

ARAH DESAIN
- Kesan: teknis, bersih, modern futuristik. Bukan template korporat generik.
- Palet: dasar navy sangat gelap (#070B14) dan panel (#111A2E), aksen cyan (#22D3EE)
  dan violet (#A78BFA). Merah (#FB7185) HANYA untuk masalah/ancaman.
  Hijau tosca (#34D399) HANYA untuk hal yang sudah aman/berhasil. Amber (#FBBF24)
  untuk penekanan netral dan angka besar.
- Tipografi: satu keluarga sans-serif, dua bobot. Judul besar dan tegas.
  Font harus TETAP JELAS TERBACA — futuristik dari warna dan tata letak, bukan dari
  huruf yang aneh. Isi jangan lebih kecil dari 18pt ekuivalen.
- Layout: satu gagasan per slide. Maksimal 5 baris teks. Utamakan diagram, tabel ringkas,
  dan angka besar dibanding daftar peluru.
- Slide demo dibuat sebagai penanda penuh layar, bukan slide berisi teks.
- Wajib dihindari: dinding peluru, clip art, ikon 3D, gradien berlebihan,
  lebih dari dua jenis huruf, teks slide yang sama persis dengan yang diucapkan.

Untuk setiap slide saya sertakan: judul, isi inti, saran visual, catatan pembicara,
dan durasi. Catatan pembicara TIDAK ditulis di slide — taruh di area notes.
```

---

## ALOKASI WAKTU (total 20 menit)

| Bagian | Slide | Durasi |
|---|---|---|
| Pembuka & konteks | 1–3 | 2,5 menit |
| Arsitektur & desain | 4–6 | 4,5 menit |
| Cara kerja fitur | 7–9 | 3,5 menit |
| **Demo langsung** | 10 | **5 menit** |
| Keamanan, deployment, pengujian | 11–13 | 3 menit |
| Pelajaran & penutup | 14–15 | 1,5 menit |

---

# SLIDE 1 — Judul · 30 detik

**Judul:** Authentication & Authorization Service
**Subjudul:** Laporan Pengembangan — Node.js · PostgreSQL · Redis · RabbitMQ · MinIO · Docker

**Isi:** Satya Rayyis Baruna, Junior Developer · Pembimbing: Khairul Umam · PT Digital Infra Teknologi (DTECH) · 2026

**Saran visual:** Slide navy penuh, judul besar. Nama teknologi kecil di bawah, dipisah titik tengah.

**Catatan pembicara:** "Saya akan lebih banyak menjelaskan *kenapa* keputusannya diambil daripada *apa* yang dibuat. Di tengah nanti ada demo langsung."

---

# SLIDE 2 — Masalah yang Diselesaikan · 1 menit

**Judul:** Kenapa Dipisah Jadi Satu Service

**Isi:**
- Setiap aplikasi butuh tiga hal yang sama: memastikan identitas, mengatur hak akses, menyimpan profil
- Kalau tiap aplikasi membangun sendiri: pekerjaan berulang, kualitas keamanan berbeda-beda
- Keamanan mudah terlihat benar padahal salah — dan kesalahannya tidak menimbulkan error

**Saran visual:** Kiri, tiga kotak aplikasi masing-masing dengan modul auth sendiri berwarna berbeda. Kanan, tiga kotak menunjuk ke satu kotak auth service berwarna seragam.

**Catatan pembicara:** Tekankan kalimat ketiga. "Fitur login bisa berjalan sempurna sambil membocorkan daftar email terdaftar. Tidak ada error, tidak ada log — hanya menunggu."

---

# SLIDE 3 — Ruang Lingkup · 1 menit

**Judul:** Yang Dibangun dan Yang Sengaja Tidak

| Termasuk | Tidak Termasuk |
|---|---|
| Login & logout | Pendaftaran mandiri publik |
| Verifikasi token per request | Login lewat Google / OAuth |
| Role & permission (RBAC) | 2FA / OTP |
| Lupa password lewat email | Refresh token |
| Profil & foto avatar | Audit log aktivitas |
| Manajemen user & role | Ganti alamat email |
| Antarmuka console untuk demo | Frontend untuk pengguna akhir |

**Saran visual:** Dua kolom. Kiri centang tosca, kanan garis putus-putus abu — kesan "sengaja dikosongkan", bukan "gagal".

**Catatan pembicara:** "Kolom kanan sama pentingnya. Tidak adanya pendaftaran publik adalah keputusan keamanan — tidak ada pintu masuk terbuka yang perlu dijaga."

---

# SLIDE 4 — Teknologi dan Analoginya · 1,5 menit

**Judul:** Enam Komponen, Enam Peran Berbeda

| Komponen | Analogi |
|---|---|
| Express | Resepsionis — menerima, memeriksa, mengarahkan |
| PostgreSQL | Lemari arsip tahan api — rapi, permanen |
| Redis | Papan tulis berpenghapus otomatis — cepat, sementara |
| RabbitMQ | Loket titipan — dititipkan, dikerjakan belakangan |
| MinIO | Gudang — untuk barang besar, bukan dokumen tipis |
| Docker | Kontainer pengiriman standar — isi bebas, perlakuan sama |

**Saran visual:** Enam kartu sejajar. Nama teknologi besar, analogi di bawahnya. Kalau memungkinkan, ilustrasi denah kantor sederhana bergaris tipis satu warna.

**Catatan pembicara:** Slide yang paling membantu audiens. Sebutkan satu per satu sambil menunjuk. Tambahkan: "Redis dipilih terutama karena satu fitur — data bisa menghapus dirinya sendiri setelah waktu tertentu."

---

# SLIDE 5 — Struktur Folder dan Aturan Penempatan · 1,5 menit

**Judul:** Modular per Fitur, dengan Aturan Penempatan yang Tegas

**Isi bagian kiri** — perbandingan struktur:

```
Layer-based (tidak dipakai)     Feature-based (dipakai)
controllers/                    modules/
  authController                  auth/
  userController                    auth.controller.js
services/                           auth.service.js
  authService                       auth.routes.js
routes/                           users/  roles/  profile/
```

**Isi bagian kanan** — empat pertanyaan, berhenti di "ya" pertama:

1. Data tetap tanpa koneksi? → `constants/`
2. Fungsi murni tanpa I/O? → `utils/`
3. Dipakai lintas fitur? → `services/` atau `middlewares/`
4. Hanya satu fitur? → `modules/<fitur>/`

**Saran visual:** Dua panel berdampingan. Kiri pohon direktori monospace (yang tidak dipakai diberi warna abu). Kanan diagram alur vertikal empat titik keputusan.

**Catatan pembicara:** Beri satu contoh konkret: "Berkas berisi daftar nama izin harus jadi folder sendiri, tidak digabung ke service — karena service membuka koneksi Redis, dan seeder yang cuma butuh daftar nama akan ikut membuka koneksi yang tidak pernah ditutup."

---

# SLIDE 6 — Skema Database dan RBAC · 1,5 menit

**Judul:** Lima Tabel, Dua Relasi Many-to-Many

```
users ──┬── user_roles ──┬── roles ──┬── role_permissions ──┬── permissions
   id (UUID)         user_id     id (INT)              role_id         id (INT)
   email             role_id     name                  permission_id   name
   password_hash                 description                           description
   is_active
   password_changed_at
```

**Isi tambahan:** User punya banyak Role → tiap Role punya banyak Permission

**Saran visual:** Tiga kotak utama berwarna, dua kotak penghubung lebih kecil berwarna abu — ukuran berbeda menandakan perannya sebagai relasi, bukan entitas utama.

**Catatan pembicara:** "Permission melekat pada role, bukan langsung pada user. Ketika kebijakan berubah — semua admin kini boleh menghapus user — cukup satu baris yang diubah, bukan dua ratus user."

---

# SLIDE 7 — Login dan Empat Keputusan Keamanannya · 1,5 menit

**Judul:** Login: Empat Keputusan pada Satu Alur Pendek

**Isi:**
- Pesan error seragam — satu kalimat untuk semua sebab kegagalan
- Waktu respons disamakan — pembandingan tetap dijalankan meski user tidak ada
- Status aktif diperiksa **setelah** password terverifikasi
- Hash password dijaga dua lapis: tidak dibaca dari database, dan tidak ikut ke jawaban

**Saran visual:** Diagram alur horizontal 5 langkah, dengan empat penanda bernomor di titik keputusan keamanannya.

**Catatan pembicara:** Fokus ke poin kedua. "Kalau user tidak ditemukan lalu langsung ditolak, responsnya lima puluh kali lebih cepat. Selisih waktu itu sendiri sudah membocorkan email mana yang terdaftar."

---

# SLIDE 8 — Masalah Logout pada JWT · 1 menit

**Judul:** JWT Tidak Bisa Dicabut — Kecuali Dibantu

**Isi:**
- JWT tidak disimpan di server, jadi tidak ada yang bisa dihapus saat logout
- Tanpa penanganan: token yang sudah di-logout tetap sah sampai kedaluwarsa
- Solusi: daftar cabut di Redis, masa simpan **sama persis** dengan sisa umur token
- Hasil uji: token bertanda tangan sah dan belum kedaluwarsa → **ditolak**

**Saran visual:** Dua garis waktu sejajar. Atas: terbit → logout → tetap berlaku (merah). Bawah: terbit → logout → dicatat di Redis → ditolak (tosca).

**Catatan pembicara:** "Masa simpannya dihitung dari isi token, bukan angka tetap. Kalau lebih pendek dari umur token, token yang sudah di-logout akan hidup kembali — lubang keamanan yang tidak menimbulkan error apa pun."

---

# SLIDE 9 — Email Asinkron · 1 menit

**Judul:** Yang Tidak Perlu Ditunggu, Jangan Ditunggu

**Isi:**
- Kirim email lewat SMTP: **1–3 detik**
- Waktu respons API: **135 ms** — baik saat pekerja hidup maupun mati
- Pekerja dimatikan → pesan menunggu di antrean, tidak hilang
- Broker di-restart → pesan tetap ada karena disimpan ke disk

**Saran visual:** Diagram alur API → RabbitMQ → Worker → SMTP dengan label waktu per segmen. Angka "135 ms" besar berwarna amber.

**Catatan pembicara:** "Kalau pengiriman email dilakukan langsung di dalam request, dua hal terjadi: pengguna menunggu 3 detik untuk sesuatu yang tidak ia butuhkan saat itu, dan kalau SMTP tumbang, permintaan reset gagal padahal tokennya sudah tersimpan dan sah."

---

# SLIDE 10 — DEMO LANGSUNG · 5 menit

**Judul:** Demo

**Isi slide:** hanya judul besar dan satu baris — `localhost:3000`

**Saran visual:** Slide penuh warna gelap dengan judul sangat besar di tengah. Tidak ada teks lain. Slide ini hanya penanda pindah ke browser.

### Skenario demo — ikuti urutan ini

| No | Aksi | Yang ditunjukkan | Waktu |
|---|---|---|---|
| 1 | Login dari halaman awal | Panel kanan mencatat `POST /auth/login` beserta waktu responsnya | 30 dtk |
| 2 | Dashboard | Identitas, 11 izin, status PostgreSQL & Redis — semuanya dari endpoint sungguhan | 30 dtk |
| 3 | Buka **Matriks Izin** | **Inti demo.** Perbedaan panjang kolom = perbedaan wewenang. Tunjuk baris `roles.create` dan `roles.update` yang hanya dimiliki superadmin | 1 mnt |
| 4 | Klik **Ubah Izin**, cabut satu izin dari role `admin`, simpan | Panel kanan menampilkan `PUT /roles/:id/permissions`. Sebutkan versi cache dinaikkan sehingga seluruh pengguna role itu langsung terpengaruh | 1 mnt |
| 5 | Buka **Pengguna**, klik **Role** pada Dewi Lestari, beri role `user` | Perubahan role berlaku seketika tanpa pengguna perlu login ulang | 1 mnt |
| 6 | Buka **Status & Cakupan** | Daftar 26 endpoint, yang sudah dipanggil menyala hijau | 45 dtk |
| 7 | Klik satu entri di panel kanan | Isi request dan response mentah — bukti API-nya nyata | 15 dtk |

**Persiapan sebelum presentasi:**
- Jalankan `docker compose up -d` dan pastikan `docker compose ps` menunjukkan `app` **healthy**
- Buka `http://localhost:3000` dan login sekali untuk memastikan lancar, lalu **logout** agar demo dimulai dari layar login
- Klik **Bersihkan** pada panel kanan agar catatan mulai dari nol
- Data demo sudah tersedia: 5 pengguna dengan role dan status berbeda-beda

**Catatan pembicara:** Jangan terburu-buru pada langkah 3. Diam sejenak setelah membuka matriks — biarkan audiens membaca perbedaan kolomnya sendiri sebelum dijelaskan.

---

# SLIDE 11 — Keamanan · 1,5 menit

**Judul:** 19 Ancaman Ditangani — Enam yang Paling Berdampak

| Ancaman | Penanganan |
|---|---|
| User enumeration | Pesan error seragam untuk semua sebab kegagalan |
| Timing attack | Waktu respons disamakan lewat pembandingan tiruan |
| Brute force | Enkripsi lambat (cost 12) + batas 5 percobaan / 15 menit |
| Privilege escalation | Penetapan role dijaga izin yang tidak dimiliki admin |
| Serangan ke akun lebih tinggi | Hanya superadmin boleh mengelola superadmin |
| XSS lewat unggahan | SVG ditolak — bisa memuat JavaScript di dalamnya |

**Saran visual:** Dua kolom, ancaman dengan penanda merah tipis, penanganan dengan penanda tosca. Angka besar "19" di sudut.

**Catatan pembicara:** Angkat baris keempat, dan hubungkan dengan demo: "Yang tadi kita lihat di matriks — `roles.update` hanya dimiliki superadmin — itulah yang mencegah seorang admin memberi dirinya sendiri role superadmin."

---

# SLIDE 12 — Deployment · 1 menit

**Judul:** Satu Perintah, Enam Layanan

**Isi:**
- `docker compose up -d --build`
- Aplikasi menunggu database dan Redis benar-benar siap sebelum start
- Start dari nol: **0 kegagalan, 0 restart**
- Penghentian rapi dalam **1,8 detik** — koneksi ditutup, bukan diputus paksa
- Berjalan sebagai pengguna biasa. Berkas `.env` tidak ikut ke dalam image

**Saran visual:** Enam kotak container dalam satu kotak besar bertanda "Docker network". Panah dependensi dari `app` ke `postgres` dan `redis`. Dua angka ditonjolkan.

**Catatan pembicara:** "Migration sengaja tidak dijalankan otomatis saat container menyala. Kalau aplikasi berjalan dalam beberapa salinan, semuanya akan menjalankan migration bersamaan pada database yang sama."

---

# SLIDE 13 — Pengujian · 1 menit

**Judul:** 15 Pengujian Otomatis — Sebagian Besar Menguji Keamanan

**Isi:**
- `15 pass · 0 fail · 3,1 detik`
- Diuji pada tingkat end-to-end lewat HTTP sungguhan, bukan per fungsi
- Yang dijaga: pesan seragam, hash tidak bocor, token mati setelah logout, role superadmin terlindungi
- Basis data pengujian terpisah, tidak mengotori data pengembangan
- Ditambah 10 pengujian manual untuk perilaku infrastruktur

**Saran visual:** Blok hasil bergaya terminal (latar gelap, monospace, centang hijau) di kiri; daftar sifat keamanan yang dijaga di kanan.

**Catatan pembicara:** "Kesalahan yang paling sering lolos bukan di dalam sebuah fungsi, tapi di sambungan antar lapisan — middleware yang urutannya tertukar, atau izin yang salah dipasang pada endpoint."

---

# SLIDE 14 — Pelajaran Utama · 1 menit

**Judul:** Tiga Kesalahan yang Paling Banyak Mengajari

| Kasus | Akar penyebab | Pelajaran |
|---|---|---|
| Token lama masih diterima setelah reset password | Dua satuan waktu dibandingkan langsung: token dalam detik, database dalam milidetik | Kesalahan yang gagal ke arah **terbuka** paling berbahaya |
| Endpoint selalu gagal di container, normal di laptop | Klien Redis punya dua status: soket terbuka, dan siap menerima perintah. Yang diperiksa status pertama | Optimasi yang membuat sistem gagal lebih cepat memunculkan bug yang tersembunyi oleh kelambatan |
| Superadmin ditolak padahal punya semua izin | Nama izin salah ketik — tunggal, bukan jamak. Tidak ada error karena bagi sistem itu hanya teks | Arah kegagalan sudah benar: salah ketik menolak akses, bukan memberikannya |

**Saran visual:** Tiga kartu sejajar, tiap kartu berlabel Gejala / Akar penyebab / Pelajaran.

**Catatan pembicara:** Ceritakan satu agak panjang — yang pertama paling kuat karena menyangkut keamanan.

---

# SLIDE 15 — Ringkasan dan Penutup · 1 menit

**Judul:** Ringkasan

**Isi:** angka besar dalam grid

- **26** endpoint pada 6 modul
- **6** tabel dengan relasi many-to-many ganda
- **19** ancaman keamanan terdokumentasi
- **165** pengujian otomatis, seluruhnya lulus
- **6** layanan berjalan dengan satu perintah

**Batasan yang disadari** (baris kecil di bawah): logging terstruktur, antrean pesan gagal, daftar sesi aktif per perangkat, batas umur mutlak sesi, dan pemeriksaan isi berkas unggahan — masing-masing sudah ada catatan kapan sebaiknya ditambahkan.

> **Catatan pemutakhiran.** Brief ini disusun sebelum empat perbaikan pada Bab 12 dikerjakan (katalog izin, lapisan repository, pengujian unit, dan refresh token). Angka di atas sudah disesuaikan, tetapi kalau presentasinya diberikan setelah perbaikan itu, pertimbangkan menambah satu slide untuk Bab 12 — bagian itu justru yang paling menarik dibahas dengan pembimbing, karena isinya masukan beliau sendiri yang ditindaklanjuti.

**Penutup:** Terima kasih — siap untuk pertanyaan

**Saran visual:** Slide gelap seperti slide 1, menutup lingkaran. Lima angka besar dalam grid, keterangan kecil di bawahnya.

**Catatan pembicara:** Jangan membaca ulang angkanya. Cukup: "Itu ringkasannya. Saya senang kalau ada bagian yang mau digali lebih dalam."

---

## CATATAN TAMBAHAN UNTUK DESAINER

**Slide yang paling butuh perhatian visual:** 4 (analogi), 5 (dua panel), 6 (ERD), 8 (dua garis waktu), 12 (diagram container). Kelimanya menyampaikan gagasan yang jauh lebih cepat dipahami lewat gambar daripada teks.

**Slide 10 harus paling berbeda dari yang lain.** Ia penanda perpindahan ke browser, jadi buat sesederhana mungkin — judul besar, satu baris alamat, tanpa isi lain. Kalau semua slide penuh dan slide ini juga penuh, perpindahan ke demo terasa datar.

**Slide yang boleh sederhana:** 3, 11, 13 — semuanya tabel. Cukup bersih dan mudah dibaca.

**Konsistensi warna:** merah hanya untuk masalah/ancaman, tosca hanya untuk hal yang sudah aman/berhasil, amber untuk penekanan netral. Jangan memakai merah sekadar untuk menonjolkan sesuatu.

**Kesinambungan dengan demo:** antarmuka console memakai palet yang sama persis (navy gelap, aksen cyan dan violet). Kalau deck memakai palet itu juga, perpindahan dari slide ke browser akan terasa menyatu, bukan seperti dua bahan berbeda.

**Jumlah teks:** 15 slide untuk 15 menit bicara berarti sekitar 60 detik per slide. Kalau sebuah slide terasa penuh, pindahkan kalimat penjelasnya ke catatan pembicara.
