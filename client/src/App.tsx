import { useCallback, useEffect, useState } from 'react'
import { api, clearToken, getToken, setToken, type Comment, type Post, type User } from './api'

type View = 'feed' | 'post' | 'login' | 'register' | 'new' | 'edit' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('feed')
  const [posts, setPosts] = useState<Post[]>([])
  const [current, setCurrent] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshPosts = useCallback(async () => {
    try {
      setPosts(await api.listPosts())
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  const loadMe = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const { user } = await api.me()
      setUser(user)
    } catch {
      clearToken()
    }
  }, [])

  useEffect(() => {
    Promise.all([refreshPosts(), loadMe()]).finally(() => setLoading(false))
  }, [refreshPosts, loadMe])

  async function openPost(id: number) {
    setError('')
    setView('post')
    try {
      const [p, c] = await Promise.all([api.getPost(id), api.listComments(id)])
      setCurrent(p)
      setComments(c)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function onLogin(u: string, p: string) {
    setError('')
    try {
      const { user, token } = await api.login(u, p)
      setToken(token)
      setUser(user)
      setView('feed')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function onRegister(u: string, e: string, p: string) {
    setError('')
    try {
      const { user, token } = await api.register(u, e, p)
      setToken(token)
      setUser(user)
      setView('feed')
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function onSave(title: string, body: string, editing?: Post) {
    setError('')
    try {
      if (editing) {
        await api.updatePost(editing.id, title, body)
      } else {
        await api.createPost(title, body)
      }
      await refreshPosts()
      setView('feed')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function onDelete(id: number) {
    if (!confirm('Изтриване на публикацията?')) return
    try {
      await api.deletePost(id)
      await refreshPosts()
      setView('feed')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function onComment(postId: number, body: string) {
    setError('')
    try {
      const c = await api.addComment(postId, body)
      setComments((prev) => [...prev, c])
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function onDeleteComment(id: number) {
    try {
      await api.deleteComment(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function onChangePassword(cur: string, next: string) {
    setError('')
    try {
      await api.changePassword(cur, next)
      alert('Паролата е сменена')
      setView('feed')
    } catch (e: any) {
      setError(e.message)
    }
  }

  function logout() {
    clearToken()
    setUser(null)
    setView('feed')
  }

  return (
    <div className="shell">
      <nav className="bar">
        <button className="brand" onClick={() => setView('feed')}>
          ✍️ Простичък блог
        </button>
        <div className="right">
          {user ? (
            <>
              <span className="who">👋 {user.username}</span>
              <button onClick={() => setView('settings')}>🔑 Смяна на парола</button>
              <button onClick={() => setView('new')}>+ Нова публикация</button>
              <button onClick={logout}>Изход</button>
            </>
          ) : (
            <>
              <button onClick={() => setView('login')}>Вход</button>
              <button onClick={() => setView('register')}>Регистрация</button>
            </>
          )}
        </div>
      </nav>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Зареждане…</p>}

      {!loading && view === 'feed' && (
        <FeedView
          posts={posts}
          onOpen={openPost}
          onDelete={onDelete}
          isOwner={(id) => user?.id === id || user?.role === 'admin'}
        />
      )}

      {view === 'post' && current && (
        <PostView
          post={current}
          comments={comments}
          isOwner={user?.id === (current as any).user_id || user?.role === 'admin'}
          onBack={() => setView('feed')}
          onEdit={() => setView('edit')}
          onDelete={() => onDelete(current.id)}
          onComment={onComment}
          onDeleteComment={onDeleteComment}
        />
      )}

      {view === 'login' && (
        <AuthForm mode="login" onDone={onLogin} />
      )}
      {view === 'register' && (
        <AuthForm mode="register" onDone={onRegister} />
      )}

      {view === 'new' && (
        <PostForm onSave={onSave} onCancel={() => setView('feed')} />
      )}
      {view === 'edit' && current && (
        <PostForm
          existing={current}
          onSave={(t, b) => onSave(t, b, current)}
          onCancel={() => setView('post')}
        />
      )}

      {view === 'settings' && (
        <ChangePassword
          onDone={onChangePassword}
          onCancel={() => setView('feed')}
        />
      )}
    </div>
  )
}

function FeedView({ posts, onOpen, onDelete, isOwner }: {
  posts: Post[]
  onOpen: (id: number) => void
  onDelete: (id: number) => void
  isOwner: (userId: number) => boolean
}) {
  if (posts.length === 0) return <p className="muted">Все още няма публикации.</p>
  return (
    <div className="feed">
      {posts.map((p) => (
        <article className="card" key={p.id}>
          <h2 onClick={() => onOpen(p.id)} className="link">
            {p.title}
          </h2>
          <p className="meta">
            от {p.author} · {fmt(p.created_at)}
          </p>
          <p className="excerpt">{p.body}</p>
          <div className="actions">
            <button onClick={() => onOpen(p.id)}>Чети</button>
            {isOwner(p.id) && (
              <button className="danger" onClick={() => onDelete(p.id)}>
                Изтрий
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

function PostView({ post, comments, isOwner, onBack, onEdit, onDelete, onComment, onDeleteComment }: {
  post: Post
  comments: Comment[]
  isOwner: boolean
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onComment: (id: number, body: string) => void
  onDeleteComment: (id: number) => void
}) {
  const [text, setText] = useState('')
  return (
    <div>
      <button className="ghost" onClick={onBack}>← Назад</button>
      <article className="card">
        <h1>{post.title}</h1>
        <p className="meta">
          от {post.author} · {fmt(post.created_at)}
          {post.updated_at !== post.created_at && <span> · редактирано</span>}
        </p>
        <p className="body">{post.body}</p>
        {isOwner && (
          <div className="actions">
            <button onClick={onEdit}>Редактирай</button>
            <button className="danger" onClick={onDelete}>Изтрий</button>
          </div>
        )}
      </article>

      <section className="card">
        <h3>Коментари ({comments.length})</h3>
        {comments.length === 0 ? (
          <p className="muted">Няма коментари. Първи напиши!</p>
        ) : (
          <ul className="comments">
            {comments.map((c) => (
              <li key={c.id}>
                <p>
                  <strong>{c.author}</strong> · {fmt(c.created_at)}
                  <button className="x" onClick={() => onDeleteComment(c.id)}>✕</button>
                </p>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) {
              onComment(post.id, text)
              setText('')
            }
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Напиши коментар…" />
          <button type="submit">Изпрати</button>
        </form>
      </section>
    </div>
  )
}

function AuthForm({ mode, onDone }: {
  mode: 'login' | 'register'
  onDone: (a: string, b: string, c: string) => void
}) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [c, setC] = useState('')
  return (
    <div className="card narrow">
      <h2>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === 'login') onDone(a, b, '')
          else onDone(a, c, b)
        }}
      >
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Потребител / email" />
        {mode === 'register' && (
          <input value={c} onChange={(e) => setC(e.target.value)} placeholder="Email" type="email" />
        )}
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="Парола" type="password" />
        <button type="submit">{mode === 'login' ? 'Влез' : 'Създай акаунт'}</button>
      </form>
    </div>
  )
}

function PostForm({ existing, onSave, onCancel }: {
  existing?: Post
  onSave: (t: string, b: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  return (
    <div className="card narrow">
      <h2>{existing ? 'Редактиране' : 'Нова публикация'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave(title, body)
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заглавие" required />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст…" rows={8} required />
        <div className="row">
          <button type="submit">Запази</button>
          <button type="button" className="ghost" onClick={onCancel}>Отказ</button>
        </div>
      </form>
    </div>
  )
}

function ChangePassword({ onDone, onCancel }: {
  onDone: (cur: string, next: string) => void
  onCancel: () => void
}) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [rep, setRep] = useState('')
  return (
    <div className="card narrow">
      <h2>Смяна на парола</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (next !== rep) {
            alert('Новите пароли не съвпадат')
            return
          }
          onDone(cur, next)
        }}
      >
        <input value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Текуща парола" type="password" required />
        <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Нова парола" type="password" required />
        <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Повтори новата" type="password" required />
        <div className="row">
          <button type="submit">Смени</button>
          <button type="button" className="ghost" onClick={onCancel}>Отказ</button>
        </div>
      </form>
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'Z'))
  return d.toLocaleString('bg-BG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}