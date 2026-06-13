# RISALATREN - Repositori Informasi Surat dan Administrasi Pondok Pesantren

Aplikasi manajemen surat digital untuk Forum Pondok Pesantren (FPP) Kota Bandung, dengan fitur tanda tangan elektronik berjenjang, arsip surat masuk/keluar, dan verifikasi QR Code.

## 🚀 Fitur Utama

### 1. Manajemen Peran (Role-Based Access Control)
- **Admin**: Mengelola sistem, membuat draft surat, manajemen user
- **Sekretaris**: Tanda tangan tahap pertama (paraf)
- **Kepala**: Verifikasi akhir dan tanda tangan utama
- **Guru**: Menerima dan melihat surat

### 2. Persuratan Digital
- Pembuatan surat keluar dengan text editor lengkap (support Arabic & tabel)
- Alur penandatanganan berjenjang (Sekretaris → Ketua)
- Fitur tolak surat dengan catatan perbaikan
- Simpan sebagai draft, edit, dan hapus surat
- Pengiriman surat internal ke user lain
- Lampiran surat dengan text editor
- Penanggalan Masehi dan Hijriyah
- QR Code verifikasi untuk setiap surat

### 3. Surat Masuk & Disposisi
- Administrasi surat masuk eksternal
- Sistem disposisi dengan pemilihan penerima
- Hanya penerima disposisi yang dapat melihat surat

### 4. Profil Organisasi Dinamis
- Pengaturan nama organisasi, alamat, kontak
- Upload logo organisasi
- Kop surat dinamis mengikuti profil organisasi

### 5. Verifikasi Publik
- Halaman verifikasi publik untuk scan QR Code
- Validasi keaslian dokumen secara real-time

### 6. Export & Cetak
- Download surat sebagai PDF
- Format dokumen resmi dengan QR Code
- Footer verifikasi elektronik

## 🛠️ Teknologi

### Backend
- Node.js + Express.js
- MySQL / MariaDB (Database)
- Prisma ORM
- JWT Authentication
- QRCode Generator
- PDFKit untuk generate PDF

### Frontend
- React 18 + Vite
- TailwindCSS (styling)
- Framer Motion (animasi)
- React Query (state management)
- React Router (routing)
- TipTap (rich text editor dengan support Arabic)
- Axios (HTTP client)

## 📁 Struktur Proyek

```
RISALATREN/
├── backend/                 # Backend API
│   ├── prisma/             # Database schema & migrations
│   ├── src/
│   │   ├── config/         # Konfigurasi
│   │   ├── controllers/    # Controllers
│   │   ├── middleware/     # Middleware (auth, validation)
│   │   ├── routes/         # API routes
│   │   ├── utils/          # Utilities (QR, PDF, etc)
│   │   └── server.js       # Entry point
│   └── package.json
│
├── frontend/               # Frontend React
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── utils/         # Utilities
│   │   ├── store/         # Zustand stores
│   │   └── App.jsx        # Main app
│   └── package.json
│
└── README.md
```

## 🚦 Cara Menjalankan

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Sesuaikan DATABASE_URL di .env
npx prisma migrate deploy
npx prisma generate
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🔐 Default Admin Account
Setelah seed database, akun admin default akan dibuat:
- Email: admin@risalatren.com
- Password: admin123

**⚠️ Segera ubah password setelah login pertama!**

## 📝 Alur Kerja Surat

1. **Admin** membuat draft surat
2. **Admin** memilih penandatangan (Sekretaris & Ketua)
3. **Sekretaris** menandatangani atau menolak dengan catatan
4. **Kepala** melakukan verifikasi akhir dan tanda tangan
5. Surat selesai → Generate QR Code → Dapat dikirim/didownload
6. Penerima dapat melihat surat yang ditujukan kepada mereka

## 🎨 Desain
- Tema warna: Hijau profesional
- Responsif (Mobile & Desktop)
- Animasi smooth dengan Framer Motion
- UI/UX modern dan bersih

## 📄 Lisensi
Proprietary - RISALATREN © 2026 — Forum Pondok Pesantren (FPP) Kota Bandung
