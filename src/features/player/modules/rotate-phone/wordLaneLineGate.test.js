import { describe, it, expect, vi } from 'vitest'
import { lineReadiness, waitForLine, LINE_WAIT_MS, LINE_POLL_MS } from './wordLaneLineGate.js'

// Отсрочка озвученной реплики до готовности прогрева: слот реплики готов, прогрев закончен, не прервали после пробуждения
const trace = (over = {}) => ({ inWindow: () => true, warmed: () => true, ...over })
const slot = (over = {}) => ({ exists: true, hasUrl: true, prepared: true, wokeAt: 100, wokeErr: null, ...over })
const check = (t, s, last = 0) => lineReadiness('rh_start', { trace: t, warm: { status: () => ({ lastInterruptAt: last }) }, slotOf: () => s })

describe('lineReadiness', () => {
  it('всё готово — ready; вне первых 15 с реплика не ждёт ничего', () => {
    expect(check(trace(), slot())).toEqual({ ready: true, why: null })
    expect(check(trace({ inWindow: () => false, warmed: () => false }), { exists: false })).toEqual({ ready: true, why: null })
  })
  it('прогрев не закончен; слота нет; звук не подгружен; слот не разбужен (отклонён play() тишины); src не подставлен — ждём, причина по-русски', () => {
    expect(check(trace({ warmed: () => false }), slot()).why).toContain('прогрев звука ещё не закончен')
    expect(check(trace(), slot({ exists: false })).why).toContain('слота реплики нет')
    expect(check(trace(), slot({ hasUrl: false })).why).toContain('ещё не подгружен')
    expect(check(trace(), slot({ wokeErr: 'NotAllowedError', prepared: false })).why).toContain('NotAllowedError')
    expect(check(trace(), slot({ prepared: false })).why).toContain('не разбужен')
  })
  it('аудиосессию прервали ПОСЛЕ пробуждения слота — не готов; прерывание до пробуждения (своё при открытии микрофона) не мешает', () => {
    expect(check(trace(), slot({ wokeAt: 100 }), 150)).toMatchObject({ ready: false })
    expect(check(trace(), slot({ wokeAt: 200 }), 150).ready).toBe(true)
  })
})

describe('waitForLine', () => {
  it('готово сразу — onReady(0) синхронно, таймеров нет', () => {
    const onReady = vi.fn(); const setTimer = vi.fn()
    waitForLine(() => ({ ready: true }), { onReady, onTimeout: vi.fn() }, { setTimer })
    expect(onReady).toHaveBeenCalledWith(0)
    expect(setTimer).not.toHaveBeenCalled()
  })
  it('слот стал готов через ~400 мс — onReady с реальным ожиданием; дальше опрос не идёт', async () => {
    vi.useFakeTimers()
    let ready = false
    const onReady = vi.fn(); const onTimeout = vi.fn()
    waitForLine(() => ({ ready, why: 'ждём' }), { onReady, onTimeout })
    await vi.advanceTimersByTimeAsync(400); ready = true
    await vi.advanceTimersByTimeAsync(LINE_POLL_MS * 2)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady.mock.calls[0][0]).toBeGreaterThanOrEqual(400)
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
  it('не дождались за LINE_WAIT_MS — onTimeout с причиной и ожиданием ≥ 1500; отмена снимает опрос', async () => {
    vi.useFakeTimers()
    const onReady = vi.fn(); const onTimeout = vi.fn()
    waitForLine(() => ({ ready: false, why: 'слот не разбужен' }), { onReady, onTimeout })
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + LINE_POLL_MS * 2)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(onTimeout.mock.calls[0][0]).toBeGreaterThanOrEqual(LINE_WAIT_MS)
    expect(onTimeout.mock.calls[0][1]).toContain('слот не успел за 1500 мс: слот не разбужен')
    const t2 = vi.fn()
    const cancel = waitForLine(() => ({ ready: false, why: 'x' }), { onReady, onTimeout: t2 })
    cancel()
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS * 2)
    expect(t2).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
