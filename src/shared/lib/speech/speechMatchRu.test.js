import { describe, it, expect } from 'vitest'
import { altsRu, wordCountRu, phraseFormsRu, tokenizeRu } from './speechMatchRu.js'

// Переводы с вариантами и пометками: ученик говорит один вариант, пометку в скобках не произносит (проход B «Встряхни память»)
describe('altsRu: варианты перевода', () => {
  it('одно слово и фраза — как есть; пусто — нет вариантов', () => {
    expect(altsRu('встретить')).toEqual(['встретить'])
    expect(altsRu('добрый день')).toEqual(['добрый день'])
    expect(altsRu('')).toEqual([]); expect(altsRu(null)).toEqual([]); expect(altsRu(' , / ')).toEqual([])
  })
  it('запятая, «/», «;», «или» — разделители вариантов; повторы убраны (ё ≡ е)', () => {
    expect(altsRu('пытаться, стараться')).toEqual(['пытаться', 'стараться'])
    expect(altsRu('бегать / бежать')).toEqual(['бегать', 'бежать'])
    expect(altsRu('хороший; добрый')).toEqual(['хороший', 'добрый'])
    expect(altsRu('где или куда')).toEqual(['где', 'куда'])
    expect(altsRu('ещё, еще')).toEqual(['ещё'])
  })
  it('пометка в скобках не произносится; весь перевод в скобках — берётся как есть', () => {
    expect(altsRu('встретить (кого-то)')).toEqual(['встретить'])
    expect(altsRu('приятно [разг.]')).toEqual(['приятно'])
    expect(altsRu('(привет)')).toEqual(['(привет)'])
    expect(tokenizeRu(altsRu('(привет)')[0])).toEqual(['привет'])
  })
})

describe('wordCountRu и phraseFormsRu', () => {
  it('число слов — по самому короткому варианту, не меньше 1', () => {
    expect(wordCountRu('добрый день')).toBe(2); expect(wordCountRu('пытаться, стараться')).toBe(1)
    expect(wordCountRu('как дела / как ты')).toBe(2); expect(wordCountRu('')).toBe(1); expect(wordCountRu('кто-то')).toBe(2)
  })
  it('словарь Vosk: каждый вариант отдельной записью, с «ё» и без; скобки не попадают', () => {
    expect(phraseFormsRu('пытаться, стараться')).toEqual(['пытаться', 'стараться'])
    expect(phraseFormsRu('ещё / снова')).toEqual(['ещё', 'еще', 'снова'])
    expect(phraseFormsRu('встретить (кого-то)')).toEqual(['встретить'])
    expect(phraseFormsRu('Добрый день!')).toEqual(['добрый день'])
  })
})
