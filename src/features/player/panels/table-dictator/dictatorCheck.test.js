import { describe, it, expect } from 'vitest'
import { evaluateDictator } from './dictatorCheck.js'

const cellTok  = { type: 'cell' }
const extraTok = v => ({ type: 'extra', value: v })

describe('сверка собранной фразы с эталоном', () => {
  it('фраза собирается по порядку токенов ответа', () => {
    const r = evaluateDictator({
      tokens: [cellTok, cellTok, extraTok("I'm")],
      assembled: ['I', 'am'],
      extrasAssembled: [{ value: "I'm", key: 'e0' }],
      answer: "I am I'm",
    })
    expect(r.phrase).toBe("I am I'm")
    expect(r.isCorrect).toBe(true)
  })

  it('типографский апостроф не делает верный ответ ошибкой', () => {
    // автор набрал ответ в редакторе с «умными» кавычками, чип — с обычной
    const r = evaluateDictator({
      tokens: [cellTok, extraTok("I'm")],
      assembled: ['I'],
      extrasAssembled: [{ value: "I'm", key: 'e0' }],
      answer: 'I I\u2019m',
    })
    expect(r.isCorrect).toBe(true)
  })

  it('двойные пробелы и регистр тоже не мешают', () => {
    const r = evaluateDictator({
      tokens: [cellTok, cellTok],
      assembled: ['I', 'AM'],
      extrasAssembled: [],
      answer: '  i   am ',
    })
    expect(r.isCorrect).toBe(true)
  })

  it('недобранная фраза — честная ошибка', () => {
    const r = evaluateDictator({
      tokens: [cellTok, cellTok, extraTok("I'm")],
      assembled: ['I', 'am'],
      extrasAssembled: [],
      answer: "I am I'm",
    })
    expect(r.phrase).toBe('I am')
    expect(r.isCorrect).toBe(false)
  })

  it('слова, поставленные на одно время, прилетают в любом порядке — ответ верный', () => {
    // два слова вне таблицы стоят одновременно: очередь их появления зависит
    // от раскладки таймлайна, а не от ответа
    const r = evaluateDictator({
      tokens: [cellTok, extraTok('not'), extraTok('a')],
      assembled: ['I'],
      extrasAssembled: [{ value: 'a', key: 'e1' }, { value: 'not', key: 'e0' }],
      answer: 'I not a',
    })
    expect(r.phrase).toBe('I not a')
    expect(r.isCorrect).toBe(true)
  })

  it('повтор слова требует двух собранных слов', () => {
    const one = evaluateDictator({
      tokens: [extraTok('a'), extraTok('a')],
      assembled: [],
      extrasAssembled: [{ value: 'a', key: 'e0' }],
      answer: 'a a',
    })
    expect(one.isCorrect).toBe(false)
    const two = evaluateDictator({
      tokens: [extraTok('a'), extraTok('a')],
      assembled: [],
      extrasAssembled: [{ value: 'a', key: 'e0' }, { value: 'a', key: 'e1' }],
      answer: 'a a',
    })
    expect(two.isCorrect).toBe(true)
  })

  it('лишнее слово (ловушка) в боксе — ответ неверный', () => {
    const r = evaluateDictator({
      tokens: [cellTok, extraTok('not')],
      assembled: ['I'],
      extrasAssembled: [{ value: 'not', key: 'e0' }, { value: 'never', key: 'e1' }],
      answer: 'I not',
    })
    expect(r.phrase).toBe('I not')
    expect(r.isCorrect).toBe(false)
  })

  it('эталон не задан — засчитываем что собрали', () => {
    expect(evaluateDictator({ tokens: [cellTok], assembled: ['I'], extrasAssembled: [], answer: '' }).isCorrect).toBe(true)
  })
})
