import { getToken } from '../api'
import { httpErrorText } from './errors'
import type { ChatMessage } from './types'

// Всичко минава през нашия сървър (/api/ai-chat), който добавя ключа и кой е човекът.
const BASE = '/api/ai-chat'

export class ChatHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function auth(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Отказът като грешка с текст за човека; подробностите за настройката отиват в конзолата. */
export async function failure(res: Response): Promise<ChatHttpError> {
  const data = await res.json().catch(() => null)
  const detail: string | undefined = data?.message ?? data?.error
  if (res.status === 401 || res.status === 503) console.warn('AI chat:', res.status, detail)
  return new ChatHttpError(res.status, httpErrorText(res.status, detail))
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...auth(), ...init.headers } })
  if (!res.ok) throw await failure(res)
  return (await res.json().catch(() => null)) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return call<T>(path, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function stream(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...auth(), Accept: 'text/event-stream', ...init.headers },
    signal,
  })
}

export const chatApi = {
  history: (before?: number) =>
    call<{ messages: ChatMessage[]; hasMore: boolean }>(`/messages${before ? `?before=${before}` : ''}`),

  send: (text: string, signal: AbortSignal) =>
    stream(
      '/messages',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) },
      signal,
    ),

  upload: (file: File, caption: string, signal: AbortSignal) => {
    const form = new FormData()
    if (caption) form.append('text', caption)
    form.append('file', file)
    return stream('/upload', { method: 'POST', body: form }, signal)
  },

  events: (turnId: number, lastEventId: string | undefined, signal: AbortSignal) =>
    stream(`/turns/${turnId}/events`, { headers: lastEventId ? { 'Last-Event-ID': lastEventId } : {} }, signal),

  transcribe: (voice: Blob, filename: string) => {
    const form = new FormData()
    form.append('file', voice, filename)
    return call<{ text: string }>('/transcribe', { method: 'POST', body: form })
  },

  cancel: (turnId: number) => post(`/turns/${turnId}/cancel`),

  decide: (turnId: number, decision: 'confirm' | 'cancel') =>
    post<{ userMessage: ChatMessage; message: ChatMessage }>(`/turns/${turnId}/approval`, { decision }),

  feedback: (turnId: number, verdict: 'up' | 'down') => post(`/turns/${turnId}/feedback`, { verdict }),

  reset: () => post('/reset'),

  /** Файлът с нашия токен (обикновена връзка не би го носила), свален под даденото име. */
  download: async (path: string, name: string) => {
    const res = await fetch(`${BASE}${path}`, { headers: auth() })
    if (!res.ok) throw await failure(res)
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}
