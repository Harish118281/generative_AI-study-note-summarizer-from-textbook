export type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  attachments?: ChatMessageAttachment[]
  tone?: 'normal' | 'error'
}

export type ChatMessageAttachment = {
  id: string
  filename: string
  size: number
  type: string
  category: FileCategory
  preview_url?: string
}

export type ChatModel =
  | 'gemini-3.5'
  | 'gemini-3.6'
  | 'gemini-3.7'
  | 'gemini-3.8'
  | 'nvidia-nemotron'
  | 'cloudflare-qwen'

export type ChatModelOption = {
  value: ChatModel
  label: string
}

export const chatModelOptions: ChatModelOption[] = [
  {
    value: 'gemini-3.5',
    label: 'Gemini 3.5 Flash',
  },
  {
    value: 'gemini-3.6',
    label: 'Gemini 3.6 Flash',
  },
  {
    value: 'gemini-3.7',
    label: 'Gemini 3.7 Flash',
  },
  {
    value: 'gemini-3.8',
    label: 'Gemini 3.8 Flash',
  },
  {
    value: 'nvidia-nemotron',
    label: 'NVIDIA Nemotron',
  },
  {
    value: 'cloudflare-qwen',
    label: 'Qwen 3.8',
  },
]

export type ChatSession = {
  id: number
  title: string
}

export type ChatAttachment = {
  id: number
  filename: string
  original_filename?: string | null
  extension?: string | null
  mime_type?: string | null
  content_type?: string | null
  size?: number | null
  byte_size: number
  sha256_hash?: string | null
  sha256: string
  storage_path?: string | null
  category?: FileCategory | null
  chunk_count: number
  created_at: string
  attached_at?: string | null
  updated_at?: string | null
  created?: boolean
}

export type PendingAttachment = {
  id: string
  file: File
  filename: string
  size: number
  type: string
  category: FileCategory
  preview_url?: string
}

export type FileCategory =
  | 'documents'
  | 'images'
  | 'audio'
  | 'video'
  | 'archive'
  | 'code'
  | 'others'

export type SavedChatMessage = {
  role: string
  content: string
  created_at?: string
}

export type ChatDetail = ChatSession & {
  messages: SavedChatMessage[]
}
