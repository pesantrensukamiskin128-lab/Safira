const prisma = require('../config/prisma');

// GET semua template
const getAll = async (req, res) => {
  try {
    const templates = await prisma.templateSurat.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: templates });
  } catch (err) {
    console.error('getAll template error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// GET satu template by ID
const getById = async (req, res) => {
  try {
    const template = await prisma.templateSurat.findUnique({
      where: { id: req.params.id },
    });
    if (!template) return res.status(404).json({ success: false, message: 'Template tidak ditemukan' });
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// POST buat template baru
const create = async (req, res) => {
  try {
    const { nama, deskripsi, jenisSurat, perihal, tujuanSurat, lampiran, isiSurat, lampiranIsi, tempatTerbit } = req.body;
    if (!nama?.trim()) return res.status(400).json({ success: false, message: 'Nama template harus diisi' });
    if (!isiSurat?.trim()) return res.status(400).json({ success: false, message: 'Isi surat harus diisi' });

    const template = await prisma.templateSurat.create({
      data: {
        nama:         nama.trim(),
        deskripsi:    deskripsi?.trim() || null,
        jenisSurat:   jenisSurat || 'A',
        perihal:      perihal?.trim() || null,
        tujuanSurat:  tujuanSurat?.trim() || null,
        lampiran:     lampiran?.trim() || null,
        isiSurat:     isiSurat.trim(),
        lampiranIsi:  lampiranIsi?.trim() || null,
        tempatTerbit: tempatTerbit?.trim() || 'Bandung',
      },
    });
    res.status(201).json({ success: true, message: 'Template berhasil disimpan', data: template });
  } catch (err) {
    console.error('create template error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// PUT update template
const update = async (req, res) => {
  try {
    const existing = await prisma.templateSurat.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Template tidak ditemukan' });

    const { nama, deskripsi, jenisSurat, perihal, tujuanSurat, lampiran, isiSurat, lampiranIsi, tempatTerbit } = req.body;

    const template = await prisma.templateSurat.update({
      where: { id: req.params.id },
      data: {
        nama:         nama?.trim()         ?? existing.nama,
        deskripsi:    deskripsi !== undefined ? (deskripsi?.trim() || null) : existing.deskripsi,
        jenisSurat:   jenisSurat            ?? existing.jenisSurat,
        perihal:      perihal !== undefined  ? (perihal?.trim() || null)    : existing.perihal,
        tujuanSurat:  tujuanSurat !== undefined ? (tujuanSurat?.trim() || null) : existing.tujuanSurat,
        lampiran:     lampiran !== undefined ? (lampiran?.trim() || null)   : existing.lampiran,
        isiSurat:     isiSurat?.trim()      ?? existing.isiSurat,
        lampiranIsi:  lampiranIsi !== undefined ? (lampiranIsi?.trim() || null) : existing.lampiranIsi,
        tempatTerbit: tempatTerbit?.trim()  ?? existing.tempatTerbit,
      },
    });
    res.json({ success: true, message: 'Template berhasil diperbarui', data: template });
  } catch (err) {
    console.error('update template error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

// DELETE hapus template
const remove = async (req, res) => {
  try {
    const existing = await prisma.templateSurat.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Template tidak ditemukan' });
    await prisma.templateSurat.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Template berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
};

module.exports = { getAll, getById, create, update, remove };
