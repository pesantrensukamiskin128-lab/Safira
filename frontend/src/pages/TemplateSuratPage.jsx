import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PlusIcon, PencilIcon, TrashIcon, DocumentDuplicateIcon,
  XMarkIcon, CheckIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { templateAPI } from '../services/api'
import RichTextEditor from '../components/editor/RichTextEditor'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { PageLoader } from '../components/ui/LoadingSpinner'
import { JENIS_SURAT_OPTIONS } from '../utils/helpers'

const defaultForm = {
  nama: '', deskripsi: '', jenisSurat: 'A',
  perihal: '', tujuanSurat: '', lampiran: '',
  isiSurat: '', lampiranIsi: '', tempatTerbit: 'Bandung',
}

export default function TemplateSuratPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [formModal, setFormModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [deleteId, setDeleteId] = useState(null)
  const [activeTab, setActiveTab] = useState('info') // 'info' | 'isi'

  const { data, isLoading } = useQuery({
    queryKey: ['template-surat'],
    queryFn: () => templateAPI.getAll().then(r => r.data.data),
  })

  const saveMutation = useMutation({
    mutationFn: (d) => editId ? templateAPI.update(editId, d) : templateAPI.create(d),
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries(['template-surat'])
      closeModal()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Gagal menyimpan template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => templateAPI.delete(id),
    onSuccess: () => {
      toast.success('Template dihapus')
      queryClient.invalidateQueries(['template-surat'])
      setDeleteId(null)
    },
    onError: () => toast.error('Gagal menghapus template'),
  })

  const openCreate = () => {
    setEditId(null)
    setForm(defaultForm)
    setActiveTab('info')
    setFormModal(true)
  }

  const openEdit = (t) => {
    setEditId(t.id)
    setForm({
      nama:         t.nama         || '',
      deskripsi:    t.deskripsi    || '',
      jenisSurat:   t.jenisSurat   || 'A',
      perihal:      t.perihal      || '',
      tujuanSurat:  t.tujuanSurat  || '',
      lampiran:     t.lampiran     || '',
      isiSurat:     t.isiSurat     || '',
      lampiranIsi:  t.lampiranIsi  || '',
      tempatTerbit: t.tempatTerbit || 'Bandung',
    })
    setActiveTab('info')
    setFormModal(true)
  }

  const closeModal = () => {
    setFormModal(false)
    setEditId(null)
    setForm(defaultForm)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.nama.trim())                              { toast.error('Nama template harus diisi'); return }
    if (!form.isiSurat || form.isiSurat === '<p></p>') { toast.error('Isi surat harus diisi'); return }
    saveMutation.mutate(form)
  }

  const set = (key) => (val) => setForm(p => ({ ...p, [key]: val }))

  const filtered = (data || []).filter(t =>
    t.nama.toLowerCase().includes(search.toLowerCase()) ||
    t.perihal?.toLowerCase().includes(search.toLowerCase()) ||
    t.jenisSurat?.toLowerCase().includes(search.toLowerCase())
  )

  const jenisLabel = (v) => JENIS_SURAT_OPTIONS.find(o => o.value === v)?.label || v

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Template Surat</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kelola template untuk mempercepat pembuatan surat keluar
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Buat Template
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input-field pl-9"
          placeholder="Cari template..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card card-body text-center py-16">
          <DocumentDuplicateIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">
            {search ? 'Template tidak ditemukan' : 'Belum ada template'}
          </p>
          {!search && (
            <p className="text-sm text-gray-400 mt-1">
              Buat template untuk mempercepat pembuatan surat
            </p>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map(t => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card card-body flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Badge jenis */}
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                    {t.jenisSurat}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(t)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteId(t.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{t.nama}</p>
                  {t.deskripsi && (
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t.deskripsi}</p>
                  )}
                  {t.perihal && (
                    <p className="text-xs text-gray-500 mt-1.5 italic line-clamp-1">
                      Perihal: {t.perihal}
                    </p>
                  )}
                </div>

                <div className="text-xs text-gray-400 border-t border-gray-50 pt-2">
                  {jenisLabel(t.jenisSurat).split(' — ')[1] || jenisLabel(t.jenisSurat)}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal Form */}
      <Modal
        isOpen={formModal}
        onClose={closeModal}
        title={editId ? 'Edit Template' : 'Buat Template Baru'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tab navigasi */}
          <div className="flex border-b border-gray-200">
            {[
              { key: 'info', label: 'Informasi' },
              { key: 'isi',  label: 'Isi Surat' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Informasi */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Nama Template <span className="text-red-500">*</span></label>
                  <input type="text" className="input-field"
                    placeholder="contoh: Surat Tugas Mengajar"
                    value={form.nama}
                    onChange={e => setForm(p => ({ ...p, nama: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Jenis Surat</label>
                  <select className="input-field" value={form.jenisSurat}
                    onChange={e => setForm(p => ({ ...p, jenisSurat: e.target.value }))}>
                    {JENIS_SURAT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Deskripsi</label>
                <input type="text" className="input-field"
                  placeholder="Deskripsi singkat tentang template ini (opsional)"
                  value={form.deskripsi}
                  onChange={e => setForm(p => ({ ...p, deskripsi: e.target.value }))} />
              </div>

              <div>
                <label className="label">Perihal</label>
                <textarea className="input-field resize-none" rows={2}
                  placeholder="Perihal surat (bisa dikosongkan dan diisi saat membuat surat)"
                  value={form.perihal}
                  onChange={e => setForm(p => ({ ...p, perihal: e.target.value }))} />
              </div>

              <div>
                <label className="label">Kepada Yth.</label>
                <textarea className="input-field resize-none" rows={2}
                  placeholder="Tujuan surat"
                  value={form.tujuanSurat}
                  onChange={e => setForm(p => ({ ...p, tujuanSurat: e.target.value }))} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Keterangan Lampiran</label>
                  <input type="text" className="input-field"
                    placeholder="contoh: 1 (Satu Lembar)"
                    value={form.lampiran}
                    onChange={e => setForm(p => ({ ...p, lampiran: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Tempat Terbit</label>
                  <input type="text" className="input-field"
                    placeholder="Bandung"
                    value={form.tempatTerbit}
                    onChange={e => setForm(p => ({ ...p, tempatTerbit: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Isi Surat */}
          {activeTab === 'isi' && (
            <div className="space-y-4">
              <div>
                <label className="label">Isi Surat <span className="text-red-500">*</span></label>
                <RichTextEditor
                  value={form.isiSurat}
                  onChange={set('isiSurat')}
                  placeholder="Tulis isi surat template di sini..."
                  minHeight="280px"
                />
              </div>
              <div>
                <label className="label">Isi Lampiran <span className="text-xs text-gray-400 font-normal ml-1">(opsional)</span></label>
                <RichTextEditor
                  value={form.lampiranIsi}
                  onChange={set('lampiranIsi')}
                  placeholder="Isi lampiran (opsional)..."
                  minHeight="150px"
                />
              </div>
            </div>
          )}

          {/* Tombol aksi */}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            {activeTab === 'info' ? (
              <div />
            ) : (
              <button type="button" onClick={() => setActiveTab('info')}
                className="btn-secondary text-sm">
                ← Kembali
              </button>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={closeModal} className="btn-secondary">
                Batal
              </button>
              {activeTab === 'info' ? (
                <button type="button" onClick={() => setActiveTab('isi')} className="btn-primary">
                  Lanjut ke Isi Surat →
                </button>
              ) : (
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                  <CheckIcon className="w-4 h-4" />
                  {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Template'}
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
        title="Hapus Template?"
        message="Template ini akan dihapus permanen dan tidak dapat dikembalikan."
        confirmLabel="Hapus"
      />
    </div>
  )
}
