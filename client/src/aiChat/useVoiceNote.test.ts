import { test } from 'node:test'
import assert from 'node:assert/strict'
import { voiceFilename } from './useVoiceNote'

test('names a recording with an extension the platform takes', () => {
  assert.equal(voiceFilename('audio/webm;codecs=opus'), 'voice.webm')
  assert.equal(voiceFilename('audio/mp4'), 'voice.m4a')
  assert.equal(voiceFilename('audio/ogg'), 'voice.ogg')
  assert.equal(voiceFilename(''), 'voice.webm')
})
