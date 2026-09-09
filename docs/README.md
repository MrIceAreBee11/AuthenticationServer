# Dokumentasi

| Berkas                      | Isi                                                |
| --------------------------- | -------------------------------------------------- |
| `Laporan-Auth-Service.docx` | Laporan teknis lengkap, Bab 1–15 dan tiga lampiran |
| `Brief-PPT.md`              | Bahan penyusunan deck presentasi, 15 slide         |

## Membuat Ulang Laporan

Isi laporan ditulis sebagai kode di `isi-bagian-1.js` (Bab 1–5) dan `isi-bagian-2.js` (Bab 6–15
dan lampiran). Berkas `generate-laporan.js` mengurus tata letak, gaya, dan halaman judul.

Sunting berkas `isi-bagian-*.js`, lalu jalankan:

```bash
npm install --no-save docx
node docs/generate-laporan.js
```

Paket `docx` sengaja tidak dimasukkan ke `package.json` karena hanya dipakai oleh generator
dokumen, bukan oleh aplikasi. Opsi `--no-save` memasangnya sementara tanpa mengubah daftar
dependensi project.

Berkas PDF tidak disertakan di repositori karena berukuran besar dan dapat dibuat ulang dari
`.docx` menggunakan Word atau LibreOffice.
