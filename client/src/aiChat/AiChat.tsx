import { useEffect, useRef, useState } from 'react'
import { errorRowText } from './errors'
import { Markdown } from './Markdown'
import { messageFiles, onlyFile, splitMarks, waitingApproval } from './messages'
import type { ChatMessage } from './types'
import { useAiChat } from './useAiChat'
import { useVoiceNote } from './useVoiceNote'
import './aiChat.css'

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_TEXT = 8000

/** Бутонът долу вдясно и панелът с AI асистента. Само за влезли потребители. */
export function AiChat() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const chat = useAiChat(open)
  const voice = useVoiceNote(async (recording, filename) => {
    const text = await chat.transcribe(recording, filename)
    if (text) setDraft((prev) => (prev ? `${prev} ${text}` : text).slice(0, MAX_TEXT))
  })
  const fileInput = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)

  const lastId = chat.messages[chat.messages.length - 1]?.id
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [open, lastId, chat.live?.text])

  if (!open) {
    return (
      <button className="ai-fab" onClick={() => setOpen(true)}>
        💬 Асистент
      </button>
    )
  }

  const locked = chat.live !== null || chat.busy
  const waiting = chat.live ? null : waitingApproval(chat.messages)

  function submit() {
    const text = draft.trim()
    if (!text || locked) return
    chat.send(text)
    setDraft('')
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    chat.upload(file, draft.trim())
    setDraft('')
  }

  async function newConversation() {
    if (confirm('Да започна ли нов разговор?')) await chat.reset()
  }

  return (
    <section className="ai-panel" aria-label="AI асистент">
      <header className="ai-head">
        <strong>AI асистент</strong>
        <div className="ai-head-actions">
          <button className="ghost" onClick={newConversation} disabled={locked}>
            Нов разговор
          </button>
          <button className="ghost" onClick={() => setOpen(false)} aria-label="Затвори">
            ✕
          </button>
        </div>
      </header>

      <div className="ai-log" ref={log}>
        {chat.hasMore && (
          <button className="ghost ai-older" onClick={chat.loadOlder}>
            По-стари съобщения
          </button>
        )}
        {!chat.loaded && !chat.notice && <p className="muted">Зареждане…</p>}
        {chat.loaded && chat.messages.length === 0 && !chat.live && (
          <p className="muted">Попитай нещо — например колко фактури имаме този месец.</p>
        )}
        {chat.messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            waiting={waiting !== null && message.approvalTurnId === waiting}
            busy={chat.busy}
            onDecide={(decision) => chat.decide(waiting!, decision)}
            onRate={(verdict) => chat.rate(message, verdict)}
            onDownload={chat.download}
          />
        ))}
        {chat.live && (
          <div className="ai-msg assistant">
            {chat.live.text ? (
              <Markdown text={splitMarks(chat.live.text).text} onDownload={chat.download} />
            ) : (
              <p className="muted ai-thinking">{chat.live.tool ? 'Проверявам данните…' : 'Мисля…'}</p>
            )}
          </div>
        )}
      </div>

      {(chat.notice || voice.error) && <div className="error ai-notice">{chat.notice || voice.error}</div>}

      <form
        className="ai-compose"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={voice.recording ? 'Записвам… натисни ■, за да спра' : 'Напиши съобщение…'}
          maxLength={MAX_TEXT}
          rows={2}
          disabled={voice.recording}
        />
        <div className="ai-tools">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(event) => {
              pickFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="ghost"
            title="Прикачи снимка или PDF (до 10 MB)"
            disabled={locked || voice.recording}
            onClick={() => fileInput.current?.click()}
          >
            📎
          </button>
          <button
            type="button"
            className="ghost"
            title={voice.recording ? 'Спри записа' : 'Гласово съобщение'}
            disabled={locked}
            onClick={voice.recording ? voice.stop : voice.start}
          >
            {voice.recording ? '■' : '🎤'}
          </button>
          {chat.live ? (
            <button type="button" onClick={chat.stop}>
              Спри
            </button>
          ) : (
            <button type="submit" disabled={locked || voice.recording || !draft.trim()}>
              Изпрати
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

function MessageView({
  message,
  waiting,
  busy,
  onDecide,
  onRate,
  onDownload,
}: {
  message: ChatMessage
  waiting: boolean
  busy: boolean
  onDecide: (decision: 'confirm' | 'cancel') => void
  onRate: (verdict: 'up' | 'down') => void
  onDownload: (path: string, name: string) => void
}) {
  const { text, invoiceIds } = splitMarks(message.content)
  const files = messageFiles(message, invoiceIds)
  return (
    <div className={`ai-msg ${message.role}`}>
      {message.role === 'assistant' ? (
        <Markdown text={text} onDownload={onDownload} />
      ) : message.role === 'error' ? (
        <p className="ai-plain">{errorRowText(message.content)}</p>
      ) : (
        !onlyFile(message) && <p className="ai-plain">{message.content}</p>
      )}

      {files.map((file) => (
        <button key={file.path} type="button" className="ai-file" onClick={() => onDownload(file.path, file.name)}>
          📄 {file.name}
        </button>
      ))}

      {waiting && (
        <div className="actions">
          <button onClick={() => onDecide('confirm')} disabled={busy}>
            Потвърди
          </button>
          <button className="danger" onClick={() => onDecide('cancel')} disabled={busy}>
            Откажи
          </button>
        </div>
      )}

      {message.role === 'assistant' && message.turnId !== null && (
        <div className="ai-thumbs">
          <button
            className={message.feedback === 'up' ? 'on' : ''}
            aria-pressed={message.feedback === 'up'}
            title="Полезен отговор"
            onClick={() => onRate('up')}
          >
            👍
          </button>
          <button
            className={message.feedback === 'down' ? 'on' : ''}
            aria-pressed={message.feedback === 'down'}
            title="Неполезен отговор"
            onClick={() => onRate('down')}
          >
            👎
          </button>
        </div>
      )}
    </div>
  )
}
