import { describe, it, expect } from 'vitest'
import { correctPicks } from './solveCorrect.js'
import { blankMatches } from './fillBlanksCheck.js'

describe('correctPicks — авто-ответ админа в «составь предложение»', () => {
  const blanks = [
    { options: ['try', 'tries', 'tried'], answer: 'tries' },
    { options: ['y', 'ie', 'ys'], answer: 'ie' },
  ]

  it('в каждый пропуск — вариант из его меню, совпадающий с answer', () => {
    // Меню панели уже перемешано (blankOptions) — берём именно из него
    const picks = correctPicks(blanks, [['tried', 'tries', 'try'], ['ys', 'y', 'ie']])
    expect(picks).toEqual({ 0: 'tries', 1: 'ie' })
    blanks.forEach((b, i) => expect(blankMatches(picks[i], b)).toBe(true))
  })

  it('совпадение — по смыслу (регистр/апостроф), в бокс идёт текст варианта как в меню', () => {
    const picks = correctPicks([{ options: ["I’M", 'am'], answer: "i'm" }], [["I’M", 'am']])
    expect(picks[0]).toBe('I’M')
  })

  it('answer нет среди вариантов меню — берём сам answer', () => {
    expect(correctPicks(blanks, [['try', 'tried'], []])).toEqual({ 0: 'tries', 1: 'ie' })
    expect(correctPicks(blanks)).toEqual({ 0: 'tries', 1: 'ie' })
  })

  it('пропусков нет — пустой объект', () => {
    expect(correctPicks([], [])).toEqual({})
  })
})
