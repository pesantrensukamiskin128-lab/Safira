const QRCode = require('qrcode');
const Jimp   = require('jimp');
const path   = require('path');
const fs     = require('fs');
const prisma = require('../config/prisma');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// URL frontend — selalu gunakan production URL jika bukan development lokal
function getFrontendUrl() {
  const envUrl = process.env.FRONTEND_URL || '';
  // Jika env kosong atau masih localhost, paksa pakai URL production
  if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
    return 'https://risalatren.fppkotabandung.or.id';
  }
  return envUrl;
}
function resolveLogoPath(logoPathFromDB) {
  if (!logoPathFromDB) return null;
  const BASE_UPLOAD = process.env.UPLOAD_DIR
    ? (process.env.UPLOAD_DIR.startsWith('/') ? process.env.UPLOAD_DIR : path.join(__dirname, '../../', process.env.UPLOAD_DIR))
    : path.join(__dirname, '../../uploads');
  const lp = logoPathFromDB.trim();
  if (path.isAbsolute(lp))        return lp;
  if (lp.startsWith('/uploads/')) return path.join(BASE_UPLOAD, lp.replace(/^\/uploads\//, ''));
  if (lp.startsWith('uploads/'))  return path.join(__dirname, '../../', lp);
  return path.join(BASE_UPLOAD, lp);
}

/**
 * Overlay logo di tengah QR code dengan background lingkaran putih + border hijau.
 * @param {Buffer} qrBuffer   - Buffer PNG hasil QRCode
 * @param {string} logoPath   - Absolute path ke file logo
 * @param {number} qrSize     - Ukuran QR (px)
 * @returns {Promise<Buffer>} - Buffer PNG hasil composite
 */
async function overlayLogo(qrBuffer, logoPath, qrSize) {
  const [qrImg, logoRaw] = await Promise.all([
    Jimp.read(qrBuffer),
    Jimp.read(logoPath),
  ]);

  // Logo maksimal 20% dari ukuran QR (aman untuk error correction H)
  const logoMaxPx = Math.floor(qrSize * 0.20);
  logoRaw.resize(logoMaxPx, Jimp.AUTO);

  const logoW = logoRaw.getWidth();
  const logoH = logoRaw.getHeight();

  // Radius lingkaran = setengah diagonal logo + padding
  const pad    = Math.floor(qrSize * 0.03);   // ~3% QR size
  const border = Math.max(2, Math.floor(qrSize * 0.008)); // tebal border ~0.8%
  const radius = Math.floor(Math.sqrt(logoW * logoW + logoH * logoH) / 2) + pad;
  const sz     = radius * 2; // ukuran canvas lingkaran

  // ── Buat canvas lingkaran putih + border hijau ──
  const circle = new Jimp(sz, sz, 0x00000000); // transparan

  const cx = sz / 2;
  const cy = sz / 2;

  circle.scan(0, 0, sz, sz, function (px, py, idx) {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius - border) {
      // Area putih (dalam lingkaran, di luar border)
      this.bitmap.data[idx]     = 255; // R
      this.bitmap.data[idx + 1] = 255; // G
      this.bitmap.data[idx + 2] = 255; // B
      this.bitmap.data[idx + 3] = 255; // A
    } else if (dist <= radius) {
      // Border hijau senada QR (#166534)
      this.bitmap.data[idx]     = 22;  // R
      this.bitmap.data[idx + 1] = 101; // G
      this.bitmap.data[idx + 2] = 52;  // B
      this.bitmap.data[idx + 3] = 255; // A
    }
    // else: di luar radius → tetap transparan
  });

  // ── Tempel logo di tengah lingkaran ──
  const logoX = Math.floor((sz - logoW) / 2);
  const logoY = Math.floor((sz - logoH) / 2);
  circle.composite(logoRaw, logoX, logoY);

  // ── Tempel lingkaran ke QR di posisi tengah ──
  const qrX = Math.floor((qrSize - sz) / 2);
  const qrY = Math.floor((qrSize - sz) / 2);
  qrImg.composite(circle, qrX, qrY);

  return qrImg.getBufferAsync(Jimp.MIME_PNG);
}

/**
 * Ambil logo organisasi dari DB (cached ringan via module scope)
 */
let _cachedLogoPath = undefined; // undefined = belum dicek, null = tidak ada logo

async function getOrgLogoPath() {
  if (_cachedLogoPath !== undefined) return _cachedLogoPath;
  try {
    const org = await prisma.organisasiProfil.findFirst({ select: { logoPath: true } });
    const resolved = org?.logoPath ? resolveLogoPath(org.logoPath) : null;
    _cachedLogoPath = (resolved && fs.existsSync(resolved)) ? resolved : null;
  } catch (_) {
    _cachedLogoPath = null;
  }
  return _cachedLogoPath;
}

// Reset cache saat logo diupdate (dipanggil dari organisasi controller jika perlu)
function resetLogoCache() {
  _cachedLogoPath = undefined;
}

/**
 * Generate QR Code untuk surat (disimpan ke file PNG)
 * @param {string} token  - Token unik surat
 * @param {string} suratId - ID surat
 * @returns {Promise<string>} - Path relatif file QR Code
 */
async function generateQRCode(token, suratId) {
  const BASE_UPLOAD = process.env.UPLOAD_DIR
    ? (process.env.UPLOAD_DIR.startsWith('/') ? process.env.UPLOAD_DIR : path.join(__dirname, '../../', process.env.UPLOAD_DIR))
    : path.join(__dirname, '../../uploads');
  const qrDir = path.join(BASE_UPLOAD, 'qrcodes');
  ensureDir(qrDir);

  const frontendUrl    = getFrontendUrl();
  const verifikasiUrl  = `${frontendUrl}/verifikasi/${token}`;
  const qrSize         = 400; // lebih besar agar logo tetap proporsional

  // Generate QR sebagai buffer PNG
  const qrBuffer = await QRCode.toBuffer(verifikasiUrl, {
    color: { dark: '#166534', light: '#FFFFFF' },
    width: qrSize,
    margin: 2,
    errorCorrectionLevel: 'H',
  });

  // Overlay logo jika tersedia
  const logoPath = await getOrgLogoPath();
  let finalBuffer = qrBuffer;
  if (logoPath) {
    try {
      finalBuffer = await overlayLogo(qrBuffer, logoPath, qrSize);
    } catch (err) {
      console.warn('⚠️ Gagal overlay logo pada QR Code:', err.message);
      finalBuffer = qrBuffer; // fallback tanpa logo
    }
  }

  const filename = `qr-${suratId}.png`;
  const filepath = path.join(qrDir, filename);
  fs.writeFileSync(filepath, finalBuffer);

  return `/uploads/qrcodes/${filename}`;
}

/**
 * Generate QR Code sebagai Data URL (base64) — untuk embed di PDF (tanda tangan).
 * Tidak menggunakan logo agar QR lebih mudah terbaca saat dicetak.
 */
async function generateQRCodeDataURL(token) {
  const frontendUrl   = getFrontendUrl();
  const verifikasiUrl = `${frontendUrl}/verifikasi/${token}`;
  const qrSize        = 300;

  const qrBuffer = await QRCode.toBuffer(verifikasiUrl, {
    color: { dark: '#166534', light: '#FFFFFF' },
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'H',
  });

  // Tidak overlay logo — QR pada tanda tangan dibiarkan bersih
  return `data:image/png;base64,${qrBuffer.toString('base64')}`;
}

/**
 * Generate QR Code sebagai Data URL (base64) dengan overlay logo — untuk footer verifikasi di PDF.
 */
async function generateQRCodeDataURLWithLogo(token) {
  const frontendUrl   = getFrontendUrl();
  const verifikasiUrl = `${frontendUrl}/verifikasi/${token}`;
  const qrSize        = 300;

  const qrBuffer = await QRCode.toBuffer(verifikasiUrl, {
    color: { dark: '#166534', light: '#FFFFFF' },
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'H',
  });

  const logoPath = await getOrgLogoPath();
  let finalBuffer = qrBuffer;
  if (logoPath) {
    try {
      finalBuffer = await overlayLogo(qrBuffer, logoPath, qrSize);
    } catch (err) {
      console.warn('⚠️ Gagal overlay logo pada QR Code footer:', err.message);
      finalBuffer = qrBuffer;
    }
  }

  return `data:image/png;base64,${finalBuffer.toString('base64')}`;
}

module.exports = { generateQRCode, generateQRCodeDataURL, generateQRCodeDataURLWithLogo, resetLogoCache, getFrontendUrl };
