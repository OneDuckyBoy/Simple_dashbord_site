import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSseParser, readSse } from './sse'
import type { SseEvent } from './types'

test('joins frames split across chunks and skips pings', () => {
  const events: SseEvent[] = []
  const push = createSseParser((event) => events.push(event))
  push(': ping\n\nevent: delta\nid: 17-1\nda')
  push('ta: {"text":"Здра"}\r\n\r\nevent: done\ndata: {"message":{"id":3}}\n')
  assert.deepEqual(events, [{ event: 'delta', data: { text: 'Здра' }, id: '17-1' }])
  push('\n')
  assert.deepEqual(events[1], { event: 'done', data: { message: { id: 3 } }, id: undefined })
})

test('reads a whole stream, multi-byte letters split between chunks included', async () => {
  const bytes = new TextEncoder().encode('event: delta\ndata: {"text":"Ясно"}\n\n')
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 30))
      controller.enqueue(bytes.slice(30))
      controller.close()
    },
  })
  const events: SseEvent[] = []
  await readSse(body, (event) => events.push(event))
  assert.deepEqual(events, [{ event: 'delta', data: { text: 'Ясно' }, id: undefined }])
})
