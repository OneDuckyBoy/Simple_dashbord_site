import { Router, type Request, type Response } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

export const postsRouter = Router()

postsRouter.get('/', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.body, p.created_at, p.updated_at,
              u.username AS author
       FROM posts p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC`
    )
    .all()
  return res.json(rows)
})

postsRouter.get('/:id', (req: Request, res: Response) => {
  const row = db
    .prepare(
      `SELECT p.id, p.title, p.body, p.created_at, p.updated_at, p.user_id,
              u.username AS author
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`
    )
    .get(Number(req.params.id)) as any
  if (!row) return res.status(404).json({ error: 'Post not found' })
  return res.json(row)
})

postsRouter.post('/', requireAuth, (req: Request, res: Response) => {
  const { title, body } = req.body ?? {}
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' })
  const result = db
    .prepare('INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)')
    .run(req.user!.id, String(title), String(body))
  const row = db
    .prepare(
      `SELECT p.id, p.title, p.body, p.created_at, p.updated_at, u.username AS author
       FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(Number(result.lastInsertRowid))
  return res.status(201).json(row)
})

postsRouter.put('/:id', requireAuth, (req: Request, res: Response) => {
  const { title, body } = req.body ?? {}
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' })
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id)) as any
  if (!existing) return res.status(404).json({ error: 'Post not found' })
  if (existing.user_id !== req.user!.id && req.user!.role !== 'admin')
    return res.status(403).json({ error: 'Not your post' })
  db.prepare(
    "UPDATE posts SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(String(title), String(body), Number(req.params.id))
  return res.json({ id: existing.id, updated: true })
})

postsRouter.delete('/:id', requireAuth, (req: Request, res: Response) => {
  const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id)) as any
  if (!existing) return res.status(404).json({ error: 'Post not found' })
  if (existing.user_id !== req.user!.id && req.user!.role !== 'admin')
    return res.status(403).json({ error: 'Not your post' })
  db.prepare('DELETE FROM posts WHERE id = ?').run(Number(req.params.id))
  return res.json({ deleted: true })
})
