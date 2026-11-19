import { describe, it, expect } from 'vitest'
import { slitOn, SLIT_LINES } from './miaSlit.js'
import { MIA_LINES } from './miaLines.js'

describe('зрачок-щель Мии', () => {
  it('в прыжке — щель, даже в тишине', () => { expect(slitOn(null, 'flight')).toBe(true) })
  it('на колких и грозных репликах — щель; на добрых и в покое — нет', () => {
    expect(slitOn('mia_miss_2', 'sit')).toBe(true); expect(slitOn('mia_push', 'sit')).toBe(true)
    expect(slitOn('mia_ok_1', 'sit')).toBe(false); expect(slitOn('mia_end', 'sit')).toBe(false); expect(slitOn(null, 'sit')).toBe(false); expect(slitOn(null, 'off')).toBe(false)
  })
  it('все id из списка — настоящие реплики Мии (опечатка не должна тихо отключить щель)', () => {
    const known = new Set(MIA_LINES.map(l => l.id))
    for (const id of SLIT_LINES.filter(i => !i.startsWith('boss_'))) expect(known.has(id), id).toBe(true)
  })
})

describe('расширение зрачка на пиках речи', () => {
  it('ниже порога — нет; широкий рот — расширение до 1', async () => {
    const { peakTarget } = await import('./miaSlit.js')
    expect(peakTarget(0)).toBe(0); expect(peakTarget(0.55)).toBe(0); expect(peakTarget(1)).toBe(1); expect(peakTarget(0.95)).toBeGreaterThan(0.85)
  })
  it('сглаживание: быстрый подъём, медленный спад, без выбросов за 0…1', async () => {
    const { smoothPeak } = await import('./miaSlit.js')
    let v = 0; for (let i = 0; i < 12; i++) v = smoothPeak(v, 1)
    expect(v).toBeGreaterThan(0.99); expect(v).toBeLessThanOrEqual(1)
    const d = smoothPeak(1, 0); expect(d).toBeGreaterThan(0.8); expect(d).toBeLessThan(1)
  })
})
