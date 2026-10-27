import { useEffect, useState } from 'react'
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer'
import './ShareDialog.css'

type ShareDialogProps = {
  title: string
  content: string
  onClose: () => void
}

function ShareDialog({ title, content, onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function copyShareLink() {
    const shareText = `${title}\n\n${content}`
    const shareValue = `${window.location.href}\n\n${shareText}`

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareValue)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = shareValue
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    setCopied(true)
  }

  function shareTo(platform: 'x' | 'linkedin' | 'reddit') {
    const shareText = `${title}\n\n${content}`
    const pageUrl = window.location.href
    let targetUrl = ''

    if (platform === 'x') {
      targetUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}`
    }

    if (platform === 'linkedin') {
      targetUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`
    }

    if (platform === 'reddit') {
      targetUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(title)}`
    }

    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="share-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Share message"
        aria-modal="true"
        className="share-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="share-dialog-header">
          <h2>{title}</h2>
          <button aria-label="Close share dialog" onClick={onClose} type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="share-dialog-preview">
          <MarkdownRenderer content={content} />
        </div>

        <div className="share-options">
          <ShareOption
            label={copied ? 'Copied' : 'Copy link'}
            onClick={() => void copyShareLink()}
          >
            <LinkIcon />
          </ShareOption>
          <ShareOption label="X" onClick={() => shareTo('x')}>
            <span className="share-letter">X</span>
          </ShareOption>
          <ShareOption label="LinkedIn" onClick={() => shareTo('linkedin')}>
            <span className="share-letter linkedin">in</span>
          </ShareOption>
          <ShareOption label="Reddit" onClick={() => shareTo('reddit')}>
            <span className="share-letter">r</span>
          </ShareOption>
        </div>
      </section>
    </div>
  )
}

type ShareOptionProps = {
  label: string
  onClick: () => void
  children: React.ReactNode
}

function ShareOption({ label, onClick, children }: ShareOptionProps) {
  return (
    <button className="share-option" onClick={onClick} type="button">
      <span className="share-option-icon">{children}</span>
      <span>{label}</span>
    </button>
  )
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10.2 13.8a4 4 0 0 0 5.6 0l2.3-2.3a4 4 0 0 0-5.6-5.6L11.2 7M13.8 10.2a4 4 0 0 0-5.6 0l-2.3 2.3a4 4 0 1 0 5.6 5.6l1.3-1.3" />
    </svg>
  )
}

export default ShareDialog
