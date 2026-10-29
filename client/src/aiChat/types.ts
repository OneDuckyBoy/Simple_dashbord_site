// Формата на съобщенията на AI платформата (docs/chat-api.md, раздел 3).

export interface ChatAttachment {
  filename: string
  mime: string
  /** Файл, който човекът е пратил: /files/<id на съобщението>. */
  stored?: boolean
  /** Фактура, която отговорът е дал: /roster-files/<documentId>. */
  documentId?: number
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'error'
  content: string
  createdAt: string
  attachment: ChatAttachment | null
  turnId: number | null
  feedback: 'up' | 'down' | null
  /** Обобщение, което чака Потвърди / Откажи. */
  approvalTurnId?: number
}

export interface ChatFile {
  /** Пътят под /api/ai-chat. */
  path: string
  name: string
}

export interface SseEvent {
  event: string
  data: any
  id?: string
}
