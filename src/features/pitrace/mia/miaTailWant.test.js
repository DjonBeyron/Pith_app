import { describe, it, expect } from 'vitest'
import { wantStep, redLevel, RED_FROM, ENTER_VIS } from './miaTailWant.js'

const P = (id, top, bottom, o = {}) => ({ id, h: bottom - top, bottom, locked: false, failed: false, ...o }) // top, bottom — px от верха сцены, высота 40
const run = (kind, frames, redY = 800) => { let s = { want: false, seen: new Map() }; return frames.map(f => (s = wantStep(s, { kind, shown: true, pills: f, redY })).want) }

describe('когда дёргается хвост Мии', () => {
  it('красная зона шкалы — с 0,8 её длины, хвост останавливается на 20 % показавшейся пилюли', () => { expect(RED_FROM).toBe(0.8); expect(ENTER_VIS).toBe(0.2); expect(redLevel({ boxTop: 100, boxH: 500 })).toBe(500) })
  it('церемония: дёргается, пока Мия на экране', () => {
    expect(wantStep({ want: false, seen: new Map() }, { kind: 'ann', shown: true }).want).toBe(true)
    expect(wantStep({ want: true, seen: new Map() }, { kind: 'ann', shown: false }).want).toBe(false)
  })
  it('конечный диалог: дёргается, пока Мия на экране', () => { expect(wantStep({ want: false, seen: new Map() }, { kind: 'end', shown: true }).want).toBe(true); expect(wantStep({ want: true, seen: new Map() }, { kind: 'end', shown: false }).want).toBe(false) })
  it('другие стадии: лежит', () => { expect(wantStep({ want: true, seen: new Map() }, { kind: null, shown: true }).want).toBe(false) })
  it('круг: пилюля дошла до красного уровня — дёргается; следующая показалась на 50 % — остановка', () => {
    const w = run('round', [[P('a', -50, -10)], [P('a', 300, 340)], [P('a', 700, 740)], [P('a', 780, 820)], [P('a', 900, 940)], [P('a', 1000, 1040), P('b', -60, -20)], [P('a', 1100, 1140), P('b', -37, 3)], [P('a', 1200, 1240), P('b', -30, 10)]])
    expect(w).toEqual([false, false, false, true, true, true, true, false]) // 3 px из 40 — ещё меньше 20 %; 10 px из 40 — 25 %, стоп
  })
  it('верный ответ раньше красного уровня: хвост не дёргается', () => {
    expect(run('round', [[P('a', 100, 140)], [P('a', 400, 440)], [P('a', 500, 540, { locked: true })], [P('b', -50, -10)], [P('b', 20, 60)]])).toEqual([false, false, false, false, false])
  })
  it('пилюля, уже стоявшая ниже уровня при первом взгляде, ничего не запускает; без Мии — лежит', () => {
    expect(run('round', [[P('a', 900, 940)], [P('a', 950, 990)]])).toEqual([false, false])
    expect(wantStep({ want: true, seen: new Map() }, { kind: 'round', shown: false, pills: [], redY: 800 }).want).toBe(false)
  })
})
