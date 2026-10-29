import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeMessages, messageFiles, onlyFile, pdfPath, safeUrl, splitMarks, waitingApproval } from './messages'
import type { ChatMessage } from './types'

const message = (id: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role: 'assistant',
  content: '',
  createdAt: '2026-10-29T10:00:00.000Z',
  attachment: null,
  turnId: id,
  feedback: null,
  ...extra,
})

test('takes file marks out of the text and keeps the invoices they name', () => {
  assert.deepEqual(splitMarks('Ето я [[invoice:41]] и [[invoice-sent:42]] [[dashboard:7]]'), {
    text: 'Ето я  и',
    invoiceIds: [41, 42],
  })
})

test('lists a sent file, a given invoice and a marked invoice once each', () => {
  const sent = message(5, { attachment: { filename: 'a.pdf', mime: 'application/pdf', stored: true } })
  assert.deepEqual(messageFiles(sent, []), [{ path: '/files/5', name: 'a.pdf' }])
  const given = message(6, { attachment: { filename: 'f.pdf', mime: 'application/pdf', documentId: 41 } })
  assert.deepEqual(messageFiles(given, [41, 43]), [
    { path: '/roster-files/41', name: 'f.pdf' },
    { path: '/roster-files/43', name: 'invoice-43' },
  ])
})

test('a file sent without a caption shows only the file', () => {
  const attachment = { filename: 'a.jpg', mime: 'image/jpeg', stored: true }
  assert.equal(onlyFile(message(1, { role: 'user', content: 'a.jpg', attachment })), true)
  assert.equal(onlyFile(message(1, { role: 'user', content: 'фактурата', attachment })), false)
})

test('points NULA PDF links at our proxy and lets only http(s) links through', () => {
  assert.equal(pdfPath('/dashboard/pdf/12?in_english=true'), '/pdf/12?in_english=true')
  assert.equal(pdfPath('https://ai.example.com/dashboard/pdf/12'), '/pdf/12')
  assert.equal(pdfPath('/dashboard/pdf/12/../../users'), null)
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(safeUrl('/dashboard/pdf/3'), '/dashboard/pdf/3')
  assert.equal(safeUrl('javascript:alert(1)'), '')
  assert.equal(safeUrl('/dashboards/3'), '')
})

test('merges by id, oldest first', () => {
  const merged = mergeMessages([message(2), message(3)], [message(1), message(3, { content: 'new' }), message(4)])
  assert.deepEqual(merged.map((m) => [m.id, m.content]), [[1, ''], [2, ''], [3, 'new'], [4, '']])
})

test('only the newest message can wait for Confirm', () => {
  assert.equal(waitingApproval([message(1), message(2, { approvalTurnId: 2 })]), 2)
  assert.equal(waitingApproval([message(1, { approvalTurnId: 1 }), message(2)]), null)
  assert.equal(waitingApproval([]), null)
})
