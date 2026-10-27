import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from './db.js'

// Примерни данни за тестване. Можеш да ги местиш/триеш през UI-то.
const users = [
  { username: 'admin', email: 'admin@example.com', password: 'admin123', role: 'admin' },
  { username: 'demo', email: 'demo@example.com', password: 'demo123', role: 'user' },
]

const posts = [
  { title: 'Здравей, свят!', body: 'Това е първата публикация в тестовия блог. Пробвай да я редактираш или добави коментар.' },
  { title: 'Как тествам ai-automation', body: 'Този сайт е умишлено прост: потребители, публикации и коментари — всичко, за да се провери интеграцията. Понеже нямаме и блог пост с малко повече текст, за да се изпробва четенето.' },
]

const stmtUser = db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
const stmtPost = db.prepare('INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)')
const stmtComment = db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)')

db.exec('BEGIN;')
try {
  for (const u of users) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username)
    if (!exists) {
      const hash = bcrypt.hashSync(u.password, 10)
      const id = Number(stmtUser.run(u.username, u.email, hash, u.role).lastInsertRowid)
      const postId = Number(stmtPost.run(id, posts[0].title, posts[0].body).lastInsertRowid)
      stmtPost.run(id, posts[1].title, posts[1].body)
      stmtComment.run(postId, id, 'Демо коментар от ' + u.username)
    }
  }
  db.exec('COMMIT;')
} catch (e) {
  db.exec('ROLLBACK;')
  throw e
}

console.log('Seed готов. Потребители: admin/admin123, demo/demo123')
