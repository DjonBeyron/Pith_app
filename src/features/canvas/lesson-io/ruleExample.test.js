import { describe, it, expect } from 'vitest'
import { parseMarkup, toMarkup } from '../../../shared/lib/lessonMarkup.js'
import { parseExample, serializeExample, exampleToPrompt } from './ruleExample.js'

describe('обратная разметка toMarkup', () => {
  it('разметка → highlights → разметка даёт то же самое', () => {
    for (const src of ['Форма {g:tries} здесь', '{t:«Она пробует теннис»}', 'tr{p:i}es', 'буква {b:y} и {u:to}', '{w:он} идёт']) {
      const { text, highlights } = parseMarkup(src)
      expect(toMarkup(text, highlights), src).toBe(src)
    }
  })
  it('нестандартная раскраска остаётся простым текстом', () => {
    expect(toMarkup('abc', [{ start: 0, end: 3, mode: 'text', color: '#123456' }])).toBe('abc')
  })
})

describe('примеры правил', () => {
  it('текст со строками «тип: …» и метками → пузыри; обратно в промпт те же метки', () => {
    const b = parseExample('text: Форма {g:tries}\nreaction: 👏\nпросто строка')
    expect(b.map(x => x.type)).toEqual(['text', 'reaction', 'text'])
    expect(b[0].content).toBe('Форма tries')
    expect(exampleToPrompt('text: Форма {g:tries}')).toBe('text: Форма {g:tries}')
  })
  it('сохранённый JSON читается обратно, пустое — пустой массив', () => {
    const b = parseExample('text: {g:go}')
    expect(parseExample(serializeExample(b))).toEqual(b)
    expect(parseExample('')).toEqual([])
    expect(serializeExample([])).toBe('')
  })
})
