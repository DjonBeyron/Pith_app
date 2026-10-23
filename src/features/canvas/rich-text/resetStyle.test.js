import { describe, it, expect } from 'vitest'
import { addHighlight, clearRange } from '../../../shared/lib/textHighlight.js'
import { applyMarkup, BASE_GRAY } from '../../../shared/lib/lessonMarkup.js'

// «Сбросить к обычному тексту» (RichTextToolbar): снять всю раскраску и вернуть базовый серый — иначе кусок белел вместо «обычного»
describe('сброс раскраски к базовому серому', () => {
  it('после сброса у куска остаётся только базовый серый', () => {
    const { content, highlights } = applyMarkup({ content: '{g:I\'m} это {t:я есть}' })
    const end = content.length
    const next = addHighlight(clearRange(highlights, 0, end), { start: 0, end, mode: 'text', color: BASE_GRAY, opacity: 1 })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ start: 0, end, mode: 'text', color: BASE_GRAY })
  })
  it('частичный сброс не трогает остальной текст', () => {
    const { highlights } = applyMarkup({ content: '{g:I\'m} это {t:я есть}' })
    const next = addHighlight(clearRange(highlights, 0, 3), { start: 0, end: 3, mode: 'text', color: BASE_GRAY, opacity: 1 })
    expect(next.filter(h => h.start >= 3).length).toBeGreaterThan(0)
    expect(next.filter(h => h.end <= 3 && h.mode !== 'text')).toEqual([])
  })
})
