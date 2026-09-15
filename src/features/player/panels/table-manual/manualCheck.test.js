import { describe, it, expect, vi } from 'vitest'
import { makeManualCheck } from './manualCheck.js'

// tokens — форма deriveAnswerTokens: {type:'cell'|'extra', cellId?, value}.
// assembled — та же форма, что кладёт TableManualPanel при тапе: {type, cellId?,
// value, key}. Слот 0 — правильный (I), слот 1 — собран неверно (tries вместо try).
function baseSetup(overrides = {}) {
  const tokens = [
    { type: 'cell', cellId: 'c1', value: 'I' },
    { type: 'cell', cellId: 'c2', value: 'try' },
  ]
  const assembled = [
    { type: 'cell', cellId: 'c1', value: 'I', key: 'cell-c1' },
    { type: 'cell', cellId: 'c2', value: 'tries', key: 'cell-c2' }, // неверно
  ]
  const wrongCount = { current: 0 }
  const timers = { current: [] }
  const onSignal = vi.fn()
  const setResult = vi.fn()
  const onAnswered = vi.fn()
  const onAnswerToChat = vi.fn()
  const closePanelWith = vi.fn()
  const setCellMenu = vi.fn()
  const onXpEarned = vi.fn()

  const check = makeManualCheck({
    assembled, tokens, answer: 'I try', tData: {}, wrongCount, timers,
    xpAmount: 0, onXpEarned, setCellMenu, setResult, onAnswered, onAnswerToChat,
    closePanelWith, nodes: [], onSignal,
    ...overrides,
  })

  return { check, wrongCount, onSignal, setResult, onAnswered, onAnswerToChat }
}

describe('makeManualCheck — сигнал ошибки на первом неверном слоте', () => {
  it('сигнал найден и нода жива — onSignal зовётся, попытка НЕ тратится, обычная ветка молчит', () => {
    const signalNode = { id: 'sig1', type: 'audio' }
    const { check, wrongCount, onSignal, setResult, onAnswered, onAnswerToChat } = baseSetup({
      tData: { signals: [{ slot: 1, ref: 'sig1' }] },
      nodes: [signalNode],
    })
    check()
    expect(onSignal).toHaveBeenCalledWith(1, signalNode)
    expect(wrongCount.current).toBe(0)       // попытка не потрачена
    expect(setResult).not.toHaveBeenCalled() // панель не красится в 'wrong'
    expect(onAnswered).not.toHaveBeenCalled()
    expect(onAnswerToChat).not.toHaveBeenCalled()
  })

  it('сигнал есть, но ссылается на удалённую ноду — обычная ветка (попытка тратится)', () => {
    const { check, wrongCount, onSignal, setResult } = baseSetup({
      tData: { signals: [{ slot: 1, ref: 'gone' }] },
      nodes: [], // ноды с id 'gone' нет
    })
    check()
    expect(onSignal).not.toHaveBeenCalled()
    expect(wrongCount.current).toBe(1)
    expect(setResult).toHaveBeenCalledWith('wrong')
  })

  it('сигнала на этот слот нет вовсе — обычная ветка, как раньше', () => {
    const { check, wrongCount, onSignal, setResult } = baseSetup({
      tData: { signals: [{ slot: 0, ref: 'sig1' }] }, // сигнал на ДРУГОЙ, верный слот
      nodes: [{ id: 'sig1', type: 'audio' }],
    })
    check()
    expect(onSignal).not.toHaveBeenCalled()
    expect(wrongCount.current).toBe(1)
    expect(setResult).toHaveBeenCalledWith('wrong')
  })

  it('нет поля signals вовсе (старый урок) — обычная ветка, без падения', () => {
    const { check, wrongCount, onSignal, setResult } = baseSetup({ tData: {} })
    check()
    expect(onSignal).not.toHaveBeenCalled()
    expect(wrongCount.current).toBe(1)
    expect(setResult).toHaveBeenCalledWith('wrong')
  })

  it('верный ответ — сигналы вообще не смотрим, попытка не тратится', () => {
    const { check, wrongCount, onSignal, setResult } = baseSetup({
      assembled: [
        { type: 'cell', cellId: 'c1', value: 'I', key: 'cell-c1' },
        { type: 'cell', cellId: 'c2', value: 'try', key: 'cell-c2' },
      ],
      tData: { signals: [{ slot: 1, ref: 'sig1' }] },
      nodes: [{ id: 'sig1', type: 'audio' }],
    })
    check()
    expect(onSignal).not.toHaveBeenCalled()
    expect(wrongCount.current).toBe(0)
    expect(setResult).toHaveBeenCalledWith('correct')
  })

  it('всегда есть сигнал на первый неверный слот — можно проверять сколько угодно раз подряд, без счётчика попыток', () => {
    const { check, wrongCount, onSignal } = baseSetup({
      tData: { signals: [{ slot: 1, ref: 'sig1' }] },
      nodes: [{ id: 'sig1', type: 'audio' }],
    })
    check(); check(); check(); check()
    expect(onSignal).toHaveBeenCalledTimes(4)
    expect(wrongCount.current).toBe(0) // ни разу не потрачена — бесплатная подсказка каждый раз
  })
})
