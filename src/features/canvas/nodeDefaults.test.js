import { describe, it, expect, beforeEach } from 'vitest'
import { applyTypeChange, makeDefaultTriggers, hasOwnTriggers } from './nodeDefaults.js'

// applyTypeChange запоминает последний тип в localStorage — в node-окружении
// его нет, подставляем заглушку
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const node = (type, data, over = {}) => ({
  id: 'a', seq: 1, x: 0, y: 0, size: 'max', type,
  typeData: { [type]: data },
  triggers: [{ id: 't', if: 'played', then: null }],
  ...over,
})

describe('applyTypeChange — текст переезжает между типами сообщений', () => {
  it('голосовое → текстовое: реплика не теряется', () => {
    const patch = applyTypeChange(node('audio', { text: 'привет' }), 'text')
    expect(patch.typeData.text.content).toBe('привет')
  })

  it('текстовое → голосовое: тот же текст ложится в подпись аудио', () => {
    const patch = applyTypeChange(node('text', { content: 'привет' }), 'audio')
    expect(patch.typeData.audio.text).toBe('привет')
  })

  it('работает и со стикером, и с системным, и с закрепом', () => {
    expect(applyTypeChange(node('text', { content: 'ок' }), 'sticker').typeData.sticker.caption).toBe('ок')
    expect(applyTypeChange(node('sticker', { caption: 'ок' }), 'system').typeData.system.content).toBe('ок')
    expect(applyTypeChange(node('system', { content: 'ок' }), 'pin_message').typeData.pin_message.content).toBe('ок')
    expect(applyTypeChange(node('pin_message', { content: 'ок' }), 'audio').typeData.audio.text).toBe('ок')
  })

  it('раскраска и свои переносы едут вместе с текстом', () => {
    const hl = [{ start: 0, end: 2, mode: 'bg', color: '#ffeb3b', opacity: 0.5 }]
    const patch = applyTypeChange(node('text', { content: 'привет', highlights: hl, hardWrap: true }), 'audio')
    expect(patch.typeData.audio.highlights).toEqual(hl)
    expect(patch.typeData.audio.hardWrap).toBe(true)
  })

  it('уже написанный текст нового типа не затирается', () => {
    const n = node('audio', { text: 'из аудио' })
    n.typeData.text = { content: 'уже было' }
    // Переноса не происходит вовсе — патч не трогает typeData, и в ноде
    // остаётся её собственный текст
    const patch = applyTypeChange(n, 'text')
    expect(patch.typeData).toBeUndefined()
    expect(n.typeData.text.content).toBe('уже было')
  })

  it('пустой текст ничего не переносит', () => {
    const patch = applyTypeChange(node('audio', { text: '   ' }), 'text')
    expect(patch.typeData).toBeUndefined()
  })

  it('на нетекстовых типах перенос не срабатывает', () => {
    const patch = applyTypeChange(node('text', { content: 'привет' }), 'photo')
    expect(patch.typeData).toBeUndefined()
  })

  it('прочие настройки нового типа сохраняются', () => {
    const n = node('text', { content: 'привет' })
    n.typeData.sticker = { file_id: 'f1', autoSound: true }
    const patch = applyTypeChange(n, 'sticker')
    expect(patch.typeData.sticker.file_id).toBe('f1')
    expect(patch.typeData.sticker.autoSound).toBe(true)
    expect(patch.typeData.sticker.caption).toBe('привет')
  })
})

describe('applyTypeChange — триггеры при смене типа', () => {
  it('связь на следующую ноду не теряется', () => {
    const n = node('text', { content: '' }, { triggers: [{ id: 't', if: 'timer', then: 'b' }] })
    const patch = applyTypeChange(n, 'audio')
    expect(patch.triggers.some(t => t.then === 'b')).toBe(true)
  })

  it('у типа со своей парой триггеров они не пересобираются', () => {
    const n = node('word_choice', { options: [] }, {
      triggers: [{ id: '1', if: 'word_correct', then: 'b' }, { id: '2', if: 'word_wrong', then: null }],
    })
    expect(applyTypeChange(n, 'word_choice').triggers).toBeUndefined()
  })

  it('makeDefaultTriggers и hasOwnTriggers согласованы', () => {
    const trg = makeDefaultTriggers('word_choice')
    expect(hasOwnTriggers('word_choice', trg)).toBe(true)
    expect(hasOwnTriggers('text', trg)).toBe(false)
  })
})
