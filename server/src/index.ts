import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { authRouter } from './routes/auth.js'
import { postsRouter } from './routes/posts.js'
import { commentsRouter } from './routes/comments.js'

const app = express()
const PORT = Number(process.env.PORT || 3001)

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.use('/api/auth', authRouter)
app.use('/api/posts', postsRouter)
app.use('/api/comments', commentsRouter)

// грешки: валидиране на JSON / невладени грешки
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err?.message || 'Internal error' })
})

app.listen(PORT, () => {
  console.log(`API слуша на http://localhost:${PORT}`)
})
