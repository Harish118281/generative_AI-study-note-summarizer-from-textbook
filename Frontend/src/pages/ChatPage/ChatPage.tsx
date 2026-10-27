import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import Composer from '../../components/Composer/Composer'
import MessageList from '../../components/MessageList/MessageList'
import ShareDialog from '../../components/ShareDialog/ShareDialog'
import PdfReaderPanel from '../../components/PdfReaderPanel/PdfReaderPanel'
import Sidebar from '../../components/Sidebar/Sidebar'
import {
  createChat,
  deleteChat,
  getChatFiles,
  getChatFileContentUrl,
  getChatMessages,
  getChats,
  renameChat,
  streamMessage,
} from '../../services/chatservice'
import LibraryPage from '../LibraryPage/LibraryPage'
import SettingsPage, { type AppearanceMode } from '../SettingsPage/SettingsPage'
import { accentColorOptions, isAccentColor, type AccentColor } from '../../theme/accentColors'
import { chatModelOptions } from '../../types/chat'
import type {
  ChatMessage,
  ChatAttachment,
  FileCategory,
  ChatModel,
  ChatSession,
  PendingAttachment,
  ChatMessageAttachment,
  SavedChatMessage,
} from '../../types/chat'
import type { CurrentUser } from '../../types/auth'
import './ChatPage.css'

type ChatPageProps = {
  user: CurrentUser
  isLoggingOut: boolean
  onLogout: () => void
}

type ComposerDraft = {
  input: string
  attachments: PendingAttachment[]
}

const NEW_CHAT_DRAFT_KEY = 'new'
const EMPTY_DRAFT: ComposerDraft = { input: '', attachments: [] }
const ACTIVE_CHAT_STORAGE_PREFIX = 'studyai-active-chat:'
const CHAT_MODEL_STORAGE_PREFIX = 'studyai-chat-model:'
const WEB_SEARCH_STORAGE_PREFIX = 'studyai-web-search:'
const APPEARANCE_STORAGE_PREFIX = 'studyai-appearance:'
const ACCENT_COLOR_STORAGE_PREFIX = 'studyai-accent-color:'

function readStoredModel(userId: number): ChatModel {
  try {
    const savedModel = localStorage.getItem(`${CHAT_MODEL_STORAGE_PREFIX}${userId}`)
    return chatModelOptions.some((option) => option.value === savedModel)
      ? (savedModel as ChatModel)
      : 'nvidia-nemotron'
  } catch {
    return 'nvidia-nemotron'
  }
}

function readStoredBoolean(key: string, userId: number, fallback: boolean) {
  try {
    const stored = localStorage.getItem(`${key}${userId}`)
    return stored === null ? fallback : stored === 'true'
  } catch {
    return fallback
  }
}

function readStoredAppearance(userId: number): AppearanceMode {
  try {
    const value = localStorage.getItem(`${APPEARANCE_STORAGE_PREFIX}${userId}`)
    return value === 'dark' || value === 'light' ? value : 'system'
  } catch {
    return 'system'
  }
}

function readStoredAccentColor(userId: number): AccentColor {
  try {
    const value = localStorage.getItem(`${ACCENT_COLOR_STORAGE_PREFIX}${userId}`)
    return isAccentColor(value) ? value : 'teal'
  } catch {
    return 'teal'
  }
}

