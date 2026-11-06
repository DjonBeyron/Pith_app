import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSurfaceWait, SURFACE_MAX_MS } from './raceDiveWait.js'
import { createRaceSpeech, AFTER_GOOD_GAP_MS } from './raceSpeech.js'
import { PRE_SAY_GAP_MS } from './raceStageKit.js'
import { DIVE_MS } from './raceDodge.js'
import { LOCK_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// «Речь ждёт выныривания»: слово следующей пилюли — не раньше, чем Пит на месте; отступы секвенсора не растянуты больше чем на 150 мс
function clock() {
  let t = 0
  const timers = []
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = Symbol('t'); timers.push({ id, at: t + ms, fn }); return id },
    clearTimer: id => { const k = timers.findIndex(x => x.id === id); if (k >= 0) timers.splice(k, 1) },
    go(ms) { const end = t + ms; for (;;) { const x = timers.filter(y => y.at <= end).sort((a, b) => a.at - b.at)[0]; if (!x) break; timers.splice(timers.indexOf(x), 1); t = x.at; x.fn() } t = end },
  }
}

describe('raceDiveWait', () => {
  it('Пит на месте — слово сразу, без журнала', () => {
    const c = clock(), log = vi.fn(), fn = vi.fn()
    const w = createSurfaceWait({ ...c, log })
    expect(w.run(() => 0, fn)).toBe(0)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(w.pending()).toBe(false)
    w.run(null, fn)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(log).not.toHaveBeenCalled()
  })
  it('идёт нырок — слово не раньше выныривания, пока ждём pending; журнал «речь ждала выныривания N мс»', () => {
    const c = clock(), log = vi.fn(), fn = vi.fn()
    const until = 120
    const w = createSurfaceWait({ ...c, log })
    w.run(() => Math.max(0, until - c.now()), fn)
    expect(w.pending()).toBe(true)
    c.go(119)
    expect(fn).not.toHaveBeenCalled()
    c.go(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(w.pending()).toBe(false)
    expect(log).toHaveBeenCalledWith('[dodge] речь ждала выныривания 120 мс')
  })
  it('ожидание растёт (пилюля ещё над головой) — переспрашивает; страховка SURFACE_MAX_MS', () => {
    const c = clock(), log = vi.fn(), fn = vi.fn()
    const w = createSurfaceWait({ ...c, log })
    w.run(() => 100, fn)
    c.go(SURFACE_MAX_MS - 1)
    expect(fn).not.toHaveBeenCalled()
    c.go(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatch(/страховка/)
  })
  it('cancel (смена стадии) — слово не звучит', () => {
    const c = clock(), fn = vi.fn()
    const w = createSurfaceWait({ ...c })
    w.run(() => 200, fn)
    w.cancel()
    c.go(500)
    expect(fn).not.toHaveBeenCalled()
    expect(w.pending()).toBe(false)
  })
})

describe('секвенсор + нырок: отступы не растянуты больше чем на 150 мс', () => {
  // Зачёт без похвалы: нырок начинается в миг зачёта, взлёт — через LOCK_MS (заливка), перевод разрешён через PRE_SAY_GAP_MS после взлёта; речь ждёт выныривания
  it('зачёт без похвалы: слово — после выныривания и не позже, чем отступ + 150 мс', () => {
    const c = clock(), said = []
    const sp = createRaceSpeech({ ...c })
    const w = createSurfaceWait({ ...c })
    const diveEnd = c.now() + DIVE_MS
    sp.claim(null)
    c.go(LOCK_MS); sp.riseStart()
    const plain = LOCK_MS + PRE_SAY_GAP_MS
    c.go(PRE_SAY_GAP_MS)
    expect(sp.holdMs()).toBe(0)
    w.run(() => Math.max(0, diveEnd - c.now()), () => said.push(c.now()))
    c.go(1000)
    expect(said[0]).toBeGreaterThanOrEqual(diveEnd)
    expect(said[0] - plain).toBeLessThanOrEqual(150)
  })
  it('зачёт с похвалой: похвала через 500 мс после взлёта — Пит уже вынырнул; перевод после отступа без ожидания', () => {
    const c = clock()
    const sp = createRaceSpeech({ ...c, say: { praise: (id, h) => { h.onSpeak({ ms: 800 }); return true } } })
    const diveEnd = DIVE_MS
    sp.claim('race_good_1'); c.go(LOCK_MS); sp.riseStart()
    c.go(500)
    expect(sp.phase()).toBe('praise')
    expect(c.now()).toBeGreaterThanOrEqual(diveEnd)
    sp.speechEnd('praise'); c.go(AFTER_GOOD_GAP_MS)
    expect(sp.holdMs()).toBe(0)
  })
  it('проводка: движок передаёт wait в pre, директор ждёт в одной точке и держит пилюлю', () => {
    const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
    expect(read('../player/modules/rotate-phone/useWordLanePills.js')).toContain('{ ...e, wait: dodger.left }')
    expect(read('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain('rh.pre?.(e.rep, e)')
    const acts = read('./useRaceActs.js')
    expect(acts).toContain('surface.run(e?.wait,')
    expect(acts).toContain('surface.pending() ? LOCK_MS : 0')
  })
})
