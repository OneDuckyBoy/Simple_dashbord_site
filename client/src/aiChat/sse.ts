import type { SseEvent } from './types'

/**
 * Парсер на text/event-stream: подаваш му парчета текст както пристигат, а той вика onEvent
 * за всяко цяло събитие. Редовете с ":" са пингове и се пропускат.
 */
export function createSseParser(onEvent: (event: SseEvent) => void): (chunk: string) => void {
  let buffer = ''
  let name = 'message'
  let data: string[] = []
  let id: string | undefined

  return (chunk) => {
    buffer += chunk
    const lines = buffer.split(/\r\n|\r|\n/)
    // Последният ред може още да не е дошъл целият.
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line === '') {
        if (data.length) onEvent({ event: name, data: parseData(data.join('\n')), id })
        name = 'message'
        data = []
        id = undefined
        continue
      }
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') name = value
      else if (field === 'data') data.push(value)
      else if (field === 'id') id = value
    }
  }
}

/** Чете целия поток и вика onEvent за всяко събитие; свършва, когато потокът свърши. */
export async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: SseEvent) => void) {
  const push = createSseParser(onEvent)
  const reader = body.getReader()
  const decoder = new TextDecoder()
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    push(decoder.decode(chunk.value, { stream: true }))
  }
  push(decoder.decode())
}

function parseData(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
