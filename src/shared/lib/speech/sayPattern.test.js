import { describe, it, expect } from 'vitest'
import { parsePattern, matchPattern, requiredWords } from './sayPattern.js'

const ok = (p, heard, opts) => matchPattern(p, heard, opts).passed

describe('sayPattern — шаблон свободной фразы', () => {
  it('разбор: слова, группа, необязательная группа, * и **', () => {
    const r = parsePattern('(yes|yeah)? I (try|am trying) to **')
    expect(r.ok).toBe(true)
    expect(r.elements.map(e => e.kind)).toEqual(['alt', 'lit', 'alt', 'lit', 'many'])
    expect(r.elements[0].optional).toBe(true)
    expect(r.elements[2].options).toEqual([['try'], ['am', 'trying']])
  })

  it('ошибки разбора: пусто, лишние скобки, нет обязательных слов, пустая группа', () => {
    expect(parsePattern('').ok).toBe(false)
    expect(parsePattern('I (try to').ok).toBe(false)
    expect(parsePattern('I try) to').ok).toBe(false)
    expect(parsePattern('**').ok).toBe(false)
    expect(parsePattern('(yes)? **').ok).toBe(false)
    expect(parsePattern('I ( ) to').ok).toBe(false)
    expect(parsePattern('I try?').ok).toBe(false)
  })

  it('«I (try|am trying) to **»: засчитывает свою концовку, не засчитывает другое время', () => {
    const p = 'I (try|am trying) to **'
    expect(ok(p, 'I try to wake up early')).toBe(true)
    expect(ok(p, 'I am trying to relax')).toBe(true)
    expect(ok(p, "I'm trying to relax")).toBe(true) // сокращение раскрывается: i am trying
    expect(ok(p, 'i try to read.')).toBe(true) // регистр и знаки не важны
    expect(ok(p, 'I tried to relax')).toBe(false)
    expect(ok(p, 'I try to')).toBe(false) // ** требует хотя бы одно слово
    expect(ok(p, 'we try to relax')).toBe(false)
  })

  it('* — ровно одно слово, текст без хвоста не лишний', () => {
    expect(ok('She tries *', 'she tries yoga')).toBe(true)
    expect(ok('She tries *', 'she tries yoga today')).toBe(false)
    expect(ok('She tries *', 'she tries')).toBe(false)
  })

  it('необязательная группа пропускается и принимается', () => {
    const p = '(yes|yeah)? I try **'
    expect(ok(p, 'I try yoga')).toBe(true)
    expect(ok(p, 'yeah I try yoga')).toBe(true)
    expect(ok(p, 'no I try yoga')).toBe(false)
  })

  it('допуск опечаток как в обычной проверке; «Строго» — только точные слова', () => {
    expect(ok('I try to **', 'I tri to relax')).toBe(true)
    expect(ok('I try to **', 'I tri to relax', { exact: true })).toBe(false)
  })

  it('частичное совпадение для подсказки «Почти!»: matched / missed — слова шаблона по порядку', () => {
    const m = matchPattern('I (try|am trying) to **', 'I try relax')
    expect(m.passed).toBe(false)
    expect(m.matched).toEqual(['i', 'try'])
    expect(m.missed).toEqual(['to'])
    expect(m.ratio).toBeCloseTo(2 / 3)
    expect(requiredWords(parsePattern('I (try|am trying) to **').elements)).toEqual(['i', 'try', 'to'])
  })

  it('битый шаблон не засчитывает ничего и не падает', () => {
    const m = matchPattern('I (try', 'I try')
    expect(m.passed).toBe(false)
    expect(m.ratio).toBe(0)
  })
})
