# Authentication & Authorization Service

Backend service untuk autentikasi, otorisasi berbasis peran (RBAC), dan pengelolaan profil pengguna.
Dibangun dengan Express, PostgreSQL, Redis, RabbitMQ, MinIO, dan Docker.

Dilengkapi **antarmuka console** untuk memperagakan seluruh endpoint tanpa perlu perkakas API terpisah.

---

## Fitur

- **Autentikasi** — login, logout dengan pencabutan token yang benar-benar berlaku, verifikasi token per permintaan
- **RBAC** — role dan permission dengan relasi many-to-many, middleware pemeriksa izin, cache di Redis
- **Lupa password** — token acak berumur pendek di Redis, pengiriman email asinkron lewat RabbitMQ
- **Profil** — data diri dan unggah foto avatar ke object storage
- **Manajemen pengguna & role** — pembuatan akun oleh administrator, penetapan role, pengaturan izin
- **Console** — antarmuka web yang mencakup seluruh 25 endpoint, lengkap dengan panel lalu lintas API

---

## Menjalankan

### Prasyarat

Docker Desktop dan Node.js 20 ke atas.

### Langkah

```bash
# 1. Siapkan konfigurasi
cp .env.example .env
```

Isi `.env`. Tiga nilai yang wajib dibuat sendiri:

```bash
# kunci penandatangan token, minimal 32 karakter
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# password superadmin awal
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

`SMTP_*` diisi dengan kredensial penyedia email. Untuk Gmail, gunakan App Password, bukan password akun.

```bash
# 2. Nyalakan seluruh layanan
docker compose up -d

# 3. Bentuk struktur database dan isi data awal (sekali saja)
npm install
npm run db:migrate
npm run db:seed
```

Buka **http://localhost:3000** dan masuk dengan kredensial `SUPERADMIN_*` dari `.env`.

> Migration sengaja tidak dijalankan otomatis saat container menyala. Kalau aplikasi berjalan
> dalam beberapa salinan, semuanya akan menjalankan migration bersamaan pada database yang sama.

### Mode pengembangan

```bash
docker compose up -d postgres redis rabbitmq minio   # infrastruktur saja
npm run dev                                          # terminal 1 — API
npm run worker                                       # terminal 2 — pengirim email
```

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | API dengan muat ulang otomatis |
| `npm run worker` | Proses pengirim email |
| `npm run db:migrate` | Menjalankan migration |
| `npm run db:seed` | Mengisi role, pemetaan izin, dan akun superadmin |
| `npm run gen:permissions` | Membuat ulang `src/constants/permissions.js` dari database |
| `npm run db:reset` | Membangun ulang database dari nol |
| `npm run test:db:setup` | Menyiapkan database pengujian (sekali saja) |
| `npm test` | Menjalankan 15 pengujian end-to-end |

---

## Endpoint

Seluruhnya berawalan `/api/v1`.

| Metode | Alamat | Izin |
|---|---|---|
| GET | `/health` | terbuka |
| GET | `/health/ready` | terbuka |
| POST | `/auth/login` | terbuka, 5 percobaan / 15 menit |
| GET | `/auth/me` | token sah |
| POST | `/auth/logout` | token sah |
| GET | `/auth/permissions` | token sah (izin milik sendiri) |
| POST | `/auth/forgot-password` | terbuka, 3 permintaan / jam |
| POST | `/auth/reset-password` | terbuka |
| GET | `/profile` | `profile.read` |
| PATCH | `/profile` | `profile.update` |
| POST | `/profile/avatar` | `profile.update` |
| DELETE | `/profile/avatar` | `profile.update` |
| GET | `/users` | `users.read` |
| POST | `/users` | `users.create` |
| GET | `/users/:id` | `users.read` |
| PATCH | `/users/:id` | `users.update` |
| DELETE | `/users/:id` | `users.delete` |
| PUT | `/users/:id/roles` | `roles.update` |
| GET | `/roles` | `roles.read` |
| POST | `/roles` | `roles.create` |
| GET | `/roles/:id` | `roles.read` |
| PATCH | `/roles/:id` | `roles.update` |
| PUT | `/roles/:id/permissions` | `roles.update` |
| DELETE | `/roles/:id` | `roles.delete` |
| GET | `/permissions` | `permissions.read` |

---

## Struktur Folder

```
src/
├── config/        konfigurasi dan validasi environment
├── constants/     data tetap tanpa efek samping
├── utils/         fungsi murni, tidak menyentuh I/O
├── database/      koneksi, model, migration, seeder
├── redis/         koneksi Redis
├── queue/         koneksi RabbitMQ dan penerbitan pesan
├── storage/       koneksi MinIO dan operasi berkas
├── services/      logika lintas fitur yang menyentuh penyimpanan
├── middlewares/   pemeriksaan sebelum controller
├── modules/       fitur, satu folder per fitur
├── routes/        pengumpul seluruh route
└── workers/       proses terpisah yang berjalan sendiri

