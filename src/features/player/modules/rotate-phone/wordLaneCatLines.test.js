import { describe, it, expect } from 'vitest'
import { CAT_LINES, normalizeLines, withText, linesToSave, linesItems, lineMs, lineKey, MAX_LINE_CHARS } from './wordLaneCatLines.js'

describe('реплики кота', () => {
  it('нет настроек — все реплики каталога с текстами по умолчанию и без озвучки; в каталоге есть «пробуй сказать слова раздельно»', () => {
    const l = normalizeLines(null)
    expect(Object.keys(l)).toEqual(CAT_LINES.map(d => d.id))
    expect(l.split_words.text).toMatch(/раздельно/)
    expect(Object.values(l).every(x => x.url === null && x.duration === null)).toBe(true)
  })
  it('настройки: текст и озвучка применяются, пустой текст → умолчание, чужие ключи и мусор отбрасываются, текст обрезается', () => {
    const l = normalizeLines({ lines: { your_turn: { text: ' Твой ход ', url: 'https://x/a.mp3', duration: 1.4, words: [{ w: 'Твой', t: 0, e: 0.4 }] }, well_done: { text: '  ' }, bad: { text: 'x' }, try_again: { text: 'я'.repeat(500), url: 5, duration: -1 } } })
    expect(l.your_turn).toMatchObject({ text: 'Твой ход', url: 'https://x/a.mp3', duration: 1.4 })
    expect(l.well_done.text).toBe('Отлично!')
    expect(l.bad).toBeUndefined()
    expect(l.try_again.text).toHaveLength(MAX_LINE_CHARS)
    expect(l.try_again.url).toBeNull(); expect(l.try_again.duration).toBeNull()
  })
  it('сохраняется только изменённое/озвученное; поменяли текст — озвучка сбрасывается', () => {
    const l = normalizeLines({ lines: { your_turn: { text: 'Твой ход', url: 'u', duration: 1 } } })
    expect(Object.keys(linesToSave(l).lines)).toEqual(['your_turn'])
    const changed = withText(l.your_turn, 'Другое')
    expect(changed).toMatchObject({ text: 'Другое', url: null, duration: null, words: null })
    expect(withText(l.your_turn, 'Твой ход ').url).toBe('u')                  // тот же текст — озвучка на месте
    expect(linesToSave(normalizeLines(null))).toEqual({ lines: {} })
  })
  it('в тапе «Начать» готовим только озвученные; длительность — по озвучке, без неё по тексту; скорость голоса укорачивает', () => {
    const l = normalizeLines({ lines: { your_turn: { text: 'Твой ход', url: 'u', duration: 2 } } })
    expect(linesItems(l)).toEqual([{ key: lineKey('your_turn'), url: 'u' }])
    expect(lineMs(l.your_turn)).toBe(2000)
    expect(lineMs(l.your_turn, 2)).toBe(1000)
    expect(lineMs(l.well_done)).toBeGreaterThan(0)
  })
})
