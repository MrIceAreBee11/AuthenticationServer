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
- **Jejak audit** — 14 jenis perubahan data tercatat, termasuk percobaan yang ditolak
- **Idempotensi** — percobaan ulang pada pembuatan pengguna dan role menerima jawaban aslinya, bukan 409
- **Console** — antarmuka web yang mencakup seluruh 26 endpoint, lengkap dengan panel lalu lintas API

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
| `npm run test:unit` | 354 pengujian unit — tanpa Docker, tanpa database |
| `npm run test:e2e` | 34 pengujian end-to-end — perlu seluruh layanan hidup |
| `npm run test:coverage` | Pengujian unit beserta laporan cakupan |
| `npm test` | Unit lalu end-to-end |

---

## Pengujian

Dua lapis, dengan kebutuhan yang sangat berbeda.

**Pengujian unit** (`tests/unit/`) tidak menyentuh satu pun layanan. Seluruh
dependensi digantikan objek palsu yang disuntikkan lewat constructor, jadi
seluruhnya selesai dalam beberapa detik dan langsung jalan di mesin yang baru
meng-clone repositori ini:

```bash
npm run test:unit
```

Berkas `.env.unit` sengaja ikut di-commit karena isinya bukan rahasia —
alamat layanannya diisi `tidak-dipakai`, yang justru menjadi pembuktian bahwa
tidak ada pengujian unit yang benar-benar menghubungi apa pun.

**Pengujian end-to-end** (`tests/*.e2e.test.js`) menyalakan aplikasi
sungguhan dan memanggil endpoint lewat HTTP. Ia memerlukan `docker compose up
-d` dan `npm run test:db:setup` lebih dulu.

Ambang cakupan dipasang di `npm run test:coverage` dan membuat perintahnya
gagal bila turun di bawah 80 persen baris maupun cabang.

| Berkas | Baris | Cabang |
|---|---|---|
| `modules/auth/auth.service.js` | 100% | 100% |
| `modules/auth/password.service.js` | 100% | 100% |
| `services/audit.service.js` | 100% | 100% |
| `services/permission.service.js` | 97,7% | 93,9% |
| `modules/roles/roles.service.js` | 91,5% | 94,1% |
| `mappers/user.mapper.js`, `mappers/role.mapper.js` | 100% | 100% |
| `middlewares/validate.js` | 100% | 100% |
| `middlewares/idempotency.js` | 100% | 95,8% |
| `middlewares/authenticate.js` | 100% | 96,4% |
| `middlewares/authorize.js` | 100% | 100% |
| `middlewares/errorHandler.js` | 100% | 93,1% |
| `middlewares/requestLogger.js` | 100% | 100% |
| `utils/logger.js` | 100% | 96,9% |
| `utils/requestContext.js` | 89,3% | 100% |
| `utils/duration.js`, `utils/token.js`, `utils/response.js`, `utils/AppError.js` | 100% | 100% |
| `config/env.schema.js` | 97,9% | 93,3% |
| `constants/*` | 100% | 100% |
| `repositories/idempotency.repository.js` | 100% | 100% |
| `repositories/passwordResetToken.repository.js` | 100% | 100% |
| `repositories/tokenDenylist.repository.js` | 100% | 100% |

Keseluruhan **98,7 persen baris dan 97,3 persen cabang**.

Repository yang isinya murni pemanggilan Sequelize sengaja tidak diuji unit.
Menirukan Sequelize berarti menguji tiruan itu, bukan query yang sesungguhnya
dijalankan — bagian itu dibuktikan oleh pengujian end-to-end. Karena
dependensinya kini disuntikkan, berkas-berkas itu bahkan tidak ikut dimuat
saat pengujian unit berjalan.

---

## Endpoint

Seluruhnya berawalan `/api/v1`.

| Metode | Alamat | Izin |
|---|---|---|
| GET | `/health` | terbuka |
| GET | `/health/ready` | terbuka |
| POST | `/auth/login` | terbuka, 5 percobaan / 15 menit |
| POST | `/auth/refresh` | terbuka, cukup refresh token yang sah |
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
├── container.js   SATU-SATUNYA tempat `new` dipanggil (composition root)
├── app.js         perakit Express; tidak membuka port
├── server.js      titik masuk proses API
├── config/        SATU-SATUNYA tempat process.env dibaca (skema Zod)
├── constants/     data tetap: satuan, nama role, awalan kunci, izin
├── mappers/       penentu field yang boleh keluar (daftar-yang-diizinkan)
├── utils/         fungsi murni + TokenService
├── database/      Database (koneksi + model), migration, seeder
├── redis/         CacheClient
├── queue/         MessageQueue
├── storage/       ObjectStorage
├── repositories/  SATU-SATUNYA tempat penyusunan query
├── services/      logika bisnis lintas fitur
├── middlewares/   pemeriksaan sebelum controller, semuanya class
├── modules/       fitur: controller, service, routes per folder
├── routes/        pengumpul seluruh route
└── workers/       EmailWorker, proses terpisah

