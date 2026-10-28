import { describe, it, expect } from 'vitest'
import { speechBounds, PAD_START_S, PAD_END_S } from './wordLaneTrim.js'

const RATE = 8000
/** Сигнал: тишина lead с, «голос» (синус) voice с, тихий хвост tail с (амплитуда tailAmp) */
function signal(lead, voice, tail, tailAmp = 0.003) {
  const n = Math.round((lead + voice + tail) * RATE)
  const s = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    s[i] = t < lead ? 0 : t < lead + voice ? 0.5 * Math.sin(2 * Math.PI * 220 * t) : tailAmp * Math.sin(2 * Math.PI * 180 * t)
  }
  return s
}

describe('где в записи звучит голос', () => {
  it('тишина в начале и тихий хвост в конце отрезаются; запас на согласные и затухание', () => {
    const b = speechBounds(signal(0.25, 0.6, 0.4), RATE)
    expect(b.start).toBeCloseTo(0.25 - PAD_START_S, 1)
    expect(b.end).toBeCloseTo(0.85 + PAD_END_S, 1)
  })
  it('окно [from, to): границы считаются внутри него, значения — от начала записи', () => {
    const s = signal(0.2, 0.3, 0.2)
    const b = speechBounds(s, RATE, 0.1, 0.6)
    expect(b.start).toBeGreaterThanOrEqual(0.1)
    expect(b.end).toBeLessThanOrEqual(0.6)
    expect(b.start).toBeCloseTo(0.2 - PAD_START_S, 1)
  })
  it('тишина — окно целиком; голос без хвоста — почти весь файл', () => {
    expect(speechBounds(new Float32Array(RATE), RATE)).toEqual({ start: 0, end: 1 })
    const b = speechBounds(signal(0, 0.5, 0), RATE)
    expect(b.start).toBe(0)
    expect(b.end).toBeCloseTo(0.5, 1)
  })
})
