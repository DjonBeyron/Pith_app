import { describe, it, expect } from 'vitest'
import {
  cleanExtraLetters, layoutOf, litChars, keyboardModel, typedMax, catchTypedMax,
  appendChar, removeLast, typedMatches, letterCount, letterForm, capitalizeFirst,
  typedMismatchSlot, wordLetters,
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
    expect(model.lastExtra).toBe(0)
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

  it('знаки вне раскладки встают в начало последнего ряда (слева от «z»), отдельного нижнего ряда нет', () => {
    const model = keyboardModel("don't", '')
    expect(model.rows).toHaveLength(3)
    expect(model.rows[2].map(k => k.ch).join('')).toBe("'zxcvbnm")
    expect(model.lastExtra).toBe(1)
    expect(model.space).toBe(false)

    const phrase = keyboardModel('ice cream')
    expect(phrase.space).toBe(true)
    expect(phrase.lastExtra).toBe(0)
    expect(phrase.rows.map(r => r.length)).toEqual([10, 9, 7])

    expect(keyboardModel('café').rows[2][0]).toMatchObject({ ch: 'é', lit: true })
    expect(keyboardModel('ёж').rows[2][0].ch).toBe('ё')
    expect(keyboardModel('ёж').rows).toHaveLength(3)
  })

  it('высота панели не зависит от слова: три ряда клавиш и с апострофом, и без него', () => {
    for (const w of ['cat', "don't", 'café', 'well-known', 'кот', "ё'ж"]) expect(keyboardModel(w).rows).toHaveLength(3)
  })

  it('cols учитывает удлинённый последний ряд вместе со «Стереть» (1.5 клавиши)', () => {
    expect(keyboardModel('cat').cols).toBe(10)
    // 7 + апостроф + 1.5 «Стереть» помещаются в 10 колонок
    expect(keyboardModel("don't").cols).toBe(10)
    // два знака вне раскладки: 9 клавиш + 1.5 → 11 колонок
    const two = keyboardModel("well-don't")
    expect(two.rows[2]).toHaveLength(9)
    expect(two.cols).toBe(11)
    expect(keyboardModel('кот').cols).toBe(12)
  })

  it('типографский апостроф считается обычным', () => {
    expect(keyboardModel('don’t').rows[2][0].ch).toBe("'")
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
    expect(appendChar('Ca', 't', max)).toBe('Cat')
    expect(appendChar('Abcdef', 'x', max)).toBe('Abcdef')
  })

  it('catchTypedMax: длина слова + 1 (ловля), typedMax плеера остался +3', () => {
    expect(catchTypedMax('like')).toBe(5)
    expect(typedMax('like')).toBe(7)
    expect(catchTypedMax("don't")).toBe(6) // апостроф — символ длины
    expect(catchTypedMax('well-known')).toBe(11) // дефис — тоже
    // на слове из 4 букв максимум 5 символов, 6-й игнорируется
    const max = catchTypedMax('like')
    const typed = [...'likeeee'].reduce((t, ch) => appendChar(t, ch, max), '')
    expect(typed).toBe('Likee')
  })

  it('первая напечатанная буква — заглавная, остальные как есть', () => {
    expect(appendChar('', 't', 10)).toBe('T')
    expect(appendChar('T', 'r', 10)).toBe('Tr')
    expect(appendChar('', 'ё', 10)).toBe('Ё')
    // после стирания всего слова снова с заглавной
    expect(appendChar(removeLast('T'), 'q', 10)).toBe('Q')
    expect(capitalizeFirst('london')).toBe('London')
    expect(capitalizeFirst('')).toBe('')
  })

  it('capitalize: false — первая буква остаётся как есть (слова фразы кроме первого, лента)', () => {
    expect(appendChar('', 't', 10, { capitalize: false })).toBe('t')
    expect(appendChar('', 't', 10, { capitalize: true })).toBe('T')
    expect(appendChar('t', 'r', 10, { capitalize: false })).toBe('tr')
  })

  it('пробел — не первым и не двойным', () => {
    expect(appendChar('', ' ', 10)).toBe('')
    expect(appendChar('Ice ', ' ', 10)).toBe('Ice ')
    expect(appendChar('Ice', ' ', 10)).toBe('Ice ')
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

  it('слот сигнала — позиция первой неверной буквы, регистр не важен', () => {
    expect(typedMismatchSlot('Trys', 'tries')).toBe(2)   // y вместо i
    expect(typedMismatchSlot('tris', 'tries')).toBe(3)
    expect(typedMismatchSlot('Xries', 'tries')).toBe(0)
    expect(typedMismatchSlot('Tries', 'tries')).toBe(null)
  })

  it('короче слова или лишние буквы в конце — не ошибка в букве (null), слот не придумываем', () => {
    expect(typedMismatchSlot('Tr', 'tries')).toBe(null)
    expect(typedMismatchSlot('Triess', 'tries')).toBe(null)
    expect(typedMismatchSlot('', 'tries')).toBe(null)
  })

  it('пробелы не считаются буквами: слоты идут по буквам фразы', () => {
    expect(wordLetters('Ice cream').join('')).toBe('icecream')
    expect(typedMismatchSlot('Ice crean', 'ice cream')).toBe(7)
  })
})

describe('keyboardModel: lure (лишние светящиеся клавиши)', () => {
  const lureOf = model => model.rows.flat().filter(k => k.lure).map(k => k.ch).sort().join('')

  it('без дополнительных букв lure-клавиш нет', () => {
    expect(lureOf(keyboardModel('tries'))).toBe('')
  })

  it('lure — светится, но буквы нет в слове', () => {
    const m = keyboardModel('cat', 'xz')
    expect(lureOf(m)).toBe('xz')
    expect(m.rows.flat().find(k => k.ch === 'c')).toMatchObject({ lit: true, lure: false })
    expect(m.rows.flat().find(k => k.ch === 'x')).toMatchObject({ lit: true, lure: true })
    expect(m.rows.flat().find(k => k.ch === 'q')).toMatchObject({ lit: false, lure: false })
  })

  it('дополнительная буква, которая есть в слове, — не lure; дополнительные знаки вне раскладки — lure', () => {
    expect(lureOf(keyboardModel('cat', 'ca'))).toBe('')
    const m = keyboardModel("don't", 'é')
    expect(m.rows.flat().find(k => k.ch === "'").lure).toBe(false)
    expect(m.rows.flat().find(k => k.ch === 'é').lure).toBe(true)
  })

  it('пробел — не lure', () => {
    const m = keyboardModel('ice cream', 'z')
    expect(m.space).toBe(true)
    expect(lureOf(m)).toBe('z')
  })
})

describe('быстрая печать: серия appendChar подряд (плеер, setTyped(t => appendChar(t, ch, max)))', () => {
  const burst = (chars, max) => [...chars].reduce((t, ch) => appendChar(t, ch, max), '')

  it('10 нажатий подряд — все 10 символов, пока не упёрлись в лимит', () => {
    expect(burst('abcdefghij', typedMax('abcdefghijkl'))).toBe('Abcdefghij')
  })
  it('на лимите лишние нажатия игнорируются', () => {
    expect(burst('abcdefghij', 4)).toBe('Abcd')
  })
  it('двойной пробел в серии не проходит, остальное идёт по порядку', () => {
    expect(burst('a  b', 10)).toBe('A b')
  })
})
