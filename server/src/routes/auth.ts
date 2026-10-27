import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { requireAuth, signToken, type AuthUser } from '../auth.js'

export const authRouter = Router()

authRouter.post('/register', (req: Request, res: Response) => {
  const { username, email, password } = req.body ?? {}
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' })
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'password must be at least 4 characters' })
  }
  const hash = bcrypt.hashSync(String(password), 10)
  try {
    const result = db
      .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
      .run(String(username), String(email), hash)
    const user: AuthUser = publicUser(Number(result.lastInsertRowid))
    return res.status(201).json({ user, token: signToken(user) })
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'username or email already exists' })
    }
    throw e
  }
})

authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {}
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' })
  }
  const row = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(String(username), String(username)) as any
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const user: AuthUser = publicUser(row.id)
  return res.json({ user, token: signToken(user) })
})

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.json({ user: req.user })
})

authRouter.post('/change-password', requireAuth, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' })
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'new password must be at least 4 characters' })
  }
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any
  if (!row || !bcrypt.compareSync(String(currentPassword), row.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' })
  }
  const hash = bcrypt.hashSync(String(newPassword), 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user!.id)
  return res.json({ ok: true })
})

function publicUser(id: number): AuthUser {
  const row = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(id) as any
  if (!row) throw new Error('User not found')
  return { id: row.id, username: row.username, email: row.email, role: row.role }
}
