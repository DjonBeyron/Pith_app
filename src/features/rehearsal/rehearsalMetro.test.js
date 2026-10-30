import { describe, it, expect, vi, afterEach } from 'vitest'
import { scheduleMetro, metroEvents } from './rehearsalMetro.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { fixturePlan } from './rehearsalFixtures.js'

// Подсветка кусков читки (метроном): один таймер, чистая отмена — смена стадии и размонтирование не оставляют таймеров и не дёргают подсветку
afterEach(() => { vi.useRealTimers() })
const METRO = [{ chunk: 0, at: 700, ms: 300 }, { chunk: 1, at: 1100, ms: 400 }, { chunk: 2, at: 1600, ms: 500 }]

describe('метроном читки', () => {
  it('события: кусок включается в at, после последнего (at + ms) подсветка гаснет (−1); пустой метроном — событий нет', () => {
    expect(metroEvents(METRO)).toEqual([{ at: 700, chunk: 0 }, { at: 1100, chunk: 1 }, { at: 1600, chunk: 2 }, { at: 2100, chunk: -1 }])
    expect(metroEvents([])).toEqual([]); expect(metroEvents(null)).toEqual([])
  })
  it('куски подсвечиваются по времени от старта стадии; всё время жив ровно ОДИН таймер', () => {
    vi.useFakeTimers()
    const set = vi.fn()
    scheduleMetro(METRO, { start: performance.now(), set })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(699); expect(set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(set).toHaveBeenLastCalledWith(0); expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(400); expect(set).toHaveBeenLastCalledWith(1)
    vi.advanceTimersByTime(500); expect(set).toHaveBeenLastCalledWith(2)
    vi.advanceTimersByTime(500); expect(set).toHaveBeenLastCalledWith(-1)
    expect(set.mock.calls.map(c => c[0])).toEqual([0, 1, 2, -1])
    expect(vi.getTimerCount()).toBe(0)
  })
  it('смена стадии посреди читки: cancel() снимает таймер и гасит подсветку, дальше set не зовётся', () => {
    vi.useFakeTimers()
    const set = vi.fn()
    const cancel = scheduleMetro(METRO, { start: performance.now(), set })
    vi.advanceTimersByTime(1200)
    cancel()
    expect(vi.getTimerCount()).toBe(0)
    expect(set).toHaveBeenLastCalledWith(-1)
    const calls = set.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(set.mock.calls.length).toBe(calls)
    cancel() // повторная отмена безопасна
    expect(vi.getTimerCount()).toBe(0)
  })
  it('стадия началась раньше, чем стоит таймер (старт был 500 мс назад): первое событие через оставшееся время', () => {
    vi.useFakeTimers()
    const set = vi.fn()
    const cancel = scheduleMetro(METRO, { start: performance.now() - 500, set })
    vi.advanceTimersByTime(199); expect(set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(set).toHaveBeenCalledWith(0)
    cancel()
  })
  it('поток был занят (таймер опоздал): прошедшие события выполняются подряд, а не теряются', () => {
    const timers = []
    const set = vi.fn()
    let t = 0
    scheduleMetro(METRO, { start: 0, set, now: () => t, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer() {} })
    expect(timers[0].ms).toBe(700)
    t = 2000                       // поток освободился только на 2-й секунде
    timers.shift().fn()
    expect(set).toHaveBeenLastCalledWith(0); expect(timers[0].ms).toBe(0)
    timers.shift().fn(); timers.shift().fn()
    expect(set.mock.calls.map(c => c[0])).toEqual([0, 1, 2])
  })
  it('нет метронома (читка без озвучки): ничего не заводится', () => {
    vi.useFakeTimers()
    const cancel = scheduleMetro([], { start: 0, set: vi.fn() })
    expect(vi.getTimerCount()).toBe(0); expect(() => cancel()).not.toThrow()
  })
  it('метроном реальной читки (стадии read и повтор ученика) проходит все три куска и гаснет', () => {
    vi.useFakeTimers()
    const plan = fixturePlan('three')
    const { stages } = buildRehearsalStages({ plan, rate: 1, lib: () => ({ ms: 400, lead: 0 }) })
    for (const sid of ['read-d', 'read-s']) {
      const set = vi.fn()
      scheduleMetro(stages.find(s => s.sid === sid).metro, { start: performance.now(), set })
      vi.advanceTimersByTime(20000)
      expect(set.mock.calls.map(c => c[0])).toEqual([0, 1, 2, -1])
      expect(vi.getTimerCount()).toBe(0)
    }
  })
})
