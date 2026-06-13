import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, DocumentCheckIcon, InformationCircleIcon, EyeIcon, DocumentDuplicateIcon, XMarkIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { suratKeluarAPI, userAPI, templateAPI } from '../services/api'
import RichTextEditor from '../components/editor/RichTextEditor'
import PDFPreviewModal from '../components/ui/PDFPreviewModal'
import { JENIS_SURAT_OPTIONS } from '../utils/helpers'

// ── Hijriyah helpers ─────────────────────────────────────────────────────────
const BULAN_HIJRIYAH = [
  "Muharram","Shafar","Rabi'ul Awwal","Rabi'ul Akhir",
  "Jumadil Awwal","Jumadil Akhir","Rajab","Sya'ban",
  "Ramadhan","Syawal","Dzulqa'dah","Dzulhijjah",
]

function gregorianToJD(y, m, d) {
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5
}
function jdToHijri(jd) {
  jd = Math.floor(jd) + 0.5
  const z = jd - 1948438.5
  const a = Math.floor(z / 10631)
  const b = z - 10631 * a
  const c = Math.floor((b - 0.5) / 354.367)
  const d2 = b - Math.floor(354.367 * c + 0.5)
  const j = Math.floor((d2 + 0.5) / 29.5)
  return { day: Math.floor(d2 - 29.5 * j + 0.5), month: Math.min(j + 1, 12), year: 30 * a + c + 1 }
}

