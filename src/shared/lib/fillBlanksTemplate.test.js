import { describe, it, expect } from 'vitest'
import { parseTemplateSegments, countBlanks, buildRevealedText, buildPickedText } from './fillBlanksTemplate.js'

describe('parseTemplateSegments — пропуск-слово', () => {
  it('She ___ to cook every weekend. → текст/пропуск/текст', () => {
    const segs = parseTemplateSegments('She ___ to cook every weekend.')
    expect(segs).toEqual([
      { type: 'text', value: 'She ' },
      { type: 'blank', index: 0 },
      { type: 'text', value: ' to cook every weekend.' },
    ])
  })
})

describe('parseTemplateSegments — пропуск-буквы внутри слова', () => {
  it('He tr___s a new recipe every week. → пропуск разрывает слово, а не стоит отдельно', () => {
    const segs = parseTemplateSegments('He tr___s a new recipe every week.')
    expect(segs).toEqual([
      { type: 'text', value: 'He tr' },
      { type: 'blank', index: 0 },
      { type: 'text', value: 's a new recipe every week.' },
    ])
  })
})

describe('parseTemplateSegments — несколько пропусков', () => {
  it('нумерует пропуски по порядку слева направо', () => {
    const segs = parseTemplateSegments('Yesterday she ___ to fix her bike, but tomorrow she ___ again.')
    const blanks = segs.filter(s => s.type === 'blank')
    expect(blanks.map(b => b.index)).toEqual([0, 1])
  })
})

describe('parseTemplateSegments — крайние случаи', () => {
  it('пустой шаблон — пустой список сегментов', () => {
    expect(parseTemplateSegments('')).toEqual([])
    expect(parseTemplateSegments(null)).toEqual([])
  })

  it('пропуск в самом начале/конце — вокруг него пустых текстовых сегментов нет', () => {
    const segs = parseTemplateSegments('___ tries.')
    expect(segs).toEqual([
      { type: 'blank', index: 0 },
      { type: 'text', value: ' tries.' },
    ])
  })

  it('шаблон без единого пропуска — один текстовый сегмент', () => {
    expect(parseTemplateSegments('Просто фраза без пропусков')).toEqual([
      { type: 'text', value: 'Просто фраза без пропусков' },
    ])
  })
})

describe('countBlanks', () => {
  it('считает пропуски по числу вхождений маркера', () => {
    expect(countBlanks('She ___ to cook every weekend.')).toBe(1)
    expect(countBlanks('Yesterday she ___ to fix her bike, but tomorrow she ___ again.')).toBe(2)
    expect(countBlanks('Без пропусков')).toBe(0)
  })
})

describe('buildRevealedText', () => {
  it('подставляет verный ответ каждого пропуска', () => {
    const template = 'Yesterday she ___ to fix her bike, but tomorrow she ___ again.'
    const blanks = [
      { options: ['tried', 'tries', 'try'], answer: 'tried' },
      { options: ['will try', 'tried', 'tries'], answer: 'will try' },
    ]
    expect(buildRevealedText(template, blanks)).toBe(
      'Yesterday she tried to fix her bike, but tomorrow she will try again.'
    )
  })

  it('буквенный пропуск — ответ подставляется прямо внутри слова', () => {
    const template = 'He tr___s a new recipe every week.'
    const blanks = [{ options: ['ie', 'y', 'ys'], answer: 'ie' }]
    expect(buildRevealedText(template, blanks)).toBe('He tries a new recipe every week.')
  })

  it('пропущенный blank (рассинхрон с шаблоном) — подставляется пустая строка, не падает', () => {
    expect(buildRevealedText('She ___ to cook.', [])).toBe('She  to cook.')
  })
})

describe('buildPickedText', () => {
  it('подставляет выбранное учеником значение по индексу пропуска', () => {
    const template = 'She ___ to cook every weekend.'
    expect(buildPickedText(template, { 0: 'tries' })).toBe('She tries to cook every weekend.')
  })

  it('незаполненный пропуск остаётся маркером ___', () => {
    const template = 'Yesterday she ___ to fix her bike, but tomorrow she ___ again.'
    expect(buildPickedText(template, { 0: 'tried' })).toBe(
      'Yesterday she tried to fix her bike, but tomorrow she ___ again.'
    )
  })
})
