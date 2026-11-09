import { describe, it, expect } from 'vitest'
import { pickTarget, pool, isShort, MODES, LANGS, LENS } from './pillStandPick.js'
import { STAND_WORDS, STAND_PHRASES } from './pillStandData.js'

// Цель стенда пилюль по сиду: повторяемость, короткие / длинные, EN / RU, подряд одна и та же не выпадает
describe('стенд пилюль: выбор цели', () => {
  it('один сид и настройки — та же последовательность целей', () => {
    for (const mode of MODES) for (const lang of LANGS) {
      const a = Array.from({ length: 8 }, (_, n) => pickTarget({ seed: 's1', n, mode, lang }).say)
      const b = Array.from({ length: 8 }, (_, n) => pickTarget({ seed: 's1', n, mode, lang }).say)
      expect(a).toEqual(b)
    }
  })
  it('другой сид — другая последовательность', () => {
    const a = Array.from({ length: 8 }, (_, n) => pickTarget({ seed: 'a', n, mode: 'words' }).say).join('|')
    const b = Array.from({ length: 8 }, (_, n) => pickTarget({ seed: 'b', n, mode: 'words' }).say).join('|')
    expect(a).not.toBe(b)
  })
  it('короткие и длинные разделяются, «любые» — все', () => {
    for (const mode of MODES) for (const lang of LANGS) {
      for (let n = 0; n < 12; n++) {
        expect(isShort(mode, pickTarget({ seed: 'x', n, mode, lang, len: 'short' }).say)).toBe(true)
        expect(isShort(mode, pickTarget({ seed: 'x', n, mode, lang, len: 'long' }).say)).toBe(false)
      }
      expect(pool(mode, lang, 'any').length).toBe(mode === 'word' ? STAND_WORDS.length : STAND_PHRASES.length)
    }
  })
  it('EN: говорят по-английски, на вертикальной пилюле перевод; RU — наоборот, фразы русские', () => {
    const en = pickTarget({ seed: 'z', n: 0, mode: 'word', lang: 'en' })
    expect(STAND_WORDS.some(w => w.en === en.say && w.ru === en.shown)).toBe(true)
    const ru = pickTarget({ seed: 'z', n: 0, mode: 'word', lang: 'ru' })
    expect(STAND_WORDS.some(w => w.ru === ru.say && w.en === ru.shown)).toBe(true)
    const fr = pickTarget({ seed: 'z', n: 1, mode: 'fast', lang: 'ru' })
    expect(fr.say).toMatch(/[а-яё]/i)
    expect(fr.shown).toBe(fr.say)
    expect(STAND_PHRASES.some(p => p.ru === fr.say && p.en === fr.other)).toBe(true)
  })
  it('подряд одна и та же цель не выпадает', () => {
    for (const len of LENS) {
      const list = Array.from({ length: 60 }, (_, n) => pickTarget({ seed: 'rep', n, mode: 'words', lang: 'en', len }).say)
      list.forEach((s, i) => { if (i) expect(s).not.toBe(list[i - 1]) })
    }
  })
  it('в данных есть и короткие, и длинные слова и фразы с переводом', () => {
    expect(STAND_WORDS.filter(w => isShort('word', w.en)).length).toBeGreaterThan(5)
    expect(STAND_WORDS.filter(w => !isShort('word', w.en)).length).toBeGreaterThan(5)
    expect(STAND_PHRASES.filter(p => isShort('words', p.en)).length).toBeGreaterThan(3)
    expect(STAND_PHRASES.filter(p => !isShort('words', p.en)).length).toBeGreaterThan(3)
    expect(STAND_PHRASES.every(p => p.ru && p.en)).toBe(true)
  })
})
