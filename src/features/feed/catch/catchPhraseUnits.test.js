import { describe, it, expect } from 'vitest'
import { phraseUnits } from './catchPhraseUnits.js'

const texts = title => phraseUnits(title).map(u => u.text)

describe('phraseUnits: знаки прилипают к слову', () => {
  it('запятая и восклицание — к своему слову; пробел между словами — gap', () => {
    expect(phraseUnits('Hello, world!')).toEqual([
      { index: 0, text: 'Hello,', gap: ' ' },
      { index: 1, text: 'world!', gap: '' },
    ])
  })
  it('знак перед словом — к нему, в начале фразы тоже', () => {
    expect(texts('¿Qué tal? (bien) "yes"')).toEqual(['¿Qué', 'tal?', '(bien)', '"yes"'])
  })
  it('одинокое тире между словами уходит к предыдущему слову, пробелы сохраняются', () => {
    expect(phraseUnits('one - two')).toEqual([
      { index: 0, text: 'one -', gap: ' ' },
      { index: 1, text: 'two', gap: '' },
    ])
  })
  it('без пробела вокруг знака — к предыдущему слову, gap пуст; слово с апострофом цельное', () => {
    expect(phraseUnits('a/b')).toEqual([{ index: 0, text: 'a/', gap: '' }, { index: 1, text: 'b', gap: '' }])
    expect(texts("don't stop")).toEqual(["don't", 'stop'])
  })
  it('нет слов / пусто — []', () => {
    expect(phraseUnits('...')).toEqual([])
    expect(phraseUnits('')).toEqual([])
    expect(phraseUnits(null)).toEqual([])
  })
})
