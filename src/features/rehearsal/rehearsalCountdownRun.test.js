import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../shared/lib/gameAudioCtx.js', () => ({ webAudioOn: () => false, getGameCtx: () => null, gameCtxState: () => null }))
const { createCountGate, scheduleStageCount, COUNT_WAIT_CAP_MS, COUNT_POLL_MS } = await import('./rehearsalCountdownRun.js')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// Стадия не уходит, пока три ноты не доиграли; ноты стартуют, когда Пит РЕАЛЬНО договорил
describe('ворота отсчёта (createCountGate)', () => {
  it('нет отсчёта — переход сразу; отсчёт идёт — переход ждёт done(); reset снимает ожидание (смена стадии не вызовет чужой next)', () => {
    const g = createCountGate(), next = vi.fn()
    g.after(next); expect(next).toHaveBeenCalledTimes(1)
    g.plan(); g.after(next); expect(next).toHaveBeenCalledTimes(1); expect(g.pending()).toBe(true)
    g.run(); g.done(); expect(next).toHaveBeenCalledTimes(2); expect(g.pending()).toBe(false)
    g.plan(); g.after(next); g.reset(); g.done(); expect(next).toHaveBeenCalledTimes(2)
  })
})

describe('запуск отсчёта стадии (scheduleStageCount)', () => {
  it('ждёт плановый момент, потом пока Пит занят, и только тогда стартует ноты; ворота закрыты с самого начала до конца нот', () => {
    const gate = createCountGate(), starts = []
    let busy = 900
    const stop = scheduleStageCount({ countAt: 1000, busyLeft: () => busy, gate, start: o => { starts.push(o); return () => {} } })
    expect(gate.pending()).toBe(true)
    vi.advanceTimersByTime(999); expect(starts).toHaveLength(0)
    vi.advanceTimersByTime(1 + COUNT_POLL_MS * 5); expect(starts).toHaveLength(0) // Пит ещё говорит: реплика дольше расчёта
    busy = 0; vi.advanceTimersByTime(COUNT_POLL_MS); expect(starts).toHaveLength(1)
    const next = vi.fn(); gate.after(next); expect(next).not.toHaveBeenCalled()
    starts[0].onDone(); expect(next).toHaveBeenCalledTimes(1); expect(gate.pending()).toBe(false)
    stop()
  })
  it('Пит свободен — ноты в плановый момент; занят вечно — ноты всё равно стартуют после предела (тишины насовсем не будет)', () => {
    const starts = []
    scheduleStageCount({ countAt: 100, busyLeft: () => 0, start: o => { starts.push(o); return () => {} } }); vi.advanceTimersByTime(100); expect(starts).toHaveLength(1)
    const late = []
    scheduleStageCount({ countAt: 100, busyLeft: () => 5000, start: o => { late.push(o); return () => {} } }); vi.advanceTimersByTime(100 + COUNT_WAIT_CAP_MS - COUNT_POLL_MS); expect(late).toHaveLength(0)
    vi.advanceTimersByTime(COUNT_POLL_MS * 2); expect(late).toHaveLength(1)
  })
  it('отмена (смена стадии, пауза, выход): таймеры сняты, идущие ноты остановлены, ворота открыты', () => {
    const gate = createCountGate(), halted = vi.fn(), starts = []
    const stop = scheduleStageCount({ countAt: 100, busyLeft: () => 0, gate, start: o => { starts.push(o); return halted } })
    vi.advanceTimersByTime(100); expect(starts).toHaveLength(1)
    const next = vi.fn(); gate.after(next)
    stop(); expect(halted).toHaveBeenCalledTimes(1); expect(gate.pending()).toBe(false); expect(next).not.toHaveBeenCalled()
    const early = scheduleStageCount({ countAt: 100, busyLeft: () => 0, gate, start: o => { starts.push(o); return halted } })
    early(); vi.advanceTimersByTime(1000); expect(starts).toHaveLength(1)
  })
})
