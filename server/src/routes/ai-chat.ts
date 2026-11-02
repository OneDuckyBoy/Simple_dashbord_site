import { Router } from 'express'
import { requireAuth } from '../auth.js'

// AI чатът на ai-automation, вграден като iframe (docs/chat-api.md там, „8. Embed our chat“).
// Целият чат е техен; ние само даваме краткотраен токен за влезлия потребител. Ключът стои тук,
// а имейлът е от нашия JWT, никога от заявката.
export const aiChatRouter = Router()

const NOT_CONFIGURED = 'AI chat is not configured: set AI_CHAT_API_URL and AI_CHAT_ACCESS_KEY in server/.env'
const UNREACHABLE = 'The assistant is out of reach'

aiChatRouter.use(requireAuth)

aiChatRouter.post('/token', async (req, res) => {
  const base = process.env.AI_CHAT_API_URL?.trim().replace(/\/+$/, '')
  const key = process.env.AI_CHAT_ACCESS_KEY?.trim()
  if (!base || !key) return res.status(503).json({ error: NOT_CONFIGURED })

  try {
    const answer = await fetch(`${base}/api/chat/embed-token`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'x-user-email': req.user!.email },
    })
    const body = (await answer.json().catch(() => null)) as { token?: string; expiresAt?: string; message?: string } | null
    if (!answer.ok || !body?.token) {
      return res.status(answer.ok ? 502 : answer.status).json({ error: body?.message || `Грешка ${answer.status}` })
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({ token: body.token, expiresAt: body.expiresAt })
  } catch {
    res.status(502).json({ error: UNREACHABLE })
  }
})
