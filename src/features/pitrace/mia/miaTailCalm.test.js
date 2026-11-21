import { describe, it, expect } from 'vitest'
import { calmSteps, wakeSteps, instantSteps, pulseSteps, INSTANT_CYCLES, TAIL_FRAMES, REST_FRAME, MIN_STEPS, TAIL_MS, SLOW_TO_MS, WAKE_STEPS } from './miaTailCalm.js'

describe('хвост Мии затихает по порядку кадров', () => {
  it('из любого кадра: кадры идут подряд по циклу и заканчиваются кадром 1 (индекс 0)', () => {
    for (let cur = 0; cur < TAIL_FRAMES; cur++) {
      const s = calmSteps(cur)
      expect(s.at(-1).f).toBe(REST_FRAME)
      s.forEach((x, i) => expect(x.f).toBe((cur + 1 + i) % TAIL_FRAMES))
      expect(s.length).toBeGreaterThanOrEqual(MIN_STEPS)
    }
  })
  it('выдержка кадров только растёт, последний шаг держится (ms = 0), кадр не повторяется подряд', () => {
    for (let cur = 0; cur < TAIL_FRAMES; cur++) {
      const s = calmSteps(cur), ms = s.slice(0, -1).map(x => x.ms)
      expect(ms.every((m, i) => i === 0 || m >= ms[i - 1])).toBe(true)
      expect(ms[0]).toBeGreaterThan(TAIL_MS); expect(ms.at(-1)).toBeLessThanOrEqual(SLOW_TO_MS)
      expect(s.at(-1).ms).toBe(0)
    }
  })
  it('если кадр 1 слишком близко — делается лишний круг, а не обрыв', () => {
    expect(calmSteps(TAIL_FRAMES - 1).length).toBe(TAIL_FRAMES + 1) // из 9-го кадра сразу на 1-й нельзя: замедления не видно
    expect(calmSteps(3).length).toBe(TAIL_FRAMES - 3)
  })
})

describe('хвост снова дёргает', () => {
  it('идёт с кадра 2 по порядку, выдержка падает до обычной, дальше цикл CSS с кадра next', () => {
    const { steps, next } = wakeSteps()
    expect(steps.length).toBe(WAKE_STEPS)
    steps.forEach((x, i) => expect(x.f).toBe((REST_FRAME + 1 + i) % TAIL_FRAMES))
    expect(steps[0].ms).toBe(SLOW_TO_MS); expect(steps.at(-1).ms).toBe(TAIL_MS)
    expect(steps.every((x, i) => i === 0 || x.ms <= steps[i - 1].ms)).toBe(true)
    expect(next).toBe((REST_FRAME + WAKE_STEPS + 1) % TAIL_FRAMES)
  })
})

describe('вариант «мгновенно» и вариант «дышит»', () => {
  it('«мгновенно»: обычная скорость, по порядку, кадр 1 проходится три раза, стоп на третьем', () => {
    for (let cur = 0; cur < TAIL_FRAMES; cur++) {
      const s = instantSteps(cur)
      s.forEach((x, i) => expect(x.f).toBe((cur + 1 + i) % TAIL_FRAMES))
      expect(s.filter(x => x.f === REST_FRAME).length).toBe(INSTANT_CYCLES); expect(s.at(-1).f).toBe(REST_FRAME)
      expect(s.slice(0, -1).every(x => x.ms === TAIL_MS)).toBe(true); expect(s.at(-1).ms).toBe(0)
    }
  })
  it('«мгновенно» с одним проходом: встаёт на первом же кадре 1', () => {
    for (let cur = 0; cur < TAIL_FRAMES; cur++) { const s = instantSteps(cur, 1); expect(s.filter(x => x.f === REST_FRAME).length).toBe(1); expect(s.at(-1).f).toBe(REST_FRAME); expect(s.length).toBe((REST_FRAME - cur + TAIL_FRAMES) % TAIL_FRAMES || TAIL_FRAMES) }
  })
  it('«дышит»: кадры по порядку, выдержка и больше, и меньше обычной, без «медленно-медленно» (≤ 220 мс), дальше цикл CSS с next', () => {
    const { steps, next } = pulseSteps(2)
    steps.forEach((x, i) => expect(x.f).toBe((3 + i) % TAIL_FRAMES))
    const ms = steps.map(x => x.ms); expect(Math.max(...ms)).toBeLessThanOrEqual(220); expect(Math.min(...ms)).toBeGreaterThanOrEqual(30)
    expect(Math.max(...ms)).toBeGreaterThan(TAIL_MS); expect(Math.min(...ms)).toBeLessThan(TAIL_MS)
    expect(next).toBe((2 + steps.length + 1) % TAIL_FRAMES)
  })
})