public/            antarmuka console (HTML, CSS, JS tanpa build)
scripts/           perkakas pengembangan (generator konstanta izin)
tests/unit/        pengujian unit, tanpa layanan apa pun
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
3. Menyusun query ke database, Redis, atau storage? → `repositories/`
4. Logika yang dipakai lintas fitur? → `services/` atau `middlewares/`
5. Hanya dipakai satu fitur? → `modules/<fitur>/`

### Aturan lapisan

```
routes -> controller -> service -> repository -> model/DB
```

Tiga aturan yang ditegakkan, dan masing-masing dapat diperiksa dengan satu grep:

| Aturan | Perintah pemeriksa | Nilai sekarang |
|---|---|---|
| `process.env` hanya di `config/` | `grep -rn "process.env" src \| grep -v src/config` | 3, seluruhnya di dalam komentar |
| Sequelize hanya di `repositories/` | `grep -rn "models\.\|sequelize\." src \| grep -vE "repositories\|database\|container"` | 0 |
| Tidak ada singleton diekspor | `grep -rnE "module.exports.*: new [A-Z]" src` | 0 |
| Tidak ada `console.*` | `grep -rnE "console\.(log\|error\|warn)" src` | 4: tiga pemanggilan (lihat di bawah) + satu komentar |
| Tidak ada `new AppError` langsung | `grep -rn "new AppError(" src \| grep -v utils/` | 0 |

Tiga `console.*` yang tersisa sengaja dibiarkan: dua di `config/index.js`
(logger sendiri dibangun dari konfigurasi yang barusan gagal divalidasi) dan
satu di `config/database.js` (dibaca `sequelize-cli` sebagai proses terpisah
yang tidak punya container, jadi tidak ada logger untuk disuntikkan).

**Dependency injection.** Seluruh kolaborator masuk lewat constructor, dan
satu-satunya tempat kata `new` dipanggil untuk merakitnya adalah
[src/container.js](src/container.js). Tidak ada satu pun berkas logika yang
tahu implementasi konkret kolaboratornya:

```js
// dipakai sehari-hari — dirakit container
new AuthService({ users, denylist, refreshTokens, tokens, ttlSeconds })

// dipakai di pengujian — objek palsu, tanpa satu pun layanan hidup
new AuthService({ users: palsu, denylist: palsu, tokens: testTokenService() })
```
| `process.env` hanya di `config/` | `grep -rn "process.env" src | grep -v src/config` | 3, seluruhnya di dalam komentar |
| Sequelize hanya di `repositories/` | `grep -rn "models.|sequelize." src | grep -vE "repositories|database|container"` | 0 |
`utils/duration.js` murni — tanpa dependensi, tanpa keadaan. Tidak ada yang
| Tidak ada `console.*` | `grep -rnE "console.(log|error|warn)" src` | 4: tiga pemanggilan (lihat di bawah) + satu komentar |
menambah `new` tanpa menambah kemampuan. Berkas route berupa pabrik yang
menerima container; berkas `constants/` murni data.

**Log dan penelusuran.** Setiap permintaan mendapat `requestId` — dari header
`x-request-id` klien bila ada, atau dibuat baru — yang dikembalikan lewat header
yang sama. Nilainya masuk ke setiap baris log sepanjang permintaan itu, termasuk
dari service dan repository beberapa lapis di bawah, lewat `AsyncLocalStorage`.
Jadi satu nilai yang disebutkan pengguna langsung menunjuk seluruh jejaknya:

```json
{"time":"...","level":"warn","msg":"permintaan perlu diperhatikan",
 "requestId":"a5b8ec13-...","component":"http","method":"POST",
 "path":"/api/v1/auth/login","status":401,"durationMs":422,"userId":null}
```

Sepuluh nama field sensitif diredaksi otomatis, rekursif — `password`, `token`,
`refreshToken`, `authorization`, dan seterusnya, termasuk yang bersarang di
dalam objek.

**Kode error.** Setiap jawaban gagal membawa `code` yang stabil di samping
`message` yang untuk manusia. Ini yang boleh diandalkan klien:

| Status | Kode | Artinya bagi klien |
|---|---|---|
| 401 | `TOKEN_EXPIRED` | perbarui token, lalu ulangi permintaannya |
| 401 | `TOKEN_REVOKED` | jangan diulangi, minta pengguna login |
| 401 | `PASSWORD_CHANGED` | sama, tetapi pesannya untuk pengguna berbeda |

Ketiganya 401. Tanpa kode, klien harus menebak dari teks pesan.

