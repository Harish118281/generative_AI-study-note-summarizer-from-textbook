import { useLayoutEffect, useRef } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent, RefObject } from 'react'
import type { ChatModel, ChatModelOption, PendingAttachment } from '../../types/chat'
import './Composer.css'

type ComposerProps = {
  value: string
  error: string
  attachments: PendingAttachment[]
  disabled: boolean
  canSend: boolean
  isSending: boolean
  model: ChatModel
  modelOptions: ChatModelOption[]
  inputRef: RefObject<HTMLTextAreaElement | null>
  showScrollToBottom: boolean
  onChange: (value: string) => void
  onFilesSelected: (files: File[]) => void
  onRemoveAttachment: (fileId: string) => void
  onModelChange: (model: ChatModel) => void
  onScrollToBottom: () => void
  onSubmit: () => void
  onStop: () => void
}

function Composer({
  value,
  error,
  attachments,
  disabled,
  canSend,
  isSending,
  model,
  modelOptions,
  inputRef,
  showScrollToBottom,
  onChange,
  onFilesSelected,
  onRemoveAttachment,
  onModelChange,
  onScrollToBottom,
  onSubmit,
  onStop,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    const textarea = inputRef.current

    if (!textarea) {
      return
    }

    const maxHeight = 200

    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [inputRef, value])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSending) {
      onStop()
      return
    }

    onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      if (isSending) {
        return
      }

      onSubmit()
    }
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])

    event.target.value = ''

    if (files.length > 0) {
      onFilesSelected(files)
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {showScrollToBottom && (
        <button
          aria-label="Scroll to latest message"
          className="scroll-to-bottom-button"
          onClick={onScrollToBottom}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 5v13M7 13l5 5 5-5" />
          </svg>
        </button>
      )}

      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}

      <div className="composer-box">
        {attachments.length > 0 && (
          <div className="attachment-list" aria-label="Attached files">
            {attachments.map((file) => (
              <span className="attachment-chip" key={file.id}>
                <FileIcon category={file.category} />
                <span className="attachment-name">{file.filename}</span>
                <span className="attachment-size">{formatFileSize(file.size)}</span>
                <button
                  aria-label={`Remove ${file.filename}`}
                  className="attachment-remove"
                  disabled={disabled}
                  onClick={() => onRemoveAttachment(file.id)}
                  type="button"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          aria-label="Message"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI Anything"
          ref={inputRef}
          rows={1}
          value={value}
        />

        <div className="composer-controls">
          <div className="composer-left-controls">
            <input
              className="file-input"
              disabled={disabled}
              multiple
              onChange={handleFileSelect}
              ref={fileInputRef}
              type="file"
            />
            <button
              aria-label="Attach file"
              className="attach-button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>

          <div className="composer-submit-controls">
            <select
              aria-label="Select model"
              className="model-select"
              disabled={disabled}
              onChange={(event) => onModelChange(event.target.value as ChatModel)}
              value={model}
            >
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              className={isSending ? 'send-button stop-button' : 'send-button'}
              type="submit"
              disabled={!isSending && !canSend}
              aria-label={isSending ? 'Stop response' : 'Send'}
            >
              {isSending ? <StopIcon /> : <span aria-hidden="true">-&gt;</span>}
            </button>
          </div>
        </div>
      </div>

      <p className="composer-disclaimer">
        This is an AI and can make mistakes. Please double-check your response.
      </p>
    </form>
  )
}

function StopIcon() {
  return (
    <svg aria-hidden="true" className="stop-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
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

function FileIcon({ category }: { category: PendingAttachment['category'] }) {
  return (
    <span className={`attachment-icon ${category}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M6 3h8l4 4v14H6V3z" />
        <path d="M14 3v5h5" />
        {category === 'images' && <circle cx="10" cy="12" r="1.7" />}
        {category === 'images' && <path d="M8 18l3.2-3.4 2 2 1.7-1.8L18 18" />}
        {category === 'audio' && <path d="M10 17V9l7-2v8" />}
        {category === 'audio' && <circle cx="8.5" cy="17" r="1.5" />}
        {category === 'audio' && <circle cx="15.5" cy="15" r="1.5" />}
        {category === 'video' && <path d="M9 10l6 3-6 3v-6z" />}
        {category === 'archive' && <path d="M9 7h6M9 11h6M9 15h6" />}
        {category === 'code' && <path d="M10 10l-2 2 2 2M14 10l2 2-2 2" />}
      </svg>
    </span>
  )
}

export default Composer
