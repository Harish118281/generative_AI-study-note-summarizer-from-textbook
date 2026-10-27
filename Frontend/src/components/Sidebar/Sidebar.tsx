import { useRef, useState } from 'react'
import type { ChatSession } from '../../types/chat'
import type { CurrentUser } from '../../types/auth'
import LoadingIndicator from '../LoadingIndicator/LoadingIndicator'
import './Sidebar.css'

type SidebarProps = {
  activeChatId: number | null
  activeView: 'chat' | 'library'
  deletingChatId: number | null
  renamingChatId: number | null
  error: string
  isCollapsed: boolean
  isLoading: boolean
  isLoggingOut: boolean
  recentItems: ChatSession[]
  user: CurrentUser
  onDeleteChat: (session: ChatSession) => void
  onLogout: () => void
  onOpenLibrary: () => void
  onOpenSettings: () => void
  onNewChat: () => void
  onRenameChat: (session: ChatSession, title: string) => Promise<boolean>
  onSelectChat: (session: ChatSession) => void
  onToggleSidebar: () => void
}

function Sidebar({
  activeChatId,
  activeView,
  deletingChatId,
  renamingChatId,
  error,
  isCollapsed,
  isLoading,
  isLoggingOut,
  recentItems,
  user,
  onDeleteChat,
  onLogout,
  onOpenLibrary,
  onOpenSettings,
  onNewChat,
  onRenameChat,
  onSelectChat,
  onToggleSidebar,
}: SidebarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuChatId, setOpenMenuChatId] = useState<number | null>(null)
  const [editingChatId, setEditingChatId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visibleItems = normalizedQuery
    ? recentItems.filter((item) => item.title.toLowerCase().includes(normalizedQuery))
    : recentItems

  return (
    <aside
      className={isCollapsed ? 'sidebar collapsed' : 'sidebar'}
      aria-label="Conversation history"
    >
      <div className="sidebar-topbar">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>

        <div className="sidebar-top-actions">
          {!isCollapsed && (
            <button
              className="sidebar-icon-button"
              type="button"
              onClick={() => setIsSearchOpen((currentValue) => !currentValue)}
              aria-label="Search chats"
              title="Search chats"
            >
              <span className="search-glyph" aria-hidden="true" />
            </button>
          )}

          <button
            className="sidebar-icon-button sidebar-toggle-button"
            type="button"
            onClick={onToggleSidebar}
            aria-label={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
          >
            <span className="panel-glyph" aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        className="new-chat-button"
        type="button"
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
      >
        <span className="button-icon" aria-hidden="true">
          +
        </span>
        {!isCollapsed && <span>New chat</span>}
      </button>

      <button
        className="sidebar-nav-button"
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        <SettingsGlyph />
        {!isCollapsed && <span>Settings</span>}
      </button>

      <button
        className={activeView === 'library' ? 'sidebar-nav-button active' : 'sidebar-nav-button'}
        type="button"
        onClick={onOpenLibrary}
        aria-label="Library"
        title="Library"
      >
        <span className="library-glyph" aria-hidden="true" />
        {!isCollapsed && <span>Library</span>}
      </button>

      {!isCollapsed && (
        <>
          {isSearchOpen && (
            <label className="sidebar-search">
              <span className="search-glyph" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search chats"
              />
            </label>
          )}

          <nav className="history-list" aria-label="Saved chats">
            <span className="history-label">Chats</span>
            {isLoading ? (
              <p className="history-empty">
                <LoadingIndicator label="Loading chats..." />
              </p>
            ) : error ? (
              <p className="history-empty error">{error}</p>
            ) : recentItems.length === 0 ? (
              <p className="history-empty">No saved chats yet.</p>
            ) : visibleItems.length === 0 ? (
              <p className="history-empty">No matching chats.</p>
            ) : (
              visibleItems.map((item) => (
                <div
                  className={`${item.id === activeChatId ? 'history-row active' : 'history-row'}${editingChatId === item.id ? ' editing' : ''}`}
                  key={item.id}
                >
                  {editingChatId === item.id ? (
                    <form
                      className="history-rename-form"
                      onSubmit={async (event) => {
                        event.preventDefault()
                        if (renamingChatId === item.id) return
                        const title = editingTitle.trim()
                        if (!title) {
                          renameInputRef.current?.focus()
                          return
                        }
                        if (await onRenameChat(item, title)) {
                          setEditingChatId(null)
                          setEditingTitle('')
                        }
                      }}
                    >
                      <input
                        ref={renameInputRef}
                        aria-label="Chat title"
                        autoFocus
                        maxLength={80}
                        value={editingTitle}
                        disabled={renamingChatId === item.id}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setEditingChatId(null)
                            setEditingTitle('')
                          }
                        }}
                      />
                      {renamingChatId === item.id ? (
                        <LoadingIndicator
                          className="sidebar-operation-indicator"
                          label="Renaming..."
                        />
                      ) : (
                        <>
                          <button className="rename-save-button" type="submit" aria-label="Save chat title" title="Save">
                            <RenameCheckIcon />
                          </button>
                          <button
                            className="rename-cancel-button"
                            type="button"
                            aria-label="Cancel rename"
                            title="Cancel"
                            onClick={() => {
                              setEditingChatId(null)
                              setEditingTitle('')
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </form>
                  ) : (
                    <button
                      className="history-item"
                      disabled={deletingChatId === item.id}
                      onClick={() => onSelectChat(item)}
                      type="button"
                    >
                      <span>{item.title}</span>
                      {deletingChatId === item.id && (
                        <LoadingIndicator
                          className="sidebar-operation-indicator"
                          label="Deleting..."
                        />
                      )}
                    </button>
                  )}
                  <button
                    className="chat-menu-button"
                    disabled={deletingChatId === item.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenMenuChatId((currentId) =>
                        currentId === item.id ? null : item.id,
                      )
                    }}
                    title="Chat options"
                    type="button"
                    aria-label={`Options for ${item.title}`}
                    aria-expanded={openMenuChatId === item.id}
                  >
                    ...
                  </button>
                  {openMenuChatId === item.id && (
                    <div className="chat-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuChatId(null)
                          setEditingTitle(item.title)
                          setEditingChatId(item.id)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        disabled={deletingChatId === item.id}
                        onClick={() => {
                          setOpenMenuChatId(null)
                          onDeleteChat(item)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </nav>

        </>
      )}

      <div className="sidebar-account">
        <span className="account-avatar" aria-hidden="true">
          {getInitials(user.name)}
        </span>
        {!isCollapsed && (
          <>
            <div className="account-details">
              <span className="account-name">{user.name}</span>
              <span className="account-email">{user.email}</span>
            </div>
            <button
              className="logout-button"
              disabled={isLoggingOut}
              onClick={onLogout}
              type="button"
              title="Log out"
              aria-label="Log out"
            >
              {isLoggingOut ? (
                <LoadingIndicator label="Signing out..." />
              ) : 'Log out'}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

export default Sidebar

function SettingsGlyph() {
  return (
    <svg className="settings-glyph" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z" />
    </svg>
  )
}

function RenameCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function getInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return letters || 'U'
}
