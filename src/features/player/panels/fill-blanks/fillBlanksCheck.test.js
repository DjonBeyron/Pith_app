import { describe, it, expect, vi } from 'vitest'
import { makeFillBlanksCheck } from './fillBlanksCheck.js'

// Как manualCheck.test.js — проверяем только СИНХРОННУЮ часть check() (до
// setTimeout с flushSync/whenBubbleLanded: та ветка трогает document, здесь
// её не гоняем, ровно как в table-manual).
function baseSetup(overrides = {}) {
  const blanks = [
    { options: ['tries', 'try', 'tried'], answer: 'tries' },
    { options: ['ie', 'y', 'ys'], answer: 'ie' },
  ]
  const picked = { 0: 'tries', 1: 'y' } // второй пропуск неверный
  const wrongCount = { current: 0 }
  const timers = { current: [] }
  const setResult = vi.fn()
  const onAnswered = vi.fn()
  const onChecked = vi.fn()
  const onXpEarned = vi.fn()
  const closePanelWith = vi.fn()

  const check = makeFillBlanksCheck({
    picked, blanks,
    tData: { template: 'He tr___s a new recipe every week.', responseCorrect: 'Yep!', responseWrong: 'Погляди ещё раз' },
    wrongCount, timers, xpAmount: 0, onXpEarned,
    setResult, onAnswered, onChecked, closePanelWith,
    ...overrides,
  })

  return { check, wrongCount, setResult, onAnswered, onChecked, onXpEarned }
}

describe('makeFillBlanksCheck — неверный ответ', () => {
  it('первая ошибка: попытка тратится, подсказка учителя (hint) отправлена, onChecked("wrong")', () => {
    const { check, wrongCount, setResult, onAnswered, onChecked } = baseSetup()
    check()
    expect(wrongCount.current).toBe(1)
    expect(setResult).toHaveBeenCalledWith('wrong')
    expect(onChecked).toHaveBeenCalledWith('wrong')
    expect(onAnswered).toHaveBeenCalledWith('Погляди ещё раз', 'hint')
  })

  it('вторая ошибка: попытка тратится, но подсказка НЕ повторяется', () => {
    const wrongCount = { current: 1 } // уже была одна ошибка
    const { check, onAnswered } = baseSetup({ wrongCount })
    check()
    expect(wrongCount.current).toBe(2)
    expect(onAnswered).not.toHaveBeenCalled()
  })

  it('пустой responseWrong — подсказка просто не отправляется, без падения', () => {
    const { check, onAnswered } = baseSetup({ tData: { template: 't', responseWrong: '  ' } })
    check()
    expect(onAnswered).not.toHaveBeenCalled()
  })
})

describe('makeFillBlanksCheck — верный ответ', () => {
  it('все пропуски верны — onChecked("correct"), попытка не тратится, XP по требованию', () => {
    const wrongCount = { current: 0 }
    const { check, onChecked, onXpEarned, setResult } = baseSetup({
      picked: { 0: 'tries', 1: 'ie' },
      wrongCount,
      xpAmount: 10,
    })
    check()
    expect(setResult).toHaveBeenCalledWith('correct')
    expect(onChecked).toHaveBeenCalledWith('correct')
    expect(wrongCount.current).toBe(0)
    expect(onXpEarned).toHaveBeenCalledWith(10)
  })

  it('xpAmount = 0 — onXpEarned не зовётся вовсе', () => {
    const { check, onXpEarned } = baseSetup({ picked: { 0: 'tries', 1: 'ie' }, xpAmount: 0 })
    check()
    expect(onXpEarned).not.toHaveBeenCalled()
  })

  it('незаполненный пропуск (picked без ключа) — не считается верным', () => {
    const { check, setResult, onChecked } = baseSetup({ picked: { 0: 'tries' } })
    check()
    expect(setResult).toHaveBeenCalledWith('wrong')
    expect(onChecked).toHaveBeenCalledWith('wrong')
  })
})

describe('makeFillBlanksCheck — сверка нечувствительна к регистру/пробелам', () => {
  it('normalizeAnswerText сглаживает регистр и лишние пробелы в выборе', () => {
    const { check, setResult } = baseSetup({ picked: { 0: '  TRIES ', 1: 'ie' } })
    check()
    expect(setResult).toHaveBeenCalledWith('correct')
  })
})
