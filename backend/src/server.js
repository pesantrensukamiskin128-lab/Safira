require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { autoMigrate, runSeed } = require('./utils/autoMigrate');

const app = express();

// Trust reverse proxy (Hostinger)
app.set('trust proxy', 1);

// Security middleware
// Content-Security-Policy dilonggarkan agar frontend React bisa load assets
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: false, // dihandle oleh Vite build
}));

// Rate limiting hanya untuk API
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Terlalu banyak permintaan, coba lagi nanti.' }
});
app.use('/api/', limiter);

// CORS tidak diperlukan lagi (monolitik, satu domain)
// Tetap aktifkan untuk development lokal
if (process.env.NODE_ENV === 'development') {
  const cors = require('cors');
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static files untuk uploads
const uploadsDir = process.env.UPLOAD_DIR
  ? (process.env.UPLOAD_DIR.startsWith('/') ? process.env.UPLOAD_DIR : path.join(__dirname, '../', process.env.UPLOAD_DIR))
  : path.join(__dirname, '../uploads');
console.log('📁 Serving uploads from:', uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/surat-keluar', require('./routes/suratKeluar.routes'));
app.use('/api/surat-masuk', require('./routes/suratMasuk.routes'));
app.use('/api/disposisi', require('./routes/disposisi.routes'));
app.use('/api/organisasi', require('./routes/organisasi.routes'));
app.use('/api/verifikasi', require('./routes/verifikasi.routes'));
app.use('/api/rekap', require('./routes/rekap.routes'));
app.use('/api/push', require('./routes/push.routes'));
app.use('/api/notifikasi', require('./routes/notifikasi.routes'));
app.use('/api/agenda', require('./routes/agenda.routes'));
app.use('/api/template-surat', require('./routes/template.routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'RISALATREN berjalan dengan baik',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Endpoint debug DB — hapus setelah masalah teratasi
app.get('/api/setup/db-check', async (req, res) => {
  const secret = req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  const prisma = require('./config/prisma');
  try {
    const result = await prisma.$queryRaw`SELECT 1 as ping`;
    const tables = await prisma.$queryRaw`SHOW TABLES`;
    const userCount = await prisma.user.count();
    const orgCount  = await prisma.organisasiProfil.count();
    res.json({
      success: true,
      ping: result,
      tables: tables.map(t => Object.values(t)[0]),
      userCount,
      orgCount,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
      code: err.code,
      meta: err.meta,
    });
  }
});

// Endpoint debug kolom tabel
app.get('/api/setup/columns-check', async (req, res) => {
  const secret = req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  const table = req.query.table || 'agenda';
  try {
    const mysql = require('mysql2/promise');
    function parseDbUrl(url) {
      const u = new URL(url);
      return { host: u.hostname === 'localhost' ? '127.0.0.1' : u.hostname, port: parseInt(u.port)||3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//,'') };
    }
    const cfg = parseDbUrl(process.env.DATABASE_URL);
    const conn = await mysql.createConnection(cfg);
    const [cols] = await conn.execute(`SHOW COLUMNS FROM \`${table}\``);
    const [rows] = await conn.execute(`SELECT * FROM \`${table}\` LIMIT 3`);
    // Test prisma client juga
    const prismaClient = require('./config/prisma');
    // Map table name ke model name
    const tableToModel = {
      'agenda': 'agenda', 'disposisi': 'disposisi', 'kehadiran': 'kehadiran',
      'notifikasi': 'notifikasi', 'organisasiprofil': 'organisasiProfil',
      'penerimainternal': 'penerimaInternal', 'pesertaagenda': 'pesertaAgenda',
      'pushsubscription': 'pushSubscription', 'suratkeluar': 'suratKeluar',
      'suratmasuk': 'suratMasuk', 'templatesurat': 'templateSurat', 'user': 'user',
    };
    const modelName = tableToModel[table] || table;
    let prismaRow = null;
    try {
      prismaRow = prismaClient[modelName] ? await prismaClient[modelName].findFirst() : null;
    } catch(e) { prismaRow = { error: e.message }; }
    await conn.end();
    res.json({
      success: true,
      columns: cols.map(c => c.Field),
      // Nilai raw dari mysql2 langsung
      rawData: rows.map(r => {
        const out = {};
        for (const [k, v] of Object.entries(r)) out[k] = (v === null ? null : String(v).substring(0, 40));
        return out;
      }),
      // Nilai dari prisma wrapper
      prismaData: prismaRow ? Object.fromEntries(
        Object.entries(prismaRow).map(([k, v]) => [k, v === null ? null : String(v).substring(0, 40)])
      ) : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Fix qrToken kosong pada agenda + qrCodeToken pada surat
app.post('/api/setup/fix-qrtoken', async (req, res) => {
  const secret = req.headers['x-setup-secret'] || req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  try {
    const mysql2 = require('mysql2/promise');
    const { v4: uuidv4 } = require('uuid');
    function parseDbUrl(url) {
      const u = new URL(url);
      return { host: u.hostname === 'localhost' ? '127.0.0.1' : u.hostname, port: parseInt(u.port)||3306, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//,'') };
    }
    const conn = await mysql2.createConnection(parseDbUrl(process.env.DATABASE_URL));

    // Fix agenda: qrToken kosong
    const [agendas] = await conn.execute("SELECT id FROM `agenda` WHERE `qrToken` = '' OR `qrToken` IS NULL");
    let fixedAgenda = 0;
    for (const a of agendas) {
      await conn.execute("UPDATE `agenda` SET `qrToken` = ? WHERE `id` = ?", [uuidv4(), a.id]);
      fixedAgenda++;
    }

    // Fix suratkeluar: qrCodeToken kosong pada surat SELESAI
    const [surats] = await conn.execute("SELECT id FROM `suratkeluar` WHERE status = 'SELESAI' AND (`qrCodeToken` = '' OR `qrCodeToken` IS NULL)");
    let fixedSurat = 0;
    for (const s of surats) {
      await conn.execute("UPDATE `suratkeluar` SET `qrCodeToken` = ? WHERE `id` = ?", [uuidv4(), s.id]);
      fixedSurat++;
    }

    await conn.end();
    res.json({ success: true, message: `Fixed: ${fixedAgenda} agenda qrToken, ${fixedSurat} surat qrCodeToken` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint debug path logo — hapus setelah masalah teratasi
app.get('/api/setup/logo-check', async (req, res) => {
  const secret = req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  const prisma = require('./config/prisma');
  const fs = require('fs');
  const path = require('path');
  try {
    const profil = await prisma.organisasiProfil.findFirst();
    const logoPath = profil?.logoPath;
    const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
    const BASE_UPLOAD = UPLOAD_DIR.startsWith('/')
      ? UPLOAD_DIR
      : path.join(__dirname, '../', UPLOAD_DIR);

    // Coba berbagai kemungkinan path
    const candidates = logoPath ? [
      path.join(BASE_UPLOAD, logoPath.replace(/^\/uploads/, '')),
      path.join(__dirname, '../uploads', logoPath.replace(/^\/uploads\//, '')),
      path.join(__dirname, '../../uploads', logoPath.replace(/^\/uploads\//, '')),
      logoPath,
    ] : [];

    const results = candidates.map(p => ({ path: p, exists: fs.existsSync(p) }));

    res.json({
      logoPathDB: logoPath,
      UPLOAD_DIR: process.env.UPLOAD_DIR,
      BASE_UPLOAD,
      __dirname,
      candidates: results,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post('/api/setup/seed', async (req, res) => {
  const secret = req.headers['x-setup-secret'];
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  try {
    await runSeed();
    res.json({ success: true, message: 'Seed database berhasil dijalankan' });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint trigger migration manual (untuk deploy tanpa restart)
app.post('/api/setup/migrate', async (req, res) => {
  const secret = req.headers['x-setup-secret'] || req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  try {
    const { execSync } = require('child_process');
    const rootDir = path.join(__dirname, '../');
    const output = execSync('node node_modules/prisma/build/index.js migrate deploy', {
      cwd: rootDir,
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 60000,
    });
    res.json({ success: true, message: 'Migrasi selesai', output: output.toString() });
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    console.error('Migration error:', err.message, stderr);
    res.status(500).json({ success: false, message: err.message, stderr, stdout });
  }
});

// Endpoint regenerate semua QR Code surat SELESAI (fix URL salah)
app.post('/api/setup/regenerate-qr', async (req, res) => {
  const secret = req.headers['x-setup-secret'] || req.query.secret;
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  try {
    const prisma = require('./config/prisma');
    const { generateQRCode } = require('./utils/qrcode');
    const suratList = await prisma.suratKeluar.findMany({
      where: { status: 'SELESAI', qrCodeToken: { not: null } },
      select: { id: true, qrCodeToken: true },
    });
    let ok = 0, fail = 0;
    for (const surat of suratList) {
      try {
        const qrPath = await generateQRCode(surat.qrCodeToken, surat.id);
        await prisma.suratKeluar.update({ where: { id: surat.id }, data: { qrCodePath: qrPath } });
        ok++;
      } catch (e) {
        console.error(`QR regenerate gagal untuk surat ${surat.id}:`, e.message);
        fail++;
      }
    }
    res.json({ success: true, message: `Regenerasi selesai: ${ok} berhasil, ${fail} gagal`, total: suratList.length, ok, fail });
  } catch (err) {
    console.error('Regenerate QR error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Serve frontend React (production)
// Harus setelah semua route /api agar tidak tertimpa
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Semua route non-API dikembalikan ke index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal server',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  autoMigrate().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 RISALATREN berjalan di port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 App URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    });
  });
} else {
  app.listen(PORT, () => {
    console.log(`🚀 RISALATREN berjalan di port ${PORT}`);
  });
}

module.exports = app;
