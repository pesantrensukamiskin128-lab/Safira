const path = require('path');

/**
 * Jalankan prisma migrate deploy secara otomatis saat server start.
 * Menggunakan @prisma/migrate API langsung tanpa spawn child process.
 */
async function autoMigrate() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('⏭️  Auto-migrate dilewati (bukan production)');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL tidak ditemukan, auto-migrate dilewati');
    return;
  }

  try {
    console.log('🔄 Menjalankan prisma migrate deploy...');
    const { execSync } = require('child_process');
    const rootDir = path.join(__dirname, '../../');

    execSync('node node_modules/prisma/build/index.js migrate deploy', {
      cwd: rootDir,
      stdio: 'pipe',
      env: { ...process.env },
      timeout: 60000,
    });

    console.log('✅ Migrasi database selesai');
  } catch (err) {
    // Tampilkan output error yang lebih detail
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    console.error('❌ Migrasi gagal:', err.message);
    if (stderr) console.error('stderr:', stderr);
    if (stdout) console.error('stdout:', stdout);
  }
}

/**
 * Jalankan seed database.
 * Dipanggil via endpoint /api/setup/seed (dilindungi SETUP_SECRET).
 */
async function runSeed() {
  const seedPath = path.join(__dirname, '../../prisma/seed.js');
  delete require.cache[require.resolve(seedPath)];
  // seed.js memanggil main() sendiri, kita tunggu sampai selesai
  await new Promise((resolve, reject) => {
    const originalExit = process.exit;
    // Override process.exit sementara agar seed tidak matikan server
    process.exit = (code) => {
      process.exit = originalExit;
      if (code && code !== 0) {
        reject(new Error(`Seed exited with code ${code}`));
      } else {
        resolve();
      }
    };
    try {
      require(seedPath);
      // Tunggu sebentar agar async seed selesai
      setTimeout(() => {
        process.exit = originalExit;
        resolve();
      }, 5000);
    } catch (err) {
      process.exit = originalExit;
      reject(err);
    }
  });
}

module.exports = { autoMigrate, runSeed };
