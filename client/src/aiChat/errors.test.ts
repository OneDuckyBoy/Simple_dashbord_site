import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorCodeText, errorRowText, httpErrorText, retriable } from './errors'

test('error codes and old pending rows read as sentences; other rows stay as they are', () => {
  assert.match(errorCodeText('rate_limited'), /Изчакай минута/)
  assert.equal(errorCodeText('something_new'), errorCodeText('failed'))
  assert.equal(errorRowText('pending'), errorCodeText('failed'))
  assert.equal(errorRowText('unavailable'), errorCodeText('unavailable'))
  assert.equal(errorRowText('The model refused.'), 'The model refused.')
})

test('HTTP refusals: known statuses get our text, the rest the platform message', () => {
  assert.match(httpErrorText(403, 'x-user-email does not name…'), /Нямаш достъп/)
  assert.match(httpErrorText(413), /10 MB/)
  assert.equal(httpErrorText(410, 'This no longer waits.'), 'This no longer waits.')
  assert.equal(httpErrorText(418), 'Грешка 418')
})

test('a dropped stream is retried except on a 4xx other than 408 and 429', () => {
  assert.deepEqual([200, 408, 429, 502, 503].map(retriable), [true, true, true, true, true])
  assert.deepEqual([400, 401, 403, 404].map(retriable), [false, false, false, false])
})
