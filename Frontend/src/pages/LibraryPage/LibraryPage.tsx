import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteLibraryFile,
  getLibraryFileContentUrl,
  getLibraryFileDownloadUrl,
  getLibraryFiles,
  renameLibraryFile,
  uploadLibraryFiles,
} from '../../services/chatservice'
import type { ChatAttachment, FileCategory } from '../../types/chat'
import LoadingIndicator from '../../components/LoadingIndicator/LoadingIndicator'
import './LibraryPage.css'

type SortMode = 'newest' | 'oldest' | 'name'
type FilterMode = 'all' | FileCategory

const filters: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'documents', label: 'Documents' },
  { value: 'images', label: 'Images' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'archive', label: 'Archives' },
  { value: 'code', label: 'Code' },
  { value: 'others', label: 'Others' },
]

function LibraryPage() {
  const [files, setFiles] = useState<ChatAttachment[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [sort, setSort] = useState<SortMode>('newest')
  const [previewFile, setPreviewFile] = useState<ChatAttachment | null>(null)
  const [filePendingDeletion, setFilePendingDeletion] = useState<ChatAttachment | null>(null)
  const [editingFileId, setEditingFileId] = useState<number | null>(null)
  const [editingFilename, setEditingFilename] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [busyFileOperation, setBusyFileOperation] = useState<{
    id: number
    action: 'rename' | 'delete'
  } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return files
      .filter((file) => {
        if (filter !== 'all' && file.category !== filter) {
          return false
        }

        if (!normalizedQuery) {
          return true
        }

        return file.filename.toLowerCase().includes(normalizedQuery)
      })
      .sort((left, right) => {
        if (sort === 'name') {
          return left.filename.localeCompare(right.filename)
        }

        const leftTime = new Date(left.created_at).getTime()
        const rightTime = new Date(right.created_at).getTime()

        return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime
      })
  }, [files, filter, query, sort])

  async function loadFiles() {
    try {
      setFiles(await getLibraryFiles())
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('401') || message.includes('Unauthorized')) {
        setError('Your session has expired. Please log in again.')
      } else {
        setError('Could not load library files.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFiles()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  async function uploadSelectedFiles(selectedFiles: FileList | null) {
    const uploads = Array.from(selectedFiles ?? [])

    if (uploads.length === 0) {
      return
    }

    setIsUploading(true)
    setError('')

    try {
      const uploadedFiles = await uploadLibraryFiles(uploads)

      setFiles((currentFiles) => {
        const nextFiles = [...currentFiles]

        for (const file of uploadedFiles) {
          const index = nextFiles.findIndex((item) => item.id === file.id)

          if (index >= 0) {
            nextFiles[index] = file
          } else {
            nextFiles.unshift(file)
          }
        }

        return nextFiles
      })
    } catch {
      setError('Could not upload selected files.')
    } finally {
      setIsUploading(false)
    }
  }

  async function renameFile(file: ChatAttachment, filename: string): Promise<boolean> {
    const nextName = filename.trim()
    if (!nextName || nextName === file.filename) return true
    setBusyFileOperation({ id: file.id, action: 'rename' })
    try {
      const renamedFile = await renameLibraryFile(file.id, nextName)
      setFiles((currentFiles) =>
        currentFiles.map((item) => (item.id === file.id ? renamedFile : item)),
      )
      return true
    } catch {
      setError('Could not rename this file.')
      return false
    } finally {
      setBusyFileOperation(null)
    }
  }

  async function confirmFileDeletion() {
    if (!filePendingDeletion) return
    const file = filePendingDeletion
    setBusyFileOperation({ id: file.id, action: 'delete' })
    try {
      await deleteLibraryFile(file.id)
      setFiles((currentFiles) => currentFiles.filter((item) => item.id !== file.id))
      setFilePendingDeletion(null)
    } catch {
      setError('Could not delete this file.')
    } finally {
      setBusyFileOperation(null)
    }
  }

  function openFile(file: ChatAttachment) {
    window.open(getLibraryFileContentUrl(file.id), '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="library-page" aria-label="Library">
      <header className="library-header">
        <h1>Library</h1>

        <div className="library-header-actions">
          <label className="library-search">
            <span className="library-search-icon" aria-hidden="true" />
            <input
              aria-label="Search library"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              type="search"
              value={query}
            />
          </label>

          <input
            className="library-upload-input"
            multiple
            onChange={(event) => {
              void uploadSelectedFiles(event.target.files)
              event.target.value = ''
            }}
            ref={fileInputRef}
            type="file"
          />

          <button
            className="library-new-button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {isUploading ? <LoadingIndicator label="Uploading..." /> : 'New'}
          </button>
        </div>
      </header>

      <div className="library-toolbar">
        <div className="library-filters" aria-label="File type filters">
          {filters.map((item) => (
            <button
              className={item.value === filter ? 'library-filter active' : 'library-filter'}
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Sort files"
          className="library-sort"
          onChange={(event) => setSort(event.target.value as SortMode)}
          value={sort}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
        </select>
      </div>

      {error && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}

      <div className="library-table" role="table" aria-label="Uploaded files">
        <div className="library-row library-row-head" role="row">
          <span>Name</span>
          <span>Modified</span>
          <span>Size</span>
          <span>Type</span>
          <span>Actions</span>
        </div>

        {isLoading ? (
          <p className="library-empty">
            <LoadingIndicator label="Loading files..." />
          </p>
        ) : visibleFiles.length === 0 ? (
          <p className="library-empty">No files found.</p>
        ) : (
          visibleFiles.map((file) => (
            <div className="library-row" key={file.id} role="row">
              {editingFileId === file.id ? (
                <form
                  className="library-rename-form"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if (busyFileOperation?.id === file.id) return
                    if (await renameFile(file, editingFilename)) {
                      setEditingFileId(null)
                      setEditingFilename('')
                    }
                  }}
                >
                  <input
                    aria-label={`Rename ${file.filename}`}
                    autoFocus
                    maxLength={255}
                    value={editingFilename}
                    disabled={busyFileOperation?.id === file.id}
                    onChange={(event) => setEditingFilename(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setEditingFileId(null)
                        setEditingFilename('')
                      }
                    }}
                  />
                  {busyFileOperation?.id === file.id ? (
                    <LoadingIndicator label="Renaming..." />
                  ) : (
                    <>
                      <button className="library-rename-save" type="submit" aria-label="Save filename" title="Save">
                        <RenameCheckIcon />
                      </button>
                      <button
                        className="library-rename-cancel"
                        type="button"
                        aria-label="Cancel rename"
                        title="Cancel"
                        onClick={() => {
                          setEditingFileId(null)
                          setEditingFilename('')
                        }}
                      >
                        ×
                      </button>
                    </>
                  )}
                </form>
              ) : (
                <button className="library-file-name" onClick={() => setPreviewFile(file)} type="button">
                  <LibraryFileIcon file={file} />
                  <span>{file.filename}</span>
                </button>
              )}
              <span>{formatDate(file.updated_at ?? file.created_at)}</span>
              <span>{formatFileSize(file.byte_size)}</span>
              <span>{formatCategory(file.category)}</span>
              <span className="library-actions">
                <button onClick={() => setPreviewFile(file)} type="button">
                  Preview
                </button>
                <button
                  disabled={busyFileOperation !== null}
                  onClick={() => {
                    setEditingFilename(file.filename)
                    setEditingFileId(file.id)
                  }}
                  type="button"
                >
                  Rename
                </button>
                <a href={getLibraryFileDownloadUrl(file.id)}>Download</a>
                <button onClick={() => openFile(file)} type="button">
                  Open
                </button>
                <button
                  className="danger"
                  disabled={busyFileOperation !== null}
                  onClick={() => setFilePendingDeletion(file)}
                  type="button"
                >
                  Delete
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {previewFile && (
        <div className="library-preview-backdrop" role="presentation">
          <section className="library-preview" role="dialog" aria-modal="true">
            <header>
              <h2>{previewFile.filename}</h2>
              <button onClick={() => setPreviewFile(null)} type="button" aria-label="Close preview">
                x
              </button>
            </header>
            <PreviewBody file={previewFile} />
          </section>
        </div>
      )}

      {filePendingDeletion && (
        <div
          className="library-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busyFileOperation?.action !== 'delete') {
              setFilePendingDeletion(null)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && busyFileOperation?.action !== 'delete') {
              setFilePendingDeletion(null)
            }
          }}
        >
          <section
            className="library-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="library-delete-title"
            aria-describedby="library-delete-description"
          >
            <h2 id="library-delete-title">Delete this file?</h2>
            <p id="library-delete-description">
              <strong>{filePendingDeletion.filename}</strong> will be permanently deleted from your library.
            </p>
            <div className="library-confirm-actions">
              <button
                className="library-cancel-button"
                autoFocus
                disabled={busyFileOperation?.action === 'delete'}
                onClick={() => setFilePendingDeletion(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="library-delete-button"
                disabled={busyFileOperation?.action === 'delete'}
                onClick={() => void confirmFileDeletion()}
                type="button"
              >
                {busyFileOperation?.action === 'delete'
                  ? <LoadingIndicator label="Deleting..." />
                  : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function PreviewBody({ file }: { file: ChatAttachment }) {
  const previewUrl = getLibraryFileContentUrl(file.id)

  if (file.category === 'images') {
    return <img className="preview-image" src={previewUrl} alt={file.filename} />
  }

  if (file.category === 'audio') {
    return <audio className="preview-media" controls src={previewUrl} />
  }

  if (file.category === 'video') {
    return <video className="preview-media" controls src={previewUrl} />
  }

  if (file.extension === '.pdf' || file.category === 'documents' || file.category === 'code') {
    return <iframe className="preview-frame" src={previewUrl} title={file.filename} />
  }

  return (
    <dl className="preview-metadata">
      <div>
        <dt>Filename</dt>
        <dd>{file.filename}</dd>
      </div>
      <div>
        <dt>Type</dt>
        <dd>{formatCategory(file.category)}</dd>
      </div>
      <div>
        <dt>MIME</dt>
        <dd>{file.mime_type ?? 'application/octet-stream'}</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>{formatFileSize(file.byte_size)}</dd>
      </div>
    </dl>
  )
}

function LibraryFileIcon({ file }: { file: ChatAttachment }) {
  const isImage = file.category === 'images'
  const previewUrl = getLibraryFileContentUrl(file.id)

  if (isImage) {
    return <img className="library-thumb" src={previewUrl} alt="" />
  }

  return (
    <span className={`library-file-icon ${file.category ?? 'others'}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M6 3h8l4 4v14H6V3z" />
        <path d="M14 3v5h5" />
      </svg>
    </span>
  )
}

function RenameCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatCategory(category?: string | null) {
  if (!category) {
    return 'Other'
  }

  return category.charAt(0).toUpperCase() + category.slice(1)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default LibraryPage
