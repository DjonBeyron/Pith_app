import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installReturnClean, DELAY_MS } from './gameAudioReturnClean.js'

// Возврат из фона без игры: через 1 с после возврата или на первом pointerdown закрыть ВСЕ контексты страницы; идёт игра — не трогать
let ret, off, docL, doc, close, log, game, list
beforeEach(() => {
  vi.useFakeTimers()
  docL = {}
  doc = { addEventListener: (t, f) => { docL[t] = f }, removeEventListener: t => { delete docL[t] } }
  close = vi.fn(async () => ({ closed: list.length })); log = vi.fn(); game = false
  list = [{ kind: 'sounds', state: 'running', createdAt: 0 }, { kind: 'game', state: 'suspended', createdAt: 0 }]
  off = installReturnClean({ onReturn: cb => { ret = cb; return () => { ret = null } }, live: () => list, close, text: l => l.map(r => r.kind).join(', '), gameOn: () => game, doc, log })
})
afterEach(() => { off(); vi.useRealTimers() })

describe('installReturnClean', () => {
  it('через 1 с после возврата: закрыть все, журнал «возврат из фона: закрыто N контекстов (…)»; касание после — ничего', async () => {
    ret('visibility visible')
    await vi.advanceTimersByTimeAsync(DELAY_MS - 1); expect(close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[audio] возврат из фона (через 1 с): закрыто 2 контекстов (sounds, game)')
    expect(docL.pointerdown).toBeUndefined()
  })
  it('первое касание раньше секунды — закрыть сразу, таймер снят', async () => {
    ret('focus')
    docL.pointerdown()
    await vi.advanceTimersByTimeAsync(DELAY_MS * 2)
    expect(close).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0]).toMatch(/первое касание/)
  })
  it('идёт игра — не трогаем; нет живых контекстов — тоже', async () => {
    game = true; ret('visible'); await vi.advanceTimersByTimeAsync(DELAY_MS)
    game = false; list = []; ret('visible'); await vi.advanceTimersByTimeAsync(DELAY_MS)
    expect(close).not.toHaveBeenCalled()
  })
  it('установка идемпотентна', () => {
    expect(installReturnClean()).toBe(off)
  })
})
