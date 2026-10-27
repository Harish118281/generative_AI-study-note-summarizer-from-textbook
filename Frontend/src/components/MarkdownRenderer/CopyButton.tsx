import { useEffect, useState } from 'react'
import './CopyButton.css'

type CopyButtonProps = {
  value: string
}

function CopyButton({ value }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    if (!isCopied) {
      return
    }

    const timeoutId = window.setTimeout(() => setIsCopied(false), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [isCopied])

  async function copyToClipboard() {
    if (!value) {
      return
    }

    await navigator.clipboard.writeText(value)
    setIsCopied(true)
  }

  return (
    <button
      aria-label={isCopied ? 'Code copied' : 'Copy code'}
      className="copy-button"
      onClick={copyToClipboard}
      type="button"
    >
      {isCopied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default CopyButton
