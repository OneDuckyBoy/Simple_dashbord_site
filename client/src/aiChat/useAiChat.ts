import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatHttpError, chatApi, failure } from './chatApi'
import { errorCodeText, retriable } from './errors'
import { mergeMessages } from './messages'
import { readSse } from './sse'
import type { ChatMessage, SseEvent } from './types'

/** Отговорът, който се пише в момента. */
export interface LiveReply {
  text: string
  /** Асистентът проверява нещо (име на инструмент). */
  tool: string | null
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const RESUME_FOR_MS = 60_000
const RESUME_WAIT_MS = 8_000

function textOf(error: unknown): string {
  return error instanceof ChatHttpError ? error.message : 'Асистентът не е достъпен в момента.'
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

export function useAiChat(open: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [live, setLive] = useState<LiveReply | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const current = useRef<{ abort: AbortController; turnId: number | null } | null>(null)

  const add = useCallback((...incoming: ChatMessage[]) => {
    setMessages((prev) => mergeMessages(prev, incoming))
  }, [])

  useEffect(() => {
    if (!open || loaded) return
    chatApi
      .history()
      .then((page) => {
        setMessages(page.messages)
        setHasMore(page.hasMore)
        setLoaded(true)
      })
      .catch((error) => setNotice(textOf(error)))
  }, [open, loaded])

  // Затворен чат или изход: спираме да четем; асистентът пак довършва и запазва отговора.
  useEffect(() => () => current.current?.abort.abort(), [])

  async function loadOlder() {
    if (!messages.length) return
    try {
      const page = await chatApi.history(messages[0].id)
      add(...page.messages)
      setHasMore(page.hasMore)
    } catch (error) {
      setNotice(textOf(error))
    }
  }

  /** Един отговор от начало до край, взет наново, ако връзката прекъсне. */
  async function run(start: (signal: AbortSignal) => Promise<Response>) {
    const turn = { abort: new AbortController(), turnId: null as number | null }
    const { signal } = turn.abort
    current.current = turn
    setNotice('')
    setLive({ text: '', tool: null })
    let lastId: string | undefined
    let finished = false

    const onEvent = ({ event, data, id }: SseEvent) => {
      if (id) lastId = id
      const d = data ?? {}
      if (event === 'status') {
        if (d.userMessage) add(d.userMessage)
        if (typeof d.turnId === 'number') turn.turnId = d.turnId
        const phase = String(d.phase ?? '')
        // Проверка или нов опит: написаното досега отпада.
        if (phase.startsWith('tool:')) setLive({ text: '', tool: d.state === 'running' ? String(d.name) : null })
        else if (phase === 'restart') setLive({ text: '', tool: null })
      } else if (event === 'delta') {
        setLive((prev) => ({ text: (prev?.text ?? '') + String(d.text ?? ''), tool: null }))
      } else if (event === 'done' || event === 'error') {
        finished = true
        if (d.message) add(d.message)
        else if (event === 'error') setNotice(errorCodeText(d.code))
      }
    }

    try {
      try {
        const res = await start(signal)
        if (!res.ok) {
          setNotice((await failure(res)).message)
          return
        }
        await readSse(res.body!, onEvent)
      } catch {
        // Прекъсна: опитваме наново по-долу, ако вече знаем хода.
      }
      const until = Date.now() + RESUME_FOR_MS
      while (!finished && turn.turnId !== null && !signal.aborted && Date.now() < until) {
        await sleep(Math.random() * RESUME_WAIT_MS)
        if (signal.aborted) break
        // Без последно id целият поток идва отначало.
        if (!lastId) setLive({ text: '', tool: null })
        try {
          const res = await chatApi.events(turn.turnId, lastId, signal)
          if (!res.ok) {
            if (retriable(res.status)) continue
            break
          }
          await readSse(res.body!, onEvent)
        } catch {
          // Пак прекъсна: следващ опит.
        }
      }
      if (!finished && !signal.aborted) {
        setNotice('Връзката прекъсна. Отговорът ще се появи, когато отвориш чата отново.')
      }
    } finally {
      if (current.current === turn) {
        current.current = null
        setLive(null)
      }
    }
  }

  function send(text: string) {
    if (live) return
    void run((signal) => chatApi.send(text, signal))
  }

  function upload(file: File, caption: string) {
    if (live) return
    if (file.size > MAX_FILE_BYTES) {
      setNotice('Файлът е над 10 MB.')
      return
    }
    void run((signal) => chatApi.upload(file, caption, signal))
  }

  function stop() {
    const turn = current.current
    if (!turn) return
    turn.abort.abort()
    current.current = null
    setLive(null)
    if (turn.turnId !== null) chatApi.cancel(turn.turnId).catch(() => undefined)
  }

  /** Работа без поток (потвърждение, нов разговор, гласово): един по един, с текст при грешка. */
  async function act<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true)
    setNotice('')
    try {
      return await work()
    } catch (error) {
      setNotice(textOf(error))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  async function decide(turnId: number, decision: 'confirm' | 'cancel') {
    await act(async () => {
      try {
        const answer = await chatApi.decide(turnId, decision)
        add(answer.userMessage, answer.message)
      } catch (error) {
        // 410: вече не чака; бутоните отпадат.
        if (!(error instanceof ChatHttpError) || error.status !== 410) throw error
        setMessages((prev) => prev.map((m) => (m.approvalTurnId === turnId ? { ...m, approvalTurnId: undefined } : m)))
        setNotice(error.message)
      }
    })
  }

  async function rate(message: ChatMessage, verdict: 'up' | 'down') {
    if (message.turnId === null) return
    const before = message.feedback
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: verdict } : m)))
    try {
      await chatApi.feedback(message.turnId, verdict)
    } catch (error) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: before } : m)))
      setNotice(textOf(error))
    }
  }

  async function reset() {
    await act(async () => {
      await chatApi.reset()
      setMessages([])
      setHasMore(false)
    })
  }

  async function transcribe(voice: Blob, filename: string): Promise<string> {
    return (await act(() => chatApi.transcribe(voice, filename)))?.text ?? ''
  }

  async function download(path: string, name: string) {
    await chatApi.download(path, name).catch((error) => setNotice(textOf(error)))
  }

  return {
    messages,
    hasMore,
    loaded,
    live,
    busy,
    notice,
    loadOlder,
    send,
    upload,
    stop,
    decide,
    rate,
    reset,
    transcribe,
    download,
  }
}
