import { describe, it, expect } from 'vitest'
import { phraseVariants, chipWords, judgeAssembly } from './phraseVariants.js'

const pa = { words: ['We', 'try', 'every', 'day'], answers: [['Every', 'day', 'we', 'try'], 'Yes we try every day'] }

describe('phraseVariants — несколько верных ответов «Собери фразу»', () => {
  it('главный ответ первым, затем дополнительные; строка режется на слова, пустое отбрасывается', () => {
    expect(phraseVariants(pa)).toEqual([
      ['We', 'try', 'every', 'day'], ['Every', 'day', 'we', 'try'], ['Yes', 'we', 'try', 'every', 'day'],
    ])
    expect(phraseVariants({ words: ['A', 'b'], answers: [[], '  ', null] })).toEqual([['A', 'b']])
    expect(phraseVariants({ words: ['A', 'b'] })).toEqual([['A', 'b']])
    expect(phraseVariants({})).toEqual([])
  })

  it('банк слов: главный ответ как раньше + только недостающие слова других вариантов', () => {
    expect(chipWords([['We', 'try']])).toEqual(['We', 'try'])
    expect(chipWords(phraseVariants(pa))).toEqual(['We', 'try', 'every', 'day', 'Yes'])
  })

  it('банк слов: слово, повторённое в другом варианте дважды, берётся дважды', () => {
    expect(chipWords([['I', 'try'], ['I', 'try', 'and', 'try']]).filter(w => w === 'try')).toHaveLength(2)
  })

  it('засчитывается любой из вариантов, регистр не важен', () => {
    const v = phraseVariants(pa)
    expect(judgeAssembly(['we', 'TRY', 'every', 'day'], v)).toEqual({ full: true, correct: true, mismatchIdx: null })
    expect(judgeAssembly(['Every', 'day', 'we', 'try'], v).correct).toBe(true)
    expect(judgeAssembly(['Yes', 'we', 'try', 'every', 'day'], v).correct).toBe(true)
  })

  it('неверный полный ответ: первое неверное место берётся у самого близкого варианта', () => {
    const v = phraseVariants(pa)
    // «We try day every» близок к главному: первая ошибка на слоте 2, а не 0
    expect(judgeAssembly(['We', 'try', 'day', 'every'], v)).toEqual({ full: true, correct: false, mismatchIdx: 2 })
    // «Every day try we» близок ко второму: ошибка на слоте 2
    expect(judgeAssembly(['Every', 'day', 'try', 'we'], v)).toEqual({ full: true, correct: false, mismatchIdx: 2 })
  })

  it('неполный ответ и ответ другой длины — не «полный»: сигнал не показываем', () => {
    const v = phraseVariants(pa)
    expect(judgeAssembly(['We', 'try'], v)).toEqual({ full: false, correct: false, mismatchIdx: null })
    expect(judgeAssembly([], v).full).toBe(false)
  })
})
