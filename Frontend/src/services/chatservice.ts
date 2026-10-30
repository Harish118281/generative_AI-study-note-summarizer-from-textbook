import API_URL from './api'
import type { ChatAttachment, ChatDetail, ChatModel, ChatSession } from '../types/chat'

type CreateChatResponse = {
  id: number
  title: string
}

type ChatListResponse = {
  chats: ChatSession[]
}

type SendMessageResponse = {
  answer: string
  title?: string | null
}

type DeleteChatResponse = {
  message: string
}

type ChatFilesResponse = {
  files: ChatAttachment[]
}

type ErrorResponse = {
  detail?: string
}

type StreamMessageOptions = {
  onChunk: (chunk: string, fullAnswer: string) => void
  onTitle?: (title: string) => void
  onWebSearch?: (status: 'started' | 'finished', message?: string) => void
  onAnswerDone?: (answer: string) => void
  onUserMessageId?: (id: number) => void
  signal?: AbortSignal
  files?: File[]
  resume?: boolean
  webSearchEnabled?: boolean
  editMessageId?: number
  keepFileIds?: number[]
}

type StreamPayload = {
  id?: number
  text?: string
  answer?: string
  title?: string | null
  detail?: string
  status?: string
  message?: string
}

const requestCredentials: RequestCredentials = 'include'

async function readApiError(response: Response) {
  let detail = `Request failed with status ${response.status}.`

  try {
    const error = (await response.json()) as ErrorResponse
    detail = error.detail ?? detail
  } catch {
    detail = response.statusText || detail
  }

  return detail
}

