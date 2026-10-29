import type { ChatFile, ChatMessage } from './types'

const MARK = /\[\[([a-z-]+):([^\]\s]+)\]\]/g
const INVOICE_MARKS = new Set(['invoice', 'invoice-sent'])
const PDF_PATH = /^(?:https?:\/\/[^/]+)?\/dashboard\/pdf\/(\d+)(\?in_english=true)?$/

/**
 * Текстът без файловите маркери `[[kind:id]]`, които запазен отговор още може да носи, и
 * фактурите, които те посочват.
 */
export function splitMarks(content: string): { text: string; invoiceIds: number[] } {
  const invoiceIds: number[] = []
  const text = content.replace(MARK, (_mark, kind: string, id: string) => {
    if (INVOICE_MARKS.has(kind) && /^\d+$/.test(id)) invoiceIds.push(Number(id))
    return ''
  })
  return { text: text.trim(), invoiceIds }
}

/** Файловете към едно съобщение, като пътища през нашето прокси. */
export function messageFiles(message: ChatMessage, invoiceIds: number[]): ChatFile[] {
  const files: ChatFile[] = []
  const { attachment } = message
  if (attachment?.stored) files.push({ path: `/files/${message.id}`, name: attachment.filename })
  else if (attachment?.documentId) {
    files.push({ path: `/roster-files/${attachment.documentId}`, name: attachment.filename })
  }
  for (const id of invoiceIds) {
    const path = `/roster-files/${id}`
    if (!files.some((file) => file.path === path)) files.push({ path, name: `invoice-${id}` })
  }
  return files
}

/** Пратен файл без надпис: съдържанието е името му и чатът показва само файла. */
export function onlyFile(message: ChatMessage): boolean {
  return message.attachment?.stored === true && message.content === message.attachment.filename
}

/** Връзка към PDF на NULA фактура (`/dashboard/pdf/<id>`) като път през нашето прокси. */
export function pdfPath(href: string): string | null {
  const match = PDF_PATH.exec(href)
  return match ? `/pdf/${match[1]}${match[2] ?? ''}` : null
}

/** Само http(s) връзки и PDF-ите на фактурите; всичко друго става празно (и се показва като текст). */
export function safeUrl(url: string): string {
  return pdfPath(url) !== null || /^https?:\/\//i.test(url) ? url : ''
}

/** Новите съобщения слети със старите: едно и също id идва само веднъж, подредени по id. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** Ходът, който чака Потвърди / Откажи: само на най-новото съобщение, докато нищо не го следва. */
export function waitingApproval(messages: ChatMessage[]): number | null {
  return messages[messages.length - 1]?.approvalTurnId ?? null
}
