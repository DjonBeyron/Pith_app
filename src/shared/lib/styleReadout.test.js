import { describe, it, expect } from 'vitest'
import { describeStyle } from './styleReadout.js'
import { parseMarkup } from './lessonMarkup.js'

describe('стиль выделенного текста', () => {
  it('зелёный жирный — метка g, цвет и флаги', () => {
    const { text, highlights } = parseMarkup('Форма {g:tries}')
    const i = text.indexOf('tries')
    const d = describeStyle(highlights, i, i + 5)
    expect(d).toMatchObject({ mixed: false, color: '#b6fe3b', mark: 'g', markName: 'английская форма' })
    expect(d.flags).toEqual(['bold'])
  })
  it('перевод — курсив #fdfcfc; базовый текст — серый', () => {
    const { highlights } = parseMarkup('{t:«привет»} мир')
    expect(describeStyle(highlights, 0, 3)).toMatchObject({ mark: 't', color: '#fdfcfc' })
    const base = describeStyle(highlights, 9, 12)
    expect(base).toMatchObject({ isBase: true, opacity: 1, mark: null })
  })
  it('участок из двух стилей — mixed', () => {
    const { highlights } = parseMarkup('a{g:b}')
    expect(describeStyle(highlights, 0, 2).mixed).toBe(true)
  })
  it('плашка', () => {
    const { text, highlights } = parseMarkup('tr{p:i}es')
    const i = text.indexOf('i')
    expect(describeStyle(highlights, i, i + 1)).toMatchObject({ mark: 'p', bg: { pin: true } })
  })
})