public/            antarmuka console (HTML, CSS, JS tanpa build)
tests/             pengujian end-to-end
docs/              laporan teknis dan bahan presentasi
```

### Menambah permission baru

Katalog izin berada di **migration**, bukan di seeder — karena kode bergantung
padanya, dan `db:migrate` dijamin jalan di setiap deploy sedangkan `db:seed`
belum tentu. Kalau katalog absen, seluruh endpoint terlindungi menjawab 403
untuk semua orang termasuk superadmin, tanpa error apa pun.

```bash
# 1. buat migration berisi izin baru
npx sequelize-cli migration:generate --name add-users-export-permission

# 2. jalankan, lalu perbarui berkas konstanta dari database
npm run db:migrate
npm run gen:permissions

# 3. pakai konstantanya di route
#    authorize(PERMISSIONS.USERS_EXPORT)
```

`src/constants/permissions.js` **dibuat otomatis** — jangan diedit manual.
Database adalah sumber kebenarannya.

Dua pengaman berjalan tanpa perlu diingat:

- `authorize()` mencatat sendiri setiap izin yang diminta route saat aplikasi dimuat
- Saat start, daftar itu dibandingkan dengan isi tabel `permissions`. Ada yang
  tidak cocok → aplikasi **menolak menyala** dengan pesan yang menyebutkan izin
  mana yang bermasalah

---

**Aturan penempatan berkas baru** — berhenti di jawaban "ya" pertama:

1. Data tetap tanpa koneksi apa pun? → `constants/`
2. Fungsi murni tanpa I/O? → `utils/`
3. Dipakai lintas fitur dan menyentuh penyimpanan? → `services/` atau `middlewares/`
4. Hanya dipakai satu fitur? → `modules/<fitur>/`

---

## Layanan

| Layanan | Port | Wajib saat start |
|---|---|---|
| PostgreSQL | 5432 | ya |
| Redis | 6379 | ya |
| RabbitMQ | 5672, 15672 (UI) | tidak |
| MinIO | 9000, 9001 (Console) | tidak |
| API | 3000 | — |
| Worker email | — | — |

RabbitMQ dan MinIO tidak diwajibkan karena email dan avatar adalah fungsi pendukung.
Menjadikannya wajib berarti menjatuhkan seluruh autentikasi karena masalah pada gambar profil.

---

## Dokumentasi

`docs/Laporan-Auth-Service.docx` memuat laporan teknis lengkap: alasan pemilihan setiap teknologi,
keputusan desain basis data, alur tiap fitur, daftar ancaman keamanan beserta penanganannya,
serta catatan kendala yang ditemui selama pengembangan.

---

## Catatan Keamanan

- `.env` tidak pernah masuk repositori maupun image Docker; nilainya disuntikkan saat container berjalan
- Password disimpan sebagai hash bcrypt dengan cost 12, tidak pernah ikut dalam jawaban API
- Token reset disimpan sebagai hash SHA-256, bukan token aslinya
- Aplikasi berjalan sebagai pengguna biasa di dalam container, bukan root
- `TRUST_PROXY` harus diisi sesuai jumlah proksi yang benar-benar ada di depan aplikasi;
  nilai yang terlalu besar membuat pembatasan percobaan login dapat dilewati dengan header palsu
