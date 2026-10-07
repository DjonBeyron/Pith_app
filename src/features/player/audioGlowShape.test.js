import { describe, it, expect } from 'vitest'
import {
  bandShapes, glowContour, contourDelta, contourPeak, pointX, pointY,
  POINTS, CANVAS_W, CANVAS_H, REACH_X, REACH_Y,
} from './audioGlowShape.js'

const bands = arr => Float32Array.from(arr)
// Размер canvas в CSS (audio-glow.css): 68×150 при 48×104 «пикселях»
const CSS_W = 68, CSS_H = 150
const last = POINTS - 1

// Заход внутрь по низу (θ = 0°) и вылет вверх по стороне (θ = 90°) в css px
const reachX = c => pointX(c[0], 0) * CSS_W
const reachY = c => pointY(c[last], last) * CSS_H

describe('геометрия углового облака', () => {
  it('θ=0° лежит на низу, θ=90° — на боковой стороне; пределы — доли canvas', () => {
    expect(pointY(1, 0)).toBeCloseTo(0, 5)
    expect(pointX(1, last)).toBeCloseTo(0, 5)
    expect(pointX(1, 0)).toBeCloseTo(REACH_X, 5)
    expect(pointY(1, last)).toBeCloseTo(REACH_Y, 5)
    expect(REACH_Y * CANVAS_H / CANVAS_W).toBeGreaterThan(REACH_X)   // квадрант вытянут вверх
    expect(CSS_W / CSS_H).toBeCloseTo(CANVAS_W / CANVAS_H, 1)       // CSS не искажает пиксели
  })

  it('формы полос: ядро у угла (низ), вылет вверх (середина), верхушка + мелкий заход в низ (верх)', () => {
    const bottom = bandShapes(0), side = bandShapes(1)
    expect(bottom[0]).toBeGreaterThan(side[0])      // низкие — к нижнему краю угла
    expect(side[2]).toBeGreaterThan(bottom[2] * 5)  // средняя — вдоль стороны
    expect(side[3]).toBeGreaterThan(bottom[3] * 1.5)  // верхушка выше…
    expect(bottom[3]).toBeGreaterThan(0.2)          // …но небольшой заход в низ есть
    for (let u = 0; u <= 1; u += 0.05) for (const v of bandShapes(u)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.0001) }
  })
})

describe('glowContour', () => {
  it('длина POINTS, радиусы в пределах 0..1 при любых полосах', () => {
    for (const b of [[0, 0, 0, 0], [1, 1, 1, 1], [1, 0.2, 0, 0], [0, 0, 0.3, 1]]) {
      const c = glowContour(bands(b), 1.3)
      expect(c.length).toBe(POINTS)
      for (let i = 0; i < POINTS; i++) { expect(c[i]).toBeGreaterThanOrEqual(0); expect(c[i]).toBeLessThanOrEqual(1) }
    }
  })

  it('монотонность: больше амплитуда полосы — не меньше радиус в каждой точке', () => {
    for (let k = 0; k < 4; k++) {
      let prev = null
      for (const a of [0, 0.25, 0.5, 0.75, 1]) {
        const b = bands([0, 0, 0, 0]); b[k] = a
        const c = glowContour(b, 0)
        if (prev) for (let i = 0; i < POINTS; i++) expect(c[i]).toBeGreaterThanOrEqual(prev[i] - 1e-6)
        prev = c
      }
    }
  })

  it('контур гладкий: соседние радиусы не скачут', () => {
    const c = glowContour(bands([1, 0.6, 0.9, 0.3]), 0.7)
    for (let i = 1; i < POINTS; i++) expect(Math.abs(c[i] - c[i - 1])).toBeLessThan(0.15)
  })

  it('«симметрия»: форма не зависит от стороны — одна на обе (зеркалит рисовалка)', () => {
    const a = glowContour(bands([0.7, 0.5, 0.4, 0.2]), 2.2)
    const b = glowContour(bands([0.7, 0.5, 0.4, 0.2]), 2.2)
    expect(contourDelta(a, b)).toBe(0)
  })

  it('вертикальный вылет в разы больше горизонтального (css px)', () => {
    for (const b of [[1, 1, 1, 1], [0.75, 0.9, 0.6, 0.35], [0, 0, 1, 0], [0, 0, 0, 1], [1, 0.3, 0, 0]]) {
      const c = glowContour(bands(b), 0)
      expect(reachY(c)).toBeGreaterThan(reachX(c) * 1.2)
    }
    const full = glowContour(bands([1, 1, 1, 1]), 0)
    expect(reachY(full)).toBeGreaterThan(120)       // до ≈ 144 px вверх
    expect(reachY(full)).toBeLessThanOrEqual(160)
    expect(reachX(full)).toBeGreaterThan(40)        // заход в низ 40–60 px, ≤ 18 % ширины
    expect(reachX(full)).toBeLessThanOrEqual(60)
    expect(reachX(full)).toBeLessThanOrEqual(0.18 * 360)
    // средняя/высокая полосы — вылет вверх ≫ захода в низ
    expect(reachY(glowContour(bands([0, 0, 1, 0]), 0))).toBeGreaterThan(reachX(glowContour(bands([0, 0, 1, 0]), 0)) * 5)
    expect(reachY(glowContour(bands([0, 0, 0, 1]), 0))).toBeGreaterThan(reachX(glowContour(bands([0, 0, 0, 1]), 0)) * 2.5)
  })

  it('низкие частоты — ядро у угла (малый вылет), средние/высокие — вылет вверх', () => {
    const low = glowContour(bands([1, 0.8, 0, 0]), 0)
    const mid = glowContour(bands([0, 0, 1, 0]), 0)
    const high = glowContour(bands([0, 0, 0, 1]), 0)
    expect(reachY(mid)).toBeGreaterThan(reachY(low) * 1.5)
    expect(reachY(high)).toBeGreaterThan(reachY(low) * 1.5)
    expect(reachX(low)).toBeGreaterThan(reachX(mid) * 2)   // у низких — заход по низу шире, чем у средних
    expect(reachX(low)).toBeGreaterThan(30)                // толщина ядра у угла
  })

  it('тишина — крошечная точка, полный спектр — максимум около 1', () => {
    const silent = glowContour(bands([0, 0, 0, 0]), 1)
    for (let i = 0; i < POINTS; i++) expect(silent[i]).toBeLessThanOrEqual(0.03)
    expect(contourPeak(silent)).toBeLessThan(0.05)
    const full = glowContour(bands([1, 1, 1, 1]), 1)
    expect(Math.max(...full)).toBeGreaterThan(0.9)
    expect(contourPeak(full)).toBeGreaterThan(0.85)
  })

  it('contourDelta — наибольший сдвиг', () => {
    const a = bands([0.1, 0.2, 0.3]), b = bands([0.1, 0.25, 0.1])
    expect(contourDelta(a, b)).toBeCloseTo(0.2, 5)
  })
})
