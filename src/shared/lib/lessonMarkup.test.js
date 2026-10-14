import { describe, it, expect } from 'vitest'
import { parseMarkup, applyMarkup, hasMarkup, toMarkup } from './lessonMarkup.js'

describe('разметка выделений', () => {
  it('метки превращаются в чистый текст и highlights с правильными позициями', () => {
    const { text, highlights } = parseMarkup('Форма {g:tries} здесь')
    expect(text).toBe('Форма tries здесь')
    expect(highlights[0]).toMatchObject({ start: 0, end: 17, mode: 'text', color: '#c6c6c6', opacity: 1 })
    expect(highlights.filter(h => h.start === 6 && h.end === 11).map(h => h.mode)).toEqual(['text', 'bold'])
  })
  it('цвет всегда идёт вместе с bold; подчёркнутое тоже bold', () => {
    const { highlights } = parseMarkup('{u:try}')
    expect(highlights.map(h => h.mode)).toEqual(['text', 'text', 'bold', 'underline'])
  })
  it('{t:} — перевод: белый #fdfcfc + italic, без bold', () => {
    const { highlights } = parseMarkup('{t:«привет»}')
    expect(highlights.slice(1).map(h => h.mode)).toEqual(['text', 'italic'])
    expect(highlights[1].color).toBe('#fdfcfc')
  })
  it('плашка {p:i} — bg+pin на одной букве', () => {
    const { highlights } = parseMarkup('tr{p:i}es')
    expect(highlights.find(h => h.pin)).toMatchObject({ start: 2, end: 3, mode: 'bg' })
  })
  it('эмодзи считаются как в JS-строке (UTF-16): сдвиг позиций после эмодзи верный', () => {
    const { text, highlights } = parseMarkup('😅 {g:go}')
    expect(text.slice(highlights[1].start, highlights[1].end)).toBe('go')
  })
  it('applyMarkup: без меток ручные highlights остаются, а у обычного текста появляется базовый серый', () => {
    const d = { content: 'привет', highlights: [{ start: 0, end: 3, mode: 'bold' }] }
    expect(applyMarkup(d)).toBe(d)
    expect(hasMarkup('привет')).toBe(false)
    expect(applyMarkup({ content: 'привет' }).highlights).toEqual([{ start: 0, end: 6, mode: 'text', color: '#c6c6c6', opacity: 1 }])
    expect(applyMarkup({ emoji: '👍' })).toEqual({ emoji: '👍' })
  })
  it('applyMarkup: подставляет текст в нужное поле (content / text / caption)', () => {
    expect(applyMarkup({ caption: 'Это {g:tea}' })).toMatchObject({ caption: 'Это tea' })
    expect(applyMarkup({ text: '{w:он}' }).text).toBe('он')
  })

  it('{l:} белое подчёркивание и {x:} красное зачёркнутое: разбор и обратно', () => {
    const { text, highlights } = parseMarkup('нужно {l:действие} и {x:лишний}')
    expect(text).toBe('нужно действие и лишний')
    expect(highlights.filter(h => h.mode === 'underline')).toHaveLength(1)
    expect(highlights.filter(h => h.mode === 'strike')).toHaveLength(1)
    expect(toMarkup(text, highlights)).toBe('нужно {l:действие} и {x:лишний}')
  })
})
