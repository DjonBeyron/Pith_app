import { describe, it, expect } from 'vitest'
import { wantStep, redLevel, RED_FROM } from './miaTailWant.js'

const P = (id, cy, bottom, o = {}) => ({ id, cy, bottom, locked: false, failed: false, ...o })
const run = (kind, frames, redY = 800) => { let s = { want: false, seen: new Map() }; return frames.map(f => (s = wantStep(s, { kind, shown: true, pills: f, redY })).want) }

describe('когда дёргается хвост Мии', () => {
  it('красная зона шкалы — с 0,8 её длины', () => { expect(RED_FROM).toBe(0.8); expect(redLevel({ boxTop: 100, boxH: 500 })).toBe(500) })
  it('церемония: дёргается, пока Мия на экране', () => {
    expect(wantStep({ want: false, seen: new Map() }, { kind: 'ann', shown: true }).want).toBe(true)
    expect(wantStep({ want: true, seen: new Map() }, { kind: 'ann', shown: false }).want).toBe(false)
  })
  it('другие стадии: лежит', () => { expect(wantStep({ want: true, seen: new Map() }, { kind: null, shown: true }).want).toBe(false) })
  it('круг: пилюля дошла до красного уровня — дёргается; следующая показалась на 50 % — остановка', () => {
    const w = run('round', [[P('a', -40, -10)], [P('a', 300, 340)], [P('a', 700, 760)], [P('a', 780, 840)], [P('a', 900, 960)], [P('a', 1000, 1060), P('b', -60, -20)], [P('a', 1100, 1160), P('b', 20, 60)]])
    expect(w).toEqual([false, false, false, true, true, true, false])
  })
  it('верный ответ раньше красного уровня: хвост не дёргается', () => {
    expect(run('round', [[P('a', 100, 140)], [P('a', 400, 440)], [P('a', 500, 540, { locked: true })], [P('b', -50, -10)], [P('b', 20, 60)]])).toEqual([false, false, false, false, false])
  })
  it('пилюля, уже стоявшая ниже уровня при первом взгляде, ничего не запускает; без Мии — лежит', () => {
    expect(run('round', [[P('a', 900, 960)], [P('a', 950, 1010)]])).toEqual([false, false])
    expect(wantStep({ want: true, seen: new Map() }, { kind: 'round', shown: false, pills: [], redY: 800 }).want).toBe(false)
  })
})
