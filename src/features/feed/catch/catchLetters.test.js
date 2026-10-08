import { describe, it, expect } from 'vitest'
import { LURE_COUNT, SIMILAR, lureLetters, catchKeyboard } from './catchLetters.js'

const WORDS = ['cat', 'tries', 'because', 'believe', 'world', "don't", 'ice cream', 'zoo', 'quick']
const keysOf = model => model.rows.flat()
const lureKeys = model => keysOf(model).filter(k => k.lure).map(k => k.ch)
const litKeys = model => keysOf(model).filter(k => k.lit).map(k => k.ch)

describe('LURE_COUNT и SIMILAR', () => {
  it('таблица уровней по спеку', () => {
    expect(LURE_COUNT).toEqual({ 0: [0, 0], 1: [1, 1], 2: [2, 3], 3: [4, 5], 4: 'all' })
  })
  it('SIMILAR: только латиница, без самой себя', () => {
    for (const [k, v] of Object.entries(SIMILAR)) {
      expect(k).toMatch(/^[a-z]$/)
      expect(v).not.toContain(k)
    }
  })
})

describe('lureLetters: количество по уровням', () => {
  it('уровень 0 — запутывателей нет, даже если автор задал буквы', () => {
    for (const w of WORDS) expect(lureLetters(w, 0)).toBe('')
    expect(lureLetters('cat', 0, 'xyz')).toBe('')
  })

  it('уровень 1 — ровно одна буква', () => {
    for (const w of WORDS) expect(lureLetters(w, 1)).toHaveLength(1)
  })

  it('уровень 2 — 2..3, уровень 3 — 4..5', () => {
    for (const w of WORDS) {
      expect(lureLetters(w, 2).length).toBeGreaterThanOrEqual(2)
      expect(lureLetters(w, 2).length).toBeLessThanOrEqual(3)
      expect(lureLetters(w, 3).length).toBeGreaterThanOrEqual(4)
      expect(lureLetters(w, 3).length).toBeLessThanOrEqual(5)
    }
  })

  it('на разных словах встречаются оба края диапазона (хэш реально раскладывает)', () => {
    const counts = new Set(['cat', 'tries', 'because', 'believe', 'world', 'zoo', 'quick', 'apple', 'night', 'sun']
      .map(w => lureLetters(w, 2).length))
    expect(counts.size).toBe(2)
  })

  it('уровень 4 — все буквы раскладки, которых нет в слове', () => {
    const l = lureLetters('cat', 4)
    expect(l).toHaveLength(26 - 3)
    expect([...l].sort().join('')).toBe('abcdefghijklmnopqrstuvwxyz'.replace(/[cat]/g, ''))
  })

  it('неизвестный уровень — пусто', () => {
    expect(lureLetters('cat', 7)).toBe('')
  })
})

describe('lureLetters: свойства', () => {
  it('детерминизм: одно и то же слово и уровень — одна и та же строка', () => {
    for (const w of WORDS) for (const lv of [1, 2, 3]) expect(lureLetters(w, lv)).toBe(lureLetters(w, lv))
  })

  it('нет букв слова и повторов', () => {
    for (const w of WORDS) {
      for (const lv of [1, 2, 3, 4]) {
        const l = [...lureLetters(w, lv)]
        expect(new Set(l).size).toBe(l.length)
        for (const ch of l) expect(w.toLowerCase()).not.toContain(ch)
      }
    }
  })

  it('сначала берутся похожие буквы слова: cat → d/k/s/e/o (t→d, c→k,s, a→e,o)', () => {
    const l = lureLetters('cat', 3)
    const similar = new Set([...'ks', ...'eo', ...'d'])
    expect([...l].every(ch => similar.has(ch))).toBe(true)
  })

  it('если не хватает похожих — добираем из алфавита', () => {
    const l = lureLetters('h', 3) // у h похожих нет
    expect(l.length).toBeGreaterThanOrEqual(4)
    expect(l).not.toContain('h')
  })

  it('кириллица: раскладка ru, запутыватели — русские буквы без букв слова', () => {
    const l = lureLetters('привет', 3)
    expect(l.length).toBeGreaterThanOrEqual(4)
    expect(l).toMatch(/^[а-яё]+$/)
    for (const ch of 'привет') expect(l).not.toContain(ch)
    expect(lureLetters('привет', 4)).toHaveLength(32 - 6)
  })

  it('authorExtra уважается: берутся его буквы минус буквы слова, число не по уровню', () => {
    expect(lureLetters('cat', 1, 'xz')).toBe('xz')
    expect(lureLetters('cat', 3, 'x, z, c')).toBe('xz')
    expect(lureLetters('cat', 2, 'ca')).toBe('')
  })

  it('authorExtra не влияет на уровень 0 и 4', () => {
    expect(lureLetters('cat', 0, 'xz')).toBe('')
    expect(lureLetters('cat', 4, 'xz')).toHaveLength(23)
  })
})

describe('catchKeyboard', () => {
  it('число lure-клавиш по уровням', () => {
    expect(lureKeys(catchKeyboard('cat', 0))).toHaveLength(0)
    expect(lureKeys(catchKeyboard('cat', 1))).toHaveLength(1)
    expect(lureKeys(catchKeyboard('cat', 2)).length).toBeGreaterThanOrEqual(2)
    expect(lureKeys(catchKeyboard('cat', 3)).length).toBeGreaterThanOrEqual(4)
  })

  it('lure-клавиши светятся и не содержат букв слова', () => {
    const m = catchKeyboard('tries', 3)
    for (const k of keysOf(m).filter(x => x.lure)) {
      expect(k.lit).toBe(true)
      expect('tries').not.toContain(k.ch)
    }
  })

  it('уровень 4 — все клавиши раскладки светятся', () => {
    const m = catchKeyboard('cat', 4)
    expect(m.rows.flat().every(k => k.lit)).toBe(true)
    expect(litKeys(m)).toHaveLength(26)
    expect(lureKeys(m)).toHaveLength(23)
  })

  it('authorExtra уважается', () => {
    expect(lureKeys(catchKeyboard('cat', 2, 'xz')).sort()).toEqual(['x', 'z'])
  })

  it('детерминизм модели', () => {
    expect(catchKeyboard('believe', 3)).toEqual(catchKeyboard('believe', 3))
  })
})
