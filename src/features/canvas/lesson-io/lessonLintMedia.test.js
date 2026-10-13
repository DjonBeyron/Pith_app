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
