import { describe, it, expect } from 'vitest'
import { checkMedia } from './lessonLintMedia.js'

const aud = (showText, then) => ({ ref: 'a', type: 'audio', data: { text: 'x', showText }, triggers: [{ if: 'played', then }] })

describe('checkMedia', () => {
  it('R-audio-showtext: текст скрыт, а следующее не задание на слух', () => {
    const nodes = [aud(false, 't'), { ref: 't', type: 'text', data: { content: 'ок' }, triggers: [] }]
    expect(checkMedia(nodes).some(w => w.includes('R-audio-showtext'))).toBe(true)
  })
  it('перед заданием на слух скрытый текст — норма', () => {
    const nodes = [aud(false, 'w'), { ref: 'w', type: 'word_choice', data: { options: [] }, triggers: [] }]
    expect(checkMedia(nodes)).toEqual([])
  })
  it('R-table-chat и R-typo', () => {
    const nodes = [{ ref: 't', type: 'table', data: { mode: 'dictator' }, triggers: [] }, { ref: 'x', type: 'text', data: { content: 'ну как сказажи' }, triggers: [] }]
    const w = checkMedia(nodes).join('|')
    expect(w).toContain('R-table-chat'); expect(w).toContain('R-typo')
  })
  it('R-green-wrap', () => {
    const c = 'проверим: I love'
    const hl = [{ start: 10, end: c.length, mode: 'bold' }]
    const bad = { ref: 'g', type: 'text', data: { content: c, highlights: hl, hardWrap: false }, triggers: [] }
    expect(checkMedia([bad]).join()).toContain('R-green-wrap')
    const ok = { ref: 'g', type: 'text', data: { content: 'проверим:\nI love', highlights: [{ start: 10, end: 16, mode: 'bold' }], hardWrap: true }, triggers: [] }
    expect(checkMedia([ok])).toEqual([])
  })
})

describe('checkMedia: шаблон «скажи» и вводные слова', () => {
  it('R-say-any: нет «любое» в подсказке', () => {
    const bad = [{ ref: 's', type: 'say_phrase', data: { pattern: 'I can **', hintMismatch: 'Скажи по-своему)' }, triggers: [] }]
    expect(checkMedia(bad).join()).toContain('R-say-any')
    const ok = [{ ref: 's', type: 'say_phrase', data: { pattern: 'I can **', hintMismatch: 'Начни с I can и добавь любое слово)' }, triggers: [] }]
    expect(checkMedia(ok)).toEqual([])
  })
  it('R-opener: одно вводное слово в большинстве веток ошибки', () => {
    const nodes = [{ ref: 'q', type: 'word_choice', data: {}, triggers: Array.from({ length: 6 }, (_, i) => ({ if: 'word_wrong', then: 'w' + i })) }]
    for (let i = 0; i < 6; i++) nodes.push({ ref: 'w' + i, type: 'text', data: { content: 'хм) подсказка' }, triggers: [] })
    expect(checkMedia(nodes).join()).toContain('R-opener')
  })
})
