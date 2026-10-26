import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sparkColors, POP_FRAMES } from './wordLaneSnap.js'
import { makeParticle } from '../../../../shared/lib/burstParticles.js'
import { PILLS, FILL_AT, LISTEN_MS, LINE_END_Y, frontAtListen } from './wordLaneTimeline.js'
import { readWordLane } from './wordLaneConfig.js'
import { makeListenPlan, normalizeFills, fillsFromTimings, defaultFills, LEAD_MS, MIN_GAP_MS, MIN_FIRST_MS, FILL_MAX_MS, FILL_MIN_MS } from './wordLanePlan.js'

// План фазы диктора по озвучке ElevenLabs и таймлайну ноды (wordLanePlan.js)
describe('озвучка ElevenLabs и таймлайн ноды', () => {
  // ElevenLabs: слова с секундой начала. «try. try. try.» — три слова с паузами
  const timings = [{ w: 'try.', t: 0.1 }, { w: 'try.', t: 1.4 }, { w: 'try.', t: 2.9 }]
  const withEnd = [{ w: 'try.', t: 0.1, e: 0.7 }, { w: 'try.', t: 1.4, e: 1.9 }, { w: 'try.', t: 2.9, e: 3.6 }]

  it('есть конец слова (ElevenLabs e) — клип ровно по речи, а не по паузе до следующего слова', () => {
    expect(fillsFromTimings(withEnd, 'try', 4)).toEqual([{ start: 0.1, end: 0.7 }, { start: 1.4, end: 1.9 }, { start: 2.9, end: 3.6 }])
  })

  it('клипы без конца слова берутся из таймингов: начало слова → начало следующего; у последнего — длина по умолчанию или конец файла', () => {
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

  it('с озвучкой пилюли заливаются ровно по словам файла (со сдвигом LEAD): вход линии = начало слова, верх пилюли = конец слова', () => {
    const fills = fillsFromTimings(withEnd, 'try', 4)
    const p = makeListenPlan(fills)
    expect(p.audioAt).toBe(LEAD_MS)
    expect(p.fillAt).toEqual([LEAD_MS + 100, LEAD_MS + 1400, LEAD_MS + 2900])
    p.fillAt.forEach((t, k) => {
      expect(frontAtListen(t, p.anchors)).toBeCloseTo(PILLS[k].bottom, 5)
      expect(frontAtListen(t + p.fillMs[k], p.anchors)).toBeCloseTo(PILLS[k].top, 5)
    })
    expect(frontAtListen(p.listenMs, p.anchors)).toBe(LINE_END_Y)
    p.fillMs.forEach(ms => { expect(ms).toBeGreaterThanOrEqual(FILL_MIN_MS); expect(ms).toBeLessThanOrEqual(FILL_MAX_MS) })
  })

  it('быстрый диктор — линия внутри пилюли быстрее, медленный — медленнее', () => {
    const speed = fills => { const p = makeListenPlan(fills); const [t0, y0] = p.anchors[1]; const [t1, y1] = p.anchors[2]; return (y0 - y1) / (t1 - t0) }
    const fast = speed([{ start: 0.5, end: 0.9 }, { start: 2, end: 2.4 }, { start: 3.5, end: 3.9 }])
    const slow = speed([{ start: 0.5, end: 1.9 }, { start: 3, end: 4.4 }, { start: 5.5, end: 6.9 }])
    expect(fast).toBeGreaterThan(slow * 2)
  })

  it('слишком частые слова раздвигаются: линия не успевает, заливки не налезают друг на друга', () => {
    const p = makeListenPlan([{ start: 0, end: 0.2 }, { start: 0.1, end: 0.3 }, { start: 0.2, end: 0.4 }])
    expect(p.fillAt[0]).toBeGreaterThanOrEqual(MIN_FIRST_MS)
    expect(p.fillAt[1] - p.fillAt[0] - p.fillMs[0]).toBeGreaterThanOrEqual(MIN_GAP_MS)
    expect(p.fillAt[2] - p.fillAt[1] - p.fillMs[1]).toBeGreaterThanOrEqual(MIN_GAP_MS)
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


describe('щелчок пилюли', () => {
  it('цвета искр — цвет пилюли (ступень «Моей памяти»), светлый тон и белый', () => {
    expect(sparkColors(0)).toEqual(['#b6fe3b', '#e6ff9e', '#ffffff'])
    expect(sparkColors(1)[0]).toBe('#4fb3ee')
    expect(sparkColors(2)[0]).toBe('#9a76f8')
  })

  it('хлопок: 1 → 1.12 → 1, translateX(-50%) держит центр пилюли', () => {
    const scales = POP_FRAMES.map(f => Number(/scale\(([\d.]+)\)/.exec(f.transform)[1]))
    expect(scales[0]).toBe(1)
    expect(scales.at(-1)).toBe(1)
    expect(Math.max(...scales)).toBe(1.12)
    POP_FRAMES.forEach(f => expect(f.transform).toContain('translateX(-50%)'))
  })

  it('локальные искры: рождаются в точке пилюли и живут короче салюта', () => {
    const origin = { x: 200, y: 300, spread: 40, life: 0.5, reach: 300 }
    for (let i = 0; i < 30; i++) {
      const p = makeParticle(390, 300, 3.5, ['#fff'], origin)
      expect(p.left).toBeGreaterThanOrEqual(180)
      expect(p.left).toBeLessThanOrEqual(220)
    }
    const local = makeParticle(390, 300, 3.5, ['#fff'], origin).duration
    const full = makeParticle(390, 844, 3.5, ['#fff']).duration
    expect(local).toBeLessThan(full * 0.7)
    // без origin залп прежний — от нижнего края по всей ширине
    expect(makeParticle(390, 844, 4, ['#fff']).left).toBeGreaterThanOrEqual(390 * 0.2)
  })

  it('линия зовёт щелчок один раз на пилюлю, когда заливка дошла до 100 %', () => {
    const lines = readFileSync(fileURLToPath(new URL('./WordLaneLines.jsx', import.meta.url)), 'utf8')
    expect(lines).toContain("pillProgress(front, k) >= 1")
    expect(lines).toContain('snapped.add(k)')
    expect(lines).toContain('snapPill(')
  })
})
