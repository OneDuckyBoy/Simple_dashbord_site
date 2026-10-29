import { Router, type Request, type Response } from 'express'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { requireAuth } from '../auth.js'

// Проксито към чата на ai-automation (docs/chat-api.md). Ключът стои само тук: браузърът
// говори с нас, а ние казваме на платформата кой е човекът — от нашия JWT, никога от заявката.
export const aiChatRouter = Router()

const NOT_CONFIGURED = 'AI chat is not configured: set AI_CHAT_API_URL and AI_CHAT_ACCESS_KEY in server/.env'
const UNREACHABLE = 'The assistant is out of reach'
const FILE_HEADERS = ['content-type', 'content-disposition', 'x-content-type-options', 'content-security-policy']

aiChatRouter.use(requireAuth)

for (const name of ['id', 'messageId', 'documentId', 'invoiceId']) {
  aiChatRouter.param(name, (_req, res, next, value: string) => {
    if (/^[1-9]\d*$/.test(value)) next()
    else res.status(400).json({ error: 'Invalid id' })
  })
}

aiChatRouter.get('/messages', (req, res) => {
  const query = new URLSearchParams()
  for (const name of ['before', 'limit']) {
    const value = req.query[name]
    if (typeof value === 'string' && /^\d+$/.test(value)) query.set(name, value)
  }
  const suffix = query.size ? `?${query}` : ''
  return relay(req, res, `/api/chat/messages${suffix}`)
})

aiChatRouter.post('/messages', (req, res) =>
  relay(req, res, '/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ text: req.body?.text }),
  }),
)

aiChatRouter.post('/upload', (req, res) => relay(req, res, '/api/chat/upload', multipart(req, 'text/event-stream')))

aiChatRouter.post('/transcribe', (req, res) => relay(req, res, '/api/chat/transcribe', multipart(req, 'application/json')))

aiChatRouter.get('/turns/:id/events', (req, res) => {
  const last = req.get('Last-Event-ID')
  return relay(req, res, `/api/chat/turns/${req.params.id}/events`, {
    headers: { Accept: 'text/event-stream', ...(last ? { 'Last-Event-ID': last } : {}) },
  })
})

aiChatRouter.post('/turns/:id/cancel', (req, res) =>
  relay(req, res, `/api/chat/turns/${req.params.id}/cancel`, { method: 'POST' }),
)

for (const action of ['approval', 'feedback']) {
  aiChatRouter.post(`/turns/:id/${action}`, (req, res) =>
    relay(req, res, `/api/chat/turns/${req.params.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    }),
  )
}

aiChatRouter.post('/reset', (req, res) => relay(req, res, '/api/chat/reset', { method: 'POST' }))

// Файловете носят интеграцията си: човек с повече от една иначе би получил 403.
aiChatRouter.get('/files/:messageId', (req, res) =>
  relay(req, res, `/api/chat/files/${req.params.messageId}`, {}, FILE_HEADERS),
)

aiChatRouter.get('/roster-files/:documentId', (req, res) =>
  relay(req, res, `/roster-files/${req.params.documentId}`, { headers: { 'x-provider-key': 'roster' } }, FILE_HEADERS),
)

aiChatRouter.get('/pdf/:invoiceId', (req, res) => {
  const english = req.query.in_english === 'true' ? '?in_english=true' : ''
  return relay(
    req,
    res,
    `/dashboard/pdf/${req.params.invoiceId}${english}`,
    { headers: { 'x-provider-key': 'nula_bg' } },
    FILE_HEADERS,
  )
})

type Init = Omit<RequestInit, 'headers'> & { headers?: Record<string, string>; duplex?: 'half' }

/** Качен файл, препратен както пристига: express.json() не чете multipart тела. */
function multipart(req: Request, accept: string): Init {
  return {
    method: 'POST',
    headers: { 'Content-Type': req.get('Content-Type') ?? '', Accept: accept },
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  }
}

/** Отговорът на платформата, статус и тяло без промяна, всяко парче препратено веднага. */
async function relay(req: Request, res: Response, path: string, init: Init = {}, passOn = ['content-type']) {
  const base = process.env.AI_CHAT_API_URL?.trim().replace(/\/+$/, '')
  const key = process.env.AI_CHAT_ACCESS_KEY?.trim()
  if (!base || !key) return res.status(503).json({ error: NOT_CONFIGURED })

  const abort = new AbortController()
  // Браузърът си тръгна: спираме да четем. Асистентът пак довършва и запазва отговора.
  res.on('close', () => abort.abort())
  const provider = process.env.AI_CHAT_PROVIDER_KEY?.trim()
  try {
    const answer = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(provider ? { 'x-provider-key': provider } : {}),
        ...init.headers,
        'x-api-key': key,
        'x-user-email': req.user!.email,
      },
      signal: abort.signal,
    })
    res.status(answer.status)
    for (const name of passOn) {
      const value = answer.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    if (answer.body) await pipeline(Readable.fromWeb(answer.body as any), res)
    else res.end()
  } catch {
    // Платформата е недостъпна или потокът прекъсна (деплой): затваряме и този на браузъра.
    if (!res.headersSent) res.status(502).json({ error: UNREACHABLE })
    else res.destroy()
  }
}
