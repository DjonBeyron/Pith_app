import { describe, it, expect } from 'vitest'
import { SLOTS, FILL_AT, LISTEN_MS, LINE_END_Y, frontAtListen } from './wordLaneTimeline.js'
import { readWordLane } from './wordLaneConfig.js'
import { makeListenPlan, normalizeFills, fillsFromTimings, defaultFills, LEAD_MS, MIN_GAP_MS, MIN_FIRST_MS, FILL_MAX_MS, FILL_MIN_MS } from './wordLanePlan.js'

// План фазы диктора по озвучке ElevenLabs и таймлайну ноды (wordLanePlan.js)
describe('озвучка ElevenLabs и таймлайн ноды', () => {
  // ElevenLabs: слова с секундой начала. «try. try. try.» — три слова с паузами
  const timings = [{ w: 'try.', t: 0.1 }, { w: 'try.', t: 1.4 }, { w: 'try.', t: 2.9 }]

  it('клипы берутся из таймингов: начало слова → начало следующего; у последнего — длина по умолчанию или конец файла', () => {
    expect(fillsFromTimings(timings, 'try', 4)).toEqual([{ start: 0.1, end: 1.4 }, { start: 1.4, end: 2.9 }, { start: 2.9, end: 3.7 }])
    expect(fillsFromTimings(timings, 'try', 3.2).at(-1)).toEqual({ start: 2.9, end: 3.2 })
  })

  it('меньше трёх вхождений или чужое слово — null (расставляет автор)', () => {
    expect(fillsFromTimings(timings.slice(0, 2), 'try')).toBeNull()
    expect(fillsFromTimings(timings, 'cat')).toBeNull()
    expect(fillsFromTimings(null, 'try')).toBeNull()
    expect(fillsFromTimings([{ w: 'Try,', t: 0 }, { w: 'Try', t: 1 }, { w: 'try', t: 2 }, { w: 'try', t: 3 }], 'try')).toHaveLength(3)
  })

  it('фраза из двух слов ищется подряд', () => {
    const t = ['get', 'up', 'get', 'up', 'get', 'up'].map((w, i) => ({ w, t: i }))
    expect(fillsFromTimings(t, 'get up').map(c => c.start)).toEqual([0, 2, 4])
  })

  it('normalizeFills: нужны ровно три нормальных клипа', () => {
    expect(normalizeFills(defaultFills(6))).toHaveLength(3)
    expect(normalizeFills([{ start: 1, end: 2 }])).toBeNull()
    expect(normalizeFills([{ start: 1, end: 1 }, { start: 2, end: 3 }, { start: 3, end: 4 }])).toBeNull()
    expect(normalizeFills(null)).toBeNull()
  })

  it('без озвучки план — прежнее расписание, голос слова по слоям', () => {
    const p = makeListenPlan(null)
    expect(p.fillAt).toEqual(FILL_AT)
    expect(p.audioAt).toBeNull()
    expect(p.listenMs).toBe(LISTEN_MS)
  })

  it('с озвучкой слои заливаются в моменты слов файла (со сдвигом LEAD), голова линии доходит ровно к ним', () => {
    const fills = fillsFromTimings(timings, 'try', 4)
    const p = makeListenPlan(fills)
    expect(p.audioAt).toBe(LEAD_MS)
    expect(p.fillAt).toEqual([LEAD_MS + 100, LEAD_MS + 1400, LEAD_MS + 2900])
    p.fillAt.forEach((t, k) => expect(frontAtListen(t, p.anchors)).toBeCloseTo(SLOTS[k].y, 5))
    expect(frontAtListen(p.listenMs, p.anchors)).toBe(LINE_END_Y)
    p.fillMs.forEach(ms => { expect(ms).toBeGreaterThanOrEqual(FILL_MIN_MS); expect(ms).toBeLessThanOrEqual(FILL_MAX_MS) })
  })

  it('слишком частые слова раздвигаются: линия не успевает, заливки не налезают друг на друга', () => {
    const p = makeListenPlan([{ start: 0, end: 0.2 }, { start: 0.1, end: 0.3 }, { start: 0.2, end: 0.4 }])
    expect(p.fillAt[0]).toBeGreaterThanOrEqual(MIN_FIRST_MS)
    expect(p.fillAt[1] - p.fillAt[0]).toBeGreaterThanOrEqual(MIN_GAP_MS)
    expect(p.fillAt[2] - p.fillAt[1]).toBeGreaterThanOrEqual(MIN_GAP_MS)
    let prev = -1
    for (const [t] of p.anchors) { expect(t).toBeGreaterThan(prev); prev = t }
  })

  it('нода: таймлайн действует только при озвучке', () => {
    const fills = defaultFills(6)
    expect(readWordLane({ word: 'try', fills }).fills).toBeNull()
    expect(readWordLane({ word: 'try', file_id: 'f1', fills }).fills).toEqual(fills)
    expect(readWordLane({ word: 'try', file_id: 'f1' })).toMatchObject({ hasAudio: true, fills: null })
  })
})

