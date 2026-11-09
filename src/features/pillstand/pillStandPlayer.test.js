import { describe, it, expect } from 'vitest'
import { createRecorder, FRAME_MIN_MS } from './pillStandRecorder.js'
import { frameAt, stepFrame, loopRange, advance, frameEvents, eventsAround, eventLine } from './pillStandPlayer.js'

const frames = [0, 16, 33, 50, 66, 83, 100].map((t, i) => ({ t: 1000 + t, i }))

describe('стенд пилюль: рекордер', () => {
  it('кадры не чаще 60/с, номера по порядку', () => {
    const r = createRecorder()
    r.start(0)
    let ok = 0
    for (let t = 0; t <= 1000; t += 4) if (r.add(t, { g: 0 }) === true) ok++
    expect(ok).toBeGreaterThanOrEqual(55)
    expect(ok).toBeLessThanOrEqual(64)
    const fs = r.frames()
    fs.forEach((f, i) => { expect(f.i).toBe(i); if (i) expect(f.t - fs[i - 1].t).toBeGreaterThanOrEqual(FRAME_MIN_MS - 0.1) })
  })
  it('потолок длины: дальше «full», кадры не копятся', () => {
    const r = createRecorder({ maxMs: 100 })
    r.start(0)
    expect(r.add(50, {})).toBe(true)
    expect(r.add(101, {})).toBe('full')
    expect(r.add(120, {})).toBe(false)
    expect(r.frames().length).toBe(1)
    expect(r.on()).toBe(false)
  })
  it('без start / после stop — не пишет', () => {
    const r = createRecorder()
    expect(r.add(0, {})).toBe(false)
    r.start(0); r.stop()
    expect(r.add(20, {})).toBe(false)
  })
})

describe('стенд пилюль: плеер', () => {
  it('кадр в момент t — последний не позже t', () => {
    expect(frameAt(frames, 0)).toBe(0)
    expect(frameAt(frames, 1040)).toBe(2)
    expect(frameAt(frames, 1050)).toBe(3)
    expect(frameAt(frames, 9999)).toBe(6)
    expect(frameAt([], 5)).toBe(-1)
  })
  it('шаг ◀ ▶ с упором в края', () => {
    expect(stepFrame(3, 1, 7)).toBe(4)
    expect(stepFrame(3, -1, 7)).toBe(2)
    expect(stepFrame(0, -1, 7)).toBe(0)
    expect(stepFrame(6, 1, 7)).toBe(6)
  })
  it('луп: по умолчанию вся запись, отрезок внутри записи', () => {
    expect(loopRange(frames)).toEqual([1000, 1100])
    expect(loopRange(frames, [1020, 1060])).toEqual([1020, 1060])
    expect(loopRange(frames, [900, 5000])).toEqual([1000, 1100])
    expect(loopRange(frames, [1060, 1020])).toEqual([1000, 1100])
  })
  it('время со скоростью: 0,25× в 4 раза медленнее, луп повторяет отрезок, без лупа — конец', () => {
    expect(advance(1000, 40, 0.25, [1000, 1100], true).t).toBeCloseTo(1010)
    expect(advance(1000, 40, 0.5, [1000, 1100], true).t).toBeCloseTo(1020)
    const w = advance(1090, 20, 1, [1000, 1100], true)
    expect(w).toEqual({ t: 1010, wrap: true, end: false })
    expect(advance(1090, 20, 1, [1000, 1100], false)).toEqual({ t: 1100, wrap: false, end: true })
  })
  it('события кадра и окна ±200 мс', () => {
    const ev = [{ t: 990, k: 'gate', open: true }, { t: 1010, k: 'vosk-partial', raw: { partial: 'nice' } }, { t: 1020, k: 'fill', goal: 0.2 }, { t: 1040, k: 'word', index: 0, text: 'nice' }, { t: 1500, k: 'log', text: 'далеко' }]
    expect(frameEvents(ev, frames, 1).map(e => e.k)).toEqual(['vosk-partial'])
    expect(frameEvents(ev, frames, 2).map(e => e.k)).toEqual(['fill'])
    expect(frameEvents(ev, frames, 3).map(e => e.k)).toEqual(['word'])
    expect(eventsAround(ev, 1033).map(e => e.k)).toEqual(['gate', 'vosk-partial', 'word'])
    expect(eventLine(ev[1], 1000)).toBe('+10 черновик «nice»')
    expect(eventLine(ev[3], 1050)).toBe('-10 слово 1 «nice»')
  })
})

describe('стенд пилюль: «слово → заливка дошла»', () => {
  it('мс от слова до кадра, где экран догнал выросшую цель; цель не выросла — отметка снимается', async () => {
    const { createFillWatch } = await import('./standFillWatch.js')
    const w = createFillWatch()
    w.word(1000, 'nice', 0)
    expect(w.frame(1016, 0.25, 0.05)).toEqual([])
    expect(w.frame(1100, 0.25, 0.245)).toEqual([{ word: 'nice', ms: 100 }])
    w.word(2000, 'nice', 0.25)
    expect(w.frame(2500, 0.25, 0.25)).toEqual([])
    expect(w.frame(2600, 0.5, 0.5)).toEqual([])
  })
})
