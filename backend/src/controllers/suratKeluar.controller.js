const prisma = require('../config/prisma');
const { v4: uuidv4 } = require('uuid');
const { generateQRCode } = require('../utils/qrcode');
const { generateNomorSurat } = require('../utils/nomorSurat');
const { toHijriyah } = require('../utils/hijriyah');
const { generateSuratPDF } = require('../utils/pdfGenerator');
const { createNotifikasi } = require('../utils/notifikasi');
const path = require('path');
const fs = require('fs');

const suratInclude = {
  pembuat:        { select: { id: true, namaLengkap: true, jabatan: true, role: true } },
  tataUsaha:      { select: { id: true, namaLengkap: true, jabatan: true, nuptk: true } },
  kepala:         { select: { id: true, namaLengkap: true, jabatan: true, nuptk: true } },
  penerimaInternal: {
    include: { user: { select: { id: true, namaLengkap: true, jabatan: true, role: true } } }
  },
};

// ── GET ALL ──────────────────────────────────────────────────────────────────
const getAllSurat = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let where = {};

    if (req.user.role === 'SEKRETARIS') {
      where.tataUsahaId = req.user.id;
    } else if (req.user.role === 'KEPALA') {
      where.kepalaId = req.user.id;
    } else if (req.user.role === 'PENGURUS') {
      where.penerimaInternal = { some: { userId: req.user.id } };
      where.status = 'SELESAI';
    }

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { perihal:    { contains: search } },
        { nomorSurat: { contains: search } },
      ];
    }

    const [surat, total] = await Promise.all([
      prisma.suratKeluar.findMany({ where, include: suratInclude, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
      prisma.suratKeluar.count({ where }),
    ]);

    res.json({ success: true, data: surat, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── GET BY ID ────────────────────────────────────────────────────────────────
const getSuratById = async (req, res) => {
  try {
    const surat = await prisma.suratKeluar.findUnique({ where: { id: req.params.id }, include: suratInclude });
    if (!surat) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });

    if (req.user.role === 'PENGURUS') {
      const ok = surat.penerimaInternal.some(p => p.userId === req.user.id);
      if (!ok || surat.status !== 'SELESAI')
        return res.status(403).json({ success: false, message: 'Akses ditolak' });
      await prisma.penerimaInternal.updateMany({
        where: { suratId: surat.id, userId: req.user.id },
        data: { sudahDibaca: true, dibacaAt: new Date() },
      });
    }
    res.json({ success: true, data: surat });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── CREATE ───────────────────────────────────────────────────────────────────
const createSurat = async (req, res) => {
  try {
    const {
      jenisSurat = 'A', perihal, lampiran, isiSurat, lampiranIsi,
      tujuanSurat, tanggalMasehi, tempatTerbit,
      tataUsahaId, kepalaId,
      penerimaEksternal, penerimaInternalIds,
      isDraft = true,
    } = req.body;

    if (!perihal || !isiSurat || !tanggalMasehi)
      return res.status(400).json({ success: false, message: 'Perihal, isi surat, dan tanggal diperlukan' });

    const tanggal = new Date(tanggalMasehi);
    const hijriyah = toHijriyah(tanggal);

    const surat = await prisma.suratKeluar.create({
      data: {
        jenisSurat,
        perihal,
        lampiran:         lampiran   || null,
        isiSurat,
        lampiranIsi:      lampiranIsi || null,
        tujuanSurat:      tujuanSurat || null,
        tanggalMasehi:    tanggal,
        tanggalHijriyah:  hijriyah.formatted,
        tempatTerbit:     tempatTerbit || 'Bandung',
        status:           isDraft ? 'DRAFT' : 'MENUNGGU_SEKRETARIS',
        tataUsahaId:      tataUsahaId      || null,
        kepalaId:         kepalaId         || null,
        pembuatId:        req.user.id,
        penerimaEksternal: penerimaEksternal || null,
      },
      include: suratInclude,
    });

    // Buat penerima internal secara terpisah (hindari nested create)
    if (penerimaInternalIds?.length) {
      for (const uid of penerimaInternalIds) {
        await prisma.penerimaInternal.create({ data: { suratId: surat.id, userId: uid } });
      }
      // Fetch ulang dengan penerima internal
      const suratWithPI = await prisma.suratKeluar.findUnique({ where: { id: surat.id }, include: suratInclude });
      return res.status(201).json({ success: true, message: isDraft ? 'Draft disimpan' : 'Surat dikirim ke Sekretaris', data: suratWithPI });
    }

    res.status(201).json({ success: true, message: isDraft ? 'Draft disimpan' : 'Surat dikirim ke Sekretaris', data: surat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan saat membuat surat' });
  }
};

// ── UPDATE ───────────────────────────────────────────────────────────────────
const updateSurat = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.suratKeluar.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });

    if (!['DRAFT','DITOLAK_SEKRETARIS','DITOLAK_KEPALA'].includes(existing.status))
      return res.status(400).json({ success: false, message: 'Surat tidak dapat diedit pada status ini' });

    const {
      jenisSurat, perihal, lampiran, isiSurat, lampiranIsi,
      tujuanSurat, tanggalMasehi, tempatTerbit,
      tataUsahaId, kepalaId,
      penerimaEksternal, penerimaInternalIds,
      isDraft = true,
    } = req.body;

    const tanggal  = tanggalMasehi ? new Date(tanggalMasehi) : existing.tanggalMasehi;
    const hijriyah = toHijriyah(tanggal);

    await prisma.penerimaInternal.deleteMany({ where: { suratId: id } });

    const updated = await prisma.suratKeluar.update({
      where: { id },
      data: {
        jenisSurat:       jenisSurat       ?? existing.jenisSurat,
        perihal:          perihal          ?? existing.perihal,
        lampiran:         lampiran         !== undefined ? lampiran         : existing.lampiran,
        isiSurat:         isiSurat         ?? existing.isiSurat,
        lampiranIsi:      lampiranIsi      !== undefined ? lampiranIsi      : existing.lampiranIsi,
        tujuanSurat:      tujuanSurat      !== undefined ? tujuanSurat      : existing.tujuanSurat,
        tanggalMasehi:    tanggal,
        tanggalHijriyah:  hijriyah.formatted,
        tempatTerbit:     tempatTerbit     ?? existing.tempatTerbit,
        status:           isDraft ? 'DRAFT' : 'MENUNGGU_SEKRETARIS',
        tataUsahaId:      tataUsahaId      !== undefined ? tataUsahaId      : existing.tataUsahaId,
        kepalaId:         kepalaId         !== undefined ? kepalaId         : existing.kepalaId,
        penerimaEksternal: penerimaEksternal !== undefined ? penerimaEksternal : existing.penerimaEksternal,
        catatanTolak:         isDraft ? existing.catatanTolak : null,
        parafTataUsaha:       false,
        ttdKepala:            false,
        tglParafTataUsaha:    null,
        tglTtdKepala:         null,
      },
      include: suratInclude,
    });

    // Buat penerima internal secara terpisah (hindari nested create)
    if (penerimaInternalIds?.length) {
      for (const uid of penerimaInternalIds) {
        await prisma.penerimaInternal.create({ data: { suratId: id, userId: uid } });
      }
    }

    // Fetch ulang dengan penerima internal terbaru
    const updatedWithPI = await prisma.suratKeluar.findUnique({ where: { id }, include: suratInclude });
    res.json({ success: true, message: isDraft ? 'Draft diperbarui' : 'Surat dikirim ke Sekretaris', data: updatedWithPI });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── DELETE ───────────────────────────────────────────────────────────────────
const deleteSurat = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.suratKeluar.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });

    if (req.user.role !== 'ADMIN' && existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Hanya Admin yang dapat menghapus surat selain DRAFT' });
    }

    if (existing.qrCodePath) {
      const qrFile = path.join(__dirname, '../../', existing.qrCodePath);
      if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);
    }

    await prisma.suratKeluar.delete({ where: { id } });
    res.json({ success: true, message: 'Surat berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── KIRIM ────────────────────────────────────────────────────────────────────
const kirimSurat = async (req, res) => {
  try {
    const { id } = req.params;
    const surat = await prisma.suratKeluar.findUnique({ where: { id } });
    if (!surat) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });
    if (!['DRAFT','DITOLAK_SEKRETARIS','DITOLAK_KEPALA'].includes(surat.status))
      return res.status(400).json({ success: false, message: 'Surat tidak dapat dikirim pada status ini' });
    if (!surat.tataUsahaId)
      return res.status(400).json({ success: false, message: 'Pilih Sekretaris terlebih dahulu' });

    const updated = await prisma.suratKeluar.update({
      where: { id },
      data: { status: 'MENUNGGU_SEKRETARIS', catatanTolak: null, parafTataUsaha: false, ttdKepala: false, tglParafTataUsaha: null, tglTtdKepala: null },
      include: suratInclude,
    });

    if (updated.tataUsahaId) {
      await createNotifikasi(updated.tataUsahaId, {
        judul: '✍️ Surat Menunggu Tandatangan',
        pesan: `Surat "${updated.perihal}" perlu ditandatangan`,
        url: `/surat-keluar/${updated.id}`,
      });
    }

    res.json({ success: true, message: 'Surat dikirim ke Sekretaris', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── TANDA TANGAN / PARAF ─────────────────────────────────────────────────────
const tandaTangan = async (req, res) => {
  try {
    const { id } = req.params;
    const surat = await prisma.suratKeluar.findUnique({ where: { id }, include: suratInclude });
    if (!surat) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });

    let updateData = {};

    if (req.user.role === 'SEKRETARIS') {
      if (surat.status !== 'MENUNGGU_SEKRETARIS' || surat.tataUsahaId !== req.user.id)
        return res.status(403).json({ success: false, message: 'Tidak dapat memaraf surat ini' });

      updateData = {
        parafTataUsaha: true,
        tglParafTataUsaha: new Date(),
        status: surat.kepalaId ? 'MENUNGGU_KEPALA' : 'SELESAI',
      };

      if (!surat.kepalaId) {
        const nomorSurat = await generateNomorSurat(surat.jenisSurat);
        const qrToken    = uuidv4();
        const qrPath     = await generateQRCode(qrToken, id);
        updateData.nomorSurat  = nomorSurat;
        updateData.qrCodeToken = qrToken;
        updateData.qrCodePath  = qrPath;
      }
    } else if (req.user.role === 'KEPALA') {
      if (surat.status !== 'MENUNGGU_KEPALA' || surat.kepalaId !== req.user.id)
        return res.status(403).json({ success: false, message: 'Tidak dapat menandatangani surat ini' });

      const nomorSurat = await generateNomorSurat(surat.jenisSurat);
      const qrToken    = uuidv4();
      const qrPath     = await generateQRCode(qrToken, id);
      updateData = {
        ttdKepala: true,
        tglTtdKepala: new Date(),
        status: 'SELESAI',
        nomorSurat,
        qrCodeToken: qrToken,
        qrCodePath:  qrPath,
      };
    } else {
      return res.status(403).json({ success: false, message: 'Tidak memiliki izin' });
    }

    const updated = await prisma.suratKeluar.update({ where: { id }, data: updateData, include: suratInclude });

    // Notifikasi: Sekretaris tandatangan → kirim ke Kepala
    if (req.user.role === 'SEKRETARIS') {
      if (updateData.status === 'MENUNGGU_KEPALA' && updated.kepalaId) {
        await createNotifikasi(updated.kepalaId, {
          judul: '✍️ Surat Menunggu Tanda Tangan',
          pesan: `Surat "${updated.perihal}" perlu ditandatangani`,
          url: `/surat-keluar/${updated.id}`,
        });
      }
    }

    // Notifikasi: surat SELESAI → kirim ke semua penerima internal
    if (updateData.status === 'SELESAI' && updated.penerimaInternal?.length > 0) {
      const penerimaIds = updated.penerimaInternal.map(p => p.userId);
      await createNotifikasi(penerimaIds, {
        judul: '📨 Surat Masuk untuk Anda',
        pesan: `Surat "${updated.perihal}" telah selesai ditandatangani`,
        url: `/surat-keluar/${updated.id}`,
      });
    }

    res.json({ success: true, message: req.user.role === 'SEKRETARIS' ? 'Surat berhasil ditandatangan' : 'Surat berhasil ditandatangani', data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── TOLAK ────────────────────────────────────────────────────────────────────
const tolakSurat = async (req, res) => {
  try {
    const { id } = req.params;
    const { catatan } = req.body;
    if (!catatan?.trim()) return res.status(400).json({ success: false, message: 'Catatan penolakan diperlukan' });

    const surat = await prisma.suratKeluar.findUnique({ where: { id } });
    if (!surat) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });

    let newStatus;
    if (req.user.role === 'SEKRETARIS') {
      if (surat.status !== 'MENUNGGU_SEKRETARIS' || surat.tataUsahaId !== req.user.id)
        return res.status(403).json({ success: false, message: 'Tidak dapat menolak surat ini' });
      newStatus = 'DITOLAK_SEKRETARIS';
    } else if (req.user.role === 'KEPALA') {
      if (surat.status !== 'MENUNGGU_KEPALA' || surat.kepalaId !== req.user.id)
        return res.status(403).json({ success: false, message: 'Tidak dapat menolak surat ini' });
      newStatus = 'DITOLAK_KEPALA';
    } else {
      return res.status(403).json({ success: false, message: 'Tidak memiliki izin' });
    }

    const updated = await prisma.suratKeluar.update({
      where: { id },
      data: { status: newStatus, catatanTolak: catatan.trim(), ditolakOleh: req.user.namaLengkap },
      include: suratInclude,
    });
    res.json({ success: true, message: 'Surat ditolak', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// ── DOWNLOAD PDF ─────────────────────────────────────────────────────────────
const downloadPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const surat = await prisma.suratKeluar.findUnique({ where: { id }, include: suratInclude });
    if (!surat) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });
    if (surat.status !== 'SELESAI')
      return res.status(400).json({ success: false, message: 'Surat belum selesai ditandatangani' });

    const organisasi = await prisma.organisasiProfil.findFirst();
    const { filepath } = await generateSuratPDF(surat, organisasi || {});

    const safeNomor = (surat.nomorSurat || surat.id).replace(/\//g, '-');
    res.download(filepath, `Surat-${safeNomor}.pdf`, (err) => {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal generate PDF' });
  }
};

// ── PREVIEW PDF ───────────────────────────────────────────────────────────────
const previewPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const surat = await prisma.suratKeluar.findUnique({ where: { id }, include: suratInclude });
    if (!surat) return res.status(404).json({ success: false, message: 'Surat tidak ditemukan' });

    if (req.user.role === 'SEKRETARIS' && surat.tataUsahaId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak' });
    if (req.user.role === 'KEPALA' && surat.kepalaId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Akses ditolak' });

    const organisasi = await prisma.organisasiProfil.findFirst();
    const { filepath } = await generateSuratPDF(surat, organisasi || {});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');

    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
    stream.on('end', () => { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); });
    stream.on('error', (err) => {
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Gagal membaca PDF' });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal generate preview PDF' });
  }
};

// ── STATISTIK ────────────────────────────────────────────────────────────────
const getStatistik = async (req, res) => {
  try {
    const [total, draft, menunggu, selesai, ditolak] = await Promise.all([
      prisma.suratKeluar.count(),
      prisma.suratKeluar.count({ where: { status: 'DRAFT' } }),
      prisma.suratKeluar.count({ where: { status: { in: ['MENUNGGU_SEKRETARIS','MENUNGGU_KEPALA'] } } }),
      prisma.suratKeluar.count({ where: { status: 'SELESAI' } }),
      prisma.suratKeluar.count({ where: { status: { in: ['DITOLAK_SEKRETARIS','DITOLAK_KEPALA'] } } }),
    ]);
    res.json({ success: true, data: { total, draft, menunggu, selesai, ditolak } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

module.exports = { getAllSurat, getSuratById, createSurat, updateSurat, deleteSurat, kirimSurat, tandaTangan, tolakSurat, downloadPDF, previewPDF, getStatistik };
