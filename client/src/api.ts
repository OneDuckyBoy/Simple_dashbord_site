export interface User {
  id: number
  username: string
  email: string
  role: string
}

export interface Post {
  id: number
  title: string
  body: string
  author: string
  created_at: string
  updated_at: string
}

export interface Comment {
  id: number
  body: string
  author: string
  created_at: string
}

const TOKEN_KEY = 'ss_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data as any)?.error || `Грешка ${res.status}`)
  }
  return data as T
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: User; token: string }>('/auth/login', 'POST', { username, password }),
  register: (username: string, email: string, password: string) =>
    request<{ user: User; token: string }>('/auth/register', 'POST', { username, email, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', 'POST', { currentPassword, newPassword }),
  me: () => request<{ user: User }>('/auth/me'),

  listPosts: () => request<Post[]>('/posts'),
  getPost: (id: number) => request<Post & { user_id: number }>(`/posts/${id}`),
  createPost: (title: string, body: string) => request<Post>('/posts', 'POST', { title, body }),
  updatePost: (id: number, title: string, body: string) =>
    request<{ id: number; updated: boolean }>(`/posts/${id}`, 'PUT', { title, body }),
  deletePost: (id: number) => request<{ deleted: boolean }>(`/posts/${id}`, 'DELETE'),

  listComments: (postId: number) => request<Comment[]>(`/comments/post/${postId}`),
  addComment: (postId: number, body: string) =>
    request<Comment>(`/comments/post/${postId}`, 'POST', { body }),
  deleteComment: (id: number) => request<{ deleted: boolean }>(`/comments/${id}`, 'DELETE'),
}