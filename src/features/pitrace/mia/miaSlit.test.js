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
