import { useEffect, useState, useCallback } from 'react'
import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon, ArrowDownTrayIcon, DocumentTextIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { suratKeluarAPI } from '../../services/api'
import { downloadBlob } from '../../utils/helpers'
import toast from 'react-hot-toast'

// Deteksi apakah perangkat mobile / tidak support iframe PDF
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

/**
 * PDFPreviewModal
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - suratId: string  — ID surat yang akan di-preview
 *  - nomorSurat: string — untuk nama file saat download
 */
export default function PDFPreviewModal({ isOpen, onClose, suratId, nomorSurat }) {
  const [pdfUrl, setPdfUrl]     = useState(null)   // blob URL
  const [directUrl, setDirectUrl] = useState(null) // URL langsung ke backend (untuk mobile)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [mobile, setMobile]     = useState(false)

  useEffect(() => {
    setMobile(isMobile())
  }, [])

  const loadPreview = useCallback(async () => {
    if (!suratId) return
    setLoading(true)
    setError(null)
    try {
      const res = await suratKeluarAPI.previewPDF(suratId)
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)

      // Bangun URL langsung ke endpoint (untuk mobile open-in-tab / Google Docs)
      const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/api$/, '')
      const token = (() => {
        try { return JSON.parse(localStorage.getItem('risalatren-auth') || '{}')?.state?.token } catch { return null }
      })()
      setDirectUrl(`${base}/api/surat-keluar/${suratId}/preview${token ? `?token=${token}` : ''}`)
    } catch (err) {
      let msg = 'Gagal memuat preview PDF'
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          msg = JSON.parse(text)?.message || msg
        } catch (_) {}
      } else if (err.response?.data?.message) {
        msg = err.response.data.message
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [suratId])

  // Load PDF saat modal dibuka
  useEffect(() => {
    if (isOpen && suratId) {
      loadPreview()
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
        setPdfUrl(null)
      }
    }
  }, [isOpen, suratId])

  const handleDownload = () => {
    if (!pdfUrl) return
    fetch(pdfUrl)
      .then(r => r.blob())
      .then(blob => {
        const filename = `Surat-${(nomorSurat || suratId).replace(/\//g, '-')}.pdf`
        downloadBlob(blob, filename)
        toast.success('PDF berhasil diunduh')
      })
  }

  const handleClose = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    setError(null)
    onClose()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 flex flex-col p-2 sm:p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="flex flex-col w-full max-w-5xl mx-auto h-full bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <DocumentTextIcon className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  <Dialog.Title className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                    Preview Surat
                    {nomorSurat && (
                      <span className="ml-2 text-xs sm:text-sm font-mono text-gray-400 hidden sm:inline">{nomorSurat}</span>
                    )}
                  </Dialog.Title>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {pdfUrl && (
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Unduh PDF</span>
                      <span className="sm:hidden">Unduh</span>
                    </button>
                  )}
                  {/* Tombol buka di tab baru — berguna di mobile */}
                  {directUrl && (
                    <a
                      href={directUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Buka di Tab Baru</span>
                    </a>
                  )}
                  <button
                    onClick={handleClose}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 bg-gray-100 overflow-hidden">
                {loading && (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Memuat preview surat...</p>
                  </div>
                )}

                {error && !loading && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                      <XMarkIcon className="w-7 h-7 text-red-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">{error}</p>
                    <button
                      onClick={loadPreview}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}

                {pdfUrl && !loading && (
                  mobile ? (
                    /* ── Mobile: iframe tidak support PDF, tampilkan opsi aksi ── */
                    <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
                      <div className="w-20 h-20 rounded-2xl bg-primary-100 flex items-center justify-center">
                        <DocumentTextIcon className="w-10 h-10 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-800 mb-1">File PDF Siap</p>
                        <p className="text-sm text-gray-500">
                          Browser mobile tidak mendukung tampilan PDF langsung.
                          Gunakan salah satu opsi di bawah ini:
                        </p>
                      </div>
                      <div className="w-full max-w-xs space-y-3">
                        {directUrl && (
                          <a
                            href={directUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors"
                          >
                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                            Buka di Browser
                          </a>
                        )}
                        <button
                          onClick={handleDownload}
                          className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-xl transition-colors"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" />
                          Unduh PDF
                        </button>
                      </div>
                      {nomorSurat && (
                        <p className="text-xs text-gray-400 font-mono">{nomorSurat}</p>
                      )}
                    </div>
                  ) : (
                    /* ── Desktop: iframe normal ── */
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full border-0"
                      title="Preview Surat PDF"
                    />
                  )
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
