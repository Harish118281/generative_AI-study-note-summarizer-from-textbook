import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ChatAttachment } from '../../types/chat'
import { getChatFileContentUrl, getLibraryFileDownloadUrl } from '../../services/chatservice'
import LoadingIndicator from '../LoadingIndicator/LoadingIndicator'
import './PdfReaderPanel.css'

type PdfReaderPanelProps = {
  files: ChatAttachment[]
  isLoading: boolean
  selectedFileId: number | null
  error?: string
  style?: CSSProperties
  onClose: () => void
  onSelect: (fileId: number) => void
}

function PdfReaderPanel({
  files,
  isLoading,
  selectedFileId,
  error,
  style,
  onClose,
  onSelect,
}: PdfReaderPanelProps) {
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0]
  const previewRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(100)
  const [textPreview, setTextPreview] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const extension = (selectedFile?.extension || selectedFile?.filename.split('.').pop() || '')
    .replace(/^\./, '')
    .toLowerCase()
  const mimeType = selectedFile?.mime_type || selectedFile?.content_type || ''
  const previewUrl = selectedFile ? getChatFileContentUrl(selectedFile.id) : ''
  const isPdf = extension === 'pdf' || mimeType === 'application/pdf'
  const isImage = selectedFile?.category === 'images' || mimeType.startsWith('image/')
  const isAudio = selectedFile?.category === 'audio' || mimeType.startsWith('audio/')
  const isVideo = selectedFile?.category === 'video' || mimeType.startsWith('video/')
  const textExtensions = new Set(['txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'html', 'css', 'js', 'ts', 'py', 'c', 'cpp', 'java', 'log'])
  const isText = mimeType.startsWith('text/') || textExtensions.has(extension)

  useEffect(() => {
    setZoom(100)
    setMenuOpen(false)
    setTextPreview('')
    setTextError('')
    if (!selectedFile || !isText) return

    const controller = new AbortController()
    setTextLoading(true)
    fetch(previewUrl, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load this file preview.')
        setTextPreview((await response.text()).slice(0, 1_000_000))
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTextError(error instanceof Error ? error.message : 'Could not load this file preview.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTextLoading(false)
      })

    return () => controller.abort()
  }, [isText, previewUrl, selectedFile?.id])

  function changeZoom(amount: number) {
    setZoom((value) => Math.max(50, Math.min(200, value + amount)))
  }

  async function shareFile() {
    if (!selectedFile) return
    const shareData = { title: selectedFile.filename, url: previewUrl }
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined)
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareData.url).catch(() => undefined)
    }
  }

  function openFullscreen() {
    if (!previewRef.current) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void previewRef.current.requestFullscreen()
    }
  }

  return (
    <aside className="pdf-reader-panel" aria-label="File preview" style={style}>
      <header className="pdf-reader-header">
        <div className="pdf-reader-heading">
          <div className="pdf-reader-breadcrumb"><span>Chat files</span><span aria-hidden="true">/</span></div>
          <h2 title={selectedFile?.filename}>{selectedFile?.filename ?? 'File preview'}</h2>
        </div>
        <div className="pdf-reader-toolbar">
          <div className="pdf-reader-zoom" aria-label="Preview zoom controls">
            <button aria-label="Zoom out" disabled={zoom <= 50} onClick={() => changeZoom(-10)} title="Zoom out" type="button"><ZoomOutIcon /></button>
            <span>{zoom}%</span>
            <button aria-label="Zoom in" disabled={zoom >= 200} onClick={() => changeZoom(10)} title="Zoom in" type="button"><ZoomInIcon /></button>
          </div>
          <div className="pdf-reader-menu-wrap">
            <button aria-expanded={menuOpen} aria-label="More file actions" onClick={() => setMenuOpen((open) => !open)} title="More actions" type="button"><MoreIcon /></button>
            {menuOpen && <div className="pdf-reader-menu">
              <button onClick={() => void shareFile()} type="button"><ShareIcon />Share</button>
              <a href={previewUrl} rel="noreferrer" target="_blank"><OpenIcon />Open in new tab</a>
            </div>}
          </div>
          {selectedFile && <a aria-label="Download file" className="pdf-reader-tool-link" download={selectedFile.filename} href={getLibraryFileDownloadUrl(selectedFile.id)} title="Download"><DownloadIcon /></a>}
          <button aria-label="Toggle fullscreen" onClick={openFullscreen} title="Fullscreen" type="button"><FullscreenIcon /></button>
          <button aria-label="Close preview" onClick={onClose} title="Close preview" type="button"><CloseIcon /></button>
        </div>
      </header>

      {files.length > 1 && (
        <div className="pdf-reader-file-select">
          <label htmlFor="pdf-reader-select">Attached files</label>
          <select
            id="pdf-reader-select"
            onChange={(event) => onSelect(Number(event.target.value))}
            value={selectedFile?.id ?? ''}
          >
            {files.map((file) => (
              <option key={file.id} value={file.id}>{file.filename}</option>
            ))}
          </select>
        </div>
      )}

      <div className="pdf-reader-content" ref={previewRef}>
        {isLoading ? (
          <LoadingIndicator label="Loading file..." />
        ) : error ? (
          <div className="pdf-reader-empty" role="alert">
            <h3>Could not load file</h3>
            <p>{error}</p>
          </div>
        ) : selectedFile && isPdf ? (
          <iframe
            key={`${selectedFile.id}-${zoom}`}
            className="pdf-reader-frame"
            src={`${previewUrl}#zoom=${zoom}`}
            title={selectedFile.filename}
          />
        ) : selectedFile && isImage ? (
          <div className="file-preview-image-stage"><img alt={selectedFile.filename} src={previewUrl} style={{ transform: `scale(${zoom / 100})` }} /></div>
        ) : selectedFile && isAudio ? (
          <div className="file-preview-media"><FileIcon /><p>{selectedFile.filename}</p><audio controls src={previewUrl}>Audio playback is not supported.</audio></div>
        ) : selectedFile && isVideo ? (
          <div className="file-preview-media"><video controls src={previewUrl}>Video playback is not supported.</video></div>
        ) : selectedFile && isText ? (
          textLoading ? <LoadingIndicator label="Loading file..." /> : textError ? <div className="pdf-reader-empty" role="alert"><p>{textError}</p></div> : <pre className="file-preview-text" style={{ fontSize: `${Math.round(14 * zoom / 100)}px` }}>{textPreview || 'This file is empty.'}</pre>
        ) : selectedFile ? (
          <div className="pdf-reader-empty">
            <FileIcon />
            <h3>Preview is not available</h3>
            <p>{selectedFile.filename} · {mimeType || extension.toUpperCase() || 'Unknown file type'}</p>
            <a className="file-preview-download" download={selectedFile.filename} href={getLibraryFileDownloadUrl(selectedFile.id)}><DownloadIcon />Download file</a>
          </div>
        ) : (
          <div className="pdf-reader-empty">
            <BookIcon />
            <h3>No files attached to this chat</h3>
          </div>
        )}
      </div>
    </aside>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 5.5v16M8 7h8M8 10h8" />
    </svg>
  )
}

function ZoomInIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8" /><path d="M10.8 7.5v6.6m-3.3-3.3h6.6M16 16l5 5" /></svg> }
function ZoomOutIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8" /><path d="M7.5 10.8h6.6M16 16l5 5" /></svg> }
function MoreIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg> }
function DownloadIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg> }
function FullscreenIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg> }
function ShareIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 16V3m0 0L7 8m5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg> }
function OpenIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 4h6v6m0-6-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></svg> }
function FileIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6V3z" /><path d="M14 3v5h5" /></svg> }

export default PdfReaderPanel
