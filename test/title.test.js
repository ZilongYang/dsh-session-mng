import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cleanTitleText,
  collectTurns,
  frameTurns,
  normalizeTitle,
  shrinkToBudget,
  titleFromText,
  truncateTitleUtf8,
} from '../lib/title.js'

test('cleanTitleText strips terminal and directional controls', () => {
  const input = '\u001b[31mHello\u001b[0m\u200b  world\u202e!'
  assert.equal(cleanTitleText(input), 'Hello world!')
})

test('normalizeTitle keeps one line and enforces the byte budget', () => {
  assert.equal(normalizeTitle('  a\nb  ', 120), 'a b')
  const title = normalizeTitle('标题'.repeat(100), 12)
  assert.ok(Buffer.byteLength(title, 'utf8') <= 12)
  assert.equal(title, '标题标题')
})

test('truncateTitleUtf8 never splits a code point', () => {
  const emoji = '😀😀😀'
  const truncated = truncateTitleUtf8(emoji, 5)
  assert.equal(truncated, '😀')
  assert.equal(Buffer.byteLength(truncated, 'utf8'), 4)
})

test('titleFromText takes the first non-empty sanitized line', () => {
  assert.equal(titleFromText('\n\n  \u001b[31mReal title\u001b[0m\nrest', 120), 'Real title')
  assert.equal(titleFromText('', 120), '')
})

test('collectTurns reads both event shapes and clips long messages', () => {
  const events = [
    { type: 'user/message', data: { content: [{ type: 'text', text: 'first' }] } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'second' }] } } },
    { type: 'tool/result', data: {} },
    { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'no' }] } } },
  ]
  const turns = collectTurns(events, { userCharsPerMessage: 100, assistantCharsPerMessage: 100 })
  assert.deepEqual(turns, [
    { role: 'user', text: 'first' },
    { role: 'assistant', text: 'second' },
  ])
  const long = collectTurns(
    [{ type: 'user/message', data: { content: [{ type: 'text', text: 'x'.repeat(20) }] } }],
    { userCharsPerMessage: 5, assistantCharsPerMessage: 5 },
  )
  assert.ok(long[0].text.startsWith('xxxxx'))
  assert.ok(long[0].text.includes('truncated'))
})

test('shrinkToBudget keeps head and tail and reports truncation', () => {
  const turns = Array.from({ length: 10 }, (_, index) => ({ role: 'user', text: String(index) }))
  const { turns: kept, truncated } = shrinkToBudget(turns, 120)
  assert.equal(truncated, true)
  assert.ok(kept.length >= 2)
  assert.equal(kept[0].text, '0')
  assert.equal(kept.at(-1).text, '9')
  assert.ok(Buffer.byteLength(frameTurns(kept), 'utf8') < 300)
})
