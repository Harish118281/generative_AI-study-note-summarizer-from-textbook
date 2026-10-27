import { useEffect, useState } from 'react'
import './MessageCopyButton.css'

type MessageCopyButtonProps = {
  value: string
  label: string
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

function MessageCopyButton({ value, label }: MessageCopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (!isCopied) {
      return
    }

    const timeoutId = window.setTimeout(() => setIsCopied(false), 1400)
    return () => window.clearTimeout(timeoutId)
  }, [isCopied])

  async function handleCopy() {
    const copyValue = value

    if (!copyValue) {
      return
    }

    await copyText(copyValue)
    setIsCopied(true)
  }

  return (
    <button
      aria-label={isCopied ? 'Copied message' : label}
      className="message-copy-button"
      disabled={!value}
      onClick={handleCopy}
      title={isCopied ? 'Copied' : 'Copy'}
      type="button"
    >
      {isCopied ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <rect x="4" y="4" width="11" height="11" rx="2" />
        </svg>
      )}
    </button>
  )
}

export default MessageCopyButton