// Konversi tanggal masehi → objek hijriyah {day, month, year}
function toHijriObj(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const jd = gregorianToJD(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return jdToHijri(jd)
}

// Format objek hijriyah → string "DD Bulan YYYY H"
function hijriObjToStr({ day, month, year }) {
  return `${day} ${BULAN_HIJRIYAH[month - 1]} ${year} H`
}

// Parse string hijriyah → objek {day, month, year} atau null
function parseHijriyah(str) {
  if (!str) return null
  const match = str.match(/^(\d+)\s+(.+?)\s+(\d+)\s*H?$/i)
  if (!match) return null
  const month = BULAN_HIJRIYAH.findIndex(b => b.toLowerCase() === match[2].trim().toLowerCase()) + 1
  return month > 0 ? { day: parseInt(match[1]), month, year: parseInt(match[3]) } : null
}

// ── Default form ─────────────────────────────────────────────────────────────
const defaultForm = {
  jenisSurat: 'A',
  perihal: '',
  lampiran: '',
  isiSurat: '',
  lampiranIsi: '',
  tujuanSurat: '',
  tanggalMasehi: new Date().toISOString().split('T')[0],
  tanggalHijriyah: '',
  tempatTerbit: 'Bandung',
  tataUsahaId: '',
  kepalaId: '',
  penerimaEksternal: '',
  penerimaInternalIds: [],
}

export default function SuratKeluarFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const [form, setForm] = useState(defaultForm)
  const [previewModal, setPreviewModal] = useState(false)
  const [templateModal, setTemplateModal] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')

  // State hijriyah terpisah: {day, month, year}
  const [hijri, setHijri] = useState({ day: 1, month: 1, year: 1445 })

  // Load existing surat for edit
  const { data: existingSurat } = useQuery({
    queryKey: ['surat-keluar-detail', id],
    queryFn: () => suratKeluarAPI.getById(id).then(r => r.data.data),
    enabled: isEdit,
  })

  const { data: sekretarisList } = useQuery({
    queryKey: ['users-sekretaris'],
    queryFn: () => userAPI.getByRole('SEKRETARIS').then(r => r.data.data),
  })

  const { data: templates } = useQuery({
    queryKey: ['template-surat'],
    queryFn: () => templateAPI.getAll().then(r => r.data.data),
  })
  const { data: kepalaList } = useQuery({
    queryKey: ['users-kepala'],
    queryFn: () => userAPI.getByRole('KEPALA').then(r => r.data.data),
  })
  const { data: allUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => userAPI.getByRole('').then(r => r.data.data),
  })

  useEffect(() => {
    if (existingSurat) {
      setForm({
        jenisSurat:          existingSurat.jenisSurat          || 'A',
        perihal:             existingSurat.perihal              || '',
        lampiran:            existingSurat.lampiran             || '',
        isiSurat:            existingSurat.isiSurat             || '',
        lampiranIsi:         existingSurat.lampiranIsi          || '',
        tujuanSurat:         existingSurat.tujuanSurat          || '',
        tanggalMasehi:       existingSurat.tanggalMasehi?.split('T')[0] || defaultForm.tanggalMasehi,
        tanggalHijriyah:     existingSurat.tanggalHijriyah      || '',
        tempatTerbit:        existingSurat.tempatTerbit         || 'Bandung',
        tataUsahaId:         existingSurat.tataUsahaId          || '',
        kepalaId:            existingSurat.kepalaId             || '',
        penerimaEksternal:   existingSurat.penerimaEksternal    || '',
        penerimaInternalIds: existingSurat.penerimaInternal?.map(p => p.userId) || [],
      })
      // Parse hijriyah dari string existing
      const parsed = parseHijriyah(existingSurat.tanggalHijriyah)
      if (parsed) setHijri(parsed)
    }
  }, [existingSurat])

  // Sync tanggalHijriyah ke form saat hijri state berubah
  useEffect(() => {
    setForm(p => ({ ...p, tanggalHijriyah: hijriObjToStr(hijri) }))
  }, [hijri])

  const saveMutation = useMutation({
    mutationFn: (data) => isEdit ? suratKeluarAPI.update(id, data) : suratKeluarAPI.create(data),
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries(['surat-keluar'])
      navigate('/surat-keluar')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menyimpan surat'),
  })

  const handleSubmit = (isDraft) => {
    if (!form.perihal.trim())                        { toast.error('Perihal harus diisi'); return }
    if (!form.isiSurat || form.isiSurat === '<p></p>') { toast.error('Isi surat harus diisi'); return }
    if (!form.tanggalMasehi)                         { toast.error('Tanggal harus diisi'); return }
    if (!isDraft && !form.tataUsahaId)              { toast.error('Pilih Sekretaris terlebih dahulu'); return }
    saveMutation.mutate({ ...form, isDraft })
  }

  const togglePenerima = (uid) => {
    setForm(p => ({
      ...p,
      penerimaInternalIds: p.penerimaInternalIds.includes(uid)
        ? p.penerimaInternalIds.filter(x => x !== uid)
        : [...p.penerimaInternalIds, uid],
    }))
  }

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }))

  const applyTemplate = (t) => {
    setForm(p => ({
      ...p,
      jenisSurat:   t.jenisSurat   || p.jenisSurat,
      perihal:      t.perihal      || p.perihal,
      tujuanSurat:  t.tujuanSurat  || p.tujuanSurat,
      lampiran:     t.lampiran     || p.lampiran,
      isiSurat:     t.isiSurat     || p.isiSurat,
      lampiranIsi:  t.lampiranIsi  || p.lampiranIsi,
      tempatTerbit: t.tempatTerbit || p.tempatTerbit,
    }))
    setTemplateModal(false)
    setTemplateSearch('')
    toast.success(`Template "${t.nama}" diterapkan`)
  }

  const filteredTemplates = (templates || []).filter(t =>
    t.nama.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.perihal?.toLowerCase().includes(templateSearch.toLowerCase())
  )

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="page-title">{isEdit ? 'Edit Surat Keluar' : 'Buat Surat Keluar'}</h1>
          <p className="text-sm text-gray-500">Isi formulir surat keluar di bawah ini</p>
        </div>
        {!isEdit && (
          <button
            type="button"
            onClick={() => setTemplateModal(true)}
            className="btn-secondary"
          >
            <DocumentDuplicateIcon className="w-4 h-4" />
            Pakai Template
          </button>
        )}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Kolom Utama ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Informasi Surat */}
          <div className="card card-body space-y-4">
            <h2 className="section-title">Informasi Surat</h2>

            {/* Jenis Surat */}
            <div>
              <label className="label">Jenis Surat <span className="text-red-500">*</span></label>
              <select className="input-field" value={form.jenisSurat}
                onChange={e => setForm(p => ({ ...p, jenisSurat: e.target.value }))}>
                {JENIS_SURAT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Kode jenis surat akan masuk ke nomor surat otomatis
              </p>
            </div>

            {/* Perihal */}
            <div>
              <label className="label">Perihal <span className="text-red-500">*</span></label>
              <textarea
                className="input-field resize-none"
                rows={2}
                placeholder="Perihal surat..."
                value={form.perihal}
                onChange={e => setForm(p => ({ ...p, perihal: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">
                Tekan Enter untuk baris baru jika perihal lebih dari satu baris.
              </p>
            </div>

            {/* Lampiran (keterangan, bukan isi) */}
            <div>
              <label className="label">Lampiran</label>
              <input type="text" className="input-field"
                placeholder="contoh: 1 (Satu Lembar), atau kosongkan jika tidak ada"
                value={form.lampiran} onChange={e => setForm(p => ({ ...p, lampiran: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">
                Keterangan lampiran yang muncul di header surat (bukan isi lampiran)
              </p>
            </div>

            {/* Tanggal */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Tempat Terbit</label>
                <input type="text" className="input-field" placeholder="Bandung"
                  value={form.tempatTerbit} onChange={e => setForm(p => ({ ...p, tempatTerbit: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tanggal (Masehi) <span className="text-red-500">*</span></label>
                <input type="date" className="input-field" value={form.tanggalMasehi}
                  onChange={e => setForm(p => ({ ...p, tanggalMasehi: e.target.value }))} />
              </div>
            </div>

            {/* Tanggal Hijriyah — full width agar dropdown tidak sempit */}
            <div>
              <label className="label">Tanggal (Hijriyah)</label>
              <div className="flex items-center gap-2">
                {/* Hari */}
                <select
                  className="input-field w-20 text-center"
                  value={hijri.day}
                  onChange={e => setHijri(h => ({ ...h, day: parseInt(e.target.value) }))}
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {/* Bulan */}
                <select
                  className="input-field flex-1"
                  value={hijri.month}
                  onChange={e => setHijri(h => ({ ...h, month: parseInt(e.target.value) }))}
                >
                  {BULAN_HIJRIYAH.map((b, i) => (
                    <option key={i} value={i + 1}>{b}</option>
                  ))}
                </select>
                {/* Tahun */}
                <input
                  type="number"
                  className="input-field w-24 text-center"
                  value={hijri.year}
                  min={1400}
                  max={1600}
                  onChange={e => setHijri(h => ({ ...h, year: parseInt(e.target.value) || h.year }))}
                />
                <span className="text-sm text-gray-500 flex-shrink-0">H</span>
              </div>
              <button
                type="button"
                onClick={() => { const obj = toHijriObj(form.tanggalMasehi); if (obj) setHijri(obj) }}
                className="text-xs text-primary-600 hover:text-primary-700 hover:underline mt-1.5"
              >
                ↻ Isi otomatis dari tanggal Masehi
              </button>
            </div>
          </div>

          {/* Tujuan Surat */}
          <div className="card card-body space-y-3">
            <div className="flex items-start gap-2">
              <h2 className="section-title">Kepada Yth.</h2>
              <div className="group relative">
                <InformationCircleIcon className="w-4 h-4 text-gray-400 mt-0.5 cursor-help" />
                <div className="hidden group-hover:block absolute left-0 top-6 bg-gray-800 text-white text-xs rounded-lg p-2 w-56 z-10">
                  Isi tujuan surat yang akan dicetak. Penerima Internal di sidebar hanya untuk distribusi digital.
                </div>
              </div>
            </div>
            <textarea
              className="input-field min-h-[80px] resize-none"
              placeholder={"Pengurus dan Ustadz/Ustadzah Pondok Pesantren"}
              value={form.tujuanSurat}
              onChange={e => setForm(p => ({ ...p, tujuanSurat: e.target.value }))}
            />
            <p className="text-xs text-gray-400">
              Tulis tujuan surat persis seperti yang ingin dicetak. Baris baru = Enter.
            </p>
          </div>

          {/* Isi Surat */}
          <div className="card card-body space-y-3">
            <h2 className="section-title">Isi Surat <span className="text-red-500">*</span></h2>
            <p className="text-xs text-gray-400">
              Font default: Arial Narrow 12. Support teks Arab (gunakan rata kanan), tabel, dan format lengkap.
            </p>
            <RichTextEditor value={form.isiSurat} onChange={set('isiSurat')}
              placeholder="Tulis isi surat di sini..." minHeight="300px" />
          </div>

          {/* Isi Lampiran */}
          <div className="card card-body space-y-3">
            <h2 className="section-title">Isi Lampiran</h2>
            <p className="text-xs text-gray-400">
              Opsional — isi lampiran akan dicetak di halaman terpisah (halaman 2) dengan kop surat.
            </p>
            <RichTextEditor value={form.lampiranIsi} onChange={set('lampiranIsi')}
              placeholder="Tulis isi lampiran di sini (opsional)..." minHeight="150px" />
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">
          {/* Penandatangan */}
          <div className="card card-body space-y-4">
            <h2 className="section-title">Penandatangan</h2>
            <div>
              <label className="label">Sekretaris (Penandatangan)</label>
              <select className="input-field" value={form.tataUsahaId}
                onChange={e => setForm(p => ({ ...p, tataUsahaId: e.target.value }))}>
                <option value="">— Pilih Sekretaris —</option>
                {sekretarisList?.map(u => (
                  <option key={u.id} value={u.id}>{u.namaLengkap}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ketua (Penandatangan)</label>
              <select className="input-field" value={form.kepalaId}
                onChange={e => setForm(p => ({ ...p, kepalaId: e.target.value }))}>
                <option value="">— Pilih Ketua —</option>
                {kepalaList?.map(u => (
                  <option key={u.id} value={u.id}>{u.namaLengkap}</option>
                ))}
              </select>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
              <p className="font-medium text-gray-700 mb-1">Alur penandatanganan:</p>
              <p>1. Sekretaris menandatangani → 2. Ketua menandatangani</p>
            </div>
          </div>

          {/* Penerima Distribusi */}
          <div className="card card-body space-y-4">
            <h2 className="section-title">Distribusi Surat</h2>
            <p className="text-xs text-gray-400">Penerima yang dapat melihat surat di aplikasi setelah selesai ditandatangani</p>
            <div>
              <label className="label">Penerima Eksternal</label>
              <input type="text" className="input-field"
                placeholder="Nama/instansi (opsional)"
                value={form.penerimaEksternal}
                onChange={e => setForm(p => ({ ...p, penerimaEksternal: e.target.value }))} />
            </div>
            <div>
              <label className="label">Penerima Internal</label>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400">{form.penerimaInternalIds.length} dipilih</span>
                <button
                  type="button"
                  onClick={() => {
                    const nonAdminIds = (allUsers || []).filter(u => u.role !== 'ADMIN').map(u => u.id)
                    const allSelected = nonAdminIds.every(id => form.penerimaInternalIds.includes(id))
                    setForm(p => ({
                      ...p,
                      penerimaInternalIds: allSelected
                        ? p.penerimaInternalIds.filter(id => !nonAdminIds.includes(id))
                        : [...new Set([...p.penerimaInternalIds, ...nonAdminIds])]
                    }))
                  }}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium underline"
                >
                  {(allUsers || []).filter(u => u.role !== 'ADMIN').every(u => form.penerimaInternalIds.includes(u.id))
                    ? 'Batal Pilih Semua' : 'Pilih Semua'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-50">
                {allUsers?.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox"
                      checked={form.penerimaInternalIds.includes(u.id)}
                      onChange={() => togglePenerima(u.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{u.namaLengkap}</p>
                      <p className="text-xs text-gray-400">{u.jabatan || u.role}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Aksi */}
          <div className="card card-body space-y-3">
            {isEdit && (
              <button
                type="button"
                onClick={() => setPreviewModal(true)}
                className="btn-secondary w-full justify-center"
              >
                <EyeIcon className="w-4 h-4" />
                Preview PDF
              </button>
            )}
            <button onClick={() => handleSubmit(true)} disabled={saveMutation.isPending}
              className="btn-secondary w-full justify-center">
              {saveMutation.isPending ? 'Menyimpan...' : '💾 Simpan sebagai Draft'}
            </button>
            <button onClick={() => handleSubmit(false)} disabled={saveMutation.isPending}
              className="btn-primary w-full justify-center">
              <DocumentCheckIcon className="w-4 h-4" />
              {saveMutation.isPending ? 'Mengirim...' : 'Kirim ke Sekretaris'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Preview PDF — hanya tersedia saat edit (surat sudah ada di DB) */}
      {isEdit && (
        <PDFPreviewModal
          isOpen={previewModal}
          onClose={() => setPreviewModal(false)}
          suratId={id}
          nomorSurat={existingSurat?.nomorSurat}
        />
      )}

      {/* Modal Pilih Template */}
      {templateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTemplateModal(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Pilih Template</h2>
                <p className="text-xs text-gray-400 mt-0.5">Form akan diisi otomatis sesuai template</p>
              </div>
              <button onClick={() => setTemplateModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-gray-50">
              <input
                type="text"
                className="input-field"
                placeholder="Cari template..."
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <DocumentDuplicateIcon className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">
                    {templateSearch ? 'Template tidak ditemukan' : 'Belum ada template tersedia'}
                  </p>
                </div>
              ) : (
                filteredTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-primary-100 text-primary-700 flex-shrink-0">
                        {t.jenisSurat}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 group-hover:text-primary-700">
                          {t.nama}
                        </p>
                        {t.deskripsi && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.deskripsi}</p>
                        )}
                        {t.perihal && (
                          <p className="text-xs text-gray-500 mt-0.5 italic line-clamp-1">
                            Perihal: {t.perihal}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
