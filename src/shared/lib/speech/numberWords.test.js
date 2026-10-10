import { describe, it, expect } from 'vitest'
import { cardinalWords, ordinalWords, foldNumbers, readingsOfText, hasDigits, isNumberWord, MAX_READINGS } from './numberWords.js'

const first = t => readingsOfText(t)?.[0]

describe('numberWords: целые и порядковые', () => {
  it('целые 0–9999 словами', () => {
    for (const [n, w] of [[0, 'zero'], [2, 'two'], [10, 'ten'], [13, 'thirteen'], [25, 'twenty five'], [40, 'forty'], [100, 'one hundred'], [105, 'one hundred five'], [999, 'nine hundred ninety nine'], [1000, 'one thousand'], [3050, 'three thousand fifty'], [9999, 'nine thousand nine hundred ninety nine']]) {
      expect(cardinalWords(n), String(n)).toBe(w)
    }
    expect(cardinalWords(105, true)).toBe('one hundred and five')
  })
  it('порядковые: 1st, 2nd, 3rd, 5th, 8th, 12th, 20th, 21st, 100th', () => {
    for (const [n, w] of [[1, 'first'], [2, 'second'], [3, 'third'], [4, 'fourth'], [5, 'fifth'], [8, 'eighth'], [9, 'ninth'], [12, 'twelfth'], [20, 'twentieth'], [21, 'twenty first'], [30, 'thirtieth'], [100, 'one hundredth'], [101, 'one hundred first']]) {
      expect(ordinalWords(n), String(n)).toBe(w)
    }
    expect(first('the 1st')).toBe('the first'); expect(first('on the 22nd.')).toBe('on the twenty second.'); expect(first('the 3rd')).toBe('the third'); expect(first('the 11th')).toBe('the eleventh')
  })
  it('запятая в тысячах и знаки вокруг числа сохраняются', () => {
    expect(first('It costs 1,000.')).toBe('It costs one thousand.')
    expect(first('(25), 7!')).toBe('(twenty five), seven!')
    expect(first('"2"')).toBe('"two"')
  })
})

describe('numberWords: несколько прочтений', () => {
  it('год «голыми» цифрами: пара — основное, количество — второе', () => {
    expect(readingsOfText('1998')).toEqual(['nineteen ninety eight', 'one thousand nine hundred ninety eight', 'one thousand nine hundred and ninety eight'])
    expect(readingsOfText('1905')[0]).toBe('nineteen oh five')
    expect(readingsOfText('1900')[0]).toBe('nineteen hundred')
    expect(readingsOfText('2024')[0]).toBe('twenty twenty four')
    expect(readingsOfText('2024')).toContain('two thousand twenty four')
    expect(readingsOfText('2005').slice(0, 2)).toEqual(['two thousand five', 'two thousand and five'])
    expect(readingsOfText('2005')).toContain('twenty oh five')
    expect(readingsOfText('2000')).toEqual(['two thousand'])
  })
  it('четыре цифры вне годов (1000–1099, от 2100) и с запятой — только количество', () => {
    expect(readingsOfText('1050')[0]).toBe('one thousand fifty')
    expect(readingsOfText('3000')).toEqual(['three thousand'])
    expect(readingsOfText('1,998')[0]).toBe('one thousand nine hundred ninety eight')
  })
  it('«0»: zero и oh; сотни: с «and» и без', () => {
    expect(readingsOfText('0')).toEqual(['zero', 'oh'])
    expect(readingsOfText('105')).toEqual(['one hundred five', 'one hundred and five'])
    expect(readingsOfText('100')).toEqual(['one hundred'])
  })
  it('несколько чисел: основное прочтение везде первым, всего не больше MAX_READINGS, без повторов', () => {
    const r = readingsOfText('1998 and 2005 and 0 and 105')
    expect(r[0]).toBe('nineteen ninety eight and two thousand five and zero and one hundred five')
    expect(r.length).toBe(MAX_READINGS)
    expect(new Set(r).size).toBe(r.length)
    expect(readingsOfText('a 1 b 2 c 3 d 4 e 5 f 6 g 7 h 8 i 9 j 10')).toHaveLength(1) // у простых чисел прочтение одно
  })
})

describe('numberWords: проценты, валюта, время', () => {
  it('проценты и валюта', () => {
    expect(first('50% off')).toBe('fifty percent off')
    expect(first('$5 please')).toBe('five dollars please')
    expect(first('$1')).toBe('one dollar'); expect(first('£20')).toBe('twenty pounds'); expect(first('€3.')).toBe('three euros.')
  })
  it('время: 3:30, 3:00, 3:05, 12:45', () => {
    expect(first('At 3:30')).toBe('At three thirty')
    expect(readingsOfText('At 3:00')).toEqual(["At three o'clock", 'At three'])
    expect(readingsOfText('At 3:05')).toEqual(['At three oh five', 'At three zero five'])
    expect(first('12:45')).toBe('twelve forty five')
  })
})

describe('numberWords: не простое → null (фраза остаётся на системном)', () => {
  it('десятичные, большие числа, телефоны, слова с цифрами, ведущие нули, am/pm, неверное время', () => {
    for (const t of ['2.5', '10000', '12,345', '555-1234', '+1 800 555', '5-year', 'mp3', '007', '3:30 pm', '25:00', '3:75', '1,00', '$2.50', '1e5', '2x']) {
      expect(readingsOfText(t), t).toBe(null)
    }
    expect(readingsOfText('at 5 pm')).not.toBe(null) // «5» само по себе простое; am/pm проверяется только у времени 3:30
  })
  it('без цифр — текст как есть, одно прочтение', () => {
    expect(readingsOfText('Hello, world!')).toEqual(['Hello, world!'])
    expect(readingsOfText('')).toEqual([''])
    expect(readingsOfText(null)).toEqual([''])
    expect(hasDigits('a1')).toBe(true); expect(hasDigits('abc')).toBe(false)
  })
})

describe('numberWords: foldNumbers — основное прочтение для сравнения', () => {
  it('простые числа заменяются, непростые остаются как были (никаких регрессий)', () => {
    expect(foldNumbers('I have 2 cats')).toBe('I have two cats')
    expect(foldNumbers('It is 2.5 or 3')).toBe('It is 2.5 or three')
    expect(foldNumbers('call 555-1234 at 3:30 pm')).toBe('call 555-1234 at 3:30 pm')
    expect(foldNumbers('no digits here')).toBe('no digits here')
    expect(foldNumbers(null)).toBe('')
  })
  it('isNumberWord: слова из чисел (в ошибочные формы не превращаем)', () => {
    for (const w of ['two', 'twenty', 'hundred', 'thousand', 'first', 'twentieth', 'oh', 'percent', 'dollars', "o'clock", 'Five']) expect(isNumberWord(w), w).toBe(true)
    for (const w of ['cats', 'play', 'and', '', null]) expect(isNumberWord(w), String(w)).toBe(false)
  })
})
