# Panduan Deploy RISALATREN ke Hostinger

## Informasi Server
- **Domain:** https://risalatren.fppkotabandung.or.id
- **Database:** u217293837_risalatrendb
- **DB User:** u217293837_risalatrenuser
- **Node.js:** pastikan versi ≥ 18

---

## Langkah 1 — Build Frontend (di komputer lokal)

```cmd
cd frontend
npm install
npm run build
```
Output build otomatis masuk ke `backend/public/`. Commit hasilnya ke GitHub.

---

## Langkah 2 — Import Database via phpMyAdmin

1. Login ke **hPanel Hostinger** → **Databases → MySQL Databases**
2. Buka **phpMyAdmin** untuk database `u217293837_risalatrendb`
3. Klik tab **Import**
4. Pilih file **`risalatren_production.sql`** dari folder ini
5. Klik **Go / Kirim**

Ini akan membuat semua tabel dan akun admin awal:
- Email: `admin@risalatren.com`
- Password: `admin123` (**wajib diganti setelah login pertama**)

---

## Langkah 3 — Upload & Konfigurasi via GitHub

### 3a. Push ke GitHub
```cmd
git add .
git commit -m "Production build"
git push origin main
```

### 3b. Di Hostinger hPanel → Git
1. Hubungkan repository GitHub Anda
2. Set **branch** ke `main`
3. Set **deployment path** ke folder backend (misal `public_html/backend/` atau sesuai konfigurasi Hostinger)

---

## Langkah 4 — Setup di Server (SSH atau File Manager)

### Rename file env:
Di server, dalam folder backend, rename atau copy:
```
.env.production  →  .env
```

### Install Dependencies:
Buka **Terminal SSH** Hostinger dan jalankan dari folder backend:
```bash
npm install --omit=dev
```

---

## Langkah 5 — Konfigurasi Node.js di Hostinger

1. hPanel → **Node.js** → **Create Application**
2. Isi:
   - **Node.js version:** 18.x atau 20.x
   - **Application root:** folder backend (misal `backend/`)
   - **Application URL:** risalatren.fppkotabandung.or.id
   - **Application startup file:** `src/server.js`
3. Klik **Create**

---

## Langkah 6 — Verifikasi

Cek health endpoint:
```
https://risalatren.fppkotabandung.or.id/api/health
```

Response yang diharapkan:
```json
{"success": true, "message": "RISALATREN berjalan dengan baik", "version": "1.0.0"}
```

---

## Akun Default Setelah Import

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@risalatren.com | admin123 |

> ⚠️ **Segera ganti password setelah login pertama!**
> Menu: Edit Profil → Ubah Password

---

## Struktur Folder Upload

Buat folder ini di server jika belum ada:
```
backend/uploads/
├── logos/        ← Logo organisasi
├── qrcodes/      ← QR Code surat
├── surat-masuk/  ← Lampiran surat masuk
├── foto-profil/  ← Foto profil user
└── pdf/          ← PDF sementara (auto-cleanup)
```

Perintah SSH:
```bash
mkdir -p uploads/logos uploads/qrcodes uploads/surat-masuk uploads/foto-profil uploads/pdf
```

---

## Catatan Penting

- File `risalatren_production.sql` berisi skema tabel + data awal
- Tidak perlu jalankan `prisma migrate deploy` di server — SQL sudah lengkap
- Folder `backend/public/` berisi build frontend — pastikan sudah di-build sebelum push
- VAPID keys di `.env.production` bisa di-generate ulang jika perlu:
  ```bash
  npx web-push generate-vapid-keys
  ```
- `uploads/` jangan di-commit ke Git — tambahkan ke `.gitignore`
