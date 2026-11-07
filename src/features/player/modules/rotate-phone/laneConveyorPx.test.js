import { describe, it, expect } from 'vitest'
import { snap, periodPx, shiftPx, pxText, viewOf, RACE_SPLIT } from './laneConveyorPx.js'
import { createConveyorDrive } from './laneConveyorDrive.js'
import { RACE_PERIOD, PERIOD } from './wordLaneConveyor.js'

// Сдвиг и период узора в пикселях устройства (v3.3.133): линии не дрожат по Y (нет дробного translate), шов на оборачивании совпадает с CSS (период пишет привод из той же высоты экрана)
const dev = (v, dpr) => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6

describe('laneConveyorPx: чистые функции', () => {
  it('snap — до пикселя устройства; периоды кратны split пикселям устройства и близки к dvh', () => {
    expect(snap(1.26, 2)).toBe(1.5); expect(snap(1.2, 3)).toBeCloseTo(4 / 3, 9)
    expect(RACE_SPLIT).toBe(12) // узор «реже»: нить — период/12, узелки — период/2
    for (const dpr of [1, 2, 3]) for (const h of [568, 667, 812, 926]) {
      const P = periodPx(RACE_PERIOD, h, dpr, RACE_SPLIT)
      expect(dev(P / 12, dpr)).toBe(true); expect(dev(P / 2, dpr)).toBe(true) // шаг нити и узелков — целые пиксели устройства
      expect(Math.abs(P - (RACE_PERIOD * h) / 100)).toBeLessThanOrEqual(6 / dpr + 1e-9) // визуально тот же период (≤ половины шага)
    }
    expect(periodPx(PERIOD, 812, 2)).toBe(89.5); expect(periodPx(RACE_PERIOD, 10, 1, RACE_SPLIT)).toBe(12) // не меньше одного шага
  })
  it('shiftPx: доля периода до пикселя устройства, ровно период — 0; pxText без «-0»', () => {
    const P = 416
    expect(shiftPx(0, RACE_PERIOD, P, 3)).toBe(0); expect(shiftPx(RACE_PERIOD / 2, RACE_PERIOD, P, 3)).toBe(208)
    expect(shiftPx(RACE_PERIOD - 1e-4, RACE_PERIOD, P, 3)).toBe(0) // перед оборачиванием — тот же кадр, что после
    for (let y = 0; y < RACE_PERIOD; y += 0.37) { const v = shiftPx(y, RACE_PERIOD, P, 3); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(P); expect(dev(v, 3)).toBe(true) }
    expect(pxText(-1e-9)).toBe('0.000px'); expect(pxText(4 / 3)).toBe('1.333px')
    expect(viewOf({ innerHeight: 700, devicePixelRatio: 3 })).toEqual({ h: 700, dpr: 3 }); expect(viewOf({})).toEqual({ h: 800, dpr: 1 })
  })
})

describe('привод гонки: px, запись при изменении, resize', () => {
  const mk = (vp = { h: 812, dpr: 3 }) => {
    const cols = [0, 1, 2].map(() => { const st = {}, log = []; return { style: { setProperty: (k, v) => { st[k] = v; log.push(k) } }, st, log } })
    const root = { closest: s => (s === '[data-race]' ? {} : null), querySelectorAll: s => (s === '.wlLanes i' ? cols : []), querySelector: () => null }
    let t = 0, resize = () => {}
    const d = createConveyorDrive({ root, now: () => t, raf: () => 1, caf: () => {}, observe: () => () => {}, view: () => vp, onResize: fn => { resize = fn; return () => {} } })
    return { cols, d, vp, fire: () => resize(), step: ms => { for (let k = 0; k < ms; k += 1000 / 60) { t += 1000 / 60; d.frame(t) } } }
  }
  it('период --run-px пишется сразу (до кадров), кратен 12 пикселям устройства; сдвиг — целые пиксели устройства и не выходит за период', () => {
    const { cols, d, step } = mk()
    const P = parseFloat(cols[0].st['--run-px']); expect(cols[0].st['--run-px']).toBe(`${periodPx(RACE_PERIOD, 812, 3, RACE_SPLIT).toFixed(3)}px`); expect(dev(P / 12, 3)).toBe(true)
    d.setArmed('222')
    let prev = null, wraps = 0
    for (let k = 0; k < 600; k++) { step(1000 / 60); const y = parseFloat(cols[1].st['--run-y']); expect(Math.abs(y * 3 - Math.round(y * 3))).toBeLessThan(0.005); expect(y).toBeLessThan(P); if (prev !== null && y < prev) wraps += 1; prev = y }
    expect(wraps).toBeGreaterThan(0) // за 10 с узор обернулся, значения остались в периоде
  })
  it('на рабочем ходу шаг ровный (разброс ≤ 1 пиксель устройства), яркость не пишется каждый кадр', () => {
    const { cols, d, step } = mk()
    d.setArmed('222'); step(3000)
    const ys = [], n0 = cols[1].log.filter(k => k === '--run-a').length
    for (let k = 0; k < 120; k++) { step(1000 / 60); ys.push(parseFloat(cols[1].st['--run-y'])) }
    const steps = ys.slice(1).map((y, i) => Math.round((y - ys[i]) * 3)).filter(s => s >= 0)
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1); expect(Math.min(...steps)).toBeGreaterThan(0) // без нулей и удвоений
    expect(cols[1].log.filter(k => k === '--run-a').length - n0).toBe(0)
  })
  it('медленный узор: кадр без сдвига на пиксель устройства — без записи --run-y', () => {
    const { cols, d, step } = mk({ h: 50, dpr: 1 }) // держать ход на низком экране ≈ 13 px/с: пиксель — раз в 4–5 кадров
    d.setArmed('000h'); step(4000)
    const n0 = cols[0].log.filter(k => k === '--run-y').length
    step(1000)
    expect(cols[0].log.filter(k => k === '--run-y').length - n0).toBeLessThan(25)
  })
  it('resize (iOS: адресная строка меняет высоту): период и сдвиг пересчитываются из новой высоты', () => {
    const { cols, vp, fire } = mk()
    const P0 = cols[2].st['--run-px']
    vp.h = 700; fire()
    expect(cols[2].st['--run-px']).not.toBe(P0); expect(cols[2].st['--run-px']).toBe(`${periodPx(RACE_PERIOD, 700, 3, RACE_SPLIT).toFixed(3)}px`)
    expect(parseFloat(cols[2].st['--run-y'])).toBeLessThan(parseFloat(cols[2].st['--run-px']))
  })
})
