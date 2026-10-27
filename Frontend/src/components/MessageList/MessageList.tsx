import { memo, type RefObject } from 'react'
import type { ChatMessage, ChatMessageAttachment } from '../../types/chat'
import EmptyState from '../EmptyState/EmptyState'
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer'
import MessageCopyButton from '../MessageCopyButton/MessageCopyButton'
import LoadingIndicator from '../LoadingIndicator/LoadingIndicator'
import './MessageList.css'

type MessageListProps = {
  messages: ChatMessage[]
  isSending: boolean
  isLoadingMessages: boolean
  assistantStatusText?: string
  endRef: RefObject<HTMLDivElement | null>
  scrollContainerRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
  onShare: (message: ChatMessage) => void
  onOpenPdf: (attachment: ChatMessageAttachment) => void
}

type MessageItemProps = {
  message: ChatMessage
  isStreaming: boolean
  assistantStatusText?: string
  onShare: (message: ChatMessage) => void
  onOpenPdf: (attachment: ChatMessageAttachment) => void
}

const MessageItem = memo(function MessageItem({
  message,
  isStreaming,
  assistantStatusText,
  onShare,
  onOpenPdf,
}: MessageItemProps) {
  const copyValue = getMessageCopyValue(message)
  const canCopy = copyValue.length > 0
  const showActions = canCopy && !isStreaming && message.tone !== 'error'

  return (
    <article
      className={`message-row ${message.role} ${message.tone === 'error' ? 'error' : ''}`}
    >
      <div className="message-stack">
        <div className="message-bubble">
          {message.role === 'assistant' && !message.content.trim() ? (
            <LoadingIndicator
              className="thinking-indicator"
              label={assistantStatusText || 'Thinking...'}
              textOnly
            />
          ) : message.role === 'assistant' ? (
            <>
              <MarkdownRenderer content={message.content} />
              {isStreaming && (
                <LoadingIndicator
                  className="streaming-indicator"
                  label={assistantStatusText || 'Thinking...'}
                  textOnly
                />
              )}
            </>
          ) : (
            <>
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachments attachments={message.attachments} onOpenPdf={onOpenPdf} />
              )}
              {message.content.trim() && <p>{message.content}</p>}
            </>
          )}
        </div>

        {showActions && (
          <div className="message-actions">
            <MessageCopyButton
              label={
                message.role === 'assistant'
                  ? 'Copy assistant response'
                  : 'Copy user message'
              }
              value={copyValue}
            />

            {message.role === 'assistant' ? (
              <>
                <MessageActionButton label="Give response feedback" disabled>
                  <ThumbIcon />
                </MessageActionButton>
                <MessageActionButton
                  label="Share response"
                  onClick={() => onShare(message)}
                >
                  <ShareIcon />
                </MessageActionButton>
                <MessageActionButton label="Regenerate response" disabled>
                  <RegenerateIcon />
                </MessageActionButton>
              </>
            ) : (
              <>
                <MessageActionButton
                  label="Share message"
                  onClick={() => onShare(message)}
                >
                  <ShareIcon />
                </MessageActionButton>
                <MessageActionButton label="Edit message" disabled>
                  <EditIcon />
                </MessageActionButton>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
})

function MessageList({
  messages,
  isSending,
  isLoadingMessages,
  assistantStatusText,
  endRef,
  scrollContainerRef,
  onScroll,
  onShare,
  onOpenPdf,
}: MessageListProps) {
  const lastMessage = messages[messages.length - 1]
  const hasStreamingAssistant = isSending && lastMessage?.role === 'assistant'

  return (
    <div
      ref={scrollContainerRef}
      className="message-list"
      role="log"
      aria-live="polite"
      onScroll={onScroll}
    >
      {isLoadingMessages ? (
        <div className="message-loading">
          <LoadingIndicator label="Loading saved messages..." />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState />
      ) : null}

      <div className="messages-inner">
        {messages.map((message) => (
          <MessageItem
            isStreaming={hasStreamingAssistant && message.id === lastMessage?.id}
            key={message.id}
            assistantStatusText={
              hasStreamingAssistant && message.id === lastMessage?.id
                ? assistantStatusText
                : undefined
            }
            message={message}
            onShare={onShare}
            onOpenPdf={onOpenPdf}
          />
        ))}

        {isSending && !hasStreamingAssistant && (
          <article className="message-row assistant">
            <div className="message-bubble typing-bubble" aria-label="Assistant is responding">
              <LoadingIndicator label="Thinking..." textOnly />
            </div>
          </article>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}

function MessageAttachments({
  attachments,
  onOpenPdf,
}: {
  attachments: ChatMessageAttachment[]
  onOpenPdf: (attachment: ChatMessageAttachment) => void
}) {
  return (
    <div className="message-attachments" aria-label="Message attachments">
      {attachments.map((attachment) => (
        <div
          aria-label={`Open ${attachment.filename} in file preview`}
          className="message-attachment message-attachment-open"
          key={attachment.id}
          onClick={() => onOpenPdf(attachment)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpenPdf(attachment)
            }
          }}
          role="button"
          tabIndex={0}
          title="Open file beside chat"
        >
          {attachment.category === 'images' && attachment.preview_url ? (
            <img
              alt={attachment.filename}
              className="message-attachment-preview"
              src={attachment.preview_url}
            />
          ) : (
            <span className={`message-attachment-icon ${attachment.category}`} aria-hidden="true">
              <FileGlyph />
            </span>
          )}

          <span className="message-attachment-meta">
            <span className="message-attachment-name">{attachment.filename}</span>
            <span className="message-attachment-detail">
              {formatAttachmentCategory(attachment.category)} · {formatFileSize(attachment.size)}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

function FileGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 3h8l4 4v14H6V3z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

function formatAttachmentCategory(category: ChatMessageAttachment['category']) {
  const labels: Record<ChatMessageAttachment['category'], string> = {
    documents: 'Document',
    images: 'Image',
    audio: 'Audio',
    video: 'Video',
    archive: 'Archive',
    code: 'Code',
    others: 'File',
  }

  return labels[category]
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

function getMessageCopyValue(message: ChatMessage) {
  const text = message.content.trim()
  const attachments = message.attachments ?? []

  if (attachments.length === 0) {
    return text
  }

  const attachmentText = attachments
    .map((attachment) => `Attached file: ${attachment.filename}`)
    .join('\n')

  return text ? `${attachmentText}\n\n${text}` : attachmentText
}

type MessageActionButtonProps = {
  label: string
  children: React.ReactNode
  disabled?: boolean
  onClick?: () => void
}

function MessageActionButton({
  label,
  children,
  disabled = false,
  onClick,
}: MessageActionButtonProps) {
  return (
    <button
      aria-label={label}
      className="message-action-button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Coming soon' : label}
      type="button"
    >
      {children}
    </button>
  )
}

function ThumbIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 10v10H4V10h3Zm2 10h7.4a2 2 0 0 0 1.9-1.37l1.55-4.65A2 2 0 0 0 17.95 11H14l.55-3.13A2.25 2.25 0 0 0 12.33 5L9 10v10Z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 16V3m0 0L7 8m5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  )
}

function RegenerateIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 11a8 8 0 1 0 2 5.5M20 4v7h-7" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m4 20 4.2-1 9.6-9.6a2.12 2.12 0 0 0-3-3L5.2 16 4 20Zm9.5-12.5 3 3" />
    </svg>
  )
}

export default MessageList
