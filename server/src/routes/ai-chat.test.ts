import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { signToken } from '../auth.js'
import { aiChatRouter } from './ai-chat.js'

// Фалшива платформа: записва какво е получила; /api/chat/messages стриймва, докато тестът
// не я пусне, за да се види, че първото парче стига до браузъра преди края.
const seen: { path: string; headers: http.IncomingHttpHeaders; body: string }[] = []
let releaseStream = () => {}
const platform = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    seen.push({ path: req.url!, headers: req.headers, body })
    if (req.url === '/api/chat/messages' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('event: delta\ndata: {"text":"Здра"}\n\n')
      releaseStream = () => res.end('event: done\ndata: {"message":{}}\n\n')
      return
    }
    if (req.url!.startsWith('/roster-files/')) {
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="f.pdf"' })
      return res.end('%PDF')
    }
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end('{"statusCode":401,"message":"bad key","requestId":"r1"}')
  })
})

const app = express()
app.use(express.json())
app.use('/api/ai-chat', aiChatRouter)
const blog = http.createServer(app)
let blogUrl = ''
const token = signToken({ id: 7, username: 'anna', email: 'anna@firma.bg', role: 'user' })
const auth = { Authorization: `Bearer ${token}` }

before(async () => {
  await new Promise<void>((done) => platform.listen(0, done))
  await new Promise<void>((done) => blog.listen(0, done))
  process.env.AI_CHAT_API_URL = `http://127.0.0.1:${(platform.address() as AddressInfo).port}/`
  process.env.AI_CHAT_ACCESS_KEY = 'ak_test'
  blogUrl = `http://127.0.0.1:${(blog.address() as AddressInfo).port}/api/ai-chat`
})

after(() => {
  blog.closeAllConnections()
  platform.closeAllConnections()
  blog.close()
  platform.close()
})

beforeEach(() => {
  seen.length = 0
})

test('names the person from our JWT, never from what the browser sends', async () => {
  const res = await fetch(`${blogUrl}/messages?before=5&limit=x`, {
    headers: { ...auth, 'x-user-email': 'boss@firma.bg', 'x-api-key': 'ak_stolen' },
  })
  assert.equal(seen[0].path, '/api/chat/messages?before=5')
  assert.equal(seen[0].headers['x-user-email'], 'anna@firma.bg')
  assert.equal(seen[0].headers['x-api-key'], 'ak_test')
  // Грешката на платформата минава непроменена.
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { statusCode: 401, message: 'bad key', requestId: 'r1' })
})

test('streams each chunk before the reply ends', async () => {
  const res = await fetch(`${blogUrl}/messages`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Здравей', extra: 'dropped' }),
  })
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  const reader = res.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.match(first, /event: delta/)
  assert.deepEqual(JSON.parse(seen[0].body), { text: 'Здравей' })
  releaseStream()
  let rest = ''
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    rest += new TextDecoder().decode(chunk.value)
  }
  assert.match(rest, /event: done/)
})

test('passes a file on with its headers and its integration', async () => {
  const res = await fetch(`${blogUrl}/roster-files/41`, { headers: auth })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-disposition'), 'inline; filename="f.pdf"')
  assert.equal(await res.text(), '%PDF')
  assert.equal(seen[0].headers['x-provider-key'], 'roster')
})

test('refuses a bad id and a request without a login before calling the platform', async () => {
  assert.equal((await fetch(`${blogUrl}/turns/1;drop/cancel`, { method: 'POST', headers: auth })).status, 400)
  assert.equal((await fetch(`${blogUrl}/messages`)).status, 401)
  assert.equal(seen.length, 0)
})

test('answers 503 while the key is not set', async () => {
  const key = process.env.AI_CHAT_ACCESS_KEY
  delete process.env.AI_CHAT_ACCESS_KEY
  try {
    const res = await fetch(`${blogUrl}/messages`, { headers: auth })
    assert.equal(res.status, 503)
    assert.equal(seen.length, 0)
  } finally {
    process.env.AI_CHAT_ACCESS_KEY = key
  }
})
