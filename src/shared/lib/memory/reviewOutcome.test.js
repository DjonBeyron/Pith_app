import { describe, it, expect } from 'vitest'
import { reviewOutcome } from './reviewOutcome.js'
import { THRESHOLD_SLOW } from '../skillScore.js'

const ok   = (cardId, timeMs = 3000) => ({ cardId, result: 'correct', timeMs })
const bad  = (cardId) => ({ cardId, result: 'wrong', timeMs: 2000 })
const know = (cardId) => ({ cardId, result: 'know' })

describe('reviewOutcome', () => {
  it('нет ответов → null', () => {
    expect(reviewOutcome([])).toBe(null)
    expect(reviewOutcome(null)).toBe(null)
  })

  it('всё верно и быстро → good', () => {
    expect(reviewOutcome([ok('c1'), ok('c2')])).toBe('good')
  })

  it('верно, но дольше порога → hard', () => {
    expect(reviewOutcome([ok('c1'), ok('c2', THRESHOLD_SLOW + 1)])).toBe('hard')
  })

  it('ошибка, исправленная на возврате → again', () => {
    expect(reviewOutcome([bad('c1'), ok('c2'), ok('c1')])).toBe('again')
  })

  it('ошибка и на возврате → fail (сильнее again)', () => {
    expect(reviewOutcome([bad('c1'), bad('c2'), ok('c2'), bad('c1')])).toBe('fail')
  })

  it('ошибка без возврата (сессию бросили) → fail', () => {
    expect(reviewOutcome([bad('c1')])).toBe('fail')
  })

  it('медленный ответ на возврате не делает hard — решает первая попытка', () => {
    expect(reviewOutcome([bad('c1'), ok('c1', THRESHOLD_SLOW + 1)])).toBe('again')
  })

  it('только «Знаю» → know', () => {
    expect(reviewOutcome([know('c1')])).toBe('know')
  })

  it('«Знаю» на одной карточке + верный ответ на другой → good', () => {
    expect(reviewOutcome([know('c1'), ok('c2')])).toBe('good')
  })

  it('«Знаю» + ошибка → факт сильнее самооценки', () => {
    expect(reviewOutcome([know('c1'), bad('c2')])).toBe('fail')
  })
})
