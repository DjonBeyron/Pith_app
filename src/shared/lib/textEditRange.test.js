import { describe, it, expect } from 'vitest'
import { prevCharStart, nextCharEnd, wordStart, wordEnd, lineStart, lineEnd } from './textEditRange.js'

describe('prevCharStart / nextCharEnd', () => {
  it('обычный символ — один шаг', () => {
    expect(prevCharStart('abc', 2)).toBe(1)
    expect(nextCharEnd('abc', 1)).toBe(2)
  })

  it('эмодзи (суррогатная пара) съедается целиком', () => {
    const t = 'a😀b'          // 'a' + 2 code unit + 'b'
    expect(prevCharStart(t, 3)).toBe(1)
    expect(nextCharEnd(t, 1)).toBe(3)
  })

  it('края строки', () => {
    expect(prevCharStart('abc', 0)).toBe(0)
    expect(nextCharEnd('abc', 3)).toBe(3)
  })
})

describe('wordStart / wordEnd', () => {
  it('слово перед кареткой вместе с пробелами', () => {
    expect(wordStart('one two  ', 9)).toBe(4)
    expect(wordStart('one two', 7)).toBe(4)
  })

  it('слово после каретки', () => {
    expect(wordEnd('one two', 3)).toBe(7)
    expect(wordEnd('one two', 0)).toBe(3)
  })
})

describe('lineStart / lineEnd', () => {
  it('границы текущей строки', () => {
    const t = 'aa\nbb\ncc'
    expect(lineStart(t, 4)).toBe(3)
    expect(lineEnd(t, 4)).toBe(5)
    expect(lineStart(t, 1)).toBe(0)
    expect(lineEnd(t, 7)).toBe(8)
  })
})
