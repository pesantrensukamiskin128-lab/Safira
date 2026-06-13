# Panduan Setup RISALATREN

## Prasyarat

- Node.js v18+
- MySQL / MariaDB
- npm atau yarn

---

## 1. Setup Database MySQL

Buat database baru:
```sql
CREATE DATABASE risalatren_db;
```

---

## 2. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Salin dan sesuaikan file .env
cp .env.example .env
# Edit DATABASE_URL sesuai konfigurasi MySQL Anda
# Format: mysql://USER:PASSWORD@HOST:3306/risalatren_db

# Generate Prisma client
npx prisma generate

# Jalankan migrasi database
npx prisma migrate deploy

# Seed data awal (admin default + contoh user)
node prisma/seed.js

# Jalankan server development
npm run dev
```

Backend akan berjalan di: **http://localhost:5000**

---

## 3. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Jalankan development server
npm run dev
```

Frontend akan berjalan di: **http://localhost:5173**

---

## 4. Akun Default

Setelah seed, akun berikut tersedia:

| Email | Password | Role |
|-------|----------|------|
| admin@risalatren.com | admin123 | Admin |
| sekretaris@risalatren.com | password123 | Sekretaris |
| kepala@risalatren.com | password123 | Kepala |
| guru1@risalatren.com | password123 | Guru |
| guru2@risalatren.com | password123 | Guru |

> ⚠️ **Segera ubah password setelah login pertama!**

---

## 5. Konfigurasi .env Backend

```env
DATABASE_URL="mysql://root:password@localhost:3306/risalatren_db"
JWT_SECRET="ganti-dengan-string-acak-yang-panjang"
JWT_EXPIRES_IN="7d"
PORT=5000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

---

## 6. Alur Kerja Surat Keluar

1. **Admin** login → Buat Surat Keluar → Pilih penandatangan → Kirim ke Sekretaris
2. **Sekretaris** login → Lihat surat masuk → Paraf atau Tolak (dengan catatan)
3. Jika ditolak → Surat kembali ke Admin sebagai Draft → Admin edit & kirim ulang
4. **Kepala** login → Lihat surat → Tandatangani (verifikasi akhir)
5. Surat **SELESAI** → QR Code digenerate → Dapat didownload PDF → Dikirim ke penerima

---

## 7. Struktur Folder Upload

```
backend/uploads/
├── logos/          # Logo organisasi
├── qrcodes/        # QR Code surat
├── surat-masuk/    # File lampiran surat masuk
└── pdf/            # PDF surat (temporary)
```

---

## 8. Build untuk Production

### Frontend
```bash
cd frontend
npm run build
# Output otomatis masuk ke backend/public/
```

### Backend (production)
```bash
cd backend
NODE_ENV=production npm start
```
