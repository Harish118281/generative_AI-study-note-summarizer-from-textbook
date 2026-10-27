import type { ChatSession } from '../../types/chat'
import './ChatHeader.css'

type ChatHeaderProps = {
  activeChat: ChatSession | null
  onClear: () => void
}

function ChatHeader({ activeChat, onClear }: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <div className="chat-title-block">
        <span>AI Study Notes Summarizer</span>
        <h1>{activeChat?.title ?? 'Paste your notes to begin'}</h1>
      </div>

      <button
        className="clear-chat-button"
        type="button"
        aria-label="Clear chat"
        title="Clear chat"
        onClick={onClear}
      >
        <span aria-hidden="true">x</span>
      </button>
    </header>
  )
}

export default ChatHeader
