const prisma = require('../config/prisma');
const { generateSuratPDF } = require('../utils/pdfGenerator');
const fs = require('fs');

// Verifikasi surat berdasarkan token QR Code (publik, tidak perlu auth)
const verifySurat = async (req, res) => {
  try {
    const { token } = req.params;

    const surat = await prisma.suratKeluar.findUnique({
      where: { qrCodeToken: token },
      include: {
        pembuat: { select: { namaLengkap: true, jabatan: true } },
        tataUsaha: { select: { namaLengkap: true, jabatan: true } },
        kepala: { select: { namaLengkap: true, jabatan: true } },
        penerimaInternal: {
          include: {
            user: { select: { namaLengkap: true, jabatan: true } }
          }
        }
      }
    });

    if (!surat) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Dokumen tidak ditemukan atau token tidak valid'
      });
    }

    if (surat.status !== 'SELESAI') {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Dokumen belum selesai ditandatangani'
      });
    }

    const organisasi = await prisma.organisasiProfil.findFirst();

    res.json({
      success: true,
      valid: true,
      message: 'Dokumen valid dan telah ditandatangani secara elektronik',
      data: {
        nomorSurat: surat.nomorSurat,
        perihal: surat.perihal,
        tanggalMasehi: surat.tanggalMasehi,
        tanggalHijriyah: surat.tanggalHijriyah,
        penandatangan: {
          sekretaris: surat.tataUsaha ? {
            nama: surat.tataUsaha.namaLengkap,
            jabatan: surat.tataUsaha.jabatan,
            tanggalParaf: surat.tglParafTataUsaha,
          } : null,
          kepala: surat.kepala ? {
            nama: surat.kepala.namaLengkap,
            jabatan: surat.kepala.jabatan,
            tanggalTtd: surat.tglTtdKepala,
          } : null,
        },
        organisasi: {
          tingkatan: organisasi?.tingkatanOrg || '',
          nama: organisasi?.namaOrg || 'Forum Pondok Pesantren (FPP) Kota Bandung',
          daerah: organisasi?.daerahOrg || '',
          alamat: organisasi?.alamat || '',
          logoPath: organisasi?.logoPath || null,
        },
        dibuatOleh: surat.pembuat.namaLengkap,
        tanggalSelesai: surat.tglTtdKepala || surat.tglParafTataUsaha,
      }
    });
  } catch (error) {
    console.error('Verifikasi error:', error);
    res.status(500).json({
      success: false,
      valid: false,
      message: 'Terjadi kesalahan saat verifikasi'
    });
  }
};

// Preview PDF publik berdasarkan token QR (tanpa auth)
const previewPDFPublik = async (req, res) => {
  try {
    const { token } = req.params;

    const surat = await prisma.suratKeluar.findUnique({
      where: { qrCodeToken: token },
      include: {
        pembuat:        { select: { namaLengkap: true, jabatan: true } },
        tataUsaha:      { select: { namaLengkap: true, jabatan: true } },
        kepala:         { select: { namaLengkap: true, jabatan: true } },
        penerimaInternal: {
          include: { user: { select: { namaLengkap: true, jabatan: true } } }
        },
      },
    });

    if (!surat || surat.status !== 'SELESAI') {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan' });
    }

    const organisasi = await prisma.organisasiProfil.findFirst();
    const { filepath } = await generateSuratPDF(surat, organisasi || {});

    const safeNomor = (surat.nomorSurat || surat.id).replace(/\//g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Surat-${safeNomor}.pdf"`);

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
    stream.on('end', () => { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); });
    stream.on('error', () => {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Gagal membaca PDF' });
    });
  } catch (error) {
    console.error('Preview PDF publik error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat generate PDF' });
  }
};

module.exports = { verifySurat, previewPDFPublik };