function ChatPage({ user, isLoggingOut, onLogout }: ChatPageProps) {
  const [activeView, setActiveView] = useState<'chat' | 'library'>('chat')
  const [chatFiles, setChatFiles] = useState<ChatAttachment[]>([])
  const [isLoadingChatFiles, setIsLoadingChatFiles] = useState(false)
  const [isPdfReaderOpen, setIsPdfReaderOpen] = useState(false)
  const [selectedPdfId, setSelectedPdfId] = useState<number | null>(null)
  const [pdfFilesError, setPdfFilesError] = useState('')
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionMessages, setSessionMessages] = useState<Record<number, ChatMessage[]>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([])
  const [input, setInput] = useState('')
  const [selectedModel, setSelectedModel] = useState<ChatModel>(() => readStoredModel(user.id))
  const [webSearchEnabled, setWebSearchEnabled] = useState(() =>
    readStoredBoolean(WEB_SEARCH_STORAGE_PREFIX, user.id, true),
  )
  const [appearance, setAppearance] = useState<AppearanceMode>(() => readStoredAppearance(user.id))
  const [accentColor, setAccentColor] = useState<AccentColor>(() => readStoredAccentColor(user.id))
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [sendingChatKeys, setSendingChatKeys] = useState<string[]>([])
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [filePaneWidth, setFilePaneWidth] = useState(580)
  const [isLoadingChats, setIsLoadingChats] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<number | null>(null)
  const [renamingChatId, setRenamingChatId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [isNearConversationBottom, setIsNearConversationBottom] = useState(true)
  const [shareMessage, setShareMessage] = useState<ChatMessage | null>(null)
  const [webSearchStatuses, setWebSearchStatuses] = useState<Record<string, string>>({})
  const messageId = useRef(1)
  const chatLoadId = useRef(0)
  const composerDraftsRef = useRef<Record<string, ComposerDraft>>({})
  const activeChatRef = useRef(activeChat)
  const messagesRef = useRef(messages)
  const sessionMessagesRef = useRef(sessionMessages)
  const sendingChatKeysRef = useRef(new Set<string>())
  const streamAbortControllersRef = useRef(new Map<string, AbortController>())
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const sidebarDragRef = useRef<{ startX: number } | null>(null)
  const filePaneDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  activeChatRef.current = activeChat
  messagesRef.current = messages
  sessionMessagesRef.current = sessionMessages

  const activeChatSending = isActiveChatSending()
  const webSearchStatus = webSearchStatuses[getDraftKey()] ?? ''

  const canSend =
    (input.trim().length > 0 || pendingFiles.length > 0) &&
    !isActiveChatSending() &&
    !isLoadingMessages
  const isEmptyChat =
    activeView === 'chat' &&
    messages.length === 0 &&
    !isLoadingMessages

  function isActiveChatSending() {
    return sendingChatKeys.includes(getDraftKey())
  }

  function setChatSending(key: string, sending: boolean) {
    const nextKeys = new Set(sendingChatKeysRef.current)
    if (sending) {
      nextKeys.add(key)
    } else {
      nextKeys.delete(key)
    }
    sendingChatKeysRef.current = nextKeys
    setSendingChatKeys([...nextKeys])
  }

  function setChatWebSearchStatus(key: string, status: string) {
    setWebSearchStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses }
      if (status) {
        nextStatuses[key] = status
      } else {
        delete nextStatuses[key]
      }
      return nextStatuses
    })
  }

  function activateChat(chat: ChatSession | null) {
    activeChatRef.current = chat
    setActiveChat(chat)
    try {
      localStorage.setItem(
        `${ACTIVE_CHAT_STORAGE_PREFIX}${user.id}`,
        chat ? String(chat.id) : NEW_CHAT_DRAFT_KEY,
      )
    } catch {
      // Chat selection still works when browser storage is unavailable.
    }
  }

  function showMessages(nextMessages: ChatMessage[]) {
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }

  function storeChatMessages(chatId: number, nextMessages: ChatMessage[]) {
    const nextCache = { ...sessionMessagesRef.current, [chatId]: nextMessages }
    sessionMessagesRef.current = nextCache
    setSessionMessages(nextCache)
    if (activeChatRef.current?.id === chatId) {
      showMessages(nextMessages)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function loadSavedChats() {
      setIsLoadingChats(true)
      setHistoryError('')

      try {
        const savedChats = await getChats()

        if (isMounted) {
          setSessions(savedChats)
          let savedSelection: string | null = null
          try {
            savedSelection = localStorage.getItem(`${ACTIVE_CHAT_STORAGE_PREFIX}${user.id}`)
          } catch {
            savedSelection = null
          }

          if (savedSelection !== NEW_CHAT_DRAFT_KEY && savedChats.length > 0) {
            const preferredId = Number(savedSelection)
            const preferredChat = savedChats.find((chat) => chat.id === preferredId)
            void selectChat(preferredChat ?? savedChats[0])
          }
        }
      } catch {
        if (isMounted) {
          setHistoryError('Could not load saved chats.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingChats(false)
        }
      }
    }

    void loadSavedChats()

    return () => {
      isMounted = false
    }
  // Account changes should reload the history once, not restart on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  useEffect(() => {
    try {
      localStorage.setItem(`${CHAT_MODEL_STORAGE_PREFIX}${user.id}`, selectedModel)
    } catch {
      // Keep model selection usable when browser storage is unavailable.
    }
  }, [selectedModel, user.id])

  useEffect(() => {
    try {
      localStorage.setItem(`${WEB_SEARCH_STORAGE_PREFIX}${user.id}`, String(webSearchEnabled))
      localStorage.setItem(`${APPEARANCE_STORAGE_PREFIX}${user.id}`, appearance)
      localStorage.setItem(`${ACCENT_COLOR_STORAGE_PREFIX}${user.id}`, accentColor)
    } catch {
      // Preferences remain usable for the current session when storage is unavailable.
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyAppearance = () => {
      document.documentElement.dataset.theme =
        appearance === 'system' ? (media.matches ? 'dark' : 'light') : appearance
    }
    const selectedAccent = accentColorOptions.find((option) => option.value === accentColor)!
    document.documentElement.style.setProperty('--color-accent', selectedAccent.color)
    document.documentElement.style.setProperty('--color-accent-strong', selectedAccent.strong)
    document.documentElement.style.setProperty('--color-accent-soft', selectedAccent.soft)
    document.documentElement.style.setProperty('--color-accent-tint', selectedAccent.tint)
    applyAppearance()
    if (appearance === 'system') {
      media.addEventListener('change', applyAppearance)
      return () => media.removeEventListener('change', applyAppearance)
    }
  }, [accentColor, appearance, user.id, webSearchEnabled])

  useEffect(() => {
    if (isNearConversationBottom) {
      scrollToLatestMessage('auto')
    }
  }, [isNearConversationBottom, activeChatSending, messages])

  function createMessageId() {
    const id = messageId.current
    messageId.current += 1
    return id
  }

  function focusComposer() {
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  function scrollToLatestMessage(behavior: ScrollBehavior = 'smooth') {
    const messageList = messageListRef.current

    if (!messageList) {
      return
    }

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior,
    })
  }

  function handleMessageListScroll() {
    const messageList = messageListRef.current

    if (!messageList) {
      return
    }

    const distanceFromBottom =
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight

    setIsNearConversationBottom(distanceFromBottom < 80)
  }

  function handleScrollToBottom() {
    setIsNearConversationBottom(true)
    scrollToLatestMessage()
  }

  function openShareDialog(message: ChatMessage) {
    if (message.content.trim()) {
      setShareMessage(message)
    }
  }

  async function refreshChatFiles(chatId: number, target?: ChatMessageAttachment) {
    setIsLoadingChatFiles(true)
    setPdfFilesError('')

    try {
      const files = await getChatFiles(chatId)
      if (activeChatRef.current?.id !== chatId) return

      setChatFiles(files)
      const matchesName = (file: ChatAttachment) =>
        file.original_filename === target?.filename || file.filename === target?.filename
      const targetFile = target
        ? files.find((file) => matchesName(file) && (file.size === target.size || file.size == null))
          ?? files.find(matchesName)
        : undefined
      if (target && !targetFile) {
        setPdfFilesError(`Could not find ${target.filename} in this chat.`)
      }
      setSelectedPdfId((currentId) =>
        targetFile?.id ?? (files.some((file) => file.id === currentId) ? currentId : files[0]?.id ?? null),
      )
    } catch {
      if (activeChatRef.current?.id === chatId) {
        setPdfFilesError('Could not load the files attached to this chat.')
      }
    } finally {
      if (activeChatRef.current?.id === chatId) {
        setIsLoadingChatFiles(false)
      }
    }
  }

  function openMessageAttachment(attachment: ChatMessageAttachment) {
    const chatId = activeChatRef.current?.id
    if (!chatId) return
    setIsPdfReaderOpen(true)
    void refreshChatFiles(chatId, attachment)
  }

  function beginSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (isSidebarCollapsed) return
    sidebarDragRef.current = { startX: event.clientX }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function moveSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sidebarDragRef.current) return
    setSidebarWidth(Math.max(220, Math.min(460, event.clientX)))
  }

  function beginFilePaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    filePaneDragRef.current = { startX: event.clientX, startWidth: filePaneWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function moveFilePaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = filePaneDragRef.current
    if (!drag) return
    const maxWidth = Math.max(360, window.innerWidth - sidebarWidth - 300)
    setFilePaneWidth(Math.max(360, Math.min(maxWidth, drag.startWidth + drag.startX - event.clientX)))
  }

  function finishResize() {
    sidebarDragRef.current = null
    filePaneDragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  function normalizeRole(role: string): ChatMessage['role'] {
    return role === 'user' ? 'user' : 'assistant'
  }

  function mapSavedMessages(savedMessages: SavedChatMessage[], files: ChatAttachment[] = []) {
    const restoredMessages: ChatMessage[] = savedMessages.map((message) => ({
      id: createMessageId(),
      role: normalizeRole(message.role),
      content: message.content,
    }))

    const userMessageIndices = restoredMessages
      .map((message, index) => message.role === 'user' ? index : -1)
      .filter((index) => index >= 0)

    for (const file of files) {
      if (userMessageIndices.length === 0) break

      const fileTime = Date.parse(file.attached_at || file.created_at)
      const timedUserMessages = userMessageIndices
        .map((index) => ({ index, time: Date.parse(savedMessages[index].created_at || '') }))
        .filter((item) => Number.isFinite(item.time) && Number.isFinite(fileTime))
      const targetIndex = timedUserMessages.length > 0
        ? timedUserMessages.reduce((closest, item) =>
            Math.abs(item.time - fileTime) < Math.abs(closest.time - fileTime) ? item : closest,
          ).index
        : userMessageIndices.at(-1)!
      const mimeType = file.mime_type || file.content_type || ''
      const extension = (file.extension || file.filename.split('.').pop() || '').replace(/^\./, '').toLowerCase()
      const category = file.category ?? getFileCategory(mimeType, extension)
      const attachment: ChatMessageAttachment = {
        id: String(file.id),
        filename: file.original_filename || file.filename,
        size: file.size ?? file.byte_size,
        type: mimeType,
        category,
        preview_url: category === 'images' ? getChatFileContentUrl(file.id) : undefined,
      }

      restoredMessages[targetIndex].attachments = [
        ...(restoredMessages[targetIndex].attachments ?? []),
        attachment,
      ]
    }

    return restoredMessages
  }

  function saveSession(session: ChatSession) {
    setSessions((currentSessions) => {
      const withoutDuplicate = currentSessions.filter((item) => item.id !== session.id)
      return [session, ...withoutDuplicate]
    })
  }

  function updateSessionTitle(chatId: number, title?: string | null) {
    const cleanedTitle = title?.trim()

    if (!cleanedTitle) {
      return
    }

    const currentChat = activeChatRef.current
    if (currentChat?.id === chatId) {
      activateChat({ ...currentChat, title: cleanedTitle })
    }

    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === chatId
          ? {
              ...session,
              title: cleanedTitle,
            }
          : session,
      ),
    )
  }

  async function refreshGeneratedTitle(chatId: number, temporaryTitle: string) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500))

      try {
        const currentSessions = await getChats()
        const updatedChat = currentSessions.find((session) => session.id === chatId)

        if (updatedChat?.title && updatedChat.title !== temporaryTitle) {
          updateSessionTitle(chatId, updatedChat.title)
          return
        }
      } catch {
        // Keep polling; the title worker can finish even if history briefly fails.
      }
    }
  }

  function getDraftKey(chat: ChatSession | null = activeChat) {
    return chat ? String(chat.id) : NEW_CHAT_DRAFT_KEY
  }

  function saveActiveDraft(
    draftInput: string = input,
    draftAttachments: PendingAttachment[] = pendingFiles,
  ) {
    const key = getDraftKey()
    saveDraft(key, { input: draftInput, attachments: draftAttachments })
  }

  function restoreDraft(chat: ChatSession | null) {
    const draft = composerDraftsRef.current[getDraftKey(chat)] ?? EMPTY_DRAFT
    setInput(draft.input)
    setPendingFiles(draft.attachments)
  }

  function saveDraft(key: string, draft: ComposerDraft) {
    const nextDrafts = { ...composerDraftsRef.current, [key]: draft }
    composerDraftsRef.current = nextDrafts
  }

  function updateDraftInput(value: string) {
    setInput(value)
    saveActiveDraft(value)
  }

  function selectFiles(files: File[]) {
    const nextFiles = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      filename: file.name,
      size: file.size,
      type: file.type,
      category: detectFileCategory(file),
      preview_url: file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined,
    }))

    const nextPendingFiles = [...pendingFiles, ...nextFiles]
    setPendingFiles(nextPendingFiles)
    saveActiveDraft(input, nextPendingFiles)
    setActiveView('chat')
    focusComposer()
  }

  function removePendingFile(fileId: string) {
    const removedFile = pendingFiles.find((file) => file.id === fileId)
    if (removedFile?.preview_url) {
      URL.revokeObjectURL(removedFile.preview_url)
    }
    const nextPendingFiles = pendingFiles.filter((file) => file.id !== fileId)
    setPendingFiles(nextPendingFiles)
    saveActiveDraft(input, nextPendingFiles)
    focusComposer()
  }

  function releasePendingPreviewUrls(files: PendingAttachment[]) {
    for (const file of files) {
      if (file.preview_url) {
        URL.revokeObjectURL(file.preview_url)
      }
    }
  }

  async function submitMessage() {
    const content = input.trim()
    const chatAtSubmit = activeChatRef.current
    const submittingKey = getDraftKey(chatAtSubmit)

    if (
      (content.length === 0 && pendingFiles.length === 0) ||
      sendingChatKeysRef.current.has(submittingKey)
    ) {
      return
    }

    const navigationIdAtSubmit = chatLoadId.current
    const abortController = new AbortController()
    streamAbortControllersRef.current.set(submittingKey, abortController)
    setChatSending(submittingKey, true)

    const previousMessages = chatAtSubmit
      ? sessionMessagesRef.current[chatAtSubmit.id] ?? messagesRef.current
      : messagesRef.current
    const filesForMessage = pendingFiles.map((attachment) => attachment.file)
    const attachmentsForMessage = pendingFiles.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      size: attachment.size,
      type: attachment.type,
      category: attachment.category,
      preview_url: attachment.preview_url,
    }))
    const backendMessage =
      content || buildAttachmentOnlyPrompt(attachmentsForMessage)
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content,
      attachments: attachmentsForMessage,
    }

    const messagesWithUser = [...previousMessages, userMessage]
    if (chatAtSubmit) {
      storeChatMessages(chatAtSubmit.id, messagesWithUser)
    } else if (navigationIdAtSubmit === chatLoadId.current && activeChatRef.current === null) {
      showMessages(messagesWithUser)
    }
    setIsNearConversationBottom(true)
    setInput('')
    setPendingFiles([])
    saveDraft(submittingKey, EMPTY_DRAFT)
    setError('')
    setChatWebSearchStatus(submittingKey, '')

    let sessionForMessage = chatAtSubmit
    let activeRequestKey = submittingKey
    let assistantMessageId: number | null = null
    let streamedAnswer = ''
    let streamFrameId: number | null = null

    try {
      let session = chatAtSubmit
      if (!session) {
        session = await createChat()
        saveSession(session)
        setChatSending(submittingKey, false)
        activeRequestKey = String(session.id)
        setChatSending(activeRequestKey, true)
        streamAbortControllersRef.current.delete(submittingKey)
        streamAbortControllersRef.current.set(activeRequestKey, abortController)
        if (
          navigationIdAtSubmit === chatLoadId.current &&
          activeChatRef.current === null
        ) {
          activateChat(session)
        }
      }

      if (!session) {
        throw new Error('Could not create a chat for this message.')
      }

      const resolvedSession = session
      sessionForMessage = resolvedSession

      assistantMessageId = createMessageId()
      const pendingMessages: ChatMessage[] = [
        ...messagesWithUser,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
        },
      ]

      storeChatMessages(resolvedSession.id, pendingMessages)

      function flushStreamedAnswer() {
        if (assistantMessageId === null) {
          return
        }

        const currentMessages = sessionMessagesRef.current[resolvedSession.id] ?? pendingMessages
        storeChatMessages(resolvedSession.id,
          currentMessages.map((currentMessage) =>
            currentMessage.id === assistantMessageId
              ? {
                  ...currentMessage,
                  content: streamedAnswer,
                }
              : currentMessage,
          ),
        )
      }

      const response = await streamMessage(resolvedSession.id, backendMessage, selectedModel, {
        files: filesForMessage,
        webSearchEnabled,
        signal: abortController.signal,
        onChunk: (_chunk, fullAnswer) => {
          streamedAnswer = fullAnswer

          if (streamFrameId !== null) {
            return
          }

          streamFrameId = window.requestAnimationFrame(() => {
            streamFrameId = null
            flushStreamedAnswer()
          })
        },
        onTitle: (title) => {
          updateSessionTitle(resolvedSession.id, title)
        },
        onWebSearch: (status, message) => {
          setChatWebSearchStatus(
            activeRequestKey,
            status === 'started' ? message || 'Web searching...' : '',
          )
        },
        onAnswerDone: (answer) => {
          streamedAnswer = answer
          flushStreamedAnswer()
        },
      })

      if (streamFrameId !== null) {
        window.cancelAnimationFrame(streamFrameId)
        streamFrameId = null
        flushStreamedAnswer()
      }

      const answer = response.answer.trim()

      if (!answer || !streamedAnswer.trim()) {
        throw new Error('The assistant returned an empty response.')
      }

      updateSessionTitle(resolvedSession.id, response.title)
      if (response.title) {
        void refreshGeneratedTitle(resolvedSession.id, response.title)
      }

      const currentMessages = sessionMessagesRef.current[resolvedSession.id] ?? pendingMessages
      const latestMessages = currentMessages.map((currentMessage) =>
        currentMessage.id === assistantMessageId
          ? {
              ...currentMessage,
              content: answer,
            }
          : currentMessage,
      )

      storeChatMessages(resolvedSession.id, latestMessages)
      void refreshChatFiles(resolvedSession.id)
    } catch (caughtError) {
      if (abortController.signal.aborted) {
        const stoppedContent = streamedAnswer.trim() || 'Response stopped.'
        const stoppedAssistantMessage: ChatMessage = {
          id: assistantMessageId ?? createMessageId(),
          role: 'assistant',
          content: stoppedContent,
        }
        const stoppedSession = sessionForMessage

        if (stoppedSession) {
          const currentMessages = sessionMessagesRef.current[stoppedSession.id] ?? messagesWithUser
          const nextMessages = addOrReplaceMessage(currentMessages, stoppedAssistantMessage)
          storeChatMessages(stoppedSession.id, nextMessages)
        } else if (navigationIdAtSubmit === chatLoadId.current && activeChatRef.current === null) {
          showMessages(addOrReplaceMessage(messagesRef.current, stoppedAssistantMessage))
        }

        return
      }

      const detail =
        caughtError instanceof Error
          ? caughtError.message
          : 'The request could not be completed.'

      const errorMessage: ChatMessage = {
        id: assistantMessageId ?? createMessageId(),
        role: 'assistant',
        tone: 'error',
        content: detail,
      }
      const failedSession = sessionForMessage

      if (failedSession) {
        const currentMessages = sessionMessagesRef.current[failedSession.id] ?? messagesWithUser
        storeChatMessages(failedSession.id, addOrReplaceMessage(currentMessages, errorMessage))
      } else if (navigationIdAtSubmit === chatLoadId.current && activeChatRef.current === null) {
        showMessages(addOrReplaceMessage(messagesRef.current, errorMessage))
      }
    } finally {
      if (streamFrameId !== null) {
        window.cancelAnimationFrame(streamFrameId)
      }

      setChatSending(activeRequestKey, false)
      if (activeRequestKey !== submittingKey) {
        setChatSending(submittingKey, false)
      }
      streamAbortControllersRef.current.delete(activeRequestKey)
      streamAbortControllersRef.current.delete(submittingKey)
      setChatWebSearchStatus(activeRequestKey, '')
      if (activeChatRef.current?.id === sessionForMessage?.id) {
        focusComposer()
      }
    }
  }

  function stopCurrentResponse() {
    const activeKey = getDraftKey(activeChatRef.current)
    streamAbortControllersRef.current.get(activeKey)?.abort()
  }

  async function resumeIncompleteChat(
    session: ChatSession,
    navigationId: number,
    restoredMessages: ChatMessage[],
  ) {
    const chatKey = String(session.id)
    if (sendingChatKeysRef.current.has(chatKey)) return

    const abortController = new AbortController()
    const assistantMessageId = createMessageId()
    let streamedAnswer = ''
    let streamFrameId: number | null = null
    const pendingMessages = [
      ...restoredMessages,
      { id: assistantMessageId, role: 'assistant' as const, content: '' },
    ]

    streamAbortControllersRef.current.set(chatKey, abortController)
    setChatSending(chatKey, true)
    setChatWebSearchStatus(chatKey, 'Resuming response...')
    storeChatMessages(session.id, pendingMessages)

    const flushAnswer = () => {
      const currentMessages = sessionMessagesRef.current[session.id] ?? pendingMessages
      storeChatMessages(
        session.id,
        currentMessages.map((item) =>
          item.id === assistantMessageId ? { ...item, content: streamedAnswer } : item,
        ),
      )
    }

    try {
      const result = await streamMessage(session.id, '', selectedModel, {
        resume: true,
        webSearchEnabled,
        signal: abortController.signal,
        onChunk: (_chunk, fullAnswer) => {
          streamedAnswer = fullAnswer
          if (streamFrameId !== null) return
          streamFrameId = window.requestAnimationFrame(() => {
            streamFrameId = null
            flushAnswer()
          })
        },
        onTitle: (title) => updateSessionTitle(session.id, title),
        onWebSearch: (status, message) =>
          setChatWebSearchStatus(chatKey, status === 'started' ? message || 'Web searching...' : ''),
        onAnswerDone: (answer) => {
          streamedAnswer = answer
          flushAnswer()
        },
      })

      streamedAnswer = result.answer.trim()
      if (!streamedAnswer) throw new Error('The assistant returned an empty response.')
      updateSessionTitle(session.id, result.title)
      if (result.title) {
        void refreshGeneratedTitle(session.id, result.title)
      }
      flushAnswer()
    } catch (caughtError) {
      if (!abortController.signal.aborted) {
        const detail =
          caughtError instanceof Error ? caughtError.message : 'Could not resume this response.'
        const currentMessages = sessionMessagesRef.current[session.id] ?? pendingMessages
        storeChatMessages(
          session.id,
          currentMessages.map((item) =>
            item.id === assistantMessageId ? { ...item, content: detail, tone: 'error' } : item,
          ),
        )
      }
    } finally {
      if (streamFrameId !== null) window.cancelAnimationFrame(streamFrameId)
      setChatSending(chatKey, false)
      setChatWebSearchStatus(chatKey, '')
      streamAbortControllersRef.current.delete(chatKey)
      if (activeChatRef.current?.id === session.id && chatLoadId.current === navigationId) {
        focusComposer()
      }
    }
  }

  function startNewChat() {
    saveActiveDraft()
    chatLoadId.current += 1
    setActiveView('chat')
    setIsPdfReaderOpen(false)
    setChatFiles([])
    setSelectedPdfId(null)
    setPdfFilesError('')
    activateChat(null)
    showMessages([])
    setIsLoadingMessages(false)
    setIsNearConversationBottom(true)
    restoreDraft(null)
    setError('')
    focusComposer()
  }

  async function selectChat(session: ChatSession) {
    if (deletingChatId === session.id) {
      return
    }

    const currentLoadId = chatLoadId.current + 1
    chatLoadId.current = currentLoadId

    saveActiveDraft()
    setActiveView('chat')
    setIsPdfReaderOpen(false)
    setChatFiles([])
    setSelectedPdfId(null)
    setPdfFilesError('')
    activateChat(session)
    setIsLoadingMessages(false)
    restoreDraft(session)
    setError('')
    setIsNearConversationBottom(true)

    const cachedMessages = sessionMessagesRef.current[session.id]

    if (cachedMessages) {
      void refreshChatFiles(session.id)
      showMessages(cachedMessages)
      focusComposer()
      return
    }

    showMessages([])
    setIsLoadingMessages(true)

    try {
      const [savedChat, attachedFiles] = await Promise.all([
        getChatMessages(session.id),
        getChatFiles(session.id).catch(() => []),
      ])

      if (chatLoadId.current !== currentLoadId) {
        return
      }

      const loadedSession = {
        id: savedChat.id,
        title: savedChat.title,
      }
      const loadedMessages = mapSavedMessages(savedChat.messages, attachedFiles)

      setChatFiles(attachedFiles)
      setSelectedPdfId(attachedFiles[0]?.id ?? null)
      activateChat(loadedSession)
      saveSession(loadedSession)
      storeChatMessages(loadedSession.id, loadedMessages)
      const lastSavedMessage = savedChat.messages[savedChat.messages.length - 1]
      if (lastSavedMessage?.role === 'user') {
        void resumeIncompleteChat(loadedSession, currentLoadId, loadedMessages)
      }
    } catch {
      if (chatLoadId.current === currentLoadId) {
        setError('Could not load messages for this chat.')
      }
    } finally {
      if (chatLoadId.current === currentLoadId) {
        setIsLoadingMessages(false)
        focusComposer()
      }
    }
  }

  async function removeChat(session: ChatSession) {
    if (deletingChatId !== null) {
      return
    }

    setDeletingChatId(session.id)
    setError('')

    try {
      await deleteChat(session.id)
      chatLoadId.current += 1

      setSessions((currentSessions) =>
        currentSessions.filter((item) => item.id !== session.id),
      )
      const nextMessageCache = { ...sessionMessagesRef.current }
      delete nextMessageCache[session.id]
      sessionMessagesRef.current = nextMessageCache
      setSessionMessages(nextMessageCache)
      const chatDraftKey = String(session.id)
      const removedDraft = composerDraftsRef.current[chatDraftKey]
      if (removedDraft) {
        releasePendingPreviewUrls(removedDraft.attachments)
        const nextDrafts = { ...composerDraftsRef.current }
        delete nextDrafts[chatDraftKey]
        composerDraftsRef.current = nextDrafts
      }

      if (activeChat?.id === session.id) {
        activateChat(null)
        showMessages([])
        setIsNearConversationBottom(true)
        setPendingFiles([])
        setInput('')
      }
    } catch {
      setError('Could not delete this chat from the backend.')
    } finally {
      setDeletingChatId(null)
      focusComposer()
    }
  }

  async function renameChatSession(session: ChatSession, title: string): Promise<boolean> {
    const cleanedTitle = title.trim()
    if (!cleanedTitle || cleanedTitle === session.title) return true

    setError('')
    setRenamingChatId(session.id)

    try {
      const renamedSession = await renameChat(session.id, cleanedTitle)
      updateSessionTitle(renamedSession.id, renamedSession.title)
      return true
    } catch {
      setError('Could not rename this chat. Please try again.')
      return false
    } finally {
      setRenamingChatId(null)
    }
  }

  return (
    <main
      className={isSidebarCollapsed ? 'chat-page sidebar-collapsed' : 'chat-page'}
      data-theme={appearance}
      style={{ '--sidebar-width': isSidebarCollapsed ? '68px' : `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar
        activeChatId={activeChat?.id ?? null}
        activeView={activeView}
        deletingChatId={deletingChatId}
        renamingChatId={renamingChatId}
        error={historyError}
        isCollapsed={isSidebarCollapsed}
        isLoading={isLoadingChats}
        isLoggingOut={isLoggingOut}
        recentItems={sessions}
        user={user}
        onDeleteChat={removeChat}
        onLogout={onLogout}
        onOpenLibrary={() => setActiveView('library')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewChat={startNewChat}
        onRenameChat={renameChatSession}
        onSelectChat={selectChat}
        onToggleSidebar={() => setIsSidebarCollapsed((currentValue) => !currentValue)}
      />
      {!isSidebarCollapsed && (
        <div
          aria-label="Resize conversation sidebar"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth}
          className="sidebar-resize-handle"
          onLostPointerCapture={finishResize}
          onPointerDown={beginSidebarResize}
          onPointerMove={moveSidebarResize}
          onPointerUp={finishResize}
          role="separator"
          tabIndex={0}
        />
      )}

      <section
        className={isEmptyChat ? 'chat-workspace empty-chat-workspace' : 'chat-workspace'}
        aria-label="Chat conversation"
      >
        {activeView === 'library' ? (
          <LibraryPage />
        ) : (
          <div className="chat-conversation-layout">
            <div className="chat-content-column">
              <MessageList
                assistantStatusText={webSearchStatus}
                endRef={conversationEndRef}
                isLoadingMessages={isLoadingMessages}
                isSending={activeChatSending}
                messages={messages}
                onScroll={handleMessageListScroll}
                onShare={openShareDialog}
                onOpenPdf={openMessageAttachment}
                scrollContainerRef={messageListRef}
              />
              <Composer
                attachments={pendingFiles}
                canSend={canSend}
                disabled={isLoadingMessages}
                error={error}
                inputRef={inputRef}
                isSending={activeChatSending}
                model={selectedModel}
                modelOptions={chatModelOptions}
                onChange={updateDraftInput}
                onFilesSelected={selectFiles}
                onModelChange={setSelectedModel}
                onRemoveAttachment={removePendingFile}
                onScrollToBottom={handleScrollToBottom}
                onStop={stopCurrentResponse}
                onSubmit={submitMessage}
                showScrollToBottom={messages.length > 0 && !isNearConversationBottom}
                value={input}
              />
            </div>
            {isPdfReaderOpen && (
              <>
                <div
                  aria-label="Resize file preview"
                  aria-orientation="vertical"
                  aria-valuenow={filePaneWidth}
                  className="file-pane-resize-handle"
                  onLostPointerCapture={finishResize}
                  onPointerDown={beginFilePaneResize}
                  onPointerMove={moveFilePaneResize}
                  onPointerUp={finishResize}
                  role="separator"
                  tabIndex={0}
                />
                <PdfReaderPanel
                  error={pdfFilesError}
                  files={chatFiles}
                  isLoading={isLoadingChatFiles}
                  selectedFileId={selectedPdfId}
                  style={{ '--file-pane-width': `${filePaneWidth}px` } as CSSProperties}
                  onClose={() => setIsPdfReaderOpen(false)}
                  onSelect={setSelectedPdfId}
                />
              </>
            )}
          </div>
        )}

        {shareMessage && (
          <ShareDialog
            content={shareMessage.content}
            onClose={() => setShareMessage(null)}
            title={activeChat?.title || 'New Chat'}
          />
        )}
        {isSettingsOpen && (
          <SettingsPage
            appearance={appearance}
            accentColor={accentColor}
            defaultModel={selectedModel}
            user={user}
            webSearchEnabled={webSearchEnabled}
            onAppearanceChange={setAppearance}
            onAccentColorChange={setAccentColor}
            onClose={() => setIsSettingsOpen(false)}
            onDefaultModelChange={setSelectedModel}
            onLogout={onLogout}
            onWebSearchChange={setWebSearchEnabled}
          />
        )}
      </section>
    </main>
  )
}

export default ChatPage

function addOrReplaceMessage(
  messages: ChatMessage[],
  message: ChatMessage,
) {
  const existingIndex = messages.findIndex((item) => item.id === message.id)

  if (existingIndex < 0) {
    return [...messages, message]
  }

  return messages.map((item) => item.id === message.id ? message : item)
}

function detectFileCategory(file: File): FileCategory {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = file.type

  if (mimeType.startsWith('image/') || imageExtensions.has(extension)) {
    return 'images'
  }

  if (mimeType.startsWith('audio/') || audioExtensions.has(extension)) {
    return 'audio'
  }

  if (mimeType.startsWith('video/') || videoExtensions.has(extension)) {
    return 'video'
  }

  if (archiveExtensions.has(extension)) {
    return 'archive'
  }

  if (codeExtensions.has(extension)) {
    return 'code'
  }

  if (mimeType.startsWith('text/') || documentExtensions.has(extension)) {
    return 'documents'
  }

  return 'others'
}

function getFileCategory(mimeType: string, extension: string): FileCategory {
  if (mimeType.startsWith('image/') || imageExtensions.has(extension)) return 'images'
  if (mimeType.startsWith('audio/') || audioExtensions.has(extension)) return 'audio'
  if (mimeType.startsWith('video/') || videoExtensions.has(extension)) return 'video'
  if (archiveExtensions.has(extension)) return 'archive'
  if (codeExtensions.has(extension)) return 'code'
  if (mimeType.startsWith('text/') || documentExtensions.has(extension)) return 'documents'
  return 'others'
}

const documentExtensions = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'csv',
])

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'])
const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'ogg'])
const videoExtensions = new Set(['mp4', 'avi', 'mov', 'mkv'])
const archiveExtensions = new Set(['zip', 'rar', '7z'])
const codeExtensions = new Set([
  'py',
  'js',
  'ts',
  'tsx',
  'jsx',
  'cpp',
  'java',
  'c',
  'html',
  'css',
  'json',
  'xml',
  'yaml',
  'yml',
])

function buildAttachmentOnlyPrompt(
  attachments: NonNullable<ChatMessage['attachments']>,
) {
  const filenames = attachments
    .map((attachment) => attachment.filename)
    .join(', ')

  return filenames
    ? `Please analyze the attached file(s): ${filenames}`
    : 'Please analyze the attached file(s).'
}
