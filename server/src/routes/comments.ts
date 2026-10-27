import { Router, type Request, type Response } from 'express'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'

export const commentsRouter = Router()

commentsRouter.get('/post/:postId', (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.username AS author
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(Number(req.params.postId))
  return res.json(rows)
})

commentsRouter.post('/post/:postId', requireAuth, (req: Request, res: Response) => {
  const { body } = req.body ?? {}
  if (!body) return res.status(400).json({ error: 'body is required' })
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(Number(req.params.postId))
  if (!post) return res.status(404).json({ error: 'Post not found' })
  const result = db
    .prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)')
    .run(Number(req.params.postId), req.user!.id, String(body))
  const row = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.username AS author
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    )
    .get(Number(result.lastInsertRowid))
  return res.status(201).json(row)
})

commentsRouter.delete('/:id', requireAuth, (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id)) as any
  if (!row) return res.status(404).json({ error: 'Comment not found' })
  if (row.user_id !== req.user!.id && req.user!.role !== 'admin')
    return res.status(403).json({ error: 'Not your comment' })
  db.prepare('DELETE FROM comments WHERE id = ?').run(Number(req.params.id))
  return res.json({ deleted: true })
})
