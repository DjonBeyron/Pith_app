import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sparkColors, POP_FRAMES, POP_MS, FLASH_MS } from './wordLaneSnap.js'
import { makeParticle } from '../../../../shared/lib/burstParticles.js'
import { WORD_AT, WORD_LEN, LISTEN_MS, ZONE_Y, DESCENT_MS, EXIT_MS, pillY } from './wordLaneTimeline.js'
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

  it('без озвучки план — расписание по умолчанию, голос слова по очереди', () => {
    const p = makeListenPlan(null)
    expect(p.fillAt).toEqual(WORD_AT)
    expect(p.fillMs).toEqual(WORD_LEN)
    expect(p.audioAt).toBeNull()
    expect(p.listenMs).toBe(LISTEN_MS)
    expect(p.curves.every(c => c === null)).toBe(true)
  })

  it('с озвучкой пилюля стоит в зоне голоса ровно по словам файла (со сдвигом LEAD): вход в зону = начало слова', () => {
    const fills = fillsFromTimings(withEnd, 'try', 4)
    const p = makeListenPlan(fills)
    expect(p.audioAt).toBe(LEAD_MS)
    expect(p.fillAt).toEqual([LEAD_MS + 100, LEAD_MS + 1400, LEAD_MS + 2900])
    p.fillAt.forEach((t, k) => {
      expect(pillY(t, t, p.fillMs[k])).toBeCloseTo(ZONE_Y, 5)          // слово началось — пилюля в зоне
      expect(pillY(t - DESCENT_MS, t, p.fillMs[k])).toBeLessThan(0)    // за DESCENT_MS до слова она ещё за верхним краем
    })
    expect(p.listenMs).toBeGreaterThanOrEqual(p.fillAt[2] + p.fillMs[2] + EXIT_MS)
    p.fillMs.forEach(ms => { expect(ms).toBeGreaterThanOrEqual(FILL_MIN_MS); expect(ms).toBeLessThanOrEqual(FILL_MAX_MS) })
  })

  it('кривая заливки строится по громкости озвучки, если она известна', () => {
    const fills = [{ start: 0.5, end: 1.5 }, { start: 2, end: 3 }, { start: 3.5, end: 4.5 }]
    const wave = Array.from({ length: 150 }, (_, i) => (i % 30 < 10 ? 250 : 20))
    const p = makeListenPlan(fills, { wave, duration: 5 })
    p.curves.forEach(c => { expect(typeof c).toBe('function'); expect(c(1)).toBeCloseTo(1, 5) })
    expect(makeListenPlan(fills).curves.every(c => c === null)).toBe(true) // озвучка без волны — линейно
  })

  it('быстрая речь — слово короче (заливка за него быстрее), медленная — длиннее', () => {
    const fast = makeListenPlan([{ start: 0.5, end: 0.9 }, { start: 2, end: 2.4 }, { start: 3.5, end: 3.9 }])
    const slow = makeListenPlan([{ start: 0.5, end: 1.9 }, { start: 3, end: 4.4 }, { start: 5.5, end: 6.9 }])
    expect(fast.fillMs[0]).toBeLessThan(slow.fillMs[0])
  })

  it('слишком частые слова раздвигаются: пилюли по очереди, слова не налезают друг на друга', () => {
    const p = makeListenPlan([{ start: 0, end: 0.2 }, { start: 0.1, end: 0.3 }, { start: 0.2, end: 0.4 }])
    expect(p.fillAt[0]).toBeGreaterThanOrEqual(MIN_FIRST_MS)
    expect(p.fillAt[1] - p.fillAt[0] - p.fillMs[0]).toBeGreaterThanOrEqual(MIN_GAP_MS)
    expect(p.fillAt[2] - p.fillAt[1] - p.fillMs[1]).toBeGreaterThanOrEqual(MIN_GAP_MS)
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

  it('хлопок: 1 → 1.12 → 1 через отдельное свойство scale (положение пилюли остаётся за движком), плавнее первой версии', () => {
    const scales = POP_FRAMES.map(f => f.scale)
    expect(scales[0]).toBe(1)
    expect(scales.at(-1)).toBe(1)
    expect(Math.max(...scales)).toBe(1.12)
    POP_FRAMES.forEach(f => expect(f.transform).toBeUndefined())
    expect(POP_MS).toBeGreaterThanOrEqual(600)
    expect(FLASH_MS).toBeGreaterThanOrEqual(800)
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

  it('движок зовёт щелчок один раз на пилюлю: в конце слова диктора и по принятому слову ученика', () => {
    const eng = readFileSync(fileURLToPath(new URL('./useWordLanePills.js', import.meta.url)), 'utf8')
    expect(eng).toContain('t >= at + ms')
    expect(eng).toContain('snapped.add(k)')
    expect(eng).toContain("s.mode = 'out'")
    expect(eng.match(/snapPill\(/g)).toHaveLength(1) // единственная точка щелчка — done(k)
  })
})