**Konfigurasi.** Seluruh nilai environment dibaca sekali di
[src/config/index.js](src/config/index.js), divalidasi skema Zod, lalu dipotong
menjadi irisan sempit. Kegagalan konfigurasi melaporkan SELURUH masalah
sekaligus lalu keluar dengan kode 1 — bukan berhenti di variabel pertama.
Lantai keamanan dipasang di skema: `BCRYPT_SALT_ROUNDS` minimal 10,
`PASSWORD_MIN_LENGTH` minimal 12, `JWT_SECRET` minimal 32 karakter. Boleh
diperketat, tidak boleh dilemahkan.

**Kontrak keluaran.** Jawaban API tidak pernah berisi objek model apa adanya.
Setiap field disebut satu per satu di [src/mappers/](src/mappers) — daftar
yang-diizinkan, bukan daftar yang-dilarang. Bedanya terasa saat ada kolom baru:
sebelumnya kolom itu ikut terkirim otomatis, sekarang ia tidak keluar sampai
seseorang menuliskannya. Penulisan pemetaan ini menemukan dua field yang
memang sudah terkirim tanpa pernah diputuskan: `avatarKey` (nama berkas
internal di object storage) dan `passwordChangedAt` pada daftar pengguna.

**Validasi masukan.** Lima belas skema Zod di `modules/*/*.schema.js`
memeriksa bentuk data sebelum permintaannya menyentuh controller. Semuanya
`.strict()`, jadi field yang tidak dikenal ditolak 400 — bukan diabaikan
diam-diam, yang membuat klien salah tulis nama field menerima 200 yang tidak
mengubah apa pun.

Aturan yang nilainya berasal dari config tetap tinggal di service. Panjang
minimal password contohnya: angkanya datang dari `PASSWORD_MIN_LENGTH`, jadi
memeriksanya di skema berarti menuliskan angka itu dua kali.

Hasil validasi ditaruh di `req.valid[source]`, tidak dituliskan kembali ke
`req.query`. Di Express 5 `req.query` hanya bisa dibaca: penulisannya tidak
menghasilkan error dan tidak berpengaruh, jadi nilai yang sudah dikonversi
tipenya akan hilang tanpa jejak.

**Jejak audit.** Empat belas jenis perubahan data tercatat di tabel
`audit_logs`, termasuk **percobaan yang ditolak**. Yang terakhir itu bagian
terpentingnya: sepuluh percobaan gagal terhadap akun superadmin adalah
keterangan yang jauh lebih berguna daripada satu perubahan yang berhasil, dan
jejak yang hanya menyimpan keberhasilan tidak memuatnya sama sekali.

Pelaku dan `requestId` dibaca dari `AsyncLocalStorage`, bukan diteruskan lewat
argumen — alternatifnya menambah dua parameter ke setiap method yang mengubah
data, dan satu titik yang lupa meneruskannya menghasilkan baris audit tanpa
pelaku yang tetap tersimpan seolah sah.

Nama field yang berubah dicatat, nilainya tidak: jejak audit tidak boleh
menjadi tempat kedua yang menyimpan data pribadi. Satu pengecualian yang
disengaja — perubahan role menyimpan yang lama dan yang baru, karena tanpa
keduanya pertanyaan "sejak kapan orang ini jadi administrator" tidak punya
jawaban.

Kegagalan menulis audit dicatat sebagai error tetapi tidak menggagalkan
operasinya. Keputusan yang bisa diperdebatkan, jadi diuji secara eksplisit di
`tests/unit/audit.service.test.js`.

**Idempotensi.** `POST /users` dan `POST /roles` menerima header opsional
`Idempotency-Key`. Yang dipecahkan bukan data ganda — `email` dan `name` sudah
unik — melainkan bentuk jawaban pada percobaan ulang:

| Percobaan | Tanpa header | Dengan header |
|---|---|---|
| Pertama | `201` | `201` |
| Ulangan, jawaban pertama hilang | `409`, tampak gagal | `201` yang asli + `Idempotent-Replay: true` |
| Ulangan tiba saat yang pertama masih berjalan | dua operasi tulis bersamaan | `409` |
| Gagal, diperbaiki, lalu diulang | diproses ulang | diproses ulang |

Pemesanan kuncinya memakai `SET NX` Redis, bukan `GET` lalu `SET`: dua
permintaan yang datang bersamaan sama-sama melihat "belum ada" pada pola
kedua, dan keduanya lanjut diproses. Cakupan kunci menyertakan id pengguna,
metode, dan alamat endpoint — tanpa itu dua klien yang kebetulan memakai
penanda sama akan saling menerima jawaban milik orang lain. Hanya jawaban 2xx
yang disimpan; kunci yang permintaannya gagal dilepas kembali.

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