export async function createChat(): Promise<CreateChatResponse> {
  const response = await fetch(`${API_URL}/chat/new`, {
    method: 'POST',
    credentials: requestCredentials,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'New Chat' }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<CreateChatResponse>

  if (typeof data.id !== 'number' || typeof data.title !== 'string') {
    throw new Error('Unexpected response from the chat creation API.')
  }

  return {
    id: data.id,
    title: data.title,
  }
}

export async function getChats(): Promise<ChatSession[]> {
  const response = await fetch(`${API_URL}/chat/`, {
    credentials: requestCredentials,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<ChatListResponse>

  if (!Array.isArray(data.chats)) {
    throw new Error('Unexpected response from the chat list API.')
  }

  return data.chats.filter(
    (chat): chat is ChatSession =>
      typeof chat.id === 'number' && typeof chat.title === 'string',
  )
}

export async function getChatMessages(chatId: number): Promise<ChatDetail> {
  const response = await fetch(`${API_URL}/chat/${chatId}/messages`, {
    credentials: requestCredentials,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<ChatDetail>

  if (
    typeof data.id !== 'number' ||
    typeof data.title !== 'string' ||
    !Array.isArray(data.messages)
  ) {
    throw new Error('Unexpected response from the chat messages API.')
  }

  return {
    id: data.id,
    title: data.title,
    messages: data.messages.filter(
      (message) =>
        typeof message.role === 'string' && typeof message.content === 'string',
    ),
  }
}

export async function deleteChat(chatId: number): Promise<DeleteChatResponse> {
  const response = await fetch(`${API_URL}/chat/${chatId}`, {
    method: 'DELETE',
    credentials: requestCredentials,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<DeleteChatResponse>

  if (typeof data.message !== 'string') {
    throw new Error('Unexpected response from the delete chat API.')
  }

  return { message: data.message }
}

export async function renameChat(
  chatId: number,
  title: string,
): Promise<ChatSession> {
  const response = await fetch(`${API_URL}/chat/${chatId}/rename`, {
    method: 'PATCH',
    credentials: requestCredentials,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<ChatSession>

  if (typeof data.id !== 'number' || typeof data.title !== 'string') {
    throw new Error('Unexpected response from the rename chat API.')
  }

  return {
    id: data.id,
    title: data.title,
  }
}

export async function uploadChatFile(
  chatId: number,
  file: File,
): Promise<ChatAttachment> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_URL}/chat/${chatId}/files`, {
    method: 'POST',
    credentials: requestCredentials,
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  return normalizeAttachment(await response.json())
}

export async function getChatFiles(chatId: number): Promise<ChatAttachment[]> {
  const response = await fetch(`${API_URL}/chat/${chatId}/files`, {
    credentials: requestCredentials,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<ChatFilesResponse>

  if (!Array.isArray(data.files)) {
    throw new Error('Unexpected response from the chat files API.')
  }

  return data.files.map(normalizeAttachment)
}

export async function getLibraryFiles(): Promise<ChatAttachment[]> {
  const response = await fetch(`${API_URL}/files/`, {
    credentials: requestCredentials,
  })

  if (!response.ok) {
    const detail = await readApiError(response)
    throw new Error(`${response.status}: ${detail}`)
  }

  const data = (await response.json()) as Partial<ChatFilesResponse>

  if (!Array.isArray(data.files)) {
    throw new Error('Unexpected response from the library API.')
  }

  return data.files.map(normalizeAttachment)
}

export function getLibraryFileContentUrl(fileId: number) {
  return `${API_URL}/files/preview/${fileId}`
}

export function getChatFileContentUrl(fileId: number) {
  return `${API_URL}/chat/library/files/${fileId}/content`
}

export function getLibraryFileDownloadUrl(fileId: number) {
  return `${API_URL}/files/download/${fileId}`
}

export async function uploadLibraryFiles(files: File[]): Promise<ChatAttachment[]> {
  const formData = new FormData()

  for (const file of files) {
    formData.append('files', file)
  }

  const response = await fetch(`${API_URL}/files/upload`, {
    method: 'POST',
    credentials: requestCredentials,
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<ChatFilesResponse>

  if (!Array.isArray(data.files)) {
    throw new Error('Unexpected response from the file upload API.')
  }

  return data.files.map(normalizeAttachment)
}

export async function renameLibraryFile(
  fileId: number,
  filename: string,
): Promise<ChatAttachment> {
  const response = await fetch(`${API_URL}/files/${fileId}/rename`, {
    method: 'PATCH',
    credentials: requestCredentials,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  return normalizeAttachment(await response.json())
}

export async function deleteLibraryFile(fileId: number): Promise<void> {
  const response = await fetch(`${API_URL}/files/${fileId}`, {
    method: 'DELETE',
    credentials: requestCredentials,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}

export async function detachChatFile(chatId: number, fileId: number): Promise<void> {
  const response = await fetch(`${API_URL}/chat/${chatId}/files/${fileId}`, {
    method: 'DELETE',
    credentials: requestCredentials,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
}

export async function sendMessage(
  chatId: number,
  message: string,
  model: ChatModel = 'gemini-3.6',
): Promise<SendMessageResponse> {
  const response = await fetch(`${API_URL}/chat/message`, {
    method: 'POST',
    credentials: requestCredentials,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message,
      model,
    }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  const data = (await response.json()) as Partial<SendMessageResponse>

  if (typeof data.answer !== 'string') {
    throw new Error('Unexpected response from the message API.')
  }

  return {
    answer: data.answer,
    title: typeof data.title === 'string' ? data.title : null,
  }
}

function parseStreamEvent(rawEvent: string) {
  const lines = rawEvent.split('\n')
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  const dataText = dataLines.join('\n')
  const data = dataText ? (JSON.parse(dataText) as StreamPayload) : {}

  return {
    eventName,
    data,
  }
}

export async function streamMessage(
  chatId: number,
  message: string,
  model: ChatModel,
  options: StreamMessageOptions,
): Promise<SendMessageResponse> {
  const response = options.resume
    ? await fetch(`${API_URL}/chat/message/stream/resume`, {
        method: 'POST',
        credentials: requestCredentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          model,
          web_search_enabled: options.webSearchEnabled ?? true,
        }),
        signal: options.signal,
      })
    : options.editMessageId
      ? await createEditedStreamResponse(
          chatId,
          options.editMessageId,
          message,
          model,
          options.files ?? [],
          options.keepFileIds ?? [],
          options.signal,
          options.webSearchEnabled ?? true,
        )
      : await createStreamResponse(
        chatId,
        message,
        model,
        options.files ?? [],
        options.signal,
        options.webSearchEnabled ?? true,
      )

  if (!response.ok) {
    throw new Error(await readApiError(response))
  }

  if (!response.body) {
    throw new Error('The browser could not read the streamed response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  let title: string | null = null
  let finished = false

  while (!finished) {
    const { value, done } = await reader.read()

    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n')

    while (buffer.includes('\n\n')) {
      const eventEndIndex = buffer.indexOf('\n\n')
      const rawEvent = buffer.slice(0, eventEndIndex)
      buffer = buffer.slice(eventEndIndex + 2)

      if (!rawEvent.trim()) {
        continue
      }

      const { eventName, data } = parseStreamEvent(rawEvent)

      if (eventName === 'chunk') {
        if (typeof data.text !== 'string') {
          throw new Error('Unexpected streamed chunk from the message API.')
        }

        answer += data.text
        options.onChunk(data.text, answer)
      }

      if (eventName === 'title') {
        if (typeof data.title === 'string') {
          title = data.title
          options.onTitle?.(data.title)
        }
      }

      if (eventName === 'user_message' && typeof data.id === 'number') {
        options.onUserMessageId?.(data.id)
      }

      if (eventName === 'web_search') {
        if (data.status === 'started' || data.status === 'finished') {
          options.onWebSearch?.(
            data.status,
            typeof data.message === 'string' ? data.message : undefined,
          )
        }
      }

      if (eventName === 'answer_done') {
        if (typeof data.answer === 'string') {
          answer = data.answer
          options.onAnswerDone?.(data.answer)
        }
      }

      if (eventName === 'done') {
        if (typeof data.answer === 'string') {
          answer = data.answer
        }

        if (typeof data.title === 'string') {
          title = data.title
          options.onTitle?.(data.title)
        }

        finished = true
      }

      if (eventName === 'error') {
        throw new Error(data.detail ?? 'The streamed message API failed.')
      }
    }

    if (done) {
      finished = true
    }
  }

  if (!answer.trim()) {
    throw new Error('The assistant returned an empty response.')
  }

  return {
    answer,
    title,
  }
}

async function createEditedStreamResponse(
  chatId: number,
  messageId: number,
  message: string,
  model: ChatModel,
  files: File[],
  keepFileIds: number[],
  signal: AbortSignal | undefined,
  webSearchEnabled: boolean,
) {
  const formData = new FormData()
  formData.append('chat_id', String(chatId))
  formData.append('message_id', String(messageId))
  formData.append('message', message)
  formData.append('model', model)
  formData.append('web_search_enabled', String(webSearchEnabled))
  formData.append('keep_file_ids', JSON.stringify(keepFileIds))
  for (const file of files) formData.append('files', file)

  return fetch(`${API_URL}/chat/message/stream/edit`, {
    method: 'POST',
    credentials: requestCredentials,
    body: formData,
    signal,
  })
}

async function createStreamResponse(
  chatId: number,
  message: string,
  model: ChatModel,
  files: File[],
  signal?: AbortSignal,
  webSearchEnabled = true,
) {
  if (files.length > 0) {
    const formData = new FormData()
    formData.append('chat_id', String(chatId))
    formData.append('message', message)
    formData.append('model', model)
    formData.append('web_search_enabled', String(webSearchEnabled))

    for (const file of files) {
      formData.append('files', file)
    }

    return fetch(`${API_URL}/chat/message/stream/files`, {
      method: 'POST',
      credentials: requestCredentials,
      body: formData,
      signal,
    })
  }

  return fetch(`${API_URL}/chat/message/stream`, {
    method: 'POST',
    credentials: requestCredentials,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      message,
      model,
      web_search_enabled: webSearchEnabled,
    }),
    signal,
  })
}

function normalizeAttachment(data: unknown): ChatAttachment {
  const file = data as Partial<ChatAttachment>

  if (
    typeof file.id !== 'number' ||
    typeof file.filename !== 'string' ||
    typeof file.byte_size !== 'number' ||
    typeof file.sha256 !== 'string' ||
    typeof file.chunk_count !== 'number' ||
    typeof file.created_at !== 'string'
  ) {
    throw new Error('Unexpected file response from the API.')
  }

  return {
    id: file.id,
    filename: file.filename,
    original_filename: file.original_filename ?? file.filename,
    extension: file.extension ?? null,
    mime_type: file.mime_type ?? file.content_type ?? null,
    content_type: file.content_type ?? file.mime_type ?? null,
    size: file.size ?? file.byte_size,
    byte_size: file.byte_size,
    sha256_hash: file.sha256_hash ?? file.sha256,
    sha256: file.sha256,
    storage_path: file.storage_path ?? null,
    category: file.category ?? null,
    chunk_count: file.chunk_count,
    created_at: file.created_at,
    updated_at: file.updated_at ?? file.created_at,
    created: Boolean(file.created),
    attached_at: file.attached_at ?? null,
  }
}
