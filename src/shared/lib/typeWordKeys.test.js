import { describe, it, expect } from 'vitest'
import {
  cleanExtraLetters, layoutOf, litChars, keyboardModel, typedMax,
  appendChar, removeLast, typedMatches, letterCount, letterForm,
} from './typeWordKeys.js'

const litLetters = model => model.rows.flat().filter(k => k.lit).map(k => k.ch).sort().join('')

describe('«Напечатай слово»: клавиатура', () => {
  it('светятся только буквы слова, остальные тусклые', () => {
    const model = keyboardModel('try')
    expect(litLetters(model)).toBe('rty')
    // клавиатура полная: все 26 латинских букв на месте, просто почти все тусклые
    expect(model.rows.flat()).toHaveLength(26)
    expect(model.rows.map(r => r.length)).toEqual([10, 9, 7])
    expect(model.cols).toBe(10)
    expect(model.extraKeys).toEqual([])
    expect(model.space).toBe(false)
  })

  it('дополнительные буквы автора тоже светятся', () => {
    expect(litLetters(keyboardModel('try', 'xz'))).toBe('rtxyz')
    // регистр, пробелы и запятые в поле автора не мешают
    expect(litLetters(keyboardModel('try', ' X, Z '))).toBe('rtxyz')
  })

  it('русское слово — раскладка ЙЦУКЕН', () => {
    const model = keyboardModel('кот')
    expect(model.rows.map(r => r.length)).toEqual([12, 11, 9])
    expect(model.cols).toBe(12)
    expect(litLetters(model)).toBe('кот')
    expect(layoutOf('hello', 'ж')).toBe('ru')
    expect(layoutOf('hello')).toBe('en')
  })

  it('знаки вне раскладки уходят в нижний ряд, пробел — если он в слове', () => {
    const model = keyboardModel("don't", '')
    expect(model.extraKeys.map(k => k.ch)).toEqual(["'"])
    expect(model.space).toBe(false)

    const phrase = keyboardModel('ice cream')
    expect(phrase.space).toBe(true)
    expect(phrase.extraKeys).toEqual([])

    expect(keyboardModel('café').extraKeys.map(k => k.ch)).toEqual(['é'])
    expect(keyboardModel('ёж').extraKeys.map(k => k.ch)).toEqual(['ё'])
  })

  it('типографский апостроф считается обычным', () => {
    expect(keyboardModel('don’t').extraKeys.map(k => k.ch)).toEqual(["'"])
  })

  it('cleanExtraLetters: уникальные символы нижнего регистра', () => {
    expect(cleanExtraLetters('Xx, zZ; q')).toBe('xzq')
    expect(cleanExtraLetters('')).toBe('')
    expect(cleanExtraLetters(undefined)).toBe('')
  })

  it('litChars сливает слово и дополнительные буквы', () => {
    expect([...litChars('go', 'x')].sort().join('')).toBe('gox')
  })
})

describe('«Напечатай слово»: ввод и проверка', () => {
  it('печать добавляет символ, переполнение и мёртвое не проходят', () => {
    const max = typedMax('cat') // 3 + запас
    expect(max).toBe(6)
    expect(appendChar('ca', 't', max)).toBe('cat')
    expect(appendChar('abcdef', 'x', max)).toBe('abcdef')
  })

  it('пробел — не первым и не двойным', () => {
    expect(appendChar('', ' ', 10)).toBe('')
    expect(appendChar('ice ', ' ', 10)).toBe('ice ')
    expect(appendChar('ice', ' ', 10)).toBe('ice ')
  })

  it('стирание убирает последний символ', () => {
    expect(removeLast('cat')).toBe('ca')
    expect(removeLast('')).toBe('')
  })

  it('проверка не зависит от регистра и вида апострофа', () => {
    expect(typedMatches('london', 'London')).toBe(true)
    expect(typedMatches("don't", 'don’t')).toBe(true)
    expect(typedMatches('cat ', 'cat')).toBe(true)
    expect(typedMatches('car', 'cat')).toBe(false)
    expect(typedMatches('', '')).toBe(false)
  })

  it('число букв и склонение', () => {
    expect(letterCount('ice cream')).toBe(8)
    expect([1, 2, 5, 11, 21, 24].map(letterForm)).toEqual(['буква', 'буквы', 'букв', 'букв', 'буква', 'буквы'])
  })
})
